/**
 * Centralized browser-facing service endpoints.
 *
 * The browser defaults are deliberately same-origin paths. In development,
 * `vite.config.ts` proxies them to the local services. In production, the web
 * tier should expose the same prefixes. A direct absolute URL can still be
 * supplied through the matching `*_API_BASE` variable when a deployment has a
 * deliberate CORS policy.
 */
const env = import.meta.env as Record<string, string | undefined>;

const trimTrailingSlash = (value: string): string =>
  value === '/' ? '' : value.replace(/\/+$/, '');

export const SERVICES = {
  /** Node backend (workspace, files, persistence). */
  nodeApiBase: trimTrailingSlash(env.VITE_NODE_API_BASE ?? '/api'),

  /**
   * Engine origin used by legacy catalogue URLs and agent definitions. Local
   * URLs are converted to same-origin paths by `toEngineProxyUrl` before fetch.
   */
  engineBase: trimTrailingSlash(env.VITE_ENGINE_URL ?? 'http://localhost:8080'),

  /** Engine/JVM monitor browser base. */
  engineMonitorBase: trimTrailingSlash(
    env.VITE_ENGINE_MONITOR_API_BASE ?? '/engine-monitor'
  ),

  /** Ollama browser base. */
  aiHost: trimTrailingSlash(env.VITE_OLLAMA_API_BASE ?? '/ollama'),

  /** Default LLM model. */
  aiModel: env.VITE_LLM_MODEL ?? 'qwen2.5:14b',
} as const;

const LEGACY_ENGINE_PREFIX = 'http://localhost:8080';

/**
 * Swap the legacy localhost origin baked into catalogue entries for the
 * configured engine origin. This is primarily presentation/configuration
 * support; actual requests additionally pass through `toEngineProxyUrl`.
 */
export function resolveEngineUrl(url: string): string {
  if (typeof url === 'string' && url.startsWith(LEGACY_ENGINE_PREFIX)) {
    return SERVICES.engineBase + url.slice(LEGACY_ENGINE_PREFIX.length);
  }
  return url;
}
