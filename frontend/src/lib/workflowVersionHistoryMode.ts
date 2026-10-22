/**
 * Frontend read-mode gate for PostgreSQL-backed workflow version history.
 *
 * legacy   — use only the existing localStorage history.
 * shadow   — load PostgreSQL history and compare it, but keep localStorage visible.
 * postgres — intentionally blocked until the restore/credential-safe cutover step.
 */

export type WorkflowVersionHistoryReadMode = 'legacy' | 'shadow' | 'postgres';
export type SafeWorkflowVersionHistoryReadMode = 'legacy' | 'shadow';

export interface WorkflowVersionHistoryModeState {
  configured: WorkflowVersionHistoryReadMode;
  effective: SafeWorkflowVersionHistoryReadMode;
  cutoverBlocked: boolean;
}

export function normalizeWorkflowVersionHistoryReadMode(
  value: unknown
): WorkflowVersionHistoryReadMode {
  const normalized = String(value ?? 'legacy').trim().toLowerCase();
  if (normalized === 'shadow' || normalized === 'postgres') return normalized;
  return 'legacy';
}

export function resolveWorkflowVersionHistoryMode(
  value: unknown
): WorkflowVersionHistoryModeState {
  const configured = normalizeWorkflowVersionHistoryReadMode(value);
  if (configured === 'postgres') {
    return {
      configured,
      effective: 'shadow',
      cutoverBlocked: true,
    };
  }
  return {
    configured,
    effective: configured,
    cutoverBlocked: false,
  };
}

const viteEnv = (import.meta as ImportMeta & {
  env?: Record<string, string | undefined>;
}).env;

export const WORKFLOW_VERSION_HISTORY_MODE = resolveWorkflowVersionHistoryMode(
  viteEnv?.VITE_WORKFLOW_VERSION_HISTORY_READ_MODE
);

export const isWorkflowVersionHistoryShadowEnabled = (): boolean =>
  WORKFLOW_VERSION_HISTORY_MODE.effective === 'shadow';
