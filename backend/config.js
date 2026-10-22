/**
 * Centralized backend configuration.
 *
 * Every tunable (ports, upstream engine URL, CORS, auth, rate limits, file-op
 * sandbox) is read from the environment with a safe local-dev default, so there
 * are no hard-coded hosts/ports scattered through the codebase.
 *
 * `.env` is loaded if present (and if `dotenv` is installed); real environment
 * variables always win.
 */
try {
  // dotenv is optional at runtime — real env vars work even if it's absent.
  require('dotenv').config();
} catch {
  /* dotenv not installed yet; rely on process.env */
}

function parseList(value, fallback) {
  if (!value || typeof value !== 'string') return fallback;
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function asBool(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  return String(value).toLowerCase() === 'true';
}

const cfg = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: Number(process.env.PORT) || 8081,

  // Upstream Spring automation engine (plugin execution, DB & mail proxies).
  ENGINE_URL: (process.env.ENGINE_URL || 'http://localhost:8080').replace(/\/+$/, ''),

  // CORS allow-list (comma-separated origins).
  CORS_ORIGINS: parseList(process.env.CORS_ORIGINS, ['http://localhost:5173']),

  // ── Products Engine registry -> plugin endpoint mapping foundation ───────
  // Phase 4B.1 is read-only. It fetches the engine action catalogue and
  // compares normalized records with autoflow.plugin_endpoint_mapping.
  PLUGIN_ENDPOINT_MAPPING_API_ENABLED: asBool(
    process.env.PLUGIN_ENDPOINT_MAPPING_API_ENABLED,
    false
  ),
  PLUGIN_ENDPOINT_MAPPING_ENGINE_VERSION:
    process.env.PLUGIN_ENDPOINT_MAPPING_ENGINE_VERSION || 'v11.3',
  PLUGIN_ENDPOINT_MAPPING_ENGINE_CONTEXT_PATH:
    process.env.PLUGIN_ENDPOINT_MAPPING_ENGINE_CONTEXT_PATH || '/engine',
  PLUGIN_ENDPOINT_MAPPING_REGISTRY_PATH:
    process.env.PLUGIN_ENDPOINT_MAPPING_REGISTRY_PATH || '/api/v1/actions',
  PLUGIN_ENDPOINT_MAPPING_REGISTRY_URL:
    process.env.PLUGIN_ENDPOINT_MAPPING_REGISTRY_URL || null,
  PLUGIN_ENDPOINT_MAPPING_REQUEST_TIMEOUT_MS: Math.min(
    120000,
    Math.max(1000, Number(process.env.PLUGIN_ENDPOINT_MAPPING_REQUEST_TIMEOUT_MS) || 15000)
  ),
  PLUGIN_ENDPOINT_MAPPING_PREVIEW_LIMIT: Math.min(
    500,
    Math.max(1, Number(process.env.PLUGIN_ENDPOINT_MAPPING_PREVIEW_LIMIT) || 50)
  ),
  // Phase 4B.2 controlled CLI-only apply. Keep false during normal runtime.
  PLUGIN_ENDPOINT_MAPPING_WRITE_ENABLED: asBool(
    process.env.PLUGIN_ENDPOINT_MAPPING_WRITE_ENABLED,
    false
  ),
  PLUGIN_ENDPOINT_MAPPING_RETIRE_MISSING: asBool(
    process.env.PLUGIN_ENDPOINT_MAPPING_RETIRE_MISSING,
    true
  ),

  // Phase 4C.1 - read-only PostgreSQL mapping catalogue for frontend shadow
  // comparison. Independent from the live engine dry-run API.
  PLUGIN_MAPPING_READ_API_ENABLED: asBool(
    process.env.PLUGIN_MAPPING_READ_API_ENABLED,
    false
  ),
  PLUGIN_MAPPING_READ_DEFAULT_LIMIT: Math.min(
    2000,
    Math.max(1, Number(process.env.PLUGIN_MAPPING_READ_DEFAULT_LIMIT) || 500)
  ),
  PLUGIN_MAPPING_READ_MAX_LIMIT: Math.min(
    2000,
    Math.max(500, Number(process.env.PLUGIN_MAPPING_READ_MAX_LIMIT) || 1000)
  ),

  // Optional default workspace root. Overrides the (now git-ignored) runtime
  // server_config.json so a fresh checkout boots predictably.
  WORKSPACE_ROOT: process.env.WORKSPACE_ROOT || null,

  // ── Workspace persistence rollout ────────────────────────────────────────
  PERSISTENCE_MODE: ['filesystem', 'postgres'].includes(
    String(process.env.PERSISTENCE_MODE || 'filesystem').toLowerCase()
  )
    ? String(process.env.PERSISTENCE_MODE || 'filesystem').toLowerCase()
    : 'filesystem',
  DATABASE_SHADOW_API_ENABLED: asBool(
    process.env.DATABASE_SHADOW_API_ENABLED,
    false
  ),
  DATABASE_SHADOW_WRITE_ENABLED: asBool(
    process.env.DATABASE_SHADOW_WRITE_ENABLED,
    false
  ),
  DATABASE_PRIMARY_WRITE_ENABLED: asBool(
    process.env.DATABASE_PRIMARY_WRITE_ENABLED,
    false
  ),
  DB_WORKSPACE_KEY: process.env.DB_WORKSPACE_KEY || 'default',

  // ── Database closure contract guard ─────────────────────────────────────
  // Runs read-only schema and integrity checks whenever PostgreSQL is primary.
  DATABASE_CONTRACT_CHECK_ENABLED: asBool(
    process.env.DATABASE_CONTRACT_CHECK_ENABLED,
    true
  ),
  DATABASE_CONTRACT_STRICT: asBool(
    process.env.DATABASE_CONTRACT_STRICT,
    false
  ),
  DB_SCHEMA: process.env.DB_SCHEMA || 'autoflow',

  // ── Execution-history persistence rollout ───────────────────────────────
  // Independent from workspace-design persistence so run APIs can be rolled
  // back to .runs without changing PostgreSQL workflow CRUD.
  EXECUTION_PERSISTENCE_MODE: ['filesystem', 'postgres'].includes(
    String(process.env.EXECUTION_PERSISTENCE_MODE || 'filesystem').toLowerCase()
  )
    ? String(
        process.env.EXECUTION_PERSISTENCE_MODE || 'filesystem'
      ).toLowerCase()
    : 'filesystem',
  DATABASE_EXECUTION_WRITE_ENABLED: asBool(
    process.env.DATABASE_EXECUTION_WRITE_ENABLED,
    false
  ),
  EXECUTION_RETENTION_DAYS: Math.max(
    0,
    Number(process.env.EXECUTION_RETENTION_DAYS) || 30
  ),
  EXECUTION_MAX_BYTES: Math.max(
    1024,
    Number(process.env.EXECUTION_MAX_BYTES) || 8 * 1024 * 1024
  ),
  EXECUTION_LIST_LIMIT: Math.min(
    200,
    Math.max(1, Number(process.env.EXECUTION_LIST_LIMIT) || 25)
  ),
  EXECUTION_OUTPUT_INDEX_WRITE_ENABLED: asBool(
    process.env.EXECUTION_OUTPUT_INDEX_WRITE_ENABLED,
    false
  ),
  EXECUTION_OUTPUT_SOURCE_API_ENABLED: asBool(
    process.env.EXECUTION_OUTPUT_SOURCE_API_ENABLED,
    false
  ),
  EXECUTION_OUTPUT_SOURCE_DEFAULT_LIMIT: Math.min(
    2000,
    Math.max(1, Number(process.env.EXECUTION_OUTPUT_SOURCE_DEFAULT_LIMIT) || 500)
  ),
  EXECUTION_OUTPUT_SOURCE_MAX_LIMIT: Math.min(
    10000,
    Math.max(500, Number(process.env.EXECUTION_OUTPUT_SOURCE_MAX_LIMIT) || 2000)
  ),
  WORKFLOW_VERSION_HISTORY_API_ENABLED: asBool(
    process.env.WORKFLOW_VERSION_HISTORY_API_ENABLED,
    false
  ),
  WORKFLOW_VERSION_HISTORY_DEFAULT_LIMIT: Math.min(
    100,
    Math.max(1, Number(process.env.WORKFLOW_VERSION_HISTORY_DEFAULT_LIMIT) || 40)
  ),
  WORKFLOW_VERSION_HISTORY_MAX_LIMIT: Math.min(
    500,
    Math.max(40, Number(process.env.WORKFLOW_VERSION_HISTORY_MAX_LIMIT) || 100)
  ),

  // ── ORCH-1 server-side workflow executor (opt-in certification lane) ───
  // The existing browser Execute Workflow path remains untouched. This flag
  // only enables POST /api/orchestrator/workflows/:workflowId/execute.
  ORCHESTRATOR_ENABLED: asBool(
    process.env.ORCHESTRATOR_ENABLED,
    false
  ),

  // Request body size limit for JSON / urlencoded.
  BODY_LIMIT: process.env.BODY_LIMIT || '50mb',

  // ── Authentication framework (opt-in) ───────────────────────────────────
  // When AUTH_ENABLED=true, every /api route (except /api/health) requires
  // `Authorization: Bearer <API_AUTH_TOKEN>`. Disabled by default so existing
  // behavior is preserved until the team wires a real identity provider.
  AUTH_ENABLED: asBool(process.env.AUTH_ENABLED, false),
  API_AUTH_TOKEN: process.env.API_AUTH_TOKEN || '',

  // ── Rate limiting ───────────────────────────────────────────────────────
  RATE_LIMIT_WINDOW_MS: Number(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  RATE_LIMIT_MAX: Number(process.env.RATE_LIMIT_MAX) || 1000,

  // ── File-operation sandbox ──────────────────────────────────────────────
  // File operations are confined to the active workspace root by default.
  // Additional absolute roots may be explicitly whitelisted here.
  FILE_OPS_ALLOWED_ROOTS: parseList(process.env.FILE_OPS_ALLOWED_ROOTS, []),
};

module.exports = cfg;
