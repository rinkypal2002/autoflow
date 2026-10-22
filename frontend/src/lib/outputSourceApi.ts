/**
 * Browser client for the read-only PostgreSQL output-source API.
 *
 * Step 7B.5B.1 loads one complete immutable catalogue per persisted run and
 * filters it in the browser using the current workflow graph. This avoids a
 * request per selected node and remains safe when the current workflow has
 * nodes that did not exist in an older execution version.
 */

import type { BindingSource, BindingSourceGroup } from '../types/workflow';
import type { SafeOutputSourceReadMode } from './outputSourceMode';

const viteEnv = (import.meta as ImportMeta & {
  env?: Record<string, string | undefined>;
}).env;
const trimTrailingSlash = (value: string): string =>
  value === '/' ? '' : value.replace(/\/+$/, '');
const API_BASE = `${trimTrailingSlash(viteEnv?.VITE_NODE_API_BASE ?? '/api')}/workspace`;
const DEFAULT_PAGE_SIZE = 2000;
const MAX_PAGES = 25;

export interface IndexedBindingSource extends BindingSource {
  nodeId?: string;
  nodeName?: string;
  fieldKind?: 'BUSINESS' | 'TECHNICAL' | 'RAW' | string;
  databaseValueType?: string;
}

export interface IndexedNodeOutputGroup {
  nodeId: string;
  nodeName: string;
  stepKey: string;
  sequence: number;
  business: IndexedBindingSource[];
  technical: IndexedBindingSource[];
  raw: IndexedBindingSource[];
  counts: {
    business: number;
    technical: number;
    raw: number;
    total: number;
  };
}

export interface OutputSourceCoverage {
  finalNodes: number;
  indexedNodes: number;
  missingIndexedNodes: number;
  indexRows: number;
  complete: boolean;
  eligibleNodes: number;
  totalMatchingRows: number;
  returnedRows: number;
  returnedNodes: number;
  hasMore: boolean;
}

export interface OutputSourceApiResponse {
  status: 'success';
  source: 'postgres';
  readModel: string;
  readOnly: true;
  workflowId: string;
  requestedRunId: string | null;
  runId: string;
  execution: Record<string, unknown>;
  query: {
    targetNodeId: string | null;
    targetFilter: string;
    search: string;
    includeTechnical: boolean;
    includeRaw: boolean;
    limit: number;
    offset: number;
  };
  coverage: OutputSourceCoverage;
  groups: IndexedNodeOutputGroup[];
  bindingGroups: BindingSourceGroup[];
}

export interface LoadOutputSourceInput {
  mode: SafeOutputSourceReadMode;
  workflowId: string;
  runId: string;
  /** Metadata for parity reports; not sent when eligibleNodeIds are supplied. */
  targetNodeId?: string | null;
  /** Current-graph ancestors calculated by the frontend. */
  eligibleNodeIds?: string[] | null;
  includeTechnical?: boolean;
  includeRaw?: boolean;
  pageSize?: number;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}

export type OutputSourceLoadResult =
  | { status: 'skipped'; reason: 'legacy-mode' }
  | { status: 'loaded'; response: OutputSourceApiResponse; pages: number; cacheHit: boolean };

export class OutputSourceApiError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'OutputSourceApiError';
    this.status = status;
    this.code = code;
  }
}

interface LoadedCatalogue {
  response: OutputSourceApiResponse;
  pages: number;
}

const completedCatalogueCache = new Map<string, Promise<LoadedCatalogue>>();

function positiveInt(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function assertResponse(value: unknown): OutputSourceApiResponse {
  if (!value || typeof value !== 'object') {
    throw new OutputSourceApiError('Output-source API returned an invalid payload.', 502);
  }
  const candidate = value as Partial<OutputSourceApiResponse>;
  if (
    candidate.status !== 'success' ||
    candidate.source !== 'postgres' ||
    candidate.readOnly !== true ||
    typeof candidate.workflowId !== 'string' ||
    typeof candidate.runId !== 'string' ||
    !candidate.coverage ||
    !Array.isArray(candidate.groups) ||
    !Array.isArray(candidate.bindingGroups)
  ) {
    throw new OutputSourceApiError('Output-source API response contract mismatch.', 502);
  }
  return candidate as OutputSourceApiResponse;
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function fetchPage(
  input: Omit<LoadOutputSourceInput, 'mode' | 'eligibleNodeIds'>,
  offset: number,
  limit: number,
  fetchImpl: typeof fetch
): Promise<OutputSourceApiResponse> {
  const params = new URLSearchParams({
    runId: input.runId,
    includeTechnical: String(input.includeTechnical !== false),
    includeRaw: String(input.includeRaw !== false),
    limit: String(limit),
    offset: String(offset),
  });
  if (input.targetNodeId) params.set('targetNodeId', input.targetNodeId);

  const url = `${API_BASE}/workflows/${encodeURIComponent(input.workflowId)}` +
    `/output-sources?${params.toString()}`;

  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      signal: input.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new OutputSourceApiError('Cannot reach the output-source API.', 0);
  }

  const body = await readJson(response);
  if (!response.ok) {
    const record = body && typeof body === 'object' ? body as Record<string, unknown> : {};
    throw new OutputSourceApiError(
      String(record.error ?? `Output-source API error ${response.status}`),
      response.status,
      typeof record.code === 'string' ? record.code : undefined
    );
  }
  return assertResponse(body);
}

function sourceIdentity(source: BindingSource): string {
  return source.token || source.path;
}

function mergeSources(target: BindingSource[], incoming: BindingSource[]): void {
  const seen = new Set(target.map(sourceIdentity));
  for (const source of incoming) {
    const identity = sourceIdentity(source);
    if (seen.has(identity)) continue;
    seen.add(identity);
    target.push(source);
  }
}

function mergeBindingGroups(
  target: Map<string, BindingSourceGroup>,
  incoming: BindingSourceGroup[]
): void {
  for (const group of incoming) {
    const existing = target.get(group.id);
    if (!existing) {
      target.set(group.id, { ...group, sources: [...group.sources] });
      continue;
    }
    mergeSources(existing.sources, group.sources);
  }
}

function mergeNodeGroups(
  target: Map<string, IndexedNodeOutputGroup>,
  incoming: IndexedNodeOutputGroup[]
): void {
  for (const group of incoming) {
    const existing = target.get(group.nodeId);
    if (!existing) {
      target.set(group.nodeId, {
        ...group,
        business: [...group.business],
        technical: [...group.technical],
        raw: [...group.raw],
        counts: { ...group.counts },
      });
      continue;
    }
    mergeSources(existing.business, group.business);
    mergeSources(existing.technical, group.technical);
    mergeSources(existing.raw, group.raw);
    existing.counts = {
      business: existing.business.length,
      technical: existing.technical.length,
      raw: existing.raw.length,
      total: existing.business.length + existing.technical.length + existing.raw.length,
    };
  }
}

async function loadAllPages(
  input: Omit<LoadOutputSourceInput, 'mode' | 'eligibleNodeIds'>,
  pageSize: number,
  fetchImpl: typeof fetch
): Promise<LoadedCatalogue> {
  const bindingGroups = new Map<string, BindingSourceGroup>();
  const nodeGroups = new Map<string, IndexedNodeOutputGroup>();
  let offset = 0;
  let pages = 0;
  let first: OutputSourceApiResponse | null = null;
  let last: OutputSourceApiResponse | null = null;

  while (pages < MAX_PAGES) {
    const page = await fetchPage(input, offset, pageSize, fetchImpl);
    if (!first) first = page;
    last = page;
    pages += 1;
    mergeBindingGroups(bindingGroups, page.bindingGroups);
    mergeNodeGroups(nodeGroups, page.groups);

    if (!page.coverage.hasMore || page.coverage.returnedRows === 0) break;
    offset += page.coverage.returnedRows;
  }

  if (!first || !last) {
    throw new OutputSourceApiError('Output-source API returned no pages.', 502);
  }
  if (last.coverage.hasMore) {
    throw new OutputSourceApiError(
      `Output-source response exceeded the ${MAX_PAGES * pageSize} row shadow limit.`,
      413,
      'OUTPUT_SOURCE_SHADOW_LIMIT_EXCEEDED'
    );
  }

  const groups = [...nodeGroups.values()].sort(
    (a, b) => a.sequence - b.sequence || a.nodeName.localeCompare(b.nodeName)
  );
  const returnedRows = groups.reduce((sum, group) => sum + group.counts.total, 0);

  return {
    pages,
    response: {
      ...first,
      query: { ...first.query, offset: 0, limit: pageSize },
      coverage: {
        ...last.coverage,
        returnedRows,
        returnedNodes: groups.length,
        hasMore: false,
      },
      groups,
      bindingGroups: [...bindingGroups.values()],
    },
  };
}

function cacheKey(input: LoadOutputSourceInput, pageSize: number): string {
  return [
    input.workflowId,
    input.runId,
    input.includeTechnical !== false ? 'technical' : 'business',
    input.includeRaw !== false ? 'raw' : 'no-raw',
    pageSize,
  ].join('|');
}

function isTerminalComplete(response: OutputSourceApiResponse): boolean {
  const status = String(response.execution.status ?? '').toLowerCase();
  return response.coverage.complete && ['completed', 'error', 'cancelled', 'canceled'].includes(status);
}

async function loadFullCatalogue(
  input: LoadOutputSourceInput,
  pageSize: number,
  fetchImpl: typeof fetch
): Promise<{ loaded: LoadedCatalogue; cacheHit: boolean }> {
  // Test/custom fetches intentionally bypass the process-wide browser cache.
  if (input.fetchImpl) {
    return {
      loaded: await loadAllPages({ ...input, targetNodeId: null }, pageSize, fetchImpl),
      cacheHit: false,
    };
  }

  const key = cacheKey(input, pageSize);
  const existing = completedCatalogueCache.get(key);
  if (existing) return { loaded: await existing, cacheHit: true };

  const promise = loadAllPages(
    { ...input, targetNodeId: null, signal: undefined },
    pageSize,
    fetchImpl
  );
  completedCatalogueCache.set(key, promise);

  try {
    const loaded = await promise;
    if (!isTerminalComplete(loaded.response)) completedCatalogueCache.delete(key);
    return { loaded, cacheHit: false };
  } catch (error) {
    completedCatalogueCache.delete(key);
    throw error;
  }
}

function filteredBindingGroups(
  groups: BindingSourceGroup[],
  eligible: Set<string>
): BindingSourceGroup[] {
  return groups
    .map((group) => ({
      ...group,
      sources: group.sources.filter((source) => {
        const nodeId = (source as IndexedBindingSource).nodeId;
        return typeof nodeId === 'string' && eligible.has(nodeId);
      }),
    }))
    .filter((group) => group.sources.length > 0);
}

function filterForCurrentGraph(
  loaded: LoadedCatalogue,
  input: LoadOutputSourceInput
): LoadedCatalogue {
  if (input.eligibleNodeIds === undefined || input.eligibleNodeIds === null) return loaded;

  const eligible = new Set(
    input.eligibleNodeIds.map((value) => String(value).trim()).filter(Boolean)
  );
  const groups = loaded.response.groups.filter((group) => eligible.has(group.nodeId));
  const bindingGroups = filteredBindingGroups(loaded.response.bindingGroups, eligible);
  const returnedRows = groups.reduce((sum, group) => sum + group.counts.total, 0);
  const indexedNodes = groups.length;

  return {
    pages: loaded.pages,
    response: {
      ...loaded.response,
      query: {
        ...loaded.response.query,
        targetNodeId: input.targetNodeId ?? null,
        targetFilter: 'client-current-graph-ancestors',
      },
      coverage: {
        ...loaded.response.coverage,
        finalNodes: indexedNodes,
        indexedNodes,
        missingIndexedNodes: 0,
        indexRows: returnedRows,
        complete: true,
        eligibleNodes: eligible.size,
        totalMatchingRows: returnedRows,
        returnedRows,
        returnedNodes: indexedNodes,
        hasMore: false,
      },
      groups,
      bindingGroups,
    },
  };
}

/** Clear the immutable-run cache; primarily useful for regression tests. */
export function clearOutputSourceCatalogueCache(): void {
  completedCatalogueCache.clear();
}

/**
 * Load all pages needed for one shadow comparison.
 *
 * In `legacy` mode this returns before touching the network. In shadow mode a
 * complete run catalogue is cached once, then target-node ancestor filtering
 * is performed locally using the current editor graph.
 */
export async function loadOutputSourceCatalogue(
  input: LoadOutputSourceInput
): Promise<OutputSourceLoadResult> {
  if (input.mode === 'legacy') return { status: 'skipped', reason: 'legacy-mode' };

  const fetchImpl = input.fetchImpl ?? fetch;
  const pageSize = Math.min(2000, positiveInt(input.pageSize, DEFAULT_PAGE_SIZE));

  const { loaded, cacheHit } = input.eligibleNodeIds !== undefined
    ? await loadFullCatalogue(input, pageSize, fetchImpl)
    : {
        loaded: await loadAllPages(input, pageSize, fetchImpl),
        cacheHit: false,
      };

  if (input.signal?.aborted) {
    throw new DOMException('The output-source request was aborted.', 'AbortError');
  }

  const filtered = filterForCurrentGraph(loaded, input);
  return {
    status: 'loaded',
    pages: filtered.pages,
    response: filtered.response,
    cacheHit,
  };
}
