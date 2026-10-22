const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs/promises');
const fssync = require('fs');
const path = require('path');
const cors = require('cors');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const helmet = require('helmet');
const { rateLimit } = require('express-rate-limit');
const { z } = require('zod');
const { Parser } = require('expr-eval');

const cfg = require('./config');
const authMiddleware = require('./middleware/auth');
const { validateBody } = require('./middleware/validate');
const { safeResolve } = require('./utils/pathSafety');
const {
  createDatabaseWorkspaceRouter,
} = require('./routes/databaseWorkspaceRoutes');
const {
  createPostgresWorkspaceCompatibilityRouter,
} = require('./routes/postgresWorkspaceCompatibilityRoutes');
const {
  createPostgresExecutionRunRouter,
} = require('./routes/postgresExecutionRunRoutes');
const {
  createPostgresOutputSourceRouter,
} = require('./routes/postgresOutputSourceRoutes');
const {
  createPostgresWorkflowVersionRouter,
} = require('./routes/postgresWorkflowVersionRoutes');
const {
  createDatabaseHealthRouter,
} = require('./routes/databaseHealthRoutes');
const {
  createPluginRegistryMappingRouter,
} = require('./routes/pluginRegistryMappingRoutes');
const {
  createPluginEndpointMappingReadRouter,
} = require('./routes/pluginEndpointMappingReadRoutes');
const {
  createWorkflowOrchestratorRouter,
} = require('./routes/workflowOrchestratorRoutes');
const { inspectDatabaseContract } = require('./db/databaseContract');
const { closePool } = require('./db/pool');

const app = express();
const PORT = cfg.PORT;

// Sandboxed math evaluator (no access to globals / eval / Function).
const exprParser = new Parser();

/* -------------------------------------------------------------------------- */
/*                              CONFIGURATION                                 */
/* -------------------------------------------------------------------------- */
const corsOptions = {
  origin: cfg.CORS_ORIGINS,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Origin',
    'X-Requested-With',
    'Content-Type',
    'Accept',
    'Authorization',
  ],
  credentials: true,
};

// Helmet sets hardened security headers. CSP is disabled because this process
// serves JSON APIs only (the SPA is served separately by Vite / the web tier).
app.use(helmet({ contentSecurityPolicy: false }));

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

app.use(bodyParser.json({ limit: cfg.BODY_LIMIT }));
app.use(bodyParser.urlencoded({ extended: true, limit: cfg.BODY_LIMIT }));

// Rate-limit all API routes to blunt brute-force / abuse.
app.use(
  '/api',
  rateLimit({
    windowMs: cfg.RATE_LIMIT_WINDOW_MS,
    max: cfg.RATE_LIMIT_MAX,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

// Authentication framework (opt-in; no-op unless AUTH_ENABLED=true).
app.use('/api', authMiddleware);

/* -------------------------------------------------------------------------- */
/*                     VALIDATION SCHEMAS (security-critical)                 */
/* -------------------------------------------------------------------------- */
const calculatorSchema = z.object({
  data: z.array(z.record(z.any())),
  fieldName: z.string().min(1),
  expression: z.string().min(1).max(500),
});

const fileOperateSchema = z.object({
  operationType: z.string().min(1),
  sourcePath: z.string().min(1),
  destinationPath: z.string().optional(),
  content: z.string().optional(),
  fileName: z.string().optional(),
  target_format: z.string().optional(),
});

/* -------------------------------------------------------------------------- */
/*                        WORKSPACE ROOT MANAGEMENT                           */
/* -------------------------------------------------------------------------- */

const SERVER_CONFIG_FILE = path.resolve('./server_config.json');

let activeWorkspace = {
  rootDir: null,
  workflowsDir: null,   // kept for backward compatibility (legacy workflows may reside here)
  metaFile: null,
};

const ROOT_FOLDER_ID = 'root';

function deriveWorkspacePaths(rootDir) {
  return {
    rootDir,
    workflowsDir: path.join(rootDir, 'workflows'),
    metaFile: path.join(rootDir, 'workspace.json'),
  };
}

async function activateWorkspace(rootDir, persist = true) {
  const paths = deriveWorkspacePaths(rootDir);
  activeWorkspace = paths;
  if (persist) await saveServerConfig({ workspaceRoot: rootDir });
  return paths;
}

async function loadServerConfig() {
  try {
    const raw = await fs.readFile(SERVER_CONFIG_FILE, 'utf8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function saveServerConfig(config) {
  const existing = await loadServerConfig();
  await fs.writeFile(
    SERVER_CONFIG_FILE,
    JSON.stringify({ ...existing, ...config }, null, 2),
    'utf8'
  );
}

/**
 * Sanitise a string for use as a folder name (keeps spaces for readability).
 */
function sanitizeName(name) {
  if (typeof name !== 'string') return null;
  let sanitized = name.trim().replace(/[<>:"/\\|?*\x00-\x1F]/g, '_');
  sanitized = sanitized.replace(/\s+/g, ' ');
  return sanitized.length > 0 ? sanitized : null;
}

/**
 * Sanitise a string for use as a workflow filename – replaces spaces with hyphens,
 * removes any character illegal on Windows, and ensures a clean slug‑like base.
 */
function sanitizeFilename(name) {
  if (typeof name !== 'string') return null;
  const sanitized = name
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
    .replace(/\s+/g, '-')
    .toLowerCase();
  return sanitized.length > 0 ? sanitized : null;
}

/**
 * Validate that dirPath is a valid, writable, absolute directory.
 */
async function validateAndPrepareDir(dirPath) {
  if (!dirPath || typeof dirPath !== 'string') {
    throw new Error('Workspace path must be a non-empty string.');
  }

  if (dirPath.startsWith('[object') || /^\{/.test(dirPath.trim())) {
    throw new Error(
      'Invalid workspace path: received an object reference instead of a file system path string.'
    );
  }

  const cleaned = dirPath.trim().replace(/^["']|["']$/g, '');
  const resolved = path.resolve(cleaned);

  if (resolved === path.parse(resolved).root) {
    throw new Error('Cannot use a filesystem root as the workspace directory.');
  }

  try {
    await fs.mkdir(resolved, { recursive: true });
  } catch (err) {
    throw new Error(`Cannot create directory at '${resolved}': ${err.message}`);
  }

  const testFile = path.join(
    resolved,
    `.write_test_${Date.now()}_${Math.random().toString(36).slice(2)}`
  );
  try {
    await fs.writeFile(testFile, 'write-check', 'utf8');
    await fs.unlink(testFile);
  } catch (err) {
    throw new Error(
      `Directory '${resolved}' exists but is not writable: ${err.message}`
    );
  }

  return resolved;
}

function buildInitialMeta() {
  const now = new Date().toISOString();
  return {
    version: 1,
    folders: {
      [ROOT_FOLDER_ID]: {
        id: ROOT_FOLDER_ID,
        name: 'Workspace',
        parentId: null,
        type: 'folder',
        createdAt: now,
        updatedAt: now,
      },
    },
    workflows: {},
  };
}

async function initWorkspace(rootDir, silent = false) {
  const resolved = await validateAndPrepareDir(rootDir);
  const paths = deriveWorkspacePaths(resolved);

  await fs.mkdir(paths.workflowsDir, { recursive: true });

  const metaExists = fssync.existsSync(paths.metaFile);
  if (!metaExists) {
    await fs.writeFile(
      paths.metaFile,
      JSON.stringify(buildInitialMeta(), null, 2),
      'utf8'
    );
    if (!silent) console.log('🗂️  Workspace initialised at', resolved);
  } else {
    if (!silent) console.log('🗂️  Workspace loaded from', resolved);
  }

  return paths;
}

function requireWorkspace(res) {
  if (!activeWorkspace.rootDir) {
    res.status(503).json({
      error: 'No workspace selected. POST /api/workspace/select first.',
    });
    return false;
  }
  return true;
}

/* -------------------------------------------------------------------------- */
/*                    FILESYSTEM ↔ METADATA HELPERS                           */
/* -------------------------------------------------------------------------- */

function getFolderFsPath(meta, folderId) {
  if (!meta || !meta.folders) return null;
  if (folderId === ROOT_FOLDER_ID) return activeWorkspace.rootDir;

  const parts = [];
  let currentId = folderId;
  let safety = 0;
  while (currentId && safety < 100) {
    const folder = meta.folders[currentId];
    if (!folder) break;
    parts.unshift(folder.name);
    if (folder.parentId === null || folder.parentId === ROOT_FOLDER_ID) break;
    currentId = folder.parentId;
    safety++;
  }
  return path.join(activeWorkspace.rootDir, ...parts);
}

function getWorkflowDirectory(meta, parentId) {
  if (!meta || !meta.folders) return activeWorkspace.rootDir;
  if (parentId === ROOT_FOLDER_ID) return activeWorkspace.rootDir;
  const folderPath = getFolderFsPath(meta, parentId);
  return folderPath || activeWorkspace.rootDir;
}

/**
 * Return the full filesystem path for a workflow based on stored metadata.
 */
function getWorkflowFilePath(meta, workflowId) {
  if (!meta || !meta.workflows) return null;
  const wfMeta = meta.workflows[workflowId];
  if (!wfMeta) return null;
  const dir = getWorkflowDirectory(meta, wfMeta.parentId);
  const fileName = wfMeta.fileName || `${workflowId}.json`;
  return path.join(dir, fileName);
}

/**
 * Given a base filename (no extension) and a target directory, generate a
 * unique, human‑readable filename that doesn't clash with existing JSON files
 * or other workflows' filenames in metadata.
 */
async function getUniqueWorkflowFileName(meta, baseName, parentId, excludeWorkflowId = null) {
  const dir = getWorkflowDirectory(meta, parentId);
  await fs.mkdir(dir, { recursive: true });

  // Build a map of all filenames currently claimed by workflows in this folder
  const usedFileNames = new Set();
  for (const [id, wf] of Object.entries(meta.workflows || {})) {
    if (id === excludeWorkflowId) continue;
    if (wf.parentId === parentId && wf.fileName) {
      usedFileNames.add(wf.fileName.toLowerCase());
    }
  }

  // Also gather existing filesystem entries just in case metadata is missing
  try {
    const entries = await fs.readdir(dir);
    for (const entry of entries) {
      if (entry.endsWith('.json')) {
        usedFileNames.add(entry.toLowerCase());
      }
    }
  } catch (_) { /* ignore */ }

  const cleanBase = sanitizeFilename(baseName) || 'untitled';
  let candidate = `${cleanBase}.json`;

  // If candidate is already taken, append numeric suffixes
  let counter = 2;
  while (usedFileNames.has(candidate.toLowerCase())) {
    candidate = `${cleanBase}-${counter}.json`;
    counter++;
  }

  return path.join(dir, candidate);
}

/**
 * Read a workflow file from disk.
 */
async function readWorkflowFile(meta, id) {
  const filePath = (await resolveWorkflowFilePath(meta, id)) || getWorkflowFilePath(meta, id);
  if (!filePath) throw new Error(`Cannot resolve path for workflow ${id}`);

  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === 'ENOENT') {
      const wfMeta = meta?.workflows?.[id];
      return {
        id,
        name: wfMeta?.name || id,
        type: 'workflow',
        parentId: wfMeta?.parentId ?? ROOT_FOLDER_ID,
        status: wfMeta?.status ?? 'draft',
        description: wfMeta?.description ?? '',
        actions: [],
        connections: [],
        variables: [],
        version: wfMeta?.version || 1,
        createdAt: wfMeta?.createdAt || new Date().toISOString(),
        updatedAt: wfMeta?.updatedAt || new Date().toISOString(),
      };
    }
    throw err;
  }
}

/**
 * Write a workflow JSON file, creating the parent directory if needed.
 * The workflow's `name` is used to derive a clean filename (stored in metadata).
 */
async function writeWorkflowFile(meta, workflow) {
  const { id, name, parentId } = workflow;
  const resolvedParentId = parentId ?? ROOT_FOLDER_ID;
  const targetDir = getWorkflowDirectory(meta, resolvedParentId) || activeWorkspace.rootDir;
  await fs.mkdir(targetDir, { recursive: true });

  let filePath = await resolveWorkflowFilePath(meta, id);
  if (!filePath) {
    filePath = await getUniqueWorkflowFileName(meta, name, resolvedParentId, id);
  }

  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(workflow, null, 2), 'utf8');

  if (meta.workflows[id]) {
    meta.workflows[id].fileName = path.basename(filePath);
  }

  return filePath;
}

/**
 * Move a workflow file between parent directories (or rename on name change).
 * The new filename is computed from the new name and target directory, ensuring
 * no collisions.
 */
async function relocateWorkflowFile(meta, workflowId, newName, newParentId) {
  const wfMeta = meta.workflows[workflowId];
  if (!wfMeta) throw new Error('Workflow metadata missing');

  const oldPath = (await resolveWorkflowFilePath(meta, workflowId)) || getWorkflowFilePath(meta, workflowId);
  const newDir = getWorkflowDirectory(meta, newParentId);
  await fs.mkdir(newDir, { recursive: true });

  const newFilePath = await getUniqueWorkflowFileName(meta, newName, newParentId, workflowId);

  if (oldPath && fssync.existsSync(oldPath) && path.resolve(oldPath) !== path.resolve(newFilePath)) {
    await fs.rename(oldPath, newFilePath);
  }

  wfMeta.parentId = newParentId;
  wfMeta.fileName = path.basename(newFilePath);
  return newFilePath;
}

function collectDescendantFolderIds(folders, rootId) {
  const ids = [rootId];
  for (const [id, folder] of Object.entries(folders)) {
    if (folder.parentId === rootId) {
      ids.push(...collectDescendantFolderIds(folders, id));
    }
  }
  return ids;
}

function isAncestorOrSelf(folders, ancestorId, targetId) {
  if (ancestorId === targetId) return true;
  const target = folders[targetId];
  if (!target || target.parentId === null) return false;
  return isAncestorOrSelf(folders, ancestorId, target.parentId);
}

function sanitizeWorkflowBaseName(value, fallback = 'workflow') {
  const base =
    sanitizeFilename(value) ||
    sanitizeFilename(fallback) ||
    String(fallback || 'workflow');

  return base;
}

function getWorkflowPathCandidates(meta, workflowId) {
  const wfMeta = meta?.workflows?.[workflowId];
  if (!wfMeta) return [];

  const dir = getWorkflowDirectory(meta, wfMeta.parentId);
  const candidates = [];

  if (wfMeta.fileName) {
    candidates.push(path.join(dir, wfMeta.fileName));
  }

  const baseFromName = sanitizeWorkflowBaseName(wfMeta.name, workflowId);
  candidates.push(path.join(dir, `${baseFromName}.json`));

  const baseFromId = sanitizeWorkflowBaseName(workflowId, workflowId);
  if (baseFromId !== baseFromName) {
    candidates.push(path.join(dir, `${baseFromId}.json`));
  }

  return [...new Set(candidates)];
}

async function resolveWorkflowFilePath(meta, workflowId) {
  const wfMeta = meta?.workflows?.[workflowId];
  if (!wfMeta) return null;

  const dir = getWorkflowDirectory(meta, wfMeta.parentId);
  if (!dir) return null;

  await fs.mkdir(dir, { recursive: true });

  for (const candidate of getWorkflowPathCandidates(meta, workflowId)) {
    if (fssync.existsSync(candidate)) {
      wfMeta.fileName = path.basename(candidate);
      return candidate;
    }
  }

  let entries = [];
  try {
    entries = await fs.readdir(dir);
  } catch {
    entries = [];
  }

  const jsonFiles = entries.filter((file) => file.toLowerCase().endsWith('.json'));
  const desiredBase = sanitizeWorkflowBaseName(wfMeta.name, workflowId).toLowerCase();

  const matched = jsonFiles.find((file) => {
    const base = path.basename(file, '.json').toLowerCase();
    const normalized = base.replace(/-\d+$/, '');
    return (
      base === desiredBase ||
      normalized === desiredBase ||
      base.includes(desiredBase)
    );
  });

  if (matched) {
    wfMeta.fileName = matched;
    return path.join(dir, matched);
  }

  return null;
}

function mergeWorkflowMetadataWithDisk(meta) {
  let repaired = false;

  for (const [id, wfMeta] of Object.entries(meta.workflows || {})) {
    const dir = getWorkflowDirectory(meta, wfMeta.parentId);
    const expected = wfMeta.fileName ? path.join(dir, wfMeta.fileName) : null;
    if (expected && fssync.existsSync(expected)) continue;

    const candidates = getWorkflowPathCandidates(meta, id);
    const found = candidates.find((candidate) => fssync.existsSync(candidate));
    if (found) {
      wfMeta.fileName = path.basename(found);
      repaired = true;
    }
  }

  return repaired;
}

/* -------------------------------------------------------------------------- */
/*                          WORKSPACE DATA HELPERS                            */
/* -------------------------------------------------------------------------- */

async function syncFoldersFromDisk(meta) {
  const rootDir = activeWorkspace.rootDir;
  if (!rootDir) return meta;

  if (!meta.folders[ROOT_FOLDER_ID]) {
    const now = new Date().toISOString();
    meta.folders[ROOT_FOLDER_ID] = {
      id: ROOT_FOLDER_ID,
      name: 'Workspace',
      parentId: null,
      type: 'folder',
      createdAt: now,
      updatedAt: now,
    };
  }

  const pathToId = new Map();
  for (const [id, folder] of Object.entries(meta.folders)) {
    const fsPath = getFolderFsPath(meta, id);
    if (fsPath) pathToId.set(fsPath, id);
  }

  const walk = async (dir, parentId) => {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const dirPath = path.join(dir, entry.name);
      if (dirPath === activeWorkspace.workflowsDir) continue;
      if (path.basename(dirPath) === 'workspace.json') continue;

      if (pathToId.has(dirPath)) continue;

      const now = new Date().toISOString();
      const id = uuidv4();
      meta.folders[id] = {
        id,
        name: entry.name,
        parentId,
        type: 'folder',
        createdAt: now,
        updatedAt: now,
      };
      pathToId.set(dirPath, id);
      await walk(dirPath, id);
    }
  };

  await walk(rootDir, ROOT_FOLDER_ID);
  return meta;
}

async function readMeta() {
  const { metaFile, workflowsDir } = activeWorkspace;

  let meta;

  try {
    const raw = await fs.readFile(metaFile, 'utf8');
    try {
      meta = JSON.parse(raw);
    } catch (parseErr) {
      console.warn(`⚠️  workspace.json is corrupted (${parseErr.message}). Recreating.`);
      meta = buildInitialMeta();
      await fs.writeFile(metaFile, JSON.stringify(meta, null, 2), 'utf8');
      return meta;
    }
  } catch (readErr) {
    if (readErr.code === 'ENOENT') {
      console.warn('⚠️  workspace.json missing — recreating.');
      meta = buildInitialMeta();
      await fs.writeFile(metaFile, JSON.stringify(meta, null, 2), 'utf8');
    } else {
      throw new Error(`Cannot read workspace.json: ${readErr.message}`);
    }
  }

  if (!meta.folders) meta.folders = {};
  if (!meta.folders[ROOT_FOLDER_ID]) {
    const now = new Date().toISOString();
    meta.folders[ROOT_FOLDER_ID] = {
      id: ROOT_FOLDER_ID,
      name: 'Workspace',
      parentId: null,
      type: 'folder',
      createdAt: now,
      updatedAt: now,
    };
  }
  if (!meta.workflows) meta.workflows = {};

  // repair legacy orphaned workflow files in the old central directory
  let repaired = false;
  try {
    const files = await fs.readdir(workflowsDir);
    const jsonFiles = files.filter((f) => f.endsWith('.json'));
    for (const file of jsonFiles) {
      const idMatch = file.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
      const baseId = file.replace(/\.json$/, '');
      const id = idMatch ? idMatch[1] : baseId;

      if (meta.workflows[id]) continue;

      try {
        const raw = await fs.readFile(path.join(workflowsDir, file), 'utf8');
        const wf = JSON.parse(raw);
        console.warn(`⚠️  Rebuilding missing metadata for legacy workflow '${id}'`);
        meta.workflows[id] = {
          id: wf.id || id,
          name: wf.name || id,
          type: 'workflow',
          parentId: wf.parentId || ROOT_FOLDER_ID,
          status: wf.status || 'draft',
          description: wf.description || '',
          version: wf.version || 1,
          fileName: file,
          createdAt: wf.createdAt || new Date().toISOString(),
          updatedAt: wf.updatedAt || new Date().toISOString(),
        };
        repaired = true;
      } catch { /* skip unreadable */ }
    }
  } catch { /* workflowsDir unreadable */ }

  if (repaired) {
    await fs.writeFile(metaFile, JSON.stringify(meta, null, 2), 'utf8');
  }

  await syncFoldersFromDisk(meta);

  const repairedFiles = mergeWorkflowMetadataWithDisk(meta);
  if (repairedFiles) {
    await fs.writeFile(metaFile, JSON.stringify(meta, null, 2), 'utf8');
  }

  return meta;
}

async function writeMeta(meta) {
  await fs.writeFile(
    activeWorkspace.metaFile,
    JSON.stringify(meta, null, 2),
    'utf8'
  );
}

/* -------------------------------------------------------------------------- */
/*                    POSTGRESQL WORKSPACE ROUTING                            */
/* -------------------------------------------------------------------------- */

// Read-only PostgreSQL workflow version-history API. The status endpoint is
// always available in PostgreSQL workspace mode; data endpoints remain gated
// until Step 7B.6A certification passes. Restore/write operations are not
// exposed by this router.
if (cfg.PERSISTENCE_MODE === 'postgres') {
  app.use(
    '/api/workspace',
    createPostgresWorkflowVersionRouter({
      workspaceKey: cfg.DB_WORKSPACE_KEY,
      enabled: cfg.WORKFLOW_VERSION_HISTORY_API_ENABLED,
      defaultLimit: cfg.WORKFLOW_VERSION_HISTORY_DEFAULT_LIMIT,
      maxLimit: cfg.WORKFLOW_VERSION_HISTORY_MAX_LIMIT,
    })
  );
}

// Read-only PostgreSQL output-source API. The status endpoint is always
// available in PostgreSQL execution mode; data endpoints remain gated by
// EXECUTION_OUTPUT_SOURCE_API_ENABLED until Step 7B.5A certification passes.
if (
  cfg.PERSISTENCE_MODE === 'postgres' &&
  cfg.EXECUTION_PERSISTENCE_MODE === 'postgres'
) {
  app.use(
    '/api/workspace',
    createPostgresOutputSourceRouter({
      workspaceKey: cfg.DB_WORKSPACE_KEY,
      enabled: cfg.EXECUTION_OUTPUT_SOURCE_API_ENABLED,
      defaultLimit: cfg.EXECUTION_OUTPUT_SOURCE_DEFAULT_LIMIT,
      maxLimit: cfg.EXECUTION_OUTPUT_SOURCE_MAX_LIMIT,
    })
  );
}

// Independent execution-history cutover. This router is mounted before both
// PostgreSQL workspace CRUD and legacy filesystem run routes, so matching
// /workflows/:id/runs requests use PostgreSQL while all other routes continue
// through their existing handlers.
if (
  cfg.PERSISTENCE_MODE === 'postgres' &&
  cfg.EXECUTION_PERSISTENCE_MODE === 'postgres'
) {
  app.use(
    '/api/workspace',
    createPostgresExecutionRunRouter({
      workspaceKey: cfg.DB_WORKSPACE_KEY,
      writesEnabled: cfg.DATABASE_EXECUTION_WRITE_ENABLED,
      retentionDays: cfg.EXECUTION_RETENTION_DAYS,
      maxBytes: cfg.EXECUTION_MAX_BYTES,
      listLimit: cfg.EXECUTION_LIST_LIMIT,
      outputIndexWriteEnabled:
        cfg.EXECUTION_OUTPUT_INDEX_WRITE_ENABLED,
    })
  );
}

// Primary cutover router. It is mounted before the legacy filesystem routes,
// so matching workspace CRUD requests are served from PostgreSQL. Unmatched
// routes (notably execution-run snapshots) continue to the existing handlers.
if (cfg.PERSISTENCE_MODE === 'postgres') {
  app.use(
    '/api/workspace',
    createPostgresWorkspaceCompatibilityRouter({
      workspaceKey: cfg.DB_WORKSPACE_KEY,
      writesEnabled: cfg.DATABASE_PRIMARY_WRITE_ENABLED,
    })
  );
}

// Keep the isolated shadow API available for diagnostics and rollback checks.
if (cfg.DATABASE_SHADOW_API_ENABLED) {
  app.use(
    '/api/db/workspace',
    createDatabaseWorkspaceRouter({
      workspaceKey: cfg.DB_WORKSPACE_KEY,
    })
  );
}

/* -------------------------------------------------------------------------- */
/*        PRODUCTS ENGINE REGISTRY / PLUGIN MAPPING DRY-RUN + CLI APPLY     */
/* -------------------------------------------------------------------------- */
// Phase 4B.2 still exposes no HTTP apply endpoint. Reads remain available via
// this router; transactional writes are CLI-only, explicitly confirmed,
// advisory-locked, snapshot-backed and disabled during normal runtime.
app.use(
  '/api/engine-registry',
  createPluginRegistryMappingRouter({
    enabled: cfg.PLUGIN_ENDPOINT_MAPPING_API_ENABLED,
    engineUrl: cfg.ENGINE_URL,
    engineVersion: cfg.PLUGIN_ENDPOINT_MAPPING_ENGINE_VERSION,
    engineContextPath: cfg.PLUGIN_ENDPOINT_MAPPING_ENGINE_CONTEXT_PATH,
    registryPath: cfg.PLUGIN_ENDPOINT_MAPPING_REGISTRY_PATH,
    registryUrl: cfg.PLUGIN_ENDPOINT_MAPPING_REGISTRY_URL,
    requestTimeoutMs: cfg.PLUGIN_ENDPOINT_MAPPING_REQUEST_TIMEOUT_MS,
    previewLimit: cfg.PLUGIN_ENDPOINT_MAPPING_PREVIEW_LIMIT,
    writeEnabled: cfg.PLUGIN_ENDPOINT_MAPPING_WRITE_ENABLED,
    schema: cfg.DB_SCHEMA,
  })
);

// Phase 4C.1 exposes only the normalized PostgreSQL mapping read model.
// It never changes the static frontend catalogue or plugin execution routes.
app.use(
  '/api/plugin-mappings',
  createPluginEndpointMappingReadRouter({
    enabled: cfg.PLUGIN_MAPPING_READ_API_ENABLED,
    engineVersion: cfg.PLUGIN_ENDPOINT_MAPPING_ENGINE_VERSION,
    defaultLimit: cfg.PLUGIN_MAPPING_READ_DEFAULT_LIMIT,
    maxLimit: cfg.PLUGIN_MAPPING_READ_MAX_LIMIT,
    schema: cfg.DB_SCHEMA,
  })
);

// ORCH-1 is an isolated, opt-in server execution lane. It intentionally does
// not replace the browser executor yet. Certification starts with a strict
// Start -> one JSON API plugin -> End graph and persists every transition via
// the already-certified PostgreSQL execution repository.
app.use(
  '/api/orchestrator',
  createWorkflowOrchestratorRouter({
    enabled: cfg.ORCHESTRATOR_ENABLED,
    persistenceReady:
      cfg.PERSISTENCE_MODE === 'postgres' &&
      cfg.EXECUTION_PERSISTENCE_MODE === 'postgres' &&
      cfg.DATABASE_EXECUTION_WRITE_ENABLED,
    workspaceKey: cfg.DB_WORKSPACE_KEY,
    retentionDays: cfg.EXECUTION_RETENTION_DAYS,
    outputIndexWriteEnabled: cfg.EXECUTION_OUTPUT_INDEX_WRITE_ENABLED,
    engineUrl: cfg.ENGINE_URL,
    engineVersion: cfg.PLUGIN_ENDPOINT_MAPPING_ENGINE_VERSION,
    engineContextPath: cfg.PLUGIN_ENDPOINT_MAPPING_ENGINE_CONTEXT_PATH,
    schema: cfg.DB_SCHEMA,
  })
);

/* -------------------------------------------------------------------------- */
/*                              HEALTH CHECK                                  */
/* -------------------------------------------------------------------------- */
app.use(
  '/api/health',
  createDatabaseHealthRouter({
    enabled:
      cfg.PERSISTENCE_MODE === 'postgres' &&
      cfg.DATABASE_CONTRACT_CHECK_ENABLED,
    strict: cfg.DATABASE_CONTRACT_STRICT,
    schema: cfg.DB_SCHEMA,
  })
);

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    message:
      'Full Backend with File Ops, Data Transformer, Plugins, Database Proxy & Workspace running',
    port: PORT,
    timestamp: new Date().toISOString(),
    activeWorkspace: activeWorkspace.rootDir ?? null,
    persistenceMode: cfg.PERSISTENCE_MODE,
    databasePrimaryWriteEnabled: cfg.DATABASE_PRIMARY_WRITE_ENABLED,
    executionPersistenceMode:
      cfg.PERSISTENCE_MODE === 'postgres'
        ? cfg.EXECUTION_PERSISTENCE_MODE
        : 'filesystem',
    databaseExecutionWriteEnabled:
      cfg.PERSISTENCE_MODE === 'postgres' &&
      cfg.EXECUTION_PERSISTENCE_MODE === 'postgres'
        ? cfg.DATABASE_EXECUTION_WRITE_ENABLED
        : false,
    executionOutputIndexWriteEnabled:
      cfg.PERSISTENCE_MODE === 'postgres' &&
      cfg.EXECUTION_PERSISTENCE_MODE === 'postgres'
        ? cfg.EXECUTION_OUTPUT_INDEX_WRITE_ENABLED
        : false,
    executionOutputSourceApiEnabled:
      cfg.PERSISTENCE_MODE === 'postgres' &&
      cfg.EXECUTION_PERSISTENCE_MODE === 'postgres'
        ? cfg.EXECUTION_OUTPUT_SOURCE_API_ENABLED
        : false,
    workflowVersionHistoryApiEnabled:
      cfg.PERSISTENCE_MODE === 'postgres'
        ? cfg.WORKFLOW_VERSION_HISTORY_API_ENABLED
        : false,
  });
});

/* -------------------------------------------------------------------------- */
/*                      WORKSPACE SELECTION & STATUS                          */
/* -------------------------------------------------------------------------- */

app.get('/api/workspace/status', (req, res) => {
  res.json({
    status: 'success',
    active: activeWorkspace.rootDir
      ? {
          rootDir: activeWorkspace.rootDir,
          workflowsDir: activeWorkspace.workflowsDir,
          metaFile: activeWorkspace.metaFile,
        }
      : null,
  });
});

app.post('/api/workspace/select', async (req, res) => {
  try {
    const { path: workspacePath } = req.body;

    if (!workspacePath) {
      return res.status(400).json({ error: 'path is required' });
    }

    if (typeof workspacePath !== 'string') {
      return res.status(400).json({
        error:
          'path must be a string. Received a non-string value — do not pass a browser file handle object.',
      });
    }

    const cleaned = workspacePath.trim().replace(/^["']|["']$/g, '');
    const requestedPath = path.resolve(cleaned);

    if (activeWorkspace.rootDir && activeWorkspace.rootDir === requestedPath) {
      return res.json({
        status: 'success',
        message: 'Workspace already active.',
        workspace: {
          rootDir: activeWorkspace.rootDir,
          workflowsDir: activeWorkspace.workflowsDir,
          metaFile: activeWorkspace.metaFile,
        },
      });
    }

    const paths = await initWorkspace(requestedPath, true);
    await activateWorkspace(paths.rootDir);

    console.log(`✅ Workspace selected: ${paths.rootDir}`);

    res.json({
      status: 'success',
      message: 'Workspace selected and ready.',
      workspace: {
        rootDir: paths.rootDir,
        workflowsDir: paths.workflowsDir,
        metaFile: paths.metaFile,
      },
    });
  } catch (err) {
    console.error('❌ workspace/select error:', err.message);
    res.status(400).json({ error: err.message });
  }
});

/* -------------------------------------------------------------------------- */
/*                           WORKSPACE REST ENDPOINTS                         */
/* -------------------------------------------------------------------------- */

app.get('/api/workspace/tree', async (req, res) => {
  if (!requireWorkspace(res)) return;
  try {
    const meta = await readMeta();
    res.json({ status: 'success', folders: meta.folders, workflows: meta.workflows });
  } catch (err) {
    console.error('❌ workspace/tree error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/workspace/children/:parentId', async (req, res) => {
  if (!requireWorkspace(res)) return;
  try {
    const { parentId } = req.params;
    const meta = await readMeta();

    if (parentId !== ROOT_FOLDER_ID && !meta.folders[parentId]) {
      return res.status(404).json({ error: `Folder '${parentId}' not found` });
    }

    const childFolders = Object.values(meta.folders).filter(
      (f) => f.parentId === parentId
    );
    const childWorkflows = Object.values(meta.workflows).filter(
      (w) => w.parentId === parentId
    );

    res.json({ status: 'success', folders: childFolders, workflows: childWorkflows });
  } catch (err) {
    console.error('❌ workspace/children error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/workspace/breadcrumb/:id', async (req, res) => {
  if (!requireWorkspace(res)) return;
  try {
    const { id } = req.params;
    const meta = await readMeta();

    const item = meta.folders[id] || meta.workflows[id];
    if (!item) return res.status(404).json({ error: `Item '${id}' not found` });

    const chain = [];
    let current = item;
    while (current) {
      chain.unshift({
        id: current.id,
        name: current.name,
        type: current.type || 'folder',
      });
      if (!current.parentId) break;
      current = meta.folders[current.parentId];
    }

    res.json({ status: 'success', breadcrumb: chain });
  } catch (err) {
    console.error('❌ workspace/breadcrumb error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/* ──────────────── Folders CRUD (real directories on disk) ──────────────── */

app.get('/api/workspace/folders', async (req, res) => {
  if (!requireWorkspace(res)) return;
  try {
    const meta = await readMeta();
    const folders = Object.values(meta.folders).map((f) => ({
      ...f,
      path: getFolderFsPath(meta, f.id),
    }));
    res.json({ status: 'success', folders });
  } catch (err) {
    console.error('❌ workspace/folders GET error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/workspace/folders/:id', async (req, res) => {
  if (!requireWorkspace(res)) return;
  try {
    const meta = await readMeta();
    const folder = meta.folders[req.params.id];
    if (!folder) return res.status(404).json({ error: 'Folder not found' });
    res.json({
      status: 'success',
      folder: {
        ...folder,
        path: getFolderFsPath(meta, folder.id),
      },
    });
  } catch (err) {
    console.error('❌ workspace/folders GET error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/workspace/folders', async (req, res) => {
  if (!requireWorkspace(res)) return;
  try {
    const { name, parentId } = req.body;

    if (!name || !parentId) {
      return res.status(400).json({ error: 'name and parentId are required' });
    }
    const safeName = sanitizeName(name);
    if (!safeName) {
      return res.status(400).json({ error: 'Invalid folder name' });
    }

    const meta = await readMeta();

    if (parentId !== ROOT_FOLDER_ID && !meta.folders[parentId]) {
      return res.status(404).json({ error: `Parent folder '${parentId}' not found` });
    }

    const duplicate = Object.values(meta.folders).some(
      (f) =>
        f.parentId === parentId &&
        f.name.toLowerCase() === safeName.toLowerCase()
    );
    if (duplicate) {
      return res
        .status(409)
        .json({ error: `A folder named '${safeName}' already exists here` });
    }

    const parentPath = getFolderFsPath(meta, parentId);
    if (!parentPath) throw new Error('Cannot resolve parent folder path');
    const newFolderPath = path.join(parentPath, safeName);
    await fs.mkdir(newFolderPath, { recursive: true });

    const id = uuidv4();
    const now = new Date().toISOString();
    const folder = {
      id,
      name: safeName,
      parentId,
      type: 'folder',
      createdAt: now,
      updatedAt: now,
    };

    meta.folders[id] = folder;
    await writeMeta(meta);

    res.status(201).json({
      status: 'success',
      folder: { ...folder, path: newFolderPath },
    });
  } catch (err) {
    console.error('❌ workspace/folders POST error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/workspace/folders/:id', async (req, res) => {
  if (!requireWorkspace(res)) return;

  try {
    const { id } = req.params;
    const updates = req.body || {};

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        error: 'Request body cannot be empty',
      });
    }

    const meta = await readMeta();
    const folder = meta.folders[id];

    if (!folder) {
      return res.status(404).json({
        error: `Folder '${id}' not found`,
      });
    }

    if (id === ROOT_FOLDER_ID) {
      return res.status(403).json({
        error: 'Cannot rename or move the root folder',
      });
    }

    let newName = folder.name;
    let newParentId = folder.parentId || ROOT_FOLDER_ID;

    if (updates.name !== undefined) {
      const safeName = sanitizeName(updates.name);

      if (!safeName) {
        return res.status(400).json({
          error: 'Invalid folder name',
        });
      }

      newName = safeName;
    }

    if (updates.parentId !== undefined) {
      const requestedParentId =
        updates.parentId === null
          ? ROOT_FOLDER_ID
          : String(updates.parentId);

      const targetFolder = meta.folders[requestedParentId];

      if (!targetFolder) {
        return res.status(404).json({
          error: `Target folder '${requestedParentId}' not found`,
        });
      }

      if (isAncestorOrSelf(meta.folders, id, requestedParentId)) {
        return res.status(400).json({
          error:
            'Cannot move a folder into itself or one of its descendants',
        });
      }

      newParentId = requestedParentId;
    }

    const duplicate = Object.values(meta.folders).some(
      (candidate) =>
        candidate.id !== id &&
        candidate.parentId === newParentId &&
        candidate.name.toLowerCase() === newName.toLowerCase()
    );

    if (duplicate) {
      return res.status(409).json({
        error: `A folder named '${newName}' already exists here`,
      });
    }

    const oldPath = getFolderFsPath(meta, id);
    const targetParentPath = getFolderFsPath(meta, newParentId);

    if (!oldPath) {
      throw new Error(`Cannot resolve the current path for folder '${id}'`);
    }

    if (!targetParentPath) {
      throw new Error(
        `Cannot resolve the target path for folder '${newParentId}'`
      );
    }

    const newPath = path.join(targetParentPath, newName);
    const pathChanged =
      path.resolve(oldPath).toLowerCase() !==
      path.resolve(newPath).toLowerCase();

    if (pathChanged) {
      await fs.mkdir(targetParentPath, { recursive: true });

      if (fssync.existsSync(newPath)) {
        return res.status(409).json({
          error: `Directory '${newName}' already exists in the target folder`,
        });
      }

      if (fssync.existsSync(oldPath)) {
        await fs.rename(oldPath, newPath);
      } else {
        // Metadata can become stale if a folder was removed manually from
        // File Explorer. Recreate an empty destination so the trash/restore
        // lifecycle remains consistent and the metadata can be repaired.
        await fs.mkdir(newPath, { recursive: true });
      }
    }

    folder.name = newName;
    folder.parentId = newParentId;
    folder.updatedAt = new Date().toISOString();

    await writeMeta(meta);

    res.json({
      status: 'success',
      folder: {
        ...folder,
        path: newPath,
      },
    });
  } catch (err) {
    console.error('❌ workspace/folders PUT error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/workspace/folders/:id', async (req, res) => {
  if (!requireWorkspace(res)) return;
  try {
    const { id } = req.params;
    if (id === ROOT_FOLDER_ID) {
      return res.status(403).json({ error: 'Cannot delete root folder' });
    }

    const meta = await readMeta();
    if (!meta.folders[id])
      return res.status(404).json({ error: `Folder '${id}' not found` });

    const descendantFolderIds = collectDescendantFolderIds(meta.folders, id);

    const workflowsToDelete = Object.values(meta.workflows).filter((w) =>
      descendantFolderIds.includes(w.parentId)
    );
    await Promise.all(
      workflowsToDelete.map(async (w) => {
        const fp = getWorkflowFilePath(meta, w.id);
        if (fp && fssync.existsSync(fp)) {
          try { await fs.unlink(fp); } catch (_) {}
        }
        delete meta.workflows[w.id];
      })
    );

    const folderPath = getFolderFsPath(meta, id);
    if (folderPath) {
      try {
        await fs.rm(folderPath, { recursive: true, force: true });
      } catch (rmErr) {
        console.warn(`⚠️  Could not delete directory '${folderPath}': ${rmErr.message}`);
      }
    }

    descendantFolderIds.forEach((fid) => delete meta.folders[fid]);

    await writeMeta(meta);
    res.json({
      status: 'success',
      message: `Folder and ${workflowsToDelete.length} workflow(s) deleted`,
      deletedFolders: descendantFolderIds,
      deletedWorkflows: workflowsToDelete.map((w) => w.id),
    });
  } catch (err) {
    console.error('❌ workspace/folders DELETE error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/* ──────────────── Workflows CRUD (clean, human‑readable filenames) ─────── */

app.get('/api/workspace/workflows', async (req, res) => {
  if (!requireWorkspace(res)) return;
  try {
    const meta = await readMeta();
    const workflows = Object.values(meta.workflows).map((w) => ({
      ...w,
      path: getWorkflowFilePath(meta, w.id),
    }));
    res.json({ status: 'success', workflows });
  } catch (err) {
    console.error('❌ workspace/workflows GET error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/workspace/workflows', async (req, res) => {
  if (!requireWorkspace(res)) return;
  try {
    const { name, parentId, description = '' } = req.body;

    if (!name || !parentId) {
      return res.status(400).json({ error: 'name and parentId are required' });
    }
    const safeName = sanitizeName(name);
    if (!safeName)
      return res.status(400).json({ error: 'Invalid workflow name' });

    const meta = await readMeta();

    if (parentId !== ROOT_FOLDER_ID && !meta.folders[parentId]) {
      return res
        .status(404)
        .json({ error: `Parent folder '${parentId}' not found` });
    }

    const duplicate = Object.values(meta.workflows).some(
      (w) =>
        w.parentId === parentId &&
        w.name.toLowerCase() === safeName.toLowerCase()
    );
    if (duplicate) {
      return res
        .status(409)
        .json({ error: `A workflow named '${safeName}' already exists here` });
    }

    const id = uuidv4();
    const now = new Date().toISOString();
    const workflow = {
      id,
      name: safeName,
      type: 'workflow',
      parentId,
      status: 'draft',
      description,
      actions: [],
      connections: [],
      variables: [],
      version: 1,
      createdAt: now,
      updatedAt: now,
    };

    // Create a temporary metadata entry so we can generate the filename
    meta.workflows[id] = {
      id,
      name: safeName,
      type: 'workflow',
      parentId,
      status: workflow.status,
      description,
      version: workflow.version,
      fileName: null, // will be set by writeWorkflowFile
      createdAt: now,
      updatedAt: now,
    };

    await writeWorkflowFile(meta, workflow);
    await writeMeta(meta);

    res.status(201).json({
      status: 'success',
      workflow: {
        ...workflow,
        path: getWorkflowFilePath(meta, id),
      },
    });
  } catch (err) {
    console.error('❌ workspace/workflows POST error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/workspace/workflows/:id', async (req, res) => {
  if (!requireWorkspace(res)) return;
  try {
    const { id } = req.params;
    const meta = await readMeta();

    const wfMeta = meta.workflows[id];
    if (!wfMeta) {
      return res.status(404).json({
        error: `Workflow '${id}' not found.`,
        code: 'NOT_FOUND',
      });
    }

    // Resolve the workflow file. If metadata exists but the file is missing on
    // disk (moved/renamed/deleted out-of-band), recover gracefully rather than
    // failing with ENOENT: readWorkflowFile() rebuilds a valid shell from the
    // stored metadata, which we then heal back to disk so future loads succeed.
    const fp = (await resolveWorkflowFilePath(meta, id)) || getWorkflowFilePath(meta, id);
    const fileMissing = !fp || !fssync.existsSync(fp);

    const workflow = await readWorkflowFile(meta, id);

    if (fileMissing) {
      try {
        await writeWorkflowFile(meta, workflow);
        console.warn(`⚠️  Recovered missing workflow file for '${id}'.`);
      } catch (healErr) {
        console.warn(
          `⚠️  Could not heal missing workflow file for '${id}': ${healErr.message}`
        );
      }
    }

    await writeMeta(meta);
    res.json({ status: 'success', workflow, recovered: fileMissing });
  } catch (err) {
    console.error('❌ workspace/workflows GET error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/workspace/workflows/:id', async (req, res) => {
  if (!requireWorkspace(res)) return;
  try {
    const { id } = req.params;
    const updates = req.body;

    if (!updates || Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'Request body cannot be empty' });
    }

    const meta = await readMeta();
    const wfMeta = meta.workflows[id];
    if (!wfMeta) {
      return res.status(404).json({ error: `Workflow '${id}' not found` });
    }

    const oldParentId = wfMeta.parentId;
    let newParentId = oldParentId;
    let newName = wfMeta.name;

    if (updates.parentId !== undefined && updates.parentId !== oldParentId) {
      const targetFolder = meta.folders[updates.parentId];
      if (!targetFolder) {
        return res.status(404).json({ error: `Target folder '${updates.parentId}' not found` });
      }
      if (targetFolder.type === 'folder' && isAncestorOrSelf(meta.folders, id, updates.parentId)) {
        return res.status(400).json({ error: 'Cannot move a workflow into itself or a descendant folder.' });
      }
      newParentId = updates.parentId;
    }

    if (updates.name !== undefined) {
      const safeName = sanitizeName(updates.name);
      if (!safeName) {
        return res.status(400).json({ error: 'Invalid workflow name' });
      }

      const duplicate = Object.values(meta.workflows).some(
        (w) =>
          w.id !== id &&
          w.parentId === newParentId &&
          w.name.toLowerCase() === safeName.toLowerCase()
      );
      if (duplicate) {
        return res.status(409).json({
          error: `A workflow named '${safeName}' already exists here`,
        });
      }
      newName = safeName;
    }

    if (newName !== wfMeta.name || newParentId !== oldParentId) {
      await relocateWorkflowFile(meta, id, newName, newParentId);
    }

    const existing = await readWorkflowFile(meta, id);
    const now = new Date().toISOString();
    const updated = {
      ...existing,
      ...updates,
      id,
      type: 'workflow',
      name: newName,
      parentId: newParentId,
      createdAt: existing.createdAt,
      updatedAt: now,
      version: (existing.version || 1) + 1,
    };

    meta.workflows[id] = {
      ...wfMeta,
      name: newName,
      parentId: newParentId,
      status: updated.status ?? wfMeta.status,
      description: updated.description ?? wfMeta.description,
      version: updated.version,
      updatedAt: now,
    };

    await writeWorkflowFile(meta, updated);
    await writeMeta(meta);

    res.json({
      status: 'success',
      workflow: {
        ...updated,
        path: (await resolveWorkflowFilePath(meta, id)) || getWorkflowFilePath(meta, id),
      },
    });
  } catch (err) {
    console.error('❌ workspace/workflows PUT error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/workspace/workflows/:id/rename', async (req, res) => {
  if (!requireWorkspace(res)) return;
  try {
    const { id } = req.params;
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });

    const safeName = sanitizeName(name);
    if (!safeName)
      return res.status(400).json({ error: 'Invalid workflow name' });

    const meta = await readMeta();
    const wfMeta = meta.workflows[id];
    if (!wfMeta)
      return res.status(404).json({ error: `Workflow '${id}' not found` });

    const duplicate = Object.values(meta.workflows).some(
      (w) =>
        w.id !== id &&
        w.parentId === wfMeta.parentId &&
        w.name.toLowerCase() === safeName.toLowerCase()
    );
    if (duplicate) {
      return res.status(409).json({
        error: `A workflow named '${safeName}' already exists here`,
      });
    }

    await relocateWorkflowFile(meta, id, safeName, wfMeta.parentId);

    const existing = await readWorkflowFile(meta, id);
    const now = new Date().toISOString();
    existing.name = safeName;
    existing.updatedAt = now;
    existing.version = (existing.version || 1) + 1;
    await writeWorkflowFile(meta, existing);

    meta.workflows[id] = {
      ...wfMeta,
      name: safeName,
      updatedAt: now,
      version: existing.version,
    };
    await writeMeta(meta);

    res.json({
      status: 'success',
      workflow: { ...existing, path: (await resolveWorkflowFilePath(meta, id)) || getWorkflowFilePath(meta, id) },
    });
  } catch (err) {
    console.error('❌ workspace/workflows rename error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/workspace/workflows/:id', async (req, res) => {
  if (!requireWorkspace(res)) return;
  try {
    const { id } = req.params;
    const meta = await readMeta();

    if (!meta.workflows[id])
      return res.status(404).json({ error: `Workflow '${id}' not found` });

    const fp = (await resolveWorkflowFilePath(meta, id)) || getWorkflowFilePath(meta, id);
    if (fp && fssync.existsSync(fp)) await fs.unlink(fp);

    delete meta.workflows[id];
    await writeMeta(meta);

    res.json({ status: 'success', message: `Workflow '${id}' deleted` });
  } catch (err) {
    console.error('❌ workspace/workflows DELETE error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/* -------------------------------------------------------------------------- */
/*                 EXECUTION RUN SNAPSHOTS (debugging / recovery)             */
/* -------------------------------------------------------------------------- */
/**
 * The frontend engine keeps a WorkflowExecutionContext for every run: workflow
 * variables plus every node's output, which is what makes workflow-wide data
 * carry-forward possible. A snapshot of that context is POSTed here after each
 * node so a run can be inspected — or its collected values reused — after the
 * browser has moved on.
 *
 * Snapshots are stored beside the workspace under `.runs/<workflowId>/`, are
 * capped in size, and are pruned to the most recent RUN_RETENTION per workflow
 * so a long-lived workspace never grows without bound.
 */

const RUN_RETENTION = 25;
const RUN_MAX_BYTES = 8 * 1024 * 1024;

const runSnapshotSchema = z.object({
  version: z.literal(1),
  runId: z.string().min(1).max(200),
  workflowId: z.string().min(1).max(200),
  workflowName: z.string().max(500).optional(),
  status: z.string().max(50),
  startedAt: z.string().max(64),
  updatedAt: z.string().max(64),
  finishedAt: z.string().max(64).optional(),
  variables: z.record(z.any()).optional(),
  runtime: z.record(z.any()).optional(),
  files: z.record(z.any()).optional(),
  env: z.record(z.any()).optional(),
  outputs: z.array(z.any()).optional(),
  previousNodeId: z.string().nullable().optional(),
  logs: z.array(z.any()).optional(),
  metrics: z.record(z.any()).optional(),
});

/** Reject ids that could escape the runs directory. */
function isSafeIdSegment(value) {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= 200
    && /^[A-Za-z0-9._-]+$/.test(value)
    && value !== '.'
    && value !== '..';
}

function getRunsDir(workflowId) {
  return path.join(activeWorkspace.rootDir, '.runs', workflowId);
}

async function pruneRuns(workflowId) {
  const dir = getRunsDir(workflowId);
  let entries;
  try {
    entries = (await fs.readdir(dir)).filter((name) => name.endsWith('.json'));
  } catch {
    return;
  }
  if (entries.length <= RUN_RETENTION) return;

  const stated = await Promise.all(
    entries.map(async (name) => {
      try {
        const stat = await fs.stat(path.join(dir, name));
        return { name, mtime: stat.mtimeMs };
      } catch {
        return { name, mtime: 0 };
      }
    })
  );

  stated.sort((a, b) => b.mtime - a.mtime);
  await Promise.all(
    stated.slice(RUN_RETENTION).map((entry) =>
      fs.unlink(path.join(dir, entry.name)).catch(() => {})
    )
  );
}

// Persist (upsert) one run snapshot.
app.post('/api/workspace/workflows/:id/runs', async (req, res) => {
  if (!requireWorkspace(res)) return;
  try {
    const { id } = req.params;
    if (!isSafeIdSegment(id)) {
      return res.status(400).json({ error: 'Invalid workflow id' });
    }

    const parsed = runSnapshotSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid run snapshot',
        details: parsed.error.issues.slice(0, 5),
      });
    }

    const snapshot = parsed.data;
    if (!isSafeIdSegment(snapshot.runId)) {
      return res.status(400).json({ error: 'Invalid run id' });
    }

    const serialized = JSON.stringify(snapshot, null, 2);
    if (Buffer.byteLength(serialized, 'utf8') > RUN_MAX_BYTES) {
      return res.status(413).json({ error: 'Run snapshot exceeds the size limit' });
    }

    const dir = getRunsDir(id);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, `${snapshot.runId}.json`), serialized, 'utf8');
    await pruneRuns(id);

    res.json({ status: 'success', runId: snapshot.runId });
  } catch (err) {
    console.error('❌ workflows/runs POST error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// List runs for a workflow, newest first (metadata only — no payloads).
app.get('/api/workspace/workflows/:id/runs', async (req, res) => {
  if (!requireWorkspace(res)) return;
  try {
    const { id } = req.params;
    if (!isSafeIdSegment(id)) {
      return res.status(400).json({ error: 'Invalid workflow id' });
    }

    const dir = getRunsDir(id);
    let files;
    try {
      files = (await fs.readdir(dir)).filter((name) => name.endsWith('.json'));
    } catch {
      return res.json({ status: 'success', runs: [] });
    }

    const runs = [];
    for (const name of files) {
      try {
        const raw = await fs.readFile(path.join(dir, name), 'utf8');
        const snapshot = JSON.parse(raw);
        runs.push({
          runId: snapshot.runId,
          status: snapshot.status,
          startedAt: snapshot.startedAt,
          updatedAt: snapshot.updatedAt,
          finishedAt: snapshot.finishedAt ?? null,
          metrics: snapshot.metrics ?? null,
          nodeCount: Array.isArray(snapshot.outputs) ? snapshot.outputs.length : 0,
        });
      } catch {
        /* skip unreadable snapshot */
      }
    }

    runs.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
    res.json({ status: 'success', runs });
  } catch (err) {
    console.error('❌ workflows/runs GET error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Fetch one full run snapshot.
app.get('/api/workspace/workflows/:id/runs/:runId', async (req, res) => {
  if (!requireWorkspace(res)) return;
  try {
    const { id, runId } = req.params;
    if (!isSafeIdSegment(id) || !isSafeIdSegment(runId)) {
      return res.status(400).json({ error: 'Invalid identifier' });
    }

    const filePath = path.join(getRunsDir(id), `${runId}.json`);
    try {
      const raw = await fs.readFile(filePath, 'utf8');
      return res.json({ status: 'success', run: JSON.parse(raw) });
    } catch (err) {
      if (err.code === 'ENOENT') {
        return res.status(404).json({ error: `Run '${runId}' not found` });
      }
      throw err;
    }
  } catch (err) {
    console.error('❌ workflows/runs/:runId GET error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Delete one run snapshot.
app.delete('/api/workspace/workflows/:id/runs/:runId', async (req, res) => {
  if (!requireWorkspace(res)) return;
  try {
    const { id, runId } = req.params;
    if (!isSafeIdSegment(id) || !isSafeIdSegment(runId)) {
      return res.status(400).json({ error: 'Invalid identifier' });
    }

    await fs.unlink(path.join(getRunsDir(id), `${runId}.json`)).catch(() => {});
    res.json({ status: 'success' });
  } catch (err) {
    console.error('❌ workflows/runs DELETE error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/workspace/check-duplicate', async (req, res) => {
  if (!requireWorkspace(res)) return;
  try {
    const { name, parentId, type, excludeId } = req.body;
    if (!name || !parentId || !type) {
      return res
        .status(400)
        .json({ error: 'name, parentId, and type are required' });
    }
    const safeName = sanitizeName(name);
    if (!safeName) return res.status(400).json({ error: 'Invalid name' });

    const meta = await readMeta();
    const collection =
      type === 'folder' ? meta.folders : meta.workflows;
    const isDuplicate = Object.values(collection).some(
      (item) =>
        item.parentId === parentId &&
        item.name.toLowerCase() === safeName.toLowerCase() &&
        (!excludeId || item.id !== excludeId)
    );

    res.json({ status: 'success', isDuplicate });
  } catch (err) {
    console.error('❌ workspace/check-duplicate error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/* -------------------------------------------------------------------------- */
/*                              FILE OPERATIONS                               */
/* -------------------------------------------------------------------------- */
app.post('/api/files/operate', validateBody(fileOperateSchema), async (req, res) => {
  try {
    const {
      operationType,
      sourcePath,
      destinationPath,
      content,
      fileName,
      target_format,
    } = req.body;
    if (!operationType || !sourcePath) {
      return res
        .status(400)
        .json({ error: 'Missing operationType or sourcePath' });
    }
    // Confine every path to the active workspace root (plus any explicitly
    // whitelisted FILE_OPS_ALLOWED_ROOTS). Rejects path traversal / arbitrary
    // absolute paths — the previous `path.resolve(sourcePath)` allowed reads,
    // writes and deletes anywhere on the host filesystem.
    const root = activeWorkspace.rootDir;
    let src;
    try {
      src = safeResolve(root, sourcePath);
    } catch (pathErr) {
      return res.status(403).json({ error: pathErr.message });
    }

    switch (operationType) {
      case 'createdir':
        await fs.mkdir(src, { recursive: true });
        return res.json({ status: 'success', message: 'Directory created', path: src });

      case 'write':
        await fs.mkdir(path.dirname(src), { recursive: true });
        await fs.writeFile(src, content ?? '', 'utf8');
        return res.json({ status: 'success', message: 'File written', path: src });

      case 'read': {
        const data = await fs.readFile(src, 'utf8');
        return res.json({ status: 'success', content: data });
      }

      case 'create':
        if (!fileName) throw new Error('Missing fileName for create');
        const newFile = safeResolve(root, path.join(src, fileName));
        await fs.mkdir(src, { recursive: true });
        await fs.writeFile(newFile, '');
        return res.json({ status: 'success', message: 'File created', path: newFile });

      case 'exists':
        return res.json({ exists: fssync.existsSync(src) });

      case 'info': {
        const stats = await fs.stat(src);
        return res.json({
          status: 'success',
          details: {
            size: stats.size,
            modified: stats.mtime,
            created: stats.birthtime,
            isDirectory: stats.isDirectory(),
          },
        });
      }

      case 'list': {
        const files = await fs.readdir(src);
        return res.json({ status: 'success', files });
      }

      case 'move':
        if (!destinationPath) throw new Error('Missing destinationPath');
        await fs.rename(src, safeResolve(root, destinationPath));
        return res.json({ status: 'success', message: 'File moved' });

      case 'detecttype': {
        const ext = path.extname(src).replace('.', '');
        return res.json({ status: 'success', fileType: ext || 'unknown' });
      }

      case 'extracttext': {
        const textContent = await fs.readFile(src, 'utf8');
        return res.json({ status: 'success', text: textContent });
      }

      case 'copy':
        if (!destinationPath) throw new Error('Missing destinationPath');
        await fs.copyFile(src, safeResolve(root, destinationPath));
        return res.json({ status: 'success', message: 'File copied' });

      case 'convert':
        return res.json({
          status: 'success',
          message: `Simulated conversion of ${src} to ${target_format} at ${destinationPath}`,
        });

      case 'delete':
        await fs.unlink(src);
        return res.json({ status: 'success', message: 'File deleted' });

      case 'deletedir':
        await fs.rm(src, { recursive: true, force: true });
        return res.json({ status: 'success', message: 'Directory deleted' });

      default:
        return res
          .status(400)
          .json({ error: `Unsupported operationType: ${operationType}` });
    }
  } catch (err) {
    console.error('❌ File operation error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/* -------------------------------------------------------------------------- */
/*                        DATA TRANSFORMER ENDPOINTS                          */
/* -------------------------------------------------------------------------- */
app.post('/api/calculator', validateBody(calculatorSchema), (req, res) => {
  try {
    const { data, fieldName, expression } = req.body;

    // Convert {field} placeholders to bare identifiers, then evaluate inside a
    // sandboxed parser. This parser exposes ONLY arithmetic and the per-row
    // scope we pass in — it cannot reach `process`, `require`, or any global,
    // which closes the previous `new Function(...)` remote-code-execution hole.
    const exprText = expression.replace(/\{(\w+)\}/g, '$1');

    let parsed;
    try {
      parsed = exprParser.parse(exprText);
    } catch (parseErr) {
      return res.status(400).json({ error: `Invalid expression: ${parseErr.message}` });
    }

    const referencedVars = parsed.variables();

    const result = data.map((item) => {
      // Build a numeric scope limited to the variables the expression uses.
      // Missing / non-numeric values default to 0 (matches prior behaviour).
      const scope = {};
      for (const name of referencedVars) {
        const num = Number(item[name]);
        scope[name] = Number.isFinite(num) ? num : 0;
      }
      let value;
      try {
        value = parsed.evaluate(scope);
      } catch {
        value = null;
      }
      return { ...item, [fieldName]: value };
    });

    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/rename', (req, res) => {
  try {
    const { data, oldField, newField } = req.body;
    if (!Array.isArray(data)) throw new Error('data must be array');
    const result = data.map((item) => {
      if (Object.prototype.hasOwnProperty.call(item, oldField)) {
        const { [oldField]: _, ...rest } = item;
        return { ...rest, [newField]: item[oldField] };
      }
      return item;
    });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/sequence', (req, res) => {
  try {
    const { data, fieldName, startValue = 1 } = req.body;
    const result = data.map((item, idx) => ({
      ...item,
      [fieldName]: startValue + idx,
    }));
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/sort', (req, res) => {
  try {
    const { data, field, direction = 'ASC' } = req.body;
    const sorted = [...data].sort((a, b) => {
      if (a[field] < b[field]) return direction === 'ASC' ? -1 : 1;
      if (a[field] > b[field]) return direction === 'ASC' ? 1 : -1;
      return 0;
    });
    res.json(sorted);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/split', (req, res) => {
  try {
    const { data, field, delimiter, newFields } = req.body;
    const result = data.map((item) => {
      const parts = (item[field] || '').split(delimiter);
      const obj = { ...item };
      newFields.forEach((f, i) => (obj[f] = parts[i] ?? null));
      return obj;
    });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/string-operation', (req, res) => {
  try {
    const { data, field, operation } = req.body;
    const ops = {
      UPPERCASE: (str) => str.toUpperCase(),
      LOWERCASE: (str) => str.toLowerCase(),
      TRIM: (str) => str.trim(),
      REVERSE: (str) => str.split('').reverse().join(''),
      CAPITALIZE: (str) => str.charAt(0).toUpperCase() + str.slice(1),
    };
    const result = data.map((item) => ({
      ...item,
      [field]: ops[operation]((item[field] || '').toString()),
    }));
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/* -------------------------------------------------------------------------- */
/*                          PLUGIN PROXY ENDPOINTS                            */
/* -------------------------------------------------------------------------- */
const forwardPluginRequest = async (url, method, body, res) => {
  try {
    const response = await axios({ url, method, data: body });
    res.json(response.data);
  } catch (err) {
    res
      .status(err.response?.status || 500)
      .json({ error: err.message, details: err.response?.data });
  }
};

const pluginEndpoints = [
  'robot-handling',
  'capture-screenshot',
  'delay-row',
  'if-field-value-is-null',
  'null-if',
  'run-ssh-commands',
  'ping-a-host',
];
pluginEndpoints.forEach((ep) =>
  app.post(`/api/plugins/${ep}`, (req, res) =>
    forwardPluginRequest(
      `${cfg.ENGINE_URL}/api/plugins/${ep}`,
      'POST',
      req.body,
      res
    )
  )
);

/* -------------------------------------------------------------------------- */
/*                         DATABASE API PROXY ROUTES                          */
/* -------------------------------------------------------------------------- */
const SPRING_BASE_URL = `${cfg.ENGINE_URL}/api`;

async function proxyDatabaseRequest(req, res, endpoint) {
  try {
    if (!req.body || Object.keys(req.body).length === 0) {
      return res
        .status(400)
        .json({ error: 'Request body cannot be empty', endpoint });
    }
    const response = await axios.post(
      `${SPRING_BASE_URL}/${endpoint}`,
      req.body,
      { headers: { 'Content-Type': 'application/json' }, timeout: 10000 }
    );
    res.status(response.status).json(response.data);
  } catch (err) {
    res.status(err.response?.status || 500).json({
      error: 'Failed to process database operation',
      endpoint,
      details: err.response?.data || err.message,
    });
  }
}

[
  'create_table',
  'alter_table',
  'drop_table',
  'insert_records',
  'fetch_records',
  'update_records',
  'delete_records',
].forEach((ep) =>
  app.post(`/api/${ep}`, (req, res) => proxyDatabaseRequest(req, res, ep))
);

/* -------------------------------------------------------------------------- */
/*                           MAIL API PROXY ROUTES                            */
/* -------------------------------------------------------------------------- */
async function proxyMailRequest(req, res, endpoint) {
  try {
    if (!req.body || Object.keys(req.body).length === 0) {
      return res
        .status(400)
        .json({ error: 'Request body cannot be empty', endpoint });
    }
    const response = await axios.post(
      `${cfg.ENGINE_URL}/api/${endpoint}`,
      req.body,
      { headers: { 'Content-Type': 'application/json' }, timeout: 15000 }
    );
    res.status(response.status).json(response.data);
  } catch (err) {
    console.error(`❌ Mail API error for ${endpoint}:`, err.message);
    res.status(err.response?.status || 500).json({
      error: 'Failed to process mail operation',
      endpoint,
      details: err.response?.data || err.message,
    });
  }
}

['send_mail', 'reply_mail', 'forward_mail', 'download_attachment'].forEach(
  (ep) => app.post(`/api/${ep}`, (req, res) => proxyMailRequest(req, res, ep))
);

/* -------------------------------------------------------------------------- */
/*                              ERROR HANDLERS                                */
/* -------------------------------------------------------------------------- */
app.use((err, req, res, next) => {
  console.error('❌ Unhandled error:', err);
  res
    .status(500)
    .json({ error: 'Internal server error', timestamp: new Date().toISOString() });
});

app.use((req, res) => {
  res.status(404).json({ error: `Endpoint not found: ${req.method} ${req.path}` });
});

/* -------------------------------------------------------------------------- */
/*                               SERVER START                                 */
/* -------------------------------------------------------------------------- */
async function bootstrap() {
  if (
    cfg.PERSISTENCE_MODE === 'postgres' &&
    cfg.DATABASE_CONTRACT_CHECK_ENABLED
  ) {
    const contract = await inspectDatabaseContract({ schema: cfg.DB_SCHEMA });
    if (contract.status !== 'success') {
      const details = contract.problems.join('; ') || contract.verdict;
      if (cfg.DATABASE_CONTRACT_STRICT) {
        throw new Error(`PostgreSQL database contract failed: ${details}`);
      }
      console.warn(`⚠️  PostgreSQL database contract warning: ${details}`);
    } else {
      console.log('✅ PostgreSQL database closure contract verified.');
    }
  }

  const config = await loadServerConfig();
  // Prefer an explicit env-configured root; fall back to the (git-ignored)
  // runtime server_config.json if present.
  const workspaceRoot = cfg.WORKSPACE_ROOT || config.workspaceRoot;

  if (workspaceRoot) {
    try {
      const paths = await initWorkspace(workspaceRoot, true);
      await activateWorkspace(paths.rootDir, false);
      console.log('🔄 Restored workspace from config:', paths.rootDir);
    } catch (err) {
      console.warn(
        `⚠️  Could not restore previous workspace at '${workspaceRoot}': ${err.message}`
      );
      console.warn(
        '   Server will start without an active workspace. Use POST /api/workspace/select to choose one.'
      );
    }
  } else {
    console.log(
      'ℹ️  No workspace configured yet. Use POST /api/workspace/select to get started.'
    );
  }

  app.listen(PORT, () => {
    console.log(`🚀 Backend running at http://localhost:${PORT}`);
    console.log(`💾 Workspace persistence: ${cfg.PERSISTENCE_MODE}`);
    console.log(
      `📚 Execution persistence: ${
        cfg.PERSISTENCE_MODE === 'postgres'
          ? cfg.EXECUTION_PERSISTENCE_MODE
          : 'filesystem'
      }`
    );
    if (
      cfg.PERSISTENCE_MODE === 'postgres' &&
      cfg.EXECUTION_PERSISTENCE_MODE === 'postgres'
    ) {
      console.log(
        `✍️  PostgreSQL execution writes: ${
          cfg.DATABASE_EXECUTION_WRITE_ENABLED ? 'ENABLED' : 'DISABLED'
        }`
      );
      console.log(
        `🔎 PostgreSQL output-source API: ${
          cfg.EXECUTION_OUTPUT_SOURCE_API_ENABLED ? 'ENABLED' : 'DISABLED'
        }`
      );
    }
    console.log(
      `🧭 Server orchestrator ORCH-4D: ${
        cfg.ORCHESTRATOR_ENABLED ? 'ENABLED' : 'DISABLED'
      } (OPT-IN)`
    );
    if (cfg.PERSISTENCE_MODE === 'postgres') {
      console.log(
        `🧩 Plugin endpoint mapping dry-run API: ${
          cfg.PLUGIN_ENDPOINT_MAPPING_API_ENABLED ? 'ENABLED' : 'DISABLED'
        } (READ ONLY)`
      );
      console.log(
        `🕘 PostgreSQL version-history API: ${
          cfg.WORKFLOW_VERSION_HISTORY_API_ENABLED ? 'ENABLED' : 'DISABLED'
        }`
      );
      console.log(
        `✍️  PostgreSQL primary writes: ${
          cfg.DATABASE_PRIMARY_WRITE_ENABLED ? 'ENABLED' : 'DISABLED'
        }`
      );
    }
    console.log(`🕐 Started at: ${new Date().toLocaleString()}`);
  });
}

let shuttingDown = false;
async function gracefulShutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n🛑 ${signal} received. Closing PostgreSQL pool...`);
  try {
    await closePool();
  } catch (error) {
    console.error('❌ PostgreSQL pool shutdown failed:', error);
  } finally {
    process.exit(0);
  }
}

process.once('SIGINT', () => gracefulShutdown('SIGINT'));
process.once('SIGTERM', () => gracefulShutdown('SIGTERM'));

bootstrap().catch(async (err) => {
  console.error('❌ Fatal startup error:', err);
  try { await closePool(); } catch { /* ignore startup cleanup error */ }
  process.exit(1);
});