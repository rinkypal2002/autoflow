/**
 * Absolute local backend URL -> same-origin proxy path.
 *
 * Catalogue entries intentionally retain their historical absolute URLs, but
 * browser execution should not call local Tomcat cross-origin. This helper is
 * the single request-time normalizer used by the workflow executor and agent
 * pages. Remote/customer URLs are never rewritten.
 */

/**
 * Every prefix here must have a matching `server.proxy` entry in
 * `vite.config.ts` and a production reverse-proxy route.
 */
export const PROXIED_PATH_PREFIXES = [
  'engine',
  'VulnerabilityScanner',
  'voice_transcription',
] as const;

export type ProxiedPathPrefix = (typeof PROXIED_PATH_PREFIXES)[number];

const escapeRegex = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const PREFIX_PATTERN = PROXIED_PATH_PREFIXES.map(escapeRegex).join('|');

/** Match only local origins and declared context paths. */
const LOCAL_PROXIED_ORIGIN = new RegExp(
  `^https?:\\/\\/(?:localhost|127\\.0\\.0\\.1)(?::\\d+)?\\/(${PREFIX_PATTERN})(?=\\/|$)`,
  'i'
);

function canonicalisePrefix(raw: string): string {
  const canonical = PROXIED_PATH_PREFIXES.find(
    (prefix) => prefix.toLowerCase() === raw.toLowerCase()
  );
  return canonical ?? raw;
}

/**
 * Rewrite a local backend URL to the relative path handled by Vite/reverse
 * proxy. The function is idempotent and non-string safe.
 */
export function toEngineProxyUrl<T>(url: T): T {
  if (typeof url !== 'string') return url;
  return url.replace(
    LOCAL_PROXIED_ORIGIN,
    (_match, prefix: string) => `/${canonicalisePrefix(prefix)}`
  ) as T;
}
