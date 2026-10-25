
/**
 * AutoFlow centralized browser-facing service endpoints.
 *
 * Local development:
 * React -> Vite proxy -> Local Node / Java Engine
 *
 * Render production:
 * React -> Render Node.js / Java Engine URLs
 */

const env = import.meta.env as Record<
  string,
  string | undefined
>;

const trimTrailingSlash = (value: string): string =>
  value === "/" ? "" : value.replace(/\/+$/, "");

export const SERVICES = {

  // Node.js backend
  nodeApiBase: trimTrailingSlash(
    env.VITE_NODE_API_BASE ?? "/api"
  ),

  // Spring Boot Java Engine origin
  engineBase: trimTrailingSlash(
    env.VITE_ENGINE_URL ?? "http://localhost:8080"
  ),

  // Engine monitor
  engineMonitorBase: trimTrailingSlash(
    env.VITE_ENGINE_MONITOR_API_BASE ??
      "/engine-monitor"
  ),

  // Ollama
  aiHost: trimTrailingSlash(
    env.VITE_OLLAMA_API_BASE ?? "/ollama"
  ),

  // AI model
  aiModel: env.VITE_LLM_MODEL ?? "qwen2.5:14b",

} as const;

const LEGACY_ENGINE_PREFIX =
  "http://localhost:8080";

/**
 * Replace older localhost Engine URLs with the
 * configured Engine origin.
 */
export function resolveEngineUrl(url: string): string {

  if (
    typeof url === "string" &&
    url.startsWith(LEGACY_ENGINE_PREFIX)
  ) {
    return (
      SERVICES.engineBase +
      url.slice(LEGACY_ENGINE_PREFIX.length)
    );
  }

  return url;
}

/**
 * Resolve Engine API URLs for development and production.
 *
 * Development:
 *   /engine/excel/read-workbook
 *
 * Production:
 *   https://autoflow-engine-tfg9.onrender.com
 *   /engine/excel/read-workbook
 */
export function toEngineProxyUrl(url: string): string {

  if (!url) {
    return url;
  }

  const resolvedUrl = resolveEngineUrl(url);

  const engineOrigin = SERVICES.engineBase
    .replace(/\/engine\/?$/, "")
    .replace(/\/+$/, "");

  const parsed = new URL(
    resolvedUrl,
    window.location.origin
  );

  // Do not rewrite unrelated URLs.
  const allowedOrigins = [
    window.location.origin,
    new URL(engineOrigin).origin,
    "http://localhost:8080",
    "http://127.0.0.1:8080"
  ];

  if (!allowedOrigins.includes(parsed.origin)) {
    return resolvedUrl;
  }

  // Only process Engine API paths.
  if (
    parsed.pathname !== "/engine" &&
    !parsed.pathname.startsWith("/engine/")
  ) {
    return resolvedUrl;
  }

  const path =
    parsed.pathname +
    parsed.search +
    parsed.hash;

  // Render production:
  // call the deployed Java Engine directly.
  if (import.meta.env.PROD) {

    if (!env.VITE_ENGINE_URL) {
      throw new Error(
        "VITE_ENGINE_URL is missing in production"
      );
    }

    return `${engineOrigin}${path}`;
  }

  // Local development:
  // use the Vite proxy.
  return path;
}
