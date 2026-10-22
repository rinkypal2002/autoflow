/**
 * Execution snapshot persistence.
 *
 * A snapshot is written after every node completes, so a run that is stopped,
 * reloaded or crashed can still be inspected — and its collected values
 * reused — afterwards. Two tiers are used:
 *
 *   • localStorage — always written, synchronous, survives a page reload.
 *   • backend      — best effort POST to the workspace runs API so snapshots
 *                    live next to the workflow file and outlive the browser.
 *
 * Backend failures are never fatal: persistence is a debugging/recovery aid,
 * not part of the execution path, so a snapshot write can never fail a run.
 */

import type { ExecutionSnapshot } from '../types/workflow';
import { SERVICES } from '../config/services';
import { redactSecrets, safeJsonParse } from './objectUtils';

const STORAGE_PREFIX = 'workflowRunSnapshot:';
const INDEX_KEY = 'workflowRunSnapshotIndex';

/** Keep at most this many runs per workflow in local storage. */
const LOCAL_RETENTION = 10;

const API_BASE = `${SERVICES.nodeApiBase}/workspace`;

interface SnapshotIndexEntry {
  runId: string;
  workflowId: string;
  updatedAt: string;
  status: string;
}

/* -------------------------------------------------------------------------- */
/*                              LOCAL STORAGE TIER                            */
/* -------------------------------------------------------------------------- */

const storageAvailable = (): boolean => {
  try {
    return typeof window !== 'undefined' && Boolean(window.localStorage);
  } catch {
    return false;
  }
};

const snapshotKey = (workflowId: string, runId: string): string =>
  `${STORAGE_PREFIX}${workflowId}:${runId}`;

function readIndex(): SnapshotIndexEntry[] {
  if (!storageAvailable()) return [];
  const raw = window.localStorage.getItem(INDEX_KEY);
  if (!raw) return [];
  const parsed = safeJsonParse<SnapshotIndexEntry[]>(raw, []);
  return Array.isArray(parsed) ? parsed : [];
}

function writeIndex(entries: SnapshotIndexEntry[]): void {
  if (!storageAvailable()) return;
  try {
    window.localStorage.setItem(INDEX_KEY, JSON.stringify(entries));
  } catch {
    /* quota exceeded — index is a convenience, not a requirement */
  }
}

function pruneLocal(workflowId: string): void {
  if (!storageAvailable()) return;

  const index = readIndex();
  const forWorkflow = index
    .filter((entry) => entry.workflowId === workflowId)
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));

  const excess = forWorkflow.slice(LOCAL_RETENTION);
  if (excess.length === 0) return;

  excess.forEach((entry) => {
    try {
      window.localStorage.removeItem(snapshotKey(entry.workflowId, entry.runId));
    } catch {
      /* ignore */
    }
  });

  const keep = new Set(forWorkflow.slice(0, LOCAL_RETENTION).map((entry) => entry.runId));
  writeIndex(index.filter((entry) => entry.workflowId !== workflowId || keep.has(entry.runId)));
}

function saveLocal(snapshot: ExecutionSnapshot): void {
  if (!storageAvailable()) return;

  try {
    window.localStorage.setItem(
      snapshotKey(snapshot.workflowId, snapshot.runId),
      JSON.stringify(snapshot)
    );
  } catch {
    // Quota exceeded: drop older runs and retry once with a slimmer payload.
    pruneLocal(snapshot.workflowId);
    try {
      window.localStorage.setItem(
        snapshotKey(snapshot.workflowId, snapshot.runId),
        JSON.stringify({ ...snapshot, logs: undefined })
      );
    } catch {
      return;
    }
  }

  const index = readIndex().filter(
    (entry) => !(entry.workflowId === snapshot.workflowId && entry.runId === snapshot.runId)
  );
  index.push({
    runId: snapshot.runId,
    workflowId: snapshot.workflowId,
    updatedAt: snapshot.updatedAt,
    status: String(snapshot.status),
  });
  writeIndex(index);
  pruneLocal(snapshot.workflowId);
}

/* -------------------------------------------------------------------------- */
/*                                BACKEND TIER                                */
/* -------------------------------------------------------------------------- */

/**
 * Remote snapshot writes are intentionally best-effort, but they must still be
 * ordered per run. The editor publishes progress snapshots without awaiting
 * network I/O; without this queue an older "running" POST can finish after
 * the terminal "completed"/"error" POST and regress PostgreSQL back to a
 * non-terminal state.
 *
 * Keep different runs independent while serialising writes for the same
 * workflow + runId. Callers still do not wait, so execution speed is unchanged.
 */
const remoteWriteQueues = new Map<string, Promise<boolean>>();

const remoteQueueKey = (snapshot: ExecutionSnapshot): string =>
  `${snapshot.workflowId}:${snapshot.runId}`;

async function saveRemote(snapshot: ExecutionSnapshot): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE}/workflows/${encodeURIComponent(snapshot.workflowId)}/runs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(snapshot),
    });
    return response.ok;
  } catch {
    return false;
  }
}

function saveRemoteOrdered(snapshot: ExecutionSnapshot): Promise<boolean> {
  const key = remoteQueueKey(snapshot);
  const previous = remoteWriteQueues.get(key) ?? Promise.resolve(true);

  const current = previous
    .catch(() => false)
    .then(() => saveRemote(snapshot));

  remoteWriteQueues.set(key, current);

  void current.finally(() => {
    if (remoteWriteQueues.get(key) === current) {
      remoteWriteQueues.delete(key);
    }
  });

  return current;
}

/* -------------------------------------------------------------------------- */
/*                                 PUBLIC API                                 */
/* -------------------------------------------------------------------------- */

export interface PersistOptions {
  /** Also POST to the backend. Defaults to true. */
  remote?: boolean;
}

/**
 * Persist a snapshot. Always writes locally; optionally mirrors to the
 * backend. Resolves to whether the remote write succeeded — callers can
 * ignore the result entirely.
 */
export async function persistSnapshot(
  snapshot: ExecutionSnapshot,
  options: PersistOptions = {}
): Promise<boolean> {
  const { remote = true } = options;
  const safeSnapshot = redactSecrets(snapshot);
  saveLocal(safeSnapshot);
  if (!remote) return false;
  return saveRemoteOrdered(safeSnapshot);
}

/** Read a snapshot back, preferring the backend and falling back to local. */
export async function loadSnapshot(
  workflowId: string,
  runId: string
): Promise<ExecutionSnapshot | null> {
  try {
    const response = await fetch(
      `${API_BASE}/workflows/${encodeURIComponent(workflowId)}/runs/${encodeURIComponent(runId)}`
    );
    if (response.ok) {
      const body = await response.json();
      if (body?.run) return body.run as ExecutionSnapshot;
    }
  } catch {
    /* fall through to local */
  }

  if (!storageAvailable()) return null;
  const raw = window.localStorage.getItem(snapshotKey(workflowId, runId));
  return raw ? safeJsonParse<ExecutionSnapshot | null>(raw, null) : null;
}

/** The most recent locally-stored snapshot for a workflow, if any. */
export function loadLatestLocalSnapshot(workflowId: string): ExecutionSnapshot | null {
  if (!storageAvailable()) return null;

  const latest = readIndex()
    .filter((entry) => entry.workflowId === workflowId)
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))[0];

  if (!latest) return null;
  const raw = window.localStorage.getItem(snapshotKey(workflowId, latest.runId));
  return raw ? safeJsonParse<ExecutionSnapshot | null>(raw, null) : null;
}

/** List known runs for a workflow, newest first. */
export async function listSnapshots(workflowId: string): Promise<SnapshotIndexEntry[]> {
  try {
    const response = await fetch(`${API_BASE}/workflows/${encodeURIComponent(workflowId)}/runs`);
    if (response.ok) {
      const body = await response.json();
      if (Array.isArray(body?.runs)) {
        return body.runs.map((run: any) => ({
          runId: String(run.runId),
          workflowId,
          updatedAt: String(run.updatedAt ?? run.startedAt ?? ''),
          status: String(run.status ?? 'unknown'),
        }));
      }
    }
  } catch {
    /* fall through to local */
  }

  return readIndex()
    .filter((entry) => entry.workflowId === workflowId)
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
}

/** Remove every locally stored snapshot for a workflow. */
export function clearLocalSnapshots(workflowId: string): void {
  if (!storageAvailable()) return;
  const index = readIndex();
  index
    .filter((entry) => entry.workflowId === workflowId)
    .forEach((entry) => {
      try {
        window.localStorage.removeItem(snapshotKey(entry.workflowId, entry.runId));
      } catch {
        /* ignore */
      }
    });
  writeIndex(index.filter((entry) => entry.workflowId !== workflowId));
}
