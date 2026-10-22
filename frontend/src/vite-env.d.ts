/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_EXECUTION_OUTPUT_SOURCE_READ_MODE?: 'legacy' | 'shadow' | 'postgres';
  readonly VITE_WORKFLOW_VERSION_HISTORY_READ_MODE?: 'legacy' | 'shadow' | 'postgres';
  readonly VITE_PLUGIN_MAPPING_READ_MODE?: 'legacy' | 'shadow' | 'postgres';
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
