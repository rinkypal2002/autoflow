import type { SafePluginMappingReadMode } from './pluginMappingMode';

const viteEnv = (import.meta as ImportMeta & {
  env?: Record<string, string | undefined>;
}).env;
const trimTrailingSlash = (value: string): string =>
  value === '/' ? '' : value.replace(/\/+$/, '');
const API_BASE = `${trimTrailingSlash(viteEnv?.VITE_NODE_API_BASE ?? '/api')}/plugin-mappings`;
const DEFAULT_PAGE_SIZE = 500;
const MAX_PAGES = 10;

export type PluginMappingActionRole = 'WORKFLOW' | 'CONTROL' | 'ALIAS';
export type PluginMappingActionExposure = 'PUBLIC' | 'INTERNAL' | 'NOT_CERTIFIED';

export interface PluginEndpointMappingReadRecord {
  engineVersion: string;
  engineContextPath: string;
  pluginId: string;
  pluginName: string;
  category?: string | null;
  actionId: string;
  actionName: string;
  httpMethod: string;
  canonicalPath: string;
  legacyPath?: string | null;
  requestContentTypes: string[];
  responseContentTypes: string[];
  bodyType?: string | null;
  schemaStatus: 'PLACEHOLDER' | 'VERIFIED' | 'DEPRECATED' | string;
  responseContractVersion?: string | null;
  authenticationType?: string | null;
  artifactBehavior?: string | null;
  timeoutMs?: number | null;
  enabled: boolean;
  deprecated: boolean;
  metadata?: {
    actionRole?: PluginMappingActionRole | string;
    actionExposure?: PluginMappingActionExposure | string;
    workflowEligible?: boolean;
    replacementActionKey?: string;
    legacyEndpoints?: string[];
    deprecatedCanonicalEndpoints?: string[];
    requiredFields?: string[];
    optionalFields?: string[];
    secretFields?: string[];
    fileInputs?: string[];
    fileOutputs?: string[];
    [key: string]: unknown;
  } | null;
  updatedAt?: string | null;
}

export interface PluginMappingCoverage {
  totalMappings: number;
  activeMappings: number;
  verifiedSchemas: number;
  placeholderSchemas: number;
  returnedMappings: number;
  hasMore: boolean;
}

export interface PluginMappingApiResponse {
  status: 'success';
  source: 'postgres';
  table: string;
  readOnly: true;
  writeEndpointAvailable: false;
  engineVersion: string;
  query: {
    pluginId: string;
    search: string;
    includeDeprecated: boolean;
    limit: number;
    offset: number;
  };
  coverage: PluginMappingCoverage;
  mappings: PluginEndpointMappingReadRecord[];
}

export interface LoadPluginMappingsInput {
  mode: SafePluginMappingReadMode;
  engineVersion?: string;
  includeDeprecated?: boolean;
  pageSize?: number;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}

export type PluginMappingLoadResult =
  | { status: 'skipped'; reason: 'legacy-mode' }
  | { status: 'loaded'; response: PluginMappingApiResponse; pages: number; cacheHit: boolean };

export class PluginMappingApiError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'PluginMappingApiError';
    this.status = status;
    this.code = code;
  }
}

interface LoadedCatalogue {
  response: PluginMappingApiResponse;
  pages: number;
}

const completedCache = new Map<string, Promise<LoadedCatalogue>>();

function positiveInt(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function assertResponse(value: unknown): PluginMappingApiResponse {
  if (!value || typeof value !== 'object') {
    throw new PluginMappingApiError('Plugin mapping API returned an invalid payload.', 502);
  }
  const candidate = value as Partial<PluginMappingApiResponse>;
  if (
    candidate.status !== 'success' ||
    candidate.source !== 'postgres' ||
    candidate.readOnly !== true ||
    candidate.writeEndpointAvailable !== false ||
    typeof candidate.engineVersion !== 'string' ||
    !candidate.coverage ||
    !Array.isArray(candidate.mappings)
  ) {
    throw new PluginMappingApiError('Plugin mapping API response contract mismatch.', 502);
  }
  return candidate as PluginMappingApiResponse;
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function fetchPage(input: LoadPluginMappingsInput, offset: number, limit: number): Promise<PluginMappingApiResponse> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const params = new URLSearchParams({
    engineVersion: input.engineVersion ?? 'v11.3',
    includeDeprecated: String(input.includeDeprecated === true),
    limit: String(limit),
    offset: String(offset),
  });
  let response: Response;
  try {
    response = await fetchImpl(`${API_BASE}?${params.toString()}`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      signal: input.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new PluginMappingApiError('Cannot reach the plugin mapping API.', 0);
  }
  const body = await readJson(response);
  if (!response.ok) {
    const record = body && typeof body === 'object' ? body as Record<string, unknown> : {};
    throw new PluginMappingApiError(
      String(record.error ?? `Plugin mapping API error ${response.status}`),
      response.status,
      typeof record.code === 'string' ? record.code : undefined
    );
  }
  return assertResponse(body);
}

async function loadAllPages(input: LoadPluginMappingsInput, pageSize: number): Promise<LoadedCatalogue> {
  const mappings = new Map<string, PluginEndpointMappingReadRecord>();
  let first: PluginMappingApiResponse | null = null;
  let last: PluginMappingApiResponse | null = null;
  let offset = 0;
  let pages = 0;

  while (pages < MAX_PAGES) {
    const page = await fetchPage(input, offset, pageSize);
    if (!first) first = page;
    last = page;
    pages += 1;
    for (const mapping of page.mappings) {
      mappings.set(`${mapping.engineVersion}::${mapping.pluginId}::${mapping.actionId}`, mapping);
    }
    if (!page.coverage.hasMore || page.coverage.returnedMappings === 0) break;
    offset += page.coverage.returnedMappings;
  }

  if (!first || !last) {
    throw new PluginMappingApiError('Plugin mapping API returned no pages.', 502);
  }
  if (last.coverage.hasMore) {
    throw new PluginMappingApiError('Plugin mapping response exceeded the shadow page limit.', 502);
  }

  return {
    pages,
    response: {
      ...first,
      query: { ...first.query, limit: pageSize, offset: 0 },
      coverage: {
        ...first.coverage,
        returnedMappings: mappings.size,
        hasMore: false,
      },
      mappings: [...mappings.values()],
    },
  };
}

export async function loadPluginMappings(input: LoadPluginMappingsInput): Promise<PluginMappingLoadResult> {
  if (input.mode === 'legacy') return { status: 'skipped', reason: 'legacy-mode' };
  const pageSize = Math.min(2000, positiveInt(input.pageSize, DEFAULT_PAGE_SIZE));
  const key = `${input.engineVersion ?? 'v11.3'}|${input.includeDeprecated === true}|${pageSize}`;
  const existing = completedCache.get(key);
  if (existing) {
    const loaded = await existing;
    return { status: 'loaded', ...loaded, cacheHit: true };
  }
  const pending = loadAllPages(input, pageSize);
  completedCache.set(key, pending);
  try {
    const loaded = await pending;
    return { status: 'loaded', ...loaded, cacheHit: false };
  } catch (error) {
    completedCache.delete(key);
    throw error;
  }
}

export function clearPluginMappingCache(): void {
  completedCache.clear();
}
