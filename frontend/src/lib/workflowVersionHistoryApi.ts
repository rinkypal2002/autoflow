/** Read-only browser client for PostgreSQL workflow version history. */

import type { WorkflowVersion } from './workflowVersioning';
import type { SafeWorkflowVersionHistoryReadMode } from './workflowVersionHistoryMode';

const viteEnv = (import.meta as ImportMeta & {
  env?: Record<string, string | undefined>;
}).env;
const trimTrailingSlash = (value: string): string =>
  value === '/' ? '' : value.replace(/\/+$/, '');
const API_BASE = `${trimTrailingSlash(viteEnv?.VITE_NODE_API_BASE ?? '/api')}/workspace`;
const DEFAULT_PAGE_SIZE = 100;
const MAX_PAGES = 25;

export interface PostgresWorkflowVersion extends WorkflowVersion {
  versionNumber: number;
  versionLabel: string;
  source: 'postgres';
  sourceType: string;
  definitionSchemaVersion: number;
  definitionSha256?: string;
  comparisonFingerprint?: string;
  isPublished: boolean;
  isCurrent: boolean;
  restorable: boolean;
}

export interface WorkflowVersionHistoryCoverage {
  totalVersions: number;
  returnedVersions: number;
  hasMore: boolean;
}

export interface WorkflowVersionHistoryApiResponse {
  status: 'success';
  source: 'postgres';
  table: 'autoflow.workflow_version' | string;
  readOnly: true;
  restoreEnabled: false;
  workflowId: string;
  workflowName: string;
  currentVersionNumber: number;
  query: {
    includeDefinition: boolean;
    search: string;
    sourceType: string;
    limit: number;
    offset: number;
  };
  coverage: WorkflowVersionHistoryCoverage;
  versions: PostgresWorkflowVersion[];
}

export interface LoadWorkflowVersionHistoryInput {
  mode: SafeWorkflowVersionHistoryReadMode;
  workflowId: string;
  includeDefinition?: boolean;
  pageSize?: number;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}

export type WorkflowVersionHistoryLoadResult =
  | { status: 'skipped'; reason: 'legacy-mode' }
  | {
      status: 'loaded';
      response: WorkflowVersionHistoryApiResponse;
      pages: number;
      cacheHit: boolean;
    };

export class WorkflowVersionHistoryApiError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'WorkflowVersionHistoryApiError';
    this.status = status;
    this.code = code;
  }
}

interface LoadedHistory {
  response: WorkflowVersionHistoryApiResponse;
  pages: number;
}

const completedHistoryCache = new Map<string, Promise<LoadedHistory>>();

function positiveInt(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function assertResponse(value: unknown): WorkflowVersionHistoryApiResponse {
  if (!value || typeof value !== 'object') {
    throw new WorkflowVersionHistoryApiError(
      'Version-history API returned an invalid payload.',
      502
    );
  }
  const candidate = value as Partial<WorkflowVersionHistoryApiResponse>;
  if (
    candidate.status !== 'success' ||
    candidate.source !== 'postgres' ||
    candidate.readOnly !== true ||
    candidate.restoreEnabled !== false ||
    typeof candidate.workflowId !== 'string' ||
    typeof candidate.workflowName !== 'string' ||
    !candidate.coverage ||
    !Array.isArray(candidate.versions)
  ) {
    throw new WorkflowVersionHistoryApiError(
      'Version-history API response contract mismatch.',
      502
    );
  }
  return candidate as WorkflowVersionHistoryApiResponse;
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function fetchPage(
  workflowId: string,
  includeDefinition: boolean,
  offset: number,
  limit: number,
  signal: AbortSignal | undefined,
  fetchImpl: typeof fetch
): Promise<WorkflowVersionHistoryApiResponse> {
  const params = new URLSearchParams({
    includeDefinition: String(includeDefinition),
    limit: String(limit),
    offset: String(offset),
  });
  const response = await fetchImpl(
    `${API_BASE}/workflows/${encodeURIComponent(workflowId)}/versions?${params.toString()}`,
    {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal,
    }
  );
  const body = await readJson(response);
  if (!response.ok) {
    const record = (body && typeof body === 'object' ? body : {}) as {
      error?: string;
      code?: string;
    };
    throw new WorkflowVersionHistoryApiError(
      record.error || `Version-history API returned HTTP ${response.status}.`,
      response.status,
      record.code
    );
  }
  return assertResponse(body);
}

async function fetchCompleteHistory(
  input: Omit<LoadWorkflowVersionHistoryInput, 'mode'>,
  fetchImpl: typeof fetch
): Promise<LoadedHistory> {
  const includeDefinition = input.includeDefinition === true;
  const pageSize = Math.min(100, positiveInt(input.pageSize, DEFAULT_PAGE_SIZE));
  let offset = 0;
  let pages = 0;
  let first: WorkflowVersionHistoryApiResponse | null = null;
  const versions: PostgresWorkflowVersion[] = [];

  while (pages < MAX_PAGES) {
    const page = await fetchPage(
      input.workflowId,
      includeDefinition,
      offset,
      pageSize,
      input.signal,
      fetchImpl
    );
    if (!first) first = page;
    versions.push(...page.versions);
    pages += 1;
    if (!page.coverage.hasMore || page.versions.length === 0) break;
    offset += page.versions.length;
  }

  if (!first) {
    throw new WorkflowVersionHistoryApiError(
      'Version-history API returned no pages.',
      502
    );
  }

  const deduped = [...new Map(versions.map((version) => [version.id, version])).values()]
    .sort((a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime());

  return {
    pages,
    response: {
      ...first,
      query: {
        ...first.query,
        includeDefinition,
        limit: pageSize,
        offset: 0,
      },
      coverage: {
        totalVersions: first.coverage.totalVersions,
        returnedVersions: deduped.length,
        hasMore: deduped.length < first.coverage.totalVersions,
      },
      versions: deduped,
    },
  };
}

export async function loadWorkflowVersionHistory(
  input: LoadWorkflowVersionHistoryInput
): Promise<WorkflowVersionHistoryLoadResult> {
  if (input.mode === 'legacy') return { status: 'skipped', reason: 'legacy-mode' };
  if (!input.workflowId) {
    throw new WorkflowVersionHistoryApiError('Workflow id is required.', 400);
  }

  const includeDefinition = input.includeDefinition === true;
  const key = `${input.workflowId}|definitions:${includeDefinition}`;
  const existing = completedHistoryCache.get(key);
  const fetchImpl = input.fetchImpl ?? fetch;
  if (existing) {
    const loaded = await existing;
    return { status: 'loaded', ...loaded, cacheHit: true };
  }

  const pending = fetchCompleteHistory(
    {
      workflowId: input.workflowId,
      includeDefinition,
      pageSize: input.pageSize,
      signal: input.signal,
      fetchImpl,
    },
    fetchImpl
  );
  completedHistoryCache.set(key, pending);
  try {
    const loaded = await pending;
    return { status: 'loaded', ...loaded, cacheHit: false };
  } catch (error) {
    completedHistoryCache.delete(key);
    throw error;
  }
}

export function clearWorkflowVersionHistoryCache(workflowId?: string): void {
  if (!workflowId) {
    completedHistoryCache.clear();
    return;
  }
  for (const key of completedHistoryCache.keys()) {
    if (key.startsWith(`${workflowId}|`)) completedHistoryCache.delete(key);
  }
}
