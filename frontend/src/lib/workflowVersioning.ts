/**
 * Workflow versioning — immutable version snapshots, diffing and rollback.
 *
 * `Workflow.versionHistory` has existed in the schema from the start but was
 * never written to, so "version" was just a string on a record nobody could
 * roll back. This module makes it real:
 *
 *   • `captureVersion`  freezes the canvas (actions, connections, variables)
 *                       into an immutable, self-contained record
 *   • `diffVersions`    reports exactly what changed between two versions
 *   • `restoreVersion`  hands back a canvas ready to load, without mutating
 *                       the stored history
 *
 * Versions are stored locally per workflow. That keeps rollback available with
 * no backend change, and `serializeVersions` / `hydrateVersions` are provided
 * so the same records can be persisted server-side later without touching any
 * caller.
 *
 * Pure except for the explicitly-named storage functions.
 */

import type { Connection, WorkflowAction, WorkflowVariable } from '../types/workflow';

/* -------------------------------------------------------------------------- */
/*                                   TYPES                                    */
/* -------------------------------------------------------------------------- */

/** The part of a workflow a version actually restores. */
export interface WorkflowCanvasState {
  name: string;
  description?: string;
  actions: WorkflowAction[];
  connections: Connection[];
  variables: WorkflowVariable[];
}

export interface WorkflowVersion {
  id: string;
  workflowId: string;
  /** Semantic-ish version string, e.g. `1.4.0`. */
  version: string;
  label: string;
  description?: string;
  savedAt: string;
  savedBy: string;
  /** True when the version was cut automatically before a risky operation. */
  auto: boolean;
  state: WorkflowCanvasState;
  stats: {
    actions: number;
    connections: number;
    variables: number;
  };
}

export interface FieldChange {
  field: string;
  before: any;
  after: any;
}

export interface VersionDiffEntry {
  id: string;
  name: string;
  kind: 'action' | 'connection' | 'variable';
  change: 'added' | 'removed' | 'modified';
  changes: FieldChange[];
}

export interface VersionDiff {
  from: string;
  to: string;
  entries: VersionDiffEntry[];
  summary: {
    added: number;
    removed: number;
    modified: number;
    total: number;
  };
  /** True when the two versions describe an identical canvas. */
  identical: boolean;
}

/** How many versions to keep per workflow before pruning the oldest. */
const MAX_VERSIONS = 40;

/* -------------------------------------------------------------------------- */
/*                                  CAPTURE                                   */
/* -------------------------------------------------------------------------- */

const clone = <T,>(value: T): T => {
  try {
    return JSON.parse(JSON.stringify(value ?? null)) as T;
  } catch {
    return value;
  }
};

const HISTORY_SECRET_MASK = '********';

const HISTORY_SECRET_VALUE_KEY =
  /^(password|passwd|pwd|secret|token|accessToken|refreshToken|apiKey|api_key|authorization|privateKey|private_key|clientSecret|client_secret)$/i;

/**
 * Remove primitive credential values before a workflow version enters browser
 * history. Configuration descriptors such as propertyConfig.password remain
 * intact because object-valued fields are traversed rather than replaced.
 */
function sanitizeHistorySecrets(value: any, parentKey = ''): any {
  if (value === null || value === undefined) return value;

  if (
    HISTORY_SECRET_VALUE_KEY.test(parentKey) &&
    typeof value !== 'object'
  ) {
    return typeof value === 'string' && value.length === 0
      ? ''
      : HISTORY_SECRET_MASK;
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeHistorySecrets(item));
  }

  if (typeof value !== 'object') return value;

  const source = value as Record<string, any>;
  const out: Record<string, any> = {};

  Object.entries(source).forEach(([key, child]) => {
    if (
      key === 'value' &&
      source.isSecret === true &&
      (child === null || typeof child !== 'object')
    ) {
      out[key] =
        typeof child === 'string' && child.length === 0
          ? ''
          : HISTORY_SECRET_MASK;
      return;
    }

    out[key] = sanitizeHistorySecrets(child, key);
  });

  return out;
}

/**
 * A historical version never owns the real credential. When restoring, a
 * masked historical value inherits the matching value from the current canvas.
 * If there is no current value, leave it blank so the user must re-enter it.
 */
function restoreHistorySecrets(stored: any, current: any): any {
  if (stored === HISTORY_SECRET_MASK) {
    if (
      current === undefined ||
      current === null ||
      current === HISTORY_SECRET_MASK
    ) {
      return '';
    }

    return clone(current);
  }

  if (Array.isArray(stored)) {
    return stored.map((item, index) =>
      restoreHistorySecrets(
        item,
        Array.isArray(current) ? current[index] : undefined
      )
    );
  }

  if (stored === null || typeof stored !== 'object') {
    return stored;
  }

  const out: Record<string, any> = {};
  const currentObject =
    current && typeof current === 'object'
      ? (current as Record<string, any>)
      : {};

  Object.entries(stored).forEach(([key, value]) => {
    out[key] = restoreHistorySecrets(value, currentObject[key]);
  });

  return out;
}

/** Per-run fields that describe an execution, not the workflow's definition. */
const RUNTIME_ACTION_FIELDS = [
  'status',
  'executionTime',
  'startedAt',
  'finishedAt',
  'lastRunId',
  'selected',
] as const;

const RUNTIME_CONNECTION_FIELDS = ['isActive', 'isAnimated'] as const;

const omit = <T extends Record<string, any>>(source: T, fields: readonly string[]): T => {
  const copy = clone(source) as Record<string, any>;
  fields.forEach((field) => delete copy[field]);
  return copy as T;
};

/**
 * Strip runtime state before freezing a version.
 *
 * A version records what the workflow *is*, not what one run happened to do,
 * so per-run fields are dropped. Without this a rollback would restore stale
 * "completed" badges and timings from whenever the version was cut.
 */
function sanitizeAction(action: WorkflowAction): WorkflowAction {
  return sanitizeHistorySecrets(
    omit(action, RUNTIME_ACTION_FIELDS)
  ) as WorkflowAction;
}

function sanitizeConnection(connection: Connection): Connection {
  return omit(connection, RUNTIME_CONNECTION_FIELDS);
}

/** Next patch version: `1.2.3` -> `1.2.4`, `2` -> `2.0.1`, `''` -> `1.0.0`. */
export function nextVersionNumber(current?: string): string {
  const raw = String(current ?? '').trim();
  if (!raw) return '1.0.0';

  const parts = raw.split('.').map((part) => Number.parseInt(part, 10));
  if (parts.length === 0 || !Number.isFinite(parts[0])) return '1.0.0';

  // `Number.isFinite` rather than `Number.isNaN`: a short string like "2"
  // yields `undefined` for the missing segments, and `Number.isNaN(undefined)`
  // is false — which would let `undefined` through into the output.
  const major = Number.isFinite(parts[0]) ? parts[0] : 1;
  const minor = Number.isFinite(parts[1]) ? parts[1] : 0;
  const patch = Number.isFinite(parts[2]) ? parts[2] : 0;

  return `${major}.${minor}.${patch + 1}`;
}

export interface CaptureOptions {
  workflowId: string;
  version?: string;
  label?: string;
  description?: string;
  savedBy?: string;
  auto?: boolean;
}

/** Freeze the current canvas into an immutable version record. */
export function captureVersion(
  state: WorkflowCanvasState,
  options: CaptureOptions
): WorkflowVersion {
  const savedAt = new Date().toISOString();
  const actions = (state.actions ?? []).map(sanitizeAction);
  const connections = (state.connections ?? []).map(sanitizeConnection);
  const variables = sanitizeHistorySecrets(
    clone(state.variables ?? [])
  ) as WorkflowVariable[];

  return {
    id: `ver-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    workflowId: options.workflowId,
    version: options.version ?? '1.0.0',
    label: options.label?.trim() || `Version ${options.version ?? '1.0.0'}`,
    description: options.description?.trim() || undefined,
    savedAt,
    savedBy: options.savedBy ?? 'You',
    auto: Boolean(options.auto),
    state: {
      name: state.name,
      description: state.description,
      actions,
      connections,
      variables,
    },
    stats: {
      actions: actions.length,
      connections: connections.length,
      variables: variables.length,
    },
  };
}

/**
 * Produce a canvas ready to load into the editor.
 *
 * Returns a deep copy so the stored version can never be mutated by the editor
 * that restored it — rolling back twice to the same version gives the same
 * result both times.
 */
export function restoreVersion(
  version: WorkflowVersion,
  current?: WorkflowCanvasState
): WorkflowCanvasState {
  const stored = clone(version.state);

  if (!current) {
    return stored;
  }

  const currentActionsById = new Map(
    (current.actions ?? []).map((action) => [String(action.id), action])
  );

  const currentVariablesById = new Map(
    (current.variables ?? []).map((variable) => [String(variable.id), variable])
  );

  const currentVariablesByName = new Map(
    (current.variables ?? []).map((variable) => [String(variable.name), variable])
  );

  return {
    ...stored,
    actions: (stored.actions ?? []).map((action) =>
      restoreHistorySecrets(
        action,
        currentActionsById.get(String(action.id))
      ) as WorkflowAction
    ),
    variables: (stored.variables ?? []).map((variable) => {
      const currentVariable =
        currentVariablesById.get(String(variable.id)) ??
        currentVariablesByName.get(String(variable.name));

      return restoreHistorySecrets(
        variable,
        currentVariable
      ) as WorkflowVariable;
    }),
  };
}

/* -------------------------------------------------------------------------- */
/*                                   DIFFING                                  */
/* -------------------------------------------------------------------------- */

/** Fields worth reporting on; everything else is cosmetic or derived. */
const ACTION_DIFF_FIELDS = [
  'name',
  'type',
  'category',
  'description',
  'properties',
  'api',
  'x',
  'y',
  'retries',
  'retryDelay',
  'timeout',
  'onError',
  'fallbackActionId',
  'disabled',
  'notes',
] as const;

const CONNECTION_DIFF_FIELDS = [
  'sourceId',
  'targetId',
  'type',
  'condition',
  'label',
  'isDisabled',
  'priority',
] as const;

const VARIABLE_DIFF_FIELDS = [
  'name',
  'type',
  'value',
  'description',
  'isSecret',
  'scope',
  'required',
  'defaultValue',
] as const;

const stableStringify = (value: any): string => {
  if (value === undefined) return 'undefined';
  if (value === null) return 'null';
  if (typeof value !== 'object') return JSON.stringify(value) ?? String(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
};

const valuesEqual = (a: any, b: any): boolean => stableStringify(a) === stableStringify(b);

function compareFields(
  before: Record<string, any>,
  after: Record<string, any>,
  fields: readonly string[]
): FieldChange[] {
  const changes: FieldChange[] = [];
  fields.forEach((field) => {
    const from = before?.[field];
    const to = after?.[field];
    if (valuesEqual(from, to)) return;
    // Secrets are diffed for *presence*, never for content.
    if (field === 'value' && (before?.isSecret || after?.isSecret)) {
      changes.push({ field, before: '••••••••', after: '••••••••' });
      return;
    }
    changes.push({ field, before: from, after: to });
  });
  return changes;
}

function diffCollection<T extends Record<string, any>>(
  before: T[],
  after: T[],
  kind: VersionDiffEntry['kind'],
  fields: readonly string[],
  nameOf: (item: T) => string
): VersionDiffEntry[] {
  const beforeMap = new Map(before.map((item) => [String(item.id), item]));
  const afterMap = new Map(after.map((item) => [String(item.id), item]));
  const entries: VersionDiffEntry[] = [];

  afterMap.forEach((item, id) => {
    const previous = beforeMap.get(id);
    if (!previous) {
      entries.push({ id, name: nameOf(item), kind, change: 'added', changes: [] });
      return;
    }
    const changes = compareFields(previous, item, fields);
    if (changes.length > 0) {
      entries.push({ id, name: nameOf(item), kind, change: 'modified', changes });
    }
  });

  beforeMap.forEach((item, id) => {
    if (!afterMap.has(id)) {
      entries.push({ id, name: nameOf(item), kind, change: 'removed', changes: [] });
    }
  });

  return entries;
}

/**
 * Compare two versions field by field.
 *
 * Matching is by id, not by position, so reordering nodes on the canvas does
 * not read as "everything changed" — only a genuine edit does.
 */
export function diffVersions(from: WorkflowVersion, to: WorkflowVersion): VersionDiff {
  const entries: VersionDiffEntry[] = [
    ...diffCollection(
      from.state.actions ?? [],
      to.state.actions ?? [],
      'action',
      ACTION_DIFF_FIELDS,
      (action) => String(action.name ?? action.id)
    ),
    ...diffCollection(
      from.state.connections ?? [],
      to.state.connections ?? [],
      'connection',
      CONNECTION_DIFF_FIELDS,
      (connection) => String(connection.label ?? `${connection.sourceId} → ${connection.targetId}`)
    ),
    ...diffCollection(
      from.state.variables ?? [],
      to.state.variables ?? [],
      'variable',
      VARIABLE_DIFF_FIELDS,
      (variable) => String(variable.name ?? variable.id)
    ),
  ];

  const summary = {
    added: entries.filter((entry) => entry.change === 'added').length,
    removed: entries.filter((entry) => entry.change === 'removed').length,
    modified: entries.filter((entry) => entry.change === 'modified').length,
    total: entries.length,
  };

  return {
    from: from.version,
    to: to.version,
    entries,
    summary,
    identical: entries.length === 0,
  };
}

/** One-line description of a diff, for the version list. */
export function describeDiff(diff: VersionDiff): string {
  if (diff.identical) return 'No changes';
  const parts: string[] = [];
  if (diff.summary.added) parts.push(`${diff.summary.added} added`);
  if (diff.summary.modified) parts.push(`${diff.summary.modified} changed`);
  if (diff.summary.removed) parts.push(`${diff.summary.removed} removed`);
  return parts.join(' · ');
}

/** True when the canvas differs from the newest stored version. */
export function hasUnversionedChanges(
  current: WorkflowCanvasState,
  latest: WorkflowVersion | null | undefined
): boolean {
  if (!latest) return true;
  const candidate = captureVersion(current, { workflowId: latest.workflowId });
  return !diffVersions(latest, candidate).identical;
}

/* -------------------------------------------------------------------------- */
/*                                 PERSISTENCE                                */
/* -------------------------------------------------------------------------- */

const storageKey = (workflowId: string) => `autoflow:versions:${workflowId}`;

export function serializeVersions(versions: WorkflowVersion[]): string {
  return JSON.stringify(sanitizeHistorySecrets(versions));
}

export function hydrateVersions(raw: string | null | undefined): WorkflowVersion[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item: any) => item && typeof item.id === 'string' && item.state && Array.isArray(item.state.actions)
    );
  } catch {
    return [];
  }
}

/** Stored versions for a workflow, newest first. */
export function listVersions(workflowId: string): WorkflowVersion[] {
  if (!workflowId || typeof localStorage === 'undefined') return [];
  try {
    return hydrateVersions(localStorage.getItem(storageKey(workflowId))).sort(
      (a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime()
    );
  } catch {
    return [];
  }
}

export function latestVersion(workflowId: string): WorkflowVersion | null {
  return listVersions(workflowId)[0] ?? null;
}

/**
 * Persist a version, pruning the oldest once the cap is reached.
 *
 * A quota failure drops the oldest half and retries once — losing distant
 * history is far better than silently failing to record the version the user
 * just asked for.
 */
export function saveVersion(version: WorkflowVersion): WorkflowVersion[] {
  if (!version?.workflowId || typeof localStorage === 'undefined') return [];

  const existing = listVersions(version.workflowId);
  const next = [version, ...existing.filter((item) => item.id !== version.id)].slice(0, MAX_VERSIONS);

  try {
    localStorage.setItem(storageKey(version.workflowId), serializeVersions(next));
    return next;
  } catch {
    const trimmed = next.slice(0, Math.max(1, Math.floor(next.length / 2)));
    try {
      localStorage.setItem(storageKey(version.workflowId), serializeVersions(trimmed));
      return trimmed;
    } catch {
      return existing;
    }
  }
}

export function deleteVersion(workflowId: string, versionId: string): WorkflowVersion[] {
  if (!workflowId || typeof localStorage === 'undefined') return [];
  const next = listVersions(workflowId).filter((version) => version.id !== versionId);
  try {
    localStorage.setItem(storageKey(workflowId), serializeVersions(next));
  } catch {
    /* ignore */
  }
  return next;
}

export function clearVersions(workflowId: string): void {
  if (!workflowId || typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(storageKey(workflowId));
  } catch {
    /* ignore */
  }
}
