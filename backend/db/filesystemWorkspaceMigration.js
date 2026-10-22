'use strict';

const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const crypto = require('crypto');

const { query, withTransaction } = require('./pool');

const ROOT_FOLDER_ID = 'root';
const ALLOWED_WORKFLOW_STATUSES = new Set(['draft', 'active', 'paused']);

function parseIsoDate(value, fallback = null) {
  if (!value) return fallback;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date.toISOString();
}

function toPositiveInteger(value, fallback = 1) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isInteger(parsed) && parsed >= 1 ? parsed : fallback;
}

function toNonNegativeInteger(value, fallback = 0) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

function safeJsonObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function safeJsonArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeJsonValue(value) {
  const serialized = JSON.stringify(value);
  return serialized === undefined ? null : JSON.parse(serialized);
}

function canonicalStringify(value) {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalStringify(item)).join(',')}]`;
  }

  const keys = Object.keys(value).sort();
  return `{${keys
    .map((key) => `${JSON.stringify(key)}:${canonicalStringify(value[key])}`)
    .join(',')}}`;
}

function stableStringify(value) {
  // PostgreSQL jsonb stores JSON semantics, not JavaScript object semantics.
  // A JSON round-trip removes undefined object properties and converts
  // undefined array entries to null, matching what JSON.stringify sends to pg.
  return canonicalStringify(normalizeJsonValue(value));
}

function sanitizeDefinitionForDatabase(definition) {
  const sanitized = normalizeJsonValue(definition);
  const variables = Array.isArray(sanitized?.variables)
    ? sanitized.variables
    : [];

  sanitized.variables = variables.map((variable) => {
    if (!variable || typeof variable !== 'object') {
      return variable;
    }

    const isSecret =
      variable.isSecret === true || variable.scope === 'secret';

    if (!isSecret) {
      return variable;
    }

    const redacted = {
      ...variable,
      value: null,
      defaultValue: null,
      secretValueRedacted: true,
      credentialReferenceRequired: true,
    };

    return redacted;
  });

  return sanitized;
}

function sha256Buffer(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function sha256Json(value) {
  return sha256Buffer(Buffer.from(stableStringify(value), 'utf8'));
}

async function fileExists(filePath) {
  try {
    await fsp.access(filePath, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function readJson(filePath) {
  const raw = await fsp.readFile(filePath, 'utf8');
  try {
    return JSON.parse(raw);
  } catch (error) {
    const wrapped = new Error(`Invalid JSON in '${filePath}': ${error.message}`);
    wrapped.code = 'INVALID_JSON';
    throw wrapped;
  }
}

function resolveWorkspaceRoot({ explicitWorkspaceRoot, backendDir }) {
  if (explicitWorkspaceRoot) {
    return path.resolve(explicitWorkspaceRoot);
  }

  if (process.env.WORKSPACE_ROOT) {
    return path.resolve(process.env.WORKSPACE_ROOT);
  }

  const serverConfigPath = path.join(backendDir, 'server_config.json');
  if (fs.existsSync(serverConfigPath)) {
    try {
      const config = JSON.parse(fs.readFileSync(serverConfigPath, 'utf8'));
      if (config.workspaceRoot) {
        return path.resolve(config.workspaceRoot);
      }
    } catch (error) {
      throw new Error(
        `Cannot read backend/server_config.json: ${error.message}`
      );
    }
  }

  throw new Error(
    'Workspace root was not found. Set WORKSPACE_ROOT in backend/.env, ' +
      'keep workspaceRoot in backend/server_config.json, or pass --workspace-root.'
  );
}

function getFolderPath(meta, workspaceRoot, folderId) {
  if (folderId === ROOT_FOLDER_ID) return workspaceRoot;

  const parts = [];
  const visited = new Set();
  let currentId = folderId;

  while (currentId && currentId !== ROOT_FOLDER_ID) {
    if (visited.has(currentId)) {
      throw new Error(`Folder cycle detected at '${currentId}'.`);
    }
    visited.add(currentId);

    const folder = meta.folders[currentId];
    if (!folder) {
      throw new Error(`Folder '${currentId}' is missing from workspace.json.`);
    }

    parts.unshift(folder.name);
    currentId = folder.parentId;
  }

  return path.join(workspaceRoot, ...parts);
}

function workflowCandidates(meta, workspaceRoot, workflowId) {
  const workflowMeta = meta.workflows[workflowId];
  if (!workflowMeta) return [];

  const parentDir = getFolderPath(
    meta,
    workspaceRoot,
    workflowMeta.parentId || ROOT_FOLDER_ID
  );

  const candidates = [];

  if (workflowMeta.fileName) {
    candidates.push(path.join(parentDir, workflowMeta.fileName));
  }

  const safeName = String(workflowMeta.name || workflowId)
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
    .replace(/\s+/g, '-')
    .toLowerCase();

  if (safeName) {
    candidates.push(path.join(parentDir, `${safeName}.json`));
  }

  candidates.push(path.join(parentDir, `${workflowId}.json`));

  // Legacy central workflow directory.
  candidates.push(
    path.join(workspaceRoot, 'workflows', workflowMeta.fileName || `${workflowId}.json`)
  );

  return [...new Set(candidates.map((candidate) => path.resolve(candidate)))];
}

async function resolveWorkflowFile(meta, workspaceRoot, workflowId) {
  for (const candidate of workflowCandidates(meta, workspaceRoot, workflowId)) {
    if (await fileExists(candidate)) {
      return candidate;
    }
  }

  return null;
}

function buildWorkflowShell(workflowMeta) {
  const now = new Date().toISOString();

  return {
    id: workflowMeta.id,
    name: workflowMeta.name || workflowMeta.id,
    type: 'workflow',
    parentId: workflowMeta.parentId || ROOT_FOLDER_ID,
    status: workflowMeta.status || 'draft',
    description: workflowMeta.description || '',
    icon: workflowMeta.icon,
    actions: [],
    connections: [],
    variables: [],
    version: workflowMeta.version || 1,
    createdAt: workflowMeta.createdAt || now,
    updatedAt: workflowMeta.updatedAt || now,
  };
}

function normalizeWorkflow(workflowMeta, fileDefinition) {
  const file = safeJsonObject(fileDefinition);
  const definition = {
    ...buildWorkflowShell(workflowMeta),
    ...file,
  };

  // workspace.json is the authoritative navigation/index contract used by the
  // existing /api/workspace/tree and /api/workspace/workflows endpoints.
  // Legacy workflow JSON files may contain stale identity fields after an
  // out-of-band rename or move. Importing those stale fields can create false
  // sibling-name collisions even when the active workspace tree is valid.
  definition.id = String(workflowMeta.id || definition.id);
  definition.name = String(
    workflowMeta.name || definition.name || definition.id
  );
  definition.type = 'workflow';
  definition.parentId =
    workflowMeta.parentId || definition.parentId || ROOT_FOLDER_ID;
  definition.status =
    workflowMeta.status ?? definition.status ?? 'draft';
  definition.description = String(
    workflowMeta.description ?? definition.description ?? ''
  );
  definition.icon = workflowMeta.icon ?? definition.icon;

  // The workflow file remains authoritative for executable canvas content.
  definition.actions = safeJsonArray(file.actions ?? definition.actions);
  definition.connections = safeJsonArray(
    file.connections ?? definition.connections
  );
  definition.variables = safeJsonArray(file.variables ?? definition.variables);
  definition.triggers = safeJsonArray(file.triggers ?? definition.triggers);
  definition.schedule = file.schedule ?? definition.schedule;

  definition.createdAt =
    parseIsoDate(workflowMeta.createdAt) ||
    parseIsoDate(definition.createdAt) ||
    new Date().toISOString();
  definition.updatedAt =
    parseIsoDate(workflowMeta.updatedAt) ||
    parseIsoDate(definition.updatedAt) ||
    definition.createdAt;
  definition.version = toPositiveInteger(
    workflowMeta.version ?? definition.version,
    1
  );

  return definition;
}

function collectWorkflowIdentityDriftWarnings(
  workflowId,
  workflowMeta,
  fileDefinition,
  sourcePath
) {
  const warnings = [];
  const file = safeJsonObject(fileDefinition);

  if (!sourcePath || Object.keys(file).length === 0) {
    return warnings;
  }

  const comparisons = [
    ['id', workflowMeta.id || workflowId, file.id],
    ['name', workflowMeta.name, file.name],
    [
      'parentId',
      workflowMeta.parentId || ROOT_FOLDER_ID,
      file.parentId || ROOT_FOLDER_ID,
    ],
    ['status', workflowMeta.status || 'draft', file.status || 'draft'],
  ];

  for (const [field, metadataValue, fileValue] of comparisons) {
    if (
      fileValue !== undefined &&
      fileValue !== null &&
      String(metadataValue) !== String(fileValue)
    ) {
      warnings.push(
        `Workflow '${workflowId}' has stale file-level ${field}: ` +
          `workspace.json='${metadataValue}', file='${fileValue}'. ` +
          `The workspace.json value will be imported.`
      );
    }
  }

  return warnings;
}

function buildFolderOrder(meta) {
  const folders = meta.folders || {};
  const order = [];
  const permanent = new Set();
  const temporary = new Set();

  function visit(folderId) {
    if (permanent.has(folderId)) return;
    if (temporary.has(folderId)) {
      throw new Error(`Folder cycle detected involving '${folderId}'.`);
    }

    const folder = folders[folderId];
    if (!folder) {
      throw new Error(`Folder '${folderId}' is referenced but missing.`);
    }

    temporary.add(folderId);

    if (folderId !== ROOT_FOLDER_ID) {
      const parentId = folder.parentId || ROOT_FOLDER_ID;
      if (!folders[parentId]) {
        throw new Error(
          `Folder '${folderId}' references missing parent '${parentId}'.`
        );
      }
      visit(parentId);
    }

    temporary.delete(folderId);
    permanent.add(folderId);
    order.push(folderId);
  }

  Object.keys(folders).forEach(visit);

  return order;
}

function validateWorkspace(meta) {
  const errors = [];
  const warnings = [];

  if (!meta || typeof meta !== 'object') {
    errors.push('workspace.json must contain a JSON object.');
    return { errors, warnings };
  }

  meta.folders = safeJsonObject(meta.folders);
  meta.workflows = safeJsonObject(meta.workflows);

  if (!meta.folders[ROOT_FOLDER_ID]) {
    errors.push("workspace.json does not contain the required 'root' folder.");
  }

  for (const [folderId, folder] of Object.entries(meta.folders)) {
    if (!folderId || folderId.length > 100) {
      errors.push(`Folder ID '${folderId}' is empty or longer than 100 characters.`);
    }
    if (!folder || typeof folder !== 'object') {
      errors.push(`Folder '${folderId}' is not an object.`);
      continue;
    }
    if (!String(folder.name || '').trim()) {
      errors.push(`Folder '${folderId}' has no name.`);
    }
    if (
      folderId !== ROOT_FOLDER_ID &&
      !meta.folders[folder.parentId || ROOT_FOLDER_ID]
    ) {
      errors.push(
        `Folder '${folderId}' references missing parent '${folder.parentId}'.`
      );
    }
  }

  try {
    buildFolderOrder(meta);
  } catch (error) {
    errors.push(error.message);
  }

  const siblingFolderNames = new Map();
  for (const [folderId, folder] of Object.entries(meta.folders)) {
    if (folderId === ROOT_FOLDER_ID) continue;
    const parentId = folder.parentId || ROOT_FOLDER_ID;
    const key = `${parentId}\u0000${String(folder.name).toLowerCase()}`;
    if (siblingFolderNames.has(key)) {
      errors.push(
        `Duplicate folder name '${folder.name}' below parent '${parentId}'.`
      );
    }
    siblingFolderNames.set(key, folderId);
  }

  const siblingWorkflowNames = new Map();
  for (const [workflowId, workflow] of Object.entries(meta.workflows)) {
    if (!workflowId || workflowId.length > 100) {
      errors.push(
        `Workflow ID '${workflowId}' is empty or longer than 100 characters.`
      );
    }

    if (!workflow || typeof workflow !== 'object') {
      errors.push(`Workflow '${workflowId}' metadata is not an object.`);
      continue;
    }

    const parentId = workflow.parentId || ROOT_FOLDER_ID;
    if (!meta.folders[parentId]) {
      errors.push(
        `Workflow '${workflowId}' references missing folder '${parentId}'.`
      );
    }

    if (!String(workflow.name || '').trim()) {
      errors.push(`Workflow '${workflowId}' has no name.`);
    }

    const key = `${parentId}\u0000${String(workflow.name).toLowerCase()}`;
    if (siblingWorkflowNames.has(key)) {
      errors.push(
        `Duplicate workflow name '${workflow.name}' below folder '${parentId}'.`
      );
    }
    siblingWorkflowNames.set(key, workflowId);

    if (
      workflow.status &&
      !ALLOWED_WORKFLOW_STATUSES.has(String(workflow.status).toLowerCase())
    ) {
      warnings.push(
        `Workflow '${workflowId}' status '${workflow.status}' will be imported as 'draft'.`
      );
    }
  }

  return { errors, warnings };
}

function validateDefinition(definition, sourcePath) {
  const errors = [];
  const warnings = [];

  const nodeIds = new Set();
  for (const [index, action] of definition.actions.entries()) {
    const nodeId = String(action?.id || '');
    if (!nodeId) {
      errors.push(
        `Workflow '${definition.id}' action at index ${index} has no id.`
      );
      continue;
    }
    if (nodeId.length > 200) {
      errors.push(
        `Workflow '${definition.id}' node ID '${nodeId}' exceeds 200 characters.`
      );
    }
    if (nodeIds.has(nodeId)) {
      errors.push(
        `Workflow '${definition.id}' contains duplicate node ID '${nodeId}'.`
      );
    }
    nodeIds.add(nodeId);
  }

  const connectionIds = new Set();
  for (const [index, connection] of definition.connections.entries()) {
    const connectionId = String(connection?.id || `connection-${index + 1}`);
    const sourceId = String(connection?.sourceId || '');
    const targetId = String(connection?.targetId || '');

    if (connectionIds.has(connectionId)) {
      errors.push(
        `Workflow '${definition.id}' contains duplicate connection ID '${connectionId}'.`
      );
    }
    connectionIds.add(connectionId);

    if (!nodeIds.has(sourceId)) {
      errors.push(
        `Workflow '${definition.id}' connection '${connectionId}' references missing source '${sourceId}'.`
      );
    }
    if (!nodeIds.has(targetId)) {
      errors.push(
        `Workflow '${definition.id}' connection '${connectionId}' references missing target '${targetId}'.`
      );
    }
  }

  const variableIds = new Set();
  const variableNames = new Set();
  for (const [index, variable] of definition.variables.entries()) {
    const variableId = String(variable?.id || '');
    const variableName = String(variable?.name || '');

    if (!variableId) {
      errors.push(
        `Workflow '${definition.id}' variable at index ${index} has no id.`
      );
    } else if (variableIds.has(variableId)) {
      errors.push(
        `Workflow '${definition.id}' contains duplicate variable ID '${variableId}'.`
      );
    } else {
      variableIds.add(variableId);
    }

    if (!variableName) {
      errors.push(
        `Workflow '${definition.id}' variable at index ${index} has no name.`
      );
    } else {
      const normalizedName = variableName.toLowerCase();
      if (variableNames.has(normalizedName)) {
        errors.push(
          `Workflow '${definition.id}' contains duplicate variable name '${variableName}'.`
        );
      }
      variableNames.add(normalizedName);
    }

    if (variable?.isSecret && variable.value !== undefined && variable.value !== null) {
      warnings.push(
        `Secret variable '${variableName || variableId}' from '${definition.id}' will be redacted during migration.`
      );
    }
  }

  if (!sourcePath) {
    warnings.push(
      `Workflow '${definition.id}' file is missing. A metadata-based shell will be imported.`
    );
  }

  return { errors, warnings };
}

async function inspectFilesystemWorkspace({ workspaceRoot }) {
  const workspaceFile = path.join(workspaceRoot, 'workspace.json');

  if (!(await fileExists(workspaceFile))) {
    throw new Error(`workspace.json was not found at '${workspaceFile}'.`);
  }

  const meta = await readJson(workspaceFile);
  const workspaceValidation = validateWorkspace(meta);

  const workflows = [];
  const definitionErrors = [];
  const definitionWarnings = [];

  for (const [workflowId, workflowMetaRaw] of Object.entries(meta.workflows)) {
    const workflowMeta = {
      ...workflowMetaRaw,
      id: workflowMetaRaw.id || workflowId,
    };

    const sourcePath = await resolveWorkflowFile(meta, workspaceRoot, workflowId);
    let sourceDefinition = null;

    if (sourcePath) {
      sourceDefinition = await readJson(sourcePath);
    }

    const definition = normalizeWorkflow(workflowMeta, sourceDefinition);
    const validation = validateDefinition(definition, sourcePath);
    const identityDriftWarnings = collectWorkflowIdentityDriftWarnings(
      workflowId,
      workflowMeta,
      sourceDefinition,
      sourcePath
    );

    definitionErrors.push(...validation.errors);
    definitionWarnings.push(
      ...identityDriftWarnings,
      ...validation.warnings
    );

    workflows.push({
      workflowId,
      workflowMeta,
      definition,
      sourcePath,
      definitionHash: sha256Json(definition),
    });
  }

  // Validate the exact normalized identities that will be inserted, not only
  // the raw workspace metadata. This prevents database-only surprises.
  const effectiveSiblingNames = new Map();
  for (const item of workflows) {
    const parentId = item.definition.parentId || ROOT_FOLDER_ID;
    const normalizedName = String(item.definition.name || '')
      .trim()
      .toLowerCase();
    const key = `${parentId}\u0000${normalizedName}`;
    const existing = effectiveSiblingNames.get(key);

    if (existing) {
      definitionErrors.push(
        `Effective migration collision below folder '${parentId}': ` +
          `workflow '${existing.workflowId}' and workflow ` +
          `'${item.workflowId}' both resolve to name ` +
          `'${item.definition.name}'.`
      );
    } else {
      effectiveSiblingNames.set(key, item);
    }
  }

  return {
    workspaceRoot,
    workspaceFile,
    meta,
    folderOrder: buildFolderOrder(meta),
    workflows,
    errors: [...workspaceValidation.errors, ...definitionErrors],
    warnings: [...workspaceValidation.warnings, ...definitionWarnings],
  };
}

async function copyFileWithManifest(source, destinationRoot, workspaceRoot, manifest) {
  const relative = path.relative(workspaceRoot, source);
  const safeRelative =
    !relative.startsWith('..') && !path.isAbsolute(relative)
      ? relative
      : path.join('_external', path.basename(source));

  const destination = path.join(destinationRoot, safeRelative);
  await fsp.mkdir(path.dirname(destination), { recursive: true });
  await fsp.copyFile(source, destination);

  const content = await fsp.readFile(source);
  manifest.files.push({
    source,
    backup: destination,
    relativePath: safeRelative,
    sizeBytes: content.length,
    sha256: sha256Buffer(content),
  });
}

async function createMigrationBackup({
  inspection,
  backendDir,
  backupRoot,
}) {
  const timestamp = new Date()
    .toISOString()
    .replace(/[:.]/g, '-');

  const destinationRoot = path.resolve(
    backupRoot || path.join(backendDir, 'migration_backups'),
    `filesystem-to-postgres-${timestamp}`
  );

  await fsp.mkdir(destinationRoot, { recursive: true });

  const manifest = {
    formatVersion: 1,
    createdAt: new Date().toISOString(),
    workspaceRoot: inspection.workspaceRoot,
    workspaceFile: inspection.workspaceFile,
    folderCount: Object.keys(inspection.meta.folders).length,
    workflowCount: inspection.workflows.length,
    files: [],
  };

  await copyFileWithManifest(
    inspection.workspaceFile,
    destinationRoot,
    inspection.workspaceRoot,
    manifest
  );

  for (const workflow of inspection.workflows) {
    if (workflow.sourcePath) {
      await copyFileWithManifest(
        workflow.sourcePath,
        destinationRoot,
        inspection.workspaceRoot,
        manifest
      );
    }
  }

  const manifestPath = path.join(destinationRoot, 'migration-manifest.json');
  await fsp.writeFile(
    manifestPath,
    JSON.stringify(manifest, null, 2),
    'utf8'
  );

  return {
    destinationRoot,
    manifestPath,
    manifest,
  };
}

async function getDefaultWorkspace(client, workspaceKey) {
  const result = await client.query(
    `
      SELECT id, workspace_key, name
      FROM autoflow.workspace
      WHERE workspace_key = $1
        AND deleted_at IS NULL
      LIMIT 1
    `,
    [workspaceKey]
  );

  if (result.rowCount !== 1) {
    throw new Error(
      `Expected one active PostgreSQL workspace '${workspaceKey}', found ${result.rowCount}.`
    );
  }

  return result.rows[0];
}

async function importFolders(client, inspection, workspace) {
  const folderDbIds = new Map();
  const rootResult = await client.query(
    `
      SELECT id
      FROM autoflow.workspace_folder
      WHERE workspace_id = $1
        AND folder_key = 'root'
        AND deleted_at IS NULL
      LIMIT 1
    `,
    [workspace.id]
  );

  if (rootResult.rowCount !== 1) {
    throw new Error("PostgreSQL root folder 'root' was not found.");
  }

  folderDbIds.set(ROOT_FOLDER_ID, rootResult.rows[0].id);

  let imported = 0;
  let updated = 0;

  for (const [index, folderId] of inspection.folderOrder.entries()) {
    if (folderId === ROOT_FOLDER_ID) continue;

    const folder = inspection.meta.folders[folderId];
    const parentKey = folder.parentId || ROOT_FOLDER_ID;
    const parentDbId = folderDbIds.get(parentKey);

    if (!parentDbId) {
      throw new Error(
        `Cannot map database parent for folder '${folderId}' (${parentKey}).`
      );
    }

    const result = await client.query(
      `
        INSERT INTO autoflow.workspace_folder (
          workspace_id,
          folder_key,
          parent_id,
          name,
          is_root,
          sort_order,
          metadata,
          created_by,
          updated_by,
          created_at,
          updated_at,
          deleted_at
        )
        VALUES (
          $1, $2, $3, $4, false, $5, $6::jsonb,
          'filesystem-migration', 'filesystem-migration',
          $7::timestamptz, $8::timestamptz, NULL
        )
        ON CONFLICT (workspace_id, folder_key)
        DO UPDATE SET
          parent_id = EXCLUDED.parent_id,
          name = EXCLUDED.name,
          sort_order = EXCLUDED.sort_order,
          metadata = EXCLUDED.metadata,
          updated_by = 'filesystem-migration',
          deleted_at = NULL
        RETURNING id, (xmax = 0) AS inserted
      `,
      [
        workspace.id,
        folderId,
        parentDbId,
        String(folder.name),
        index,
        JSON.stringify({
          source: 'filesystem',
          sourcePath: getFolderPath(
            inspection.meta,
            inspection.workspaceRoot,
            folderId
          ),
          frontendType: folder.type || 'folder',
        }),
        parseIsoDate(folder.createdAt, new Date().toISOString()),
        parseIsoDate(
          folder.updatedAt,
          parseIsoDate(folder.createdAt, new Date().toISOString())
        ),
      ]
    );

    folderDbIds.set(folderId, result.rows[0].id);
    if (result.rows[0].inserted) imported += 1;
    else updated += 1;
  }

  return { folderDbIds, imported, updated };
}

function normalizeWorkflowStatus(status) {
  const normalized = String(status || 'draft').toLowerCase();
  return ALLOWED_WORKFLOW_STATUSES.has(normalized) ? normalized : 'draft';
}

async function upsertWorkflow(
  client,
  inspection,
  workspace,
  folderDbIds,
  item,
  sortOrder
) {
  const { workflowId, workflowMeta, definition, sourcePath } = item;
  const parentKey =
    definition.parentId || workflowMeta.parentId || ROOT_FOLDER_ID;
  const folderId = folderDbIds.get(parentKey);

  if (!folderId) {
    throw new Error(
      `Cannot map database folder '${parentKey}' for workflow '${workflowId}'.`
    );
  }

  const status = normalizeWorkflowStatus(
    definition.status ?? workflowMeta.status
  );
  const requestedVersion = toPositiveInteger(
    definition.version ?? workflowMeta.version,
    1
  );

  const result = await client.query(
    `
      INSERT INTO autoflow.workflow (
        workspace_id,
        folder_id,
        workflow_key,
        name,
        description,
        status,
        icon,
        current_version_number,
        last_run_at,
        sort_order,
        metadata,
        created_by,
        updated_by,
        created_at,
        updated_at,
        deleted_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8,
        $9::timestamptz, $10, $11::jsonb,
        'filesystem-migration', 'filesystem-migration',
        $12::timestamptz, $13::timestamptz, NULL
      )
      ON CONFLICT (workspace_id, workflow_key)
      DO UPDATE SET
        folder_id = EXCLUDED.folder_id,
        name = EXCLUDED.name,
        description = EXCLUDED.description,
        status = EXCLUDED.status,
        icon = EXCLUDED.icon,
        last_run_at = EXCLUDED.last_run_at,
        sort_order = EXCLUDED.sort_order,
        metadata = EXCLUDED.metadata,
        updated_by = 'filesystem-migration',
        deleted_at = NULL
      RETURNING id, current_version_number, (xmax = 0) AS inserted
    `,
    [
      workspace.id,
      folderId,
      workflowId,
      definition.name,
      definition.description || '',
      status,
      definition.icon || workflowMeta.icon || 'FileCode2',
      requestedVersion,
      parseIsoDate(definition.lastRun ?? workflowMeta.lastRun),
      sortOrder,
      JSON.stringify({
        source: 'filesystem',
        sourceFile: sourcePath,
        sourceFileName: workflowMeta.fileName || null,
        originalStatus:
          definition.status ?? workflowMeta.status ?? null,
        sourceDefinitionHash: item.definitionHash,
      }),
      definition.createdAt,
      definition.updatedAt,
    ]
  );

  return {
    workflowDbId: result.rows[0].id,
    requestedVersion,
    workflowInserted: result.rows[0].inserted,
  };
}

async function findMatchingVersion(client, workspaceId, workflowDbId, definition) {
  const result = await client.query(
    `
      SELECT id, version_number, definition_json
      FROM autoflow.workflow_version
      WHERE workspace_id = $1
        AND workflow_id = $2
      ORDER BY version_number
    `,
    [workspaceId, workflowDbId]
  );

  const canonical = stableStringify(definition);

  const matching = result.rows.find(
    (row) => stableStringify(row.definition_json) === canonical
  );

  return {
    matching,
    maxVersion: result.rows.reduce(
      (max, row) => Math.max(max, Number(row.version_number)),
      0
    ),
  };
}

async function insertWorkflowVersion(
  client,
  workspace,
  workflowDbId,
  definition,
  requestedVersion
) {
  const persistedDefinition = sanitizeDefinitionForDatabase(definition);

  const existing = await findMatchingVersion(
    client,
    workspace.id,
    workflowDbId,
    persistedDefinition
  );

  if (existing.matching) {
    await client.query(
      `
        UPDATE autoflow.workflow
        SET current_version_number = $3,
            updated_by = 'filesystem-migration'
        WHERE workspace_id = $1
          AND id = $2
      `,
      [workspace.id, workflowDbId, existing.matching.version_number]
    );

    return {
      workflowVersionDbId: existing.matching.id,
      versionNumber: Number(existing.matching.version_number),
      inserted: false,
      unchanged: true,
    };
  }

  const versionNumber = Math.max(
    requestedVersion,
    existing.maxVersion + 1
  );

  const result = await client.query(
    `
      INSERT INTO autoflow.workflow_version (
        workspace_id,
        workflow_id,
        version_number,
        version_label,
        label,
        description,
        source_type,
        definition_schema_version,
        definition_json,
        definition_sha256,
        action_count,
        connection_count,
        variable_count,
        is_published,
        created_by,
        created_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6,
        'MIGRATION', 1, $7::jsonb,
        repeat('0', 64),
        $8, $9, $10,
        false, 'filesystem-migration',
        $11::timestamptz
      )
      RETURNING id, version_number
    `,
    [
      workspace.id,
      workflowDbId,
      versionNumber,
      `v${versionNumber}`,
      `Filesystem import v${versionNumber}`,
      'Imported from the existing AutoFlow workspace filesystem.',
      JSON.stringify(persistedDefinition),
      persistedDefinition.actions.length,
      persistedDefinition.connections.length,
      persistedDefinition.variables.length,
      definition.updatedAt,
    ]
  );

  return {
    workflowVersionDbId: result.rows[0].id,
    versionNumber: Number(result.rows[0].version_number),
    inserted: true,
    unchanged: false,
  };
}

function nodeExecutionPolicy(action) {
  return {
    retries: action.retries,
    retryDelay: action.retryDelay,
    timeout: action.timeout,
    onError: action.onError,
    fallbackActionId: action.fallbackActionId,
    dependsOn: action.dependsOn,
  };
}

async function insertNodes(
  client,
  workspace,
  workflowDbId,
  workflowVersionDbId,
  definition
) {
  for (const [index, action] of definition.actions.entries()) {
    await client.query(
      `
        INSERT INTO autoflow.workflow_node (
          workspace_id,
          workflow_id,
          workflow_version_id,
          node_key,
          node_type,
          category,
          plugin_id,
          action_id,
          name,
          description,
          icon,
          logo,
          position_x,
          position_y,
          width,
          height,
          sequence_hint,
          is_control_node,
          is_disabled,
          properties_json,
          api_json,
          property_config_json,
          input_mapping_json,
          output_mapping_json,
          execution_policy_json,
          node_json
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8,
          $9, $10, $11, $12,
          $13, $14, $15, $16, $17,
          $18, $19,
          $20::jsonb, $21::jsonb, $22::jsonb,
          $23::jsonb, $24::jsonb, $25::jsonb,
          $26::jsonb
        )
      `,
      [
        workspace.id,
        workflowDbId,
        workflowVersionDbId,
        String(action.id),
        String(action.type || 'unknown'),
        action.category || null,
        action.pluginId || action.plugin || action.category || null,
        action.actionId || action.type || null,
        String(action.name || action.type || action.id),
        action.description || null,
        action.icon || null,
        action.logo || null,
        Number(action.x || 0),
        Number(action.y || 0),
        action.width == null ? null : Number(action.width),
        action.height == null ? null : Number(action.height),
        index,
        Boolean(action.isControlNode),
        Boolean(action.disabled),
        JSON.stringify(safeJsonObject(action.properties)),
        JSON.stringify(safeJsonObject(action.api)),
        JSON.stringify(safeJsonObject(action.propertyConfig)),
        JSON.stringify(safeJsonObject(action.inputMapping)),
        JSON.stringify(safeJsonObject(action.outputMapping)),
        JSON.stringify(nodeExecutionPolicy(action)),
        JSON.stringify(action),
      ]
    );
  }
}

async function insertConnections(
  client,
  workspace,
  workflowDbId,
  workflowVersionDbId,
  definition
) {
  for (const [index, connection] of definition.connections.entries()) {
    const connectionKey = String(
      connection.id || `connection-${index + 1}`
    );

    await client.query(
      `
        INSERT INTO autoflow.workflow_connection (
          workspace_id,
          workflow_id,
          workflow_version_id,
          connection_key,
          source_node_key,
          target_node_key,
          connection_type,
          condition_expression,
          condition_type,
          priority,
          routing_strategy,
          label,
          source_port,
          target_port,
          source_point_index,
          line_style,
          color,
          is_disabled,
          metadata,
          connection_json
        )
        VALUES (
          $1, $2, $3, $4, $5, $6,
          $7, $8, $9, $10, $11,
          $12, $13, $14, $15, $16, $17, $18,
          $19::jsonb, $20::jsonb
        )
      `,
      [
        workspace.id,
        workflowDbId,
        workflowVersionDbId,
        connectionKey,
        String(connection.sourceId),
        String(connection.targetId),
        connection.type || 'default',
        connection.condition || null,
        connection.conditionType || null,
        toNonNegativeInteger(connection.priority, 0),
        connection.routingStrategy || 'first-match',
        connection.label || null,
        connection.sourcePort || null,
        connection.targetPort || null,
        connection.sourcePointIndex == null
          ? null
          : Number(connection.sourcePointIndex),
        connection.style || null,
        connection.color || null,
        Boolean(connection.isDisabled),
        JSON.stringify(safeJsonObject(connection.metadata)),
        JSON.stringify(connection),
      ]
    );
  }
}

async function insertVariables(
  client,
  workspace,
  workflowDbId,
  workflowVersionDbId,
  definition
) {
  for (const variable of definition.variables) {
    const isSecret = Boolean(variable.isSecret);
    const variableScope =
      variable.scope === 'local' ||
      variable.scope === 'secret' ||
      variable.scope === 'global'
        ? variable.scope
        : isSecret
          ? 'secret'
          : 'global';

    const variableType = [
      'string',
      'number',
      'boolean',
      'object',
      'array',
      'dictionary',
    ].includes(variable.type)
      ? variable.type
      : 'string';

    await client.query(
      `
        INSERT INTO autoflow.workflow_variable (
          workspace_id,
          workflow_id,
          workflow_version_id,
          variable_key,
          name,
          data_type,
          scope,
          description,
          is_secret,
          is_required,
          is_masked,
          value_json,
          default_value_json,
          validation_rules_json,
          metadata,
          last_updated_at
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8,
          $9, $10, $11,
          $12::jsonb, $13::jsonb, $14::jsonb, $15::jsonb,
          $16::timestamptz
        )
      `,
      [
        workspace.id,
        workflowDbId,
        workflowVersionDbId,
        String(variable.id),
        String(variable.name),
        variableType,
        variableScope,
        variable.description || null,
        isSecret,
        Boolean(variable.required),
        Boolean(variable.masked),
        isSecret ? null : JSON.stringify(variable.value ?? null),
        JSON.stringify(variable.defaultValue ?? null),
        JSON.stringify(safeJsonObject(variable.validationRules)),
        JSON.stringify({
          source: 'filesystem',
          secretValueRedacted: isSecret,
        }),
        parseIsoDate(variable.lastUpdated),
      ]
    );
  }
}

async function insertScheduleAndTriggers(
  client,
  workspace,
  workflowDbId,
  workflowVersionDbId,
  definition
) {
  let scheduleDbId = null;

  if (definition.schedule && typeof definition.schedule === 'object') {
    const schedule = definition.schedule;

    const result = await client.query(
      `
        INSERT INTO autoflow.workflow_schedule (
          workspace_id,
          workflow_id,
          workflow_version_id,
          schedule_key,
          enabled,
          schedule_type,
          schedule_value,
          timezone,
          next_run_at,
          last_run_at,
          retry_on_failure,
          max_runs,
          total_runs,
          metadata
        )
        VALUES (
          $1, $2, $3, 'schedule',
          $4, $5, $6, $7,
          $8::timestamptz, $9::timestamptz,
          $10, $11, 0, $12::jsonb
        )
        RETURNING id
      `,
      [
        workspace.id,
        workflowDbId,
        workflowVersionDbId,
        Boolean(schedule.enabled),
        schedule.type === 'cron' ? 'cron' : 'interval',
        String(schedule.value || '1h'),
        String(schedule.timezone || 'UTC'),
        parseIsoDate(schedule.nextRun),
        parseIsoDate(schedule.lastRun),
        Boolean(schedule.retryOnFailure),
        toNonNegativeInteger(schedule.maxRuns, 0),
        JSON.stringify(schedule),
      ]
    );

    scheduleDbId = result.rows[0].id;
  }

  for (const [index, trigger] of definition.triggers.entries()) {
    const triggerType = [
      'manual',
      'schedule',
      'file-watcher',
      'webhook',
      'email',
      'event',
    ].includes(trigger.type)
      ? trigger.type
      : 'manual';

    await client.query(
      `
        INSERT INTO autoflow.workflow_trigger (
          workspace_id,
          workflow_id,
          workflow_version_id,
          trigger_key,
          trigger_type,
          name,
          description,
          enabled,
          schedule_id,
          properties_json,
          conditions_json,
          retry_policy_json,
          last_triggered_at,
          metadata
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9,
          $10::jsonb, $11::jsonb, $12::jsonb,
          $13::timestamptz, $14::jsonb
        )
      `,
      [
        workspace.id,
        workflowDbId,
        workflowVersionDbId,
        String(trigger.id || `trigger-${index + 1}`),
        triggerType,
        String(trigger.name || triggerType),
        trigger.description || null,
        trigger.enabled !== false,
        triggerType === 'schedule' ? scheduleDbId : null,
        JSON.stringify(safeJsonObject(trigger.properties)),
        JSON.stringify(safeJsonArray(trigger.conditions)),
        JSON.stringify(safeJsonObject(trigger.retryPolicy)),
        parseIsoDate(trigger.lastTriggeredAt),
        JSON.stringify(trigger),
      ]
    );
  }
}

async function importFilesystemWorkspace({
  inspection,
  workspaceKey = 'default',
  backup,
}) {
  return withTransaction(async (client) => {
    const workspace = await getDefaultWorkspace(client, workspaceKey);

    await client.query(
      `
        UPDATE autoflow.workspace
        SET
          storage_mode = 'HYBRID',
          storage_root = $2,
          settings = settings || $3::jsonb,
          updated_by = 'filesystem-migration'
        WHERE id = $1
      `,
      [
        workspace.id,
        inspection.workspaceRoot,
        JSON.stringify({
          filesystemMigration: {
            appliedAt: new Date().toISOString(),
            backupPath: backup.destinationRoot,
            sourceWorkspaceFile: inspection.workspaceFile,
          },
        }),
      ]
    );

    const folderResult = await importFolders(
      client,
      inspection,
      workspace
    );

    const summary = {
      foldersInserted: folderResult.imported,
      foldersUpdated: folderResult.updated,
      workflowsInserted: 0,
      workflowsUpdated: 0,
      versionsInserted: 0,
      versionsUnchanged: 0,
      nodesInserted: 0,
      connectionsInserted: 0,
      variablesInserted: 0,
      schedulesInserted: 0,
      triggersInserted: 0,
    };

    for (const [index, item] of inspection.workflows.entries()) {
      const workflowResult = await upsertWorkflow(
        client,
        inspection,
        workspace,
        folderResult.folderDbIds,
        item,
        index
      );

      if (workflowResult.workflowInserted) {
        summary.workflowsInserted += 1;
      } else {
        summary.workflowsUpdated += 1;
      }

      const versionResult = await insertWorkflowVersion(
        client,
        workspace,
        workflowResult.workflowDbId,
        item.definition,
        workflowResult.requestedVersion
      );

      if (versionResult.inserted) {
        summary.versionsInserted += 1;

        await insertNodes(
          client,
          workspace,
          workflowResult.workflowDbId,
          versionResult.workflowVersionDbId,
          item.definition
        );
        summary.nodesInserted += item.definition.actions.length;

        await insertConnections(
          client,
          workspace,
          workflowResult.workflowDbId,
          versionResult.workflowVersionDbId,
          item.definition
        );
        summary.connectionsInserted += item.definition.connections.length;

        await insertVariables(
          client,
          workspace,
          workflowResult.workflowDbId,
          versionResult.workflowVersionDbId,
          item.definition
        );
        summary.variablesInserted += item.definition.variables.length;

        await insertScheduleAndTriggers(
          client,
          workspace,
          workflowResult.workflowDbId,
          versionResult.workflowVersionDbId,
          item.definition
        );

        if (item.definition.schedule) {
          summary.schedulesInserted += 1;
        }
        summary.triggersInserted += item.definition.triggers.length;
      } else {
        summary.versionsUnchanged += 1;
      }
    }

    await client.query(
      `
        INSERT INTO autoflow.audit_log (
          workspace_id,
          actor_type,
          actor_id,
          action,
          entity_type,
          entity_key,
          success,
          after_json,
          metadata
        )
        VALUES (
          $1,
          'SYSTEM',
          'filesystem-migration',
          'WORKSPACE_FILESYSTEM_IMPORT',
          'workspace',
          $2,
          true,
          $3::jsonb,
          $4::jsonb
        )
      `,
      [
        workspace.id,
        workspace.workspace_key,
        JSON.stringify(summary),
        JSON.stringify({
          sourceWorkspaceRoot: inspection.workspaceRoot,
          backupPath: backup.destinationRoot,
        }),
      ]
    );

    return summary;
  });
}

async function getDatabaseWorkspaceSnapshot(workspaceKey = 'default') {
  const workspaceResult = await query(
    `
      SELECT id, workspace_key
      FROM autoflow.workspace
      WHERE workspace_key = $1
        AND deleted_at IS NULL
      LIMIT 1
    `,
    [workspaceKey]
  );

  if (workspaceResult.rowCount !== 1) {
    throw new Error(`PostgreSQL workspace '${workspaceKey}' was not found.`);
  }

  const workspace = workspaceResult.rows[0];

  const foldersResult = await query(
    `
      SELECT
        folder.folder_key AS id,
        folder.name,
        parent.folder_key AS "parentId"
      FROM autoflow.workspace_folder folder
      LEFT JOIN autoflow.workspace_folder parent
        ON parent.workspace_id = folder.workspace_id
       AND parent.id = folder.parent_id
      WHERE folder.workspace_id = $1
        AND folder.deleted_at IS NULL
      ORDER BY folder.folder_key
    `,
    [workspace.id]
  );

  const workflowsResult = await query(
    `
      SELECT
        workflow.workflow_key AS id,
        workflow.name,
        folder.folder_key AS "parentId",
        workflow.status,
        workflow.current_version_number AS version,
        version.definition_json AS definition
      FROM autoflow.workflow workflow
      JOIN autoflow.workspace_folder folder
        ON folder.workspace_id = workflow.workspace_id
       AND folder.id = workflow.folder_id
      LEFT JOIN autoflow.workflow_version version
        ON version.workspace_id = workflow.workspace_id
       AND version.workflow_id = workflow.id
       AND version.version_number = workflow.current_version_number
      WHERE workflow.workspace_id = $1
        AND workflow.deleted_at IS NULL
      ORDER BY workflow.workflow_key
    `,
    [workspace.id]
  );

  return {
    folders: foldersResult.rows,
    workflows: workflowsResult.rows,
  };
}

async function compareFilesystemAndDatabase({
  inspection,
  workspaceKey = 'default',
}) {
  const database = await getDatabaseWorkspaceSnapshot(workspaceKey);
  const mismatches = [];

  const dbFolders = new Map(database.folders.map((folder) => [folder.id, folder]));
  const dbWorkflows = new Map(
    database.workflows.map((workflow) => [workflow.id, workflow])
  );

  for (const [folderId, folder] of Object.entries(inspection.meta.folders)) {
    const dbFolder = dbFolders.get(folderId);
    if (!dbFolder) {
      mismatches.push(`Database is missing folder '${folderId}'.`);
      continue;
    }

    const expectedParent =
      folderId === ROOT_FOLDER_ID
        ? null
        : folder.parentId || ROOT_FOLDER_ID;

    if (dbFolder.name !== folder.name) {
      mismatches.push(
        `Folder '${folderId}' name differs: filesystem='${folder.name}', database='${dbFolder.name}'.`
      );
    }

    if (dbFolder.parentId !== expectedParent) {
      mismatches.push(
        `Folder '${folderId}' parent differs: filesystem='${expectedParent}', database='${dbFolder.parentId}'.`
      );
    }
  }

  for (const item of inspection.workflows) {
    const dbWorkflow = dbWorkflows.get(item.workflowId);
    if (!dbWorkflow) {
      mismatches.push(`Database is missing workflow '${item.workflowId}'.`);
      continue;
    }

    const expectedParent =
      item.definition.parentId ||
      item.workflowMeta.parentId ||
      ROOT_FOLDER_ID;

    if (dbWorkflow.name !== item.definition.name) {
      mismatches.push(
        `Workflow '${item.workflowId}' name differs: filesystem='${item.definition.name}', database='${dbWorkflow.name}'.`
      );
    }

    if (dbWorkflow.parentId !== expectedParent) {
      mismatches.push(
        `Workflow '${item.workflowId}' parent differs: filesystem='${expectedParent}', database='${dbWorkflow.parentId}'.`
      );
    }

    if (
      dbWorkflow.definition &&
      stableStringify(dbWorkflow.definition) !==
        stableStringify(sanitizeDefinitionForDatabase(item.definition))
    ) {
      mismatches.push(
        `Workflow '${item.workflowId}' current definition differs from the filesystem definition.`
      );
    }
  }

  if (database.folders.length !== Object.keys(inspection.meta.folders).length) {
    mismatches.push(
      `Folder count differs: filesystem=${Object.keys(inspection.meta.folders).length}, database=${database.folders.length}.`
    );
  }

  if (database.workflows.length !== inspection.workflows.length) {
    mismatches.push(
      `Workflow count differs: filesystem=${inspection.workflows.length}, database=${database.workflows.length}.`
    );
  }

  return {
    filesystemFolderCount: Object.keys(inspection.meta.folders).length,
    databaseFolderCount: database.folders.length,
    filesystemWorkflowCount: inspection.workflows.length,
    databaseWorkflowCount: database.workflows.length,
    mismatches,
    match: mismatches.length === 0,
  };
}

module.exports = {
  compareFilesystemAndDatabase,
  createMigrationBackup,
  importFilesystemWorkspace,
  inspectFilesystemWorkspace,
  resolveWorkspaceRoot,
  sanitizeDefinitionForDatabase,
};
