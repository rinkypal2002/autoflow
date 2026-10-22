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

  // Optional default workspace root. Overrides the (now git-ignored) runtime
  // server_config.json so a fresh checkout boots predictably.
  WORKSPACE_ROOT: process.env.WORKSPACE_ROOT || null,

  // ── PostgreSQL persistence rollout ─────────────────────────────────────
  // Keep filesystem mode until database migration and parity checks finish.
  PERSISTENCE_MODE: process.env.PERSISTENCE_MODE || 'filesystem',
  DATABASE_SHADOW_API_ENABLED: asBool(
    process.env.DATABASE_SHADOW_API_ENABLED,
    false
  ),
  DB_WORKSPACE_KEY: process.env.DB_WORKSPACE_KEY || 'default',

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
