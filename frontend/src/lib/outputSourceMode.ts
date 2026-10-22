/**
 * Frontend read-mode gate for PostgreSQL-backed workflow output sources.
 *
 * legacy   — render only the certified snapshot-derived catalogue.
 * shadow   — load and compare PostgreSQL, but render legacy.
 * postgres — render PostgreSQL step outputs with complete-coverage checks and
 *            automatic legacy fallback/compatibility aliases.
 */

export type OutputSourceReadMode = 'legacy' | 'shadow' | 'postgres';
export type SafeOutputSourceReadMode = OutputSourceReadMode;

export interface OutputSourceModeState {
  configured: OutputSourceReadMode;
  effective: SafeOutputSourceReadMode;
  cutoverBlocked: boolean;
}

export function normalizeOutputSourceReadMode(value: unknown): OutputSourceReadMode {
  const normalized = String(value ?? 'legacy').trim().toLowerCase();
  if (normalized === 'shadow' || normalized === 'postgres') return normalized;
  return 'legacy';
}

export function resolveOutputSourceMode(value: unknown): OutputSourceModeState {
  const configured = normalizeOutputSourceReadMode(value);
  return {
    configured,
    effective: configured,
    cutoverBlocked: false,
  };
}

const viteEnv = (import.meta as ImportMeta & {
  env?: Record<string, string | undefined>;
}).env;

export const OUTPUT_SOURCE_MODE = resolveOutputSourceMode(
  viteEnv?.VITE_EXECUTION_OUTPUT_SOURCE_READ_MODE
);

export const isOutputSourceShadowEnabled = (): boolean =>
  OUTPUT_SOURCE_MODE.effective === 'shadow';

export const isOutputSourcePostgresEnabled = (): boolean =>
  OUTPUT_SOURCE_MODE.effective === 'postgres';
