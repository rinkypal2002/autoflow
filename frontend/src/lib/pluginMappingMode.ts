export type PluginMappingReadMode = 'legacy' | 'shadow' | 'postgres';
export type SafePluginMappingReadMode = 'legacy' | 'shadow';

export interface PluginMappingModeState {
  configured: PluginMappingReadMode;
  effective: SafePluginMappingReadMode;
  cutoverBlocked: boolean;
}

export function normalizePluginMappingReadMode(value: unknown): PluginMappingReadMode {
  const normalized = String(value ?? 'legacy').trim().toLowerCase();
  if (normalized === 'shadow' || normalized === 'postgres') return normalized;
  return 'legacy';
}

export function resolvePluginMappingMode(value: unknown): PluginMappingModeState {
  const configured = normalizePluginMappingReadMode(value);
  if (configured === 'postgres') {
    return { configured, effective: 'shadow', cutoverBlocked: true };
  }
  return { configured, effective: configured, cutoverBlocked: false };
}

const viteEnv = (import.meta as ImportMeta & {
  env?: Record<string, string | undefined>;
}).env;

export const PLUGIN_MAPPING_MODE = resolvePluginMappingMode(
  viteEnv?.VITE_PLUGIN_MAPPING_READ_MODE
);

export const isPluginMappingShadowEnabled = (): boolean =>
  PLUGIN_MAPPING_MODE.effective === 'shadow';
