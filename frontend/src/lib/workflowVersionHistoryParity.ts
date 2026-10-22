/**
 * Preview-free shadow comparison between localStorage workflow history and
 * PostgreSQL immutable workflow versions. The visible modal remains local.
 */

import type { WorkflowVersion, WorkflowCanvasState } from './workflowVersioning';
import type { PostgresWorkflowVersion } from './workflowVersionHistoryApi';
import type { WorkflowVersionHistoryModeState } from './workflowVersionHistoryMode';

const STORAGE_KEY = 'autoflow:workflow-version-shadow:reports:v1';
const LAST_REPORT_KEY = 'autoflow:workflow-version-shadow:last:v1';
const MAX_STORED_REPORTS = 20;

const SENSITIVE_KEY = /(?:password|passwd|pwd|secret|token|api[_-]?key|access[_-]?key|private[_-]?key|authorization|cookie)/i;
const RUNTIME_ACTION_FIELDS = new Set([
  'status',
  'executionTime',
  'startedAt',
  'finishedAt',
  'lastRunId',
  'selected',
]);
const RUNTIME_CONNECTION_FIELDS = new Set(['isActive', 'isAnimated']);

export interface WorkflowVersionHistoryDifferenceSample {
  id: string;
  version: string;
  label: string;
  savedAt: string;
  stats: WorkflowVersion['stats'];
  definitionFingerprint: string;
}

export interface WorkflowVersionHistoryParityReport {
  schemaVersion: '1.0';
  generatedAt: string;
  workflowId: string;
  mode: WorkflowVersionHistoryModeState;
  source: 'localStorage-vs-postgres';
  visibleHistorySource: 'localStorage';
  restoreEnabled: false;
  summary: {
    localVersions: number;
    postgresVersions: number;
    exactDefinitionMatches: number;
    localOnlyDefinitions: number;
    postgresOnlyDefinitions: number;
    matchingVersionNumbers: number;
    matchingStats: number;
    currentPostgresDefinitionFoundLocally: boolean;
    newestLocalMatchesCurrentPostgres: boolean;
    secretValuesIncludedInReport: false;
  };
  currentPostgresVersion: {
    id: string;
    version: string;
    label: string;
    definitionFingerprint: string;
  } | null;
  localOnly: WorkflowVersionHistoryDifferenceSample[];
  postgresOnly: WorkflowVersionHistoryDifferenceSample[];
  verdict: 'CURRENT_DEFINITION_ALIGNED' | 'HISTORY_DIFFERENCES_RECORDED';
}

export interface WorkflowVersionHistoryShadowFailureReport {
  schemaVersion: '1.0';
  generatedAt: string;
  workflowId: string;
  mode: WorkflowVersionHistoryModeState;
  visibleHistorySource: 'localStorage';
  restoreEnabled: false;
  verdict: 'SHADOW_API_UNAVAILABLE';
  error: { name: string; message: string; code?: string; status?: number };
}

export type PersistedWorkflowVersionHistoryShadowReport =
  | WorkflowVersionHistoryParityReport
  | WorkflowVersionHistoryShadowFailureReport;

function stableObject(value: unknown, parentKind = ''): unknown {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) {
    const normalized = value.map((item) => stableObject(item, parentKind));
    if (normalized.every((item) => item && typeof item === 'object' && 'id' in (item as object))) {
      return normalized.sort((a, b) =>
        String((a as { id?: unknown }).id ?? '').localeCompare(
          String((b as { id?: unknown }).id ?? '')
        )
      );
    }
    return normalized;
  }
  if (typeof value !== 'object') return value;

  const input = value as Record<string, unknown>;
  const isSecretVariable =
    parentKind === 'variable' && (input.isSecret === true || input.scope === 'secret');
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(input).sort()) {
    if (parentKind === 'action' && RUNTIME_ACTION_FIELDS.has(key)) continue;
    if (parentKind === 'connection' && RUNTIME_CONNECTION_FIELDS.has(key)) continue;
    if (isSecretVariable) {
      if (['value', 'defaultValue', 'secretValueRedacted', 'credentialReferenceRequired'].includes(key)) {
        continue;
      }
      if (key === 'isSecret') {
        result[key] = true;
        continue;
      }
    }
    if (SENSITIVE_KEY.test(key)) {
      result[key] = '[REDACTED]';
      continue;
    }
    const childKind =
      key === 'actions'
        ? 'actions'
        : key === 'connections'
          ? 'connections'
          : key === 'variables'
            ? 'variables'
            : parentKind;
    result[key] = stableObject(input[key], childKind);
  }
  return result;
}

function normalizeState(state: WorkflowCanvasState): Record<string, unknown> {
  const actions = (state.actions ?? []).map((item) => stableObject(item, 'action'));
  const connections = (state.connections ?? []).map((item) => stableObject(item, 'connection'));
  const variables = (state.variables ?? []).map((item) => stableObject(item, 'variable'));
  return {
    name: state.name || '',
    description: state.description || '',
    actions: stableObject(actions),
    connections: stableObject(connections),
    variables: stableObject(variables),
  };
}

function hashString(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

export function workflowVersionDefinitionFingerprint(version: WorkflowVersion): string {
  const supplied = (version as WorkflowVersion & {
    comparisonFingerprint?: string;
  }).comparisonFingerprint;
  if (typeof supplied === 'string' && /^[0-9a-f]{8}$/i.test(supplied)) {
    return supplied.toLowerCase();
  }
  return hashString(JSON.stringify(normalizeState(version.state)));
}

function statsKey(version: WorkflowVersion): string {
  return `${version.stats.actions}|${version.stats.connections}|${version.stats.variables}`;
}

function sample(version: WorkflowVersion): WorkflowVersionHistoryDifferenceSample {
  return {
    id: version.id,
    version: version.version,
    label: version.label,
    savedAt: version.savedAt,
    stats: { ...version.stats },
    definitionFingerprint: workflowVersionDefinitionFingerprint(version),
  };
}

function multiset(values: WorkflowVersion[]): Map<string, WorkflowVersion[]> {
  const map = new Map<string, WorkflowVersion[]>();
  for (const version of values) {
    const key = workflowVersionDefinitionFingerprint(version);
    const bucket = map.get(key) ?? [];
    bucket.push(version);
    map.set(key, bucket);
  }
  return map;
}

export function compareWorkflowVersionHistories(input: {
  workflowId: string;
  mode: WorkflowVersionHistoryModeState;
  localVersions: WorkflowVersion[];
  postgresVersions: PostgresWorkflowVersion[];
}): WorkflowVersionHistoryParityReport {
  const local = [...input.localVersions].sort(
    (a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime()
  );
  const postgres = [...input.postgresVersions].sort(
    (a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime()
  );
  const localByDefinition = multiset(local);
  const postgresByDefinition = multiset(postgres);
  const localOnly: WorkflowVersion[] = [];
  const postgresOnly: WorkflowVersion[] = [];
  let exactDefinitionMatches = 0;

  const allFingerprints = new Set([
    ...localByDefinition.keys(),
    ...postgresByDefinition.keys(),
  ]);
  for (const fingerprint of allFingerprints) {
    const localBucket = [...(localByDefinition.get(fingerprint) ?? [])];
    const postgresBucket = [...(postgresByDefinition.get(fingerprint) ?? [])];
    const matches = Math.min(localBucket.length, postgresBucket.length);
    exactDefinitionMatches += matches;
    localOnly.push(...localBucket.slice(matches));
    postgresOnly.push(...postgresBucket.slice(matches));
  }

  const postgresCurrent =
    postgres.find((version) => version.isCurrent) ?? postgres[0] ?? null;
  const currentFingerprint = postgresCurrent
    ? workflowVersionDefinitionFingerprint(postgresCurrent)
    : null;
  const newestLocalFingerprint = local[0]
    ? workflowVersionDefinitionFingerprint(local[0])
    : null;
  const currentFoundLocally = Boolean(
    currentFingerprint && localByDefinition.has(currentFingerprint)
  );

  const localVersionNumbers = new Set(local.map((version) => String(version.version)));
  const localStats = new Set(local.map(statsKey));
  const matchingVersionNumbers = postgres.filter((version) =>
    localVersionNumbers.has(String(version.version))
  ).length;
  const matchingStats = postgres.filter((version) => localStats.has(statsKey(version))).length;

  return {
    schemaVersion: '1.0',
    generatedAt: new Date().toISOString(),
    workflowId: input.workflowId,
    mode: input.mode,
    source: 'localStorage-vs-postgres',
    visibleHistorySource: 'localStorage',
    restoreEnabled: false,
    summary: {
      localVersions: local.length,
      postgresVersions: postgres.length,
      exactDefinitionMatches,
      localOnlyDefinitions: localOnly.length,
      postgresOnlyDefinitions: postgresOnly.length,
      matchingVersionNumbers,
      matchingStats,
      currentPostgresDefinitionFoundLocally: currentFoundLocally,
      newestLocalMatchesCurrentPostgres: Boolean(
        currentFingerprint && newestLocalFingerprint === currentFingerprint
      ),
      secretValuesIncludedInReport: false,
    },
    currentPostgresVersion: postgresCurrent
      ? {
          id: postgresCurrent.id,
          version: postgresCurrent.version,
          label: postgresCurrent.label,
          definitionFingerprint: currentFingerprint!,
        }
      : null,
    localOnly: localOnly.slice(0, 10).map(sample),
    postgresOnly: postgresOnly.slice(0, 10).map(sample),
    verdict: currentFoundLocally
      ? 'CURRENT_DEFINITION_ALIGNED'
      : 'HISTORY_DIFFERENCES_RECORDED',
  };
}

export function createWorkflowVersionHistoryShadowFailure(input: {
  workflowId: string;
  mode: WorkflowVersionHistoryModeState;
  error: unknown;
}): WorkflowVersionHistoryShadowFailureReport {
  const error = input.error as {
    name?: string;
    message?: string;
    code?: string;
    status?: number;
  };
  return {
    schemaVersion: '1.0',
    generatedAt: new Date().toISOString(),
    workflowId: input.workflowId,
    mode: input.mode,
    visibleHistorySource: 'localStorage',
    restoreEnabled: false,
    verdict: 'SHADOW_API_UNAVAILABLE',
    error: {
      name: error?.name || 'Error',
      message: error?.message || String(input.error),
      code: error?.code,
      status: error?.status,
    },
  };
}

export function persistWorkflowVersionHistoryShadowReport(
  report: PersistedWorkflowVersionHistoryShadowReport,
  storage: Storage | undefined = typeof sessionStorage === 'undefined'
    ? undefined
    : sessionStorage
): void {
  if (!storage) return;
  try {
    const raw = storage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    const existing = Array.isArray(parsed) ? parsed : [];
    const next = [report, ...existing].slice(0, MAX_STORED_REPORTS);
    storage.setItem(STORAGE_KEY, JSON.stringify(next));
    storage.setItem(LAST_REPORT_KEY, JSON.stringify(report));
  } catch {
    // Shadow reporting must never affect the editor.
  }
}
