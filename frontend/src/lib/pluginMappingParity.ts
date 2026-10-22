import type { AutomationCategory, APIConfig } from '../types/workflow';
import type {
  PluginEndpointMappingReadRecord,
  PluginMappingActionExposure,
  PluginMappingActionRole,
} from './pluginMappingApi';
import type { PluginMappingModeState } from './pluginMappingMode';
import { isCategoryExecutable, isWorkflowActionExecutable } from './actionAvailability';

const LAST_REPORT_KEY = 'autoflow:plugin-mapping-shadow:last:v1';
const REPORTS_KEY = 'autoflow:plugin-mapping-shadow:reports:v1';
const MAX_REPORTS = 20;

export interface FrontendPluginActionDescriptor {
  categoryId: string;
  categoryName: string;
  actionType: string;
  actionName: string;
  endpoint: string;
  method: string;
  contentType: string;
  bodyType: string;
}

export interface PluginMappingActionPolicy {
  actionRole: PluginMappingActionRole;
  actionExposure: PluginMappingActionExposure;
  workflowEligible: boolean;
  replacementActionKey?: string;
}

export interface PluginMappingDifferenceSample {
  categoryId?: string;
  categoryName?: string;
  actionType?: string;
  actionName: string;
  endpoint?: string;
  method?: string;
  pluginId?: string;
  actionId?: string;
  canonicalPath?: string;
  expectedMethod?: string;
  actualMethod?: string;
  expectedContentTypes?: string[];
  actualContentType?: string;
  actionRole?: PluginMappingActionRole;
  actionExposure?: PluginMappingActionExposure;
  workflowEligible?: boolean;
  replacementActionKey?: string;
}

export interface PluginMappingParityReport {
  schemaVersion: '1.0';
  generatedAt: string;
  mode: PluginMappingModeState;
  source: 'static-frontend-vs-postgres';
  visibleCatalogueSource: 'static-frontend';
  executionRoutingChanged: false;
  databaseWritesPerformed: 0;
  summary: {
    frontendActions: number;
    frontendExecutableActions: number;
    frontendControlActions: number;
    frontendUnavailableActions: number;
    postgresMappings: number;
    postgresWorkflowEligibleMappings: number;
    postgresPolicyExcludedMappings: number;
    postgresAliasMappings: number;
    postgresControlMappings: number;
    postgresNotCertifiedMappings: number;
    exactRouteMethodMatches: number;
    canonicalRouteMatches: number;
    legacyRouteMatches: number;
    deprecatedRouteMatches: number;
    methodMismatches: number;
    contentTypeMismatches: number;
    routeMismatches: number;
    frontendOnlyActions: number;
    engineOnlyMappings: number;
    placeholderSchemas: number;
    verifiedSchemas: number;
  };
  methodMismatches: PluginMappingDifferenceSample[];
  contentTypeMismatches: PluginMappingDifferenceSample[];
  routeMismatches: PluginMappingDifferenceSample[];
  frontendOnly: PluginMappingDifferenceSample[];
  engineOnly: PluginMappingDifferenceSample[];
  policyExcluded: PluginMappingDifferenceSample[];
  verdict: 'SHADOW_COMPARISON_COMPLETE';
}

export interface PluginMappingShadowFailureReport {
  schemaVersion: '1.0';
  generatedAt: string;
  mode: PluginMappingModeState;
  visibleCatalogueSource: 'static-frontend';
  executionRoutingChanged: false;
  databaseWritesPerformed: 0;
  verdict: 'SHADOW_API_UNAVAILABLE';
  error: { name: string; message: string; code?: string; status?: number };
}

export type PersistedPluginMappingShadowReport =
  | PluginMappingParityReport
  | PluginMappingShadowFailureReport;

const ACTION_ROLES = new Set<PluginMappingActionRole>(['WORKFLOW', 'CONTROL', 'ALIAS']);
const ACTION_EXPOSURES = new Set<PluginMappingActionExposure>([
  'PUBLIC',
  'INTERNAL',
  'NOT_CERTIFIED',
]);

export function resolvePluginMappingActionPolicy(
  mapping: PluginEndpointMappingReadRecord
): PluginMappingActionPolicy {
  const metadata = mapping.metadata ?? {};
  const rawRole = String(metadata.actionRole ?? 'WORKFLOW').trim().toUpperCase();
  const rawExposure = String(metadata.actionExposure ?? 'PUBLIC').trim().toUpperCase();
  const actionRole = ACTION_ROLES.has(rawRole as PluginMappingActionRole)
    ? rawRole as PluginMappingActionRole
    : 'WORKFLOW';
  const actionExposure = ACTION_EXPOSURES.has(rawExposure as PluginMappingActionExposure)
    ? rawExposure as PluginMappingActionExposure
    : 'PUBLIC';
  const derivedEligible = actionRole === 'WORKFLOW' && actionExposure === 'PUBLIC';
  const explicitlyHeldBack = metadata.workflowEligible === false;

  return {
    actionRole,
    actionExposure,
    workflowEligible: derivedEligible && !explicitlyHeldBack,
    replacementActionKey:
      typeof metadata.replacementActionKey === 'string' && metadata.replacementActionKey.trim()
        ? metadata.replacementActionKey.trim()
        : undefined,
  };
}

export function isWorkflowEligiblePluginMapping(
  mapping: PluginEndpointMappingReadRecord
): boolean {
  return resolvePluginMappingActionPolicy(mapping).workflowEligible;
}

function normalizePath(value: string): string {
  let path = value.trim();
  try {
    path = new URL(path, 'http://autoflow.local').pathname;
  } catch {
    path = path.split(/[?#]/, 1)[0];
  }
  // Phase 4C.2C: normalize encoded workflow placeholders for route comparison.
  try {
    path = decodeURIComponent(path);
  } catch {
    // Keep the original path when malformed percent-encoding is encountered.
  }
  path = path.replace(/\{\{([^{}]+)\}\}/g, '{$1}');
  path = path.replace(/^\/engine(?=\/|$)/i, '') || '/';
  if (!path.startsWith('/')) path = `/${path}`;
  path = path.replace(/\/{2,}/g, '/');
  return path.length > 1 ? path.replace(/\/+$/, '') : path;
}

function normalizeMethod(value: unknown): string {
  return String(value || 'POST').trim().toUpperCase();
}

function headerContentType(api: APIConfig): string | null {
  const entry = Object.entries(api.headers || {}).find(([key]) => key.toLowerCase() === 'content-type');
  return entry ? String(entry[1]).split(';', 1)[0].trim().toLowerCase() : null;
}

function contentTypeFor(api: APIConfig, method: string): string {
  if (method === 'GET' || method === 'DELETE') return 'none';
  const header = headerContentType(api);
  if (header) return header;
  const bodyType = String(api.bodyType || '').toLowerCase();
  if (bodyType === 'form-data' || bodyType === 'multipart') return 'multipart/form-data';
  if (bodyType === 'form-urlencoded') return 'application/x-www-form-urlencoded';
  if (bodyType === 'binary') return 'application/octet-stream';
  return 'application/json';
}

function bodyTypeFor(contentType: string, method: string): string {
  if (method === 'GET' || method === 'DELETE') return 'none';
  if (contentType === 'multipart/form-data') return 'multipart';
  if (contentType === 'application/x-www-form-urlencoded') return 'form-urlencoded';
  if (contentType === 'application/octet-stream') return 'binary';
  return 'json';
}

export function flattenFrontendPluginActions(
  categories: AutomationCategory[]
): {
  descriptors: FrontendPluginActionDescriptor[];
  controlActions: number;
  unavailableActions: number;
  totalActions: number;
} {
  const descriptors: FrontendPluginActionDescriptor[] = [];
  let controlActions = 0;
  let unavailableActions = 0;
  let totalActions = 0;

  for (const category of categories) {
    const actions = category.actions ?? [];
    totalActions += actions.length;

    // Unavailable packages remain visible in the static catalogue but are not
    // executable contracts and therefore must not produce mapping findings.
    if (!isCategoryExecutable(category)) {
      unavailableActions += actions.length;
      continue;
    }

    for (const action of actions) {
      if (!isWorkflowActionExecutable(action, categories)) {
        unavailableActions += 1;
        continue;
      }

      if (!action.api?.url) {
        controlActions += 1;
        continue;
      }
      const method = normalizeMethod(action.api.method);
      const contentType = contentTypeFor(action.api, method);
      descriptors.push({
        categoryId: category.id,
        categoryName: category.name,
        actionType: action.type,
        actionName: action.name,
        endpoint: normalizePath(action.api.url),
        method,
        contentType,
        bodyType: bodyTypeFor(contentType, method),
      });
    }
  }

  return { descriptors, controlActions, unavailableActions, totalActions };
}

function endpointCandidates(mapping: PluginEndpointMappingReadRecord): Array<{ path: string; kind: 'canonical' | 'legacy' | 'deprecated' }> {
  const values: Array<{ path: string; kind: 'canonical' | 'legacy' | 'deprecated' }> = [];
  if (mapping.canonicalPath) values.push({ path: normalizePath(mapping.canonicalPath), kind: 'canonical' });
  if (mapping.legacyPath) values.push({ path: normalizePath(mapping.legacyPath), kind: 'legacy' });
  for (const value of mapping.metadata?.legacyEndpoints ?? []) {
    values.push({ path: normalizePath(value), kind: 'legacy' });
  }
  for (const value of mapping.metadata?.deprecatedCanonicalEndpoints ?? []) {
    values.push({ path: normalizePath(value), kind: 'deprecated' });
  }
  const seen = new Set<string>();
  return values.filter((item) => {
    const key = `${item.kind}:${item.path}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizedName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function routeHint(path: string): string {
  const parts = normalizePath(path).split('/').filter(Boolean);
  if (parts[0] === 'api' && parts[1] === 'v1') return parts[2] ?? '';
  if (parts[0] === 'api') return parts[1] ?? '';
  return parts[0] ?? '';
}

function normalizedRequestContentTypes(mapping: PluginEndpointMappingReadRecord): string[] {
  return (mapping.requestContentTypes ?? [])
    .map((value) => String(value).split(';', 1)[0].trim().toLowerCase())
    .filter(Boolean);
}

function contentCompatibilityRank(
  frontend: FrontendPluginActionDescriptor,
  mapping: PluginEndpointMappingReadRecord
): number {
  if (frontend.method === 'GET' || frontend.method === 'DELETE') return 3;
  const actual = String(frontend.contentType || '*/*').split(';', 1)[0].trim().toLowerCase();
  const expected = normalizedRequestContentTypes(mapping);
  if (expected.includes(actual)) return 3;
  if (expected.length === 0 || expected.includes('*/*')) return 2;
  return 0;
}

function contentCompatible(
  frontend: FrontendPluginActionDescriptor,
  mapping: PluginEndpointMappingReadRecord
): boolean {
  return contentCompatibilityRank(frontend, mapping) > 0;
}

function sampleFrontend(action: FrontendPluginActionDescriptor): PluginMappingDifferenceSample {
  return {
    categoryId: action.categoryId,
    categoryName: action.categoryName,
    actionType: action.actionType,
    actionName: action.actionName,
    endpoint: action.endpoint,
    method: action.method,
  };
}

function sampleMapping(mapping: PluginEndpointMappingReadRecord): PluginMappingDifferenceSample {
  const policy = resolvePluginMappingActionPolicy(mapping);
  return {
    actionName: mapping.actionName,
    pluginId: mapping.pluginId,
    actionId: mapping.actionId,
    canonicalPath: mapping.canonicalPath,
    method: mapping.httpMethod,
    actionRole: policy.actionRole,
    actionExposure: policy.actionExposure,
    workflowEligible: policy.workflowEligible,
    replacementActionKey: policy.replacementActionKey,
  };
}

export function comparePluginMappings(input: {
  mode: PluginMappingModeState;
  categories: AutomationCategory[];
  mappings: PluginEndpointMappingReadRecord[];
}): PluginMappingParityReport {
  const flattened = flattenFrontendPluginActions(input.categories);
  const activeMappings = input.mappings.filter((mapping) => mapping.enabled && !mapping.deprecated);
  const workflowEligibleMappings = activeMappings.filter(isWorkflowEligiblePluginMapping);
  const policyExcludedMappings = activeMappings.filter(
    (mapping) => !isWorkflowEligiblePluginMapping(mapping)
  );
  const usedMappings = new Set<string>();
  const methodMismatches: PluginMappingDifferenceSample[] = [];
  const contentTypeMismatches: PluginMappingDifferenceSample[] = [];
  const routeMismatches: PluginMappingDifferenceSample[] = [];
  const frontendOnly: PluginMappingDifferenceSample[] = [];
  let exactRouteMethodMatches = 0;
  let canonicalRouteMatches = 0;
  let legacyRouteMatches = 0;
  let deprecatedRouteMatches = 0;

  const mappingKey = (mapping: PluginEndpointMappingReadRecord): string =>
    `${mapping.engineVersion}::${mapping.pluginId}::${mapping.actionId}`;

  for (const action of flattened.descriptors) {
    const pathMatches = workflowEligibleMappings.flatMap((mapping) =>
      endpointCandidates(mapping)
        .filter((candidate) => candidate.path === action.endpoint)
        .map((candidate) => ({ mapping, kind: candidate.kind }))
    );
    const methodMatches = pathMatches.filter(
      ({ mapping }) => normalizeMethod(mapping.httpMethod) === action.method
    );
    const exact = methodMatches
      .map((candidate) => ({ candidate, rank: contentCompatibilityRank(action, candidate.mapping) }))
      .sort((left, right) => right.rank - left.rank)[0]?.candidate;
    if (exact) {
      usedMappings.add(mappingKey(exact.mapping));
      exactRouteMethodMatches += 1;
      if (exact.kind === 'canonical') canonicalRouteMatches += 1;
      if (exact.kind === 'legacy') legacyRouteMatches += 1;
      if (exact.kind === 'deprecated') deprecatedRouteMatches += 1;
      if (!contentCompatible(action, exact.mapping)) {
        contentTypeMismatches.push({
          ...sampleFrontend(action),
          pluginId: exact.mapping.pluginId,
          actionId: exact.mapping.actionId,
          canonicalPath: exact.mapping.canonicalPath,
          expectedContentTypes: exact.mapping.requestContentTypes,
          actualContentType: action.contentType,
        });
      }
      continue;
    }

    if (pathMatches.length > 0) {
      const candidate = pathMatches[0].mapping;
      usedMappings.add(mappingKey(candidate));
      methodMismatches.push({
        ...sampleFrontend(action),
        pluginId: candidate.pluginId,
        actionId: candidate.actionId,
        canonicalPath: candidate.canonicalPath,
        expectedMethod: normalizeMethod(candidate.httpMethod),
        actualMethod: action.method,
      });
      continue;
    }

    const hint = routeHint(action.endpoint);
    const nameCandidates = workflowEligibleMappings.filter((mapping) => {
      if (normalizedName(mapping.actionName) !== normalizedName(action.actionName)) return false;
      if (!hint) return true;
      const mappingHint = routeHint(mapping.canonicalPath);
      return mappingHint === hint || mapping.pluginId.toLowerCase().includes(hint.toLowerCase());
    });
    if (nameCandidates.length === 1) {
      const candidate = nameCandidates[0];
      usedMappings.add(mappingKey(candidate));
      routeMismatches.push({
        ...sampleFrontend(action),
        pluginId: candidate.pluginId,
        actionId: candidate.actionId,
        canonicalPath: candidate.canonicalPath,
        expectedMethod: normalizeMethod(candidate.httpMethod),
        actualMethod: action.method,
      });
    } else {
      frontendOnly.push(sampleFrontend(action));
    }
  }

  const engineOnly = workflowEligibleMappings
    .filter((mapping) => !usedMappings.has(mappingKey(mapping)))
    .map(sampleMapping);
  const policyExcluded = policyExcludedMappings.map(sampleMapping);

  return {
    schemaVersion: '1.0',
    generatedAt: new Date().toISOString(),
    mode: input.mode,
    source: 'static-frontend-vs-postgres',
    visibleCatalogueSource: 'static-frontend',
    executionRoutingChanged: false,
    databaseWritesPerformed: 0,
    summary: {
      frontendActions: flattened.totalActions,
      frontendExecutableActions: flattened.descriptors.length,
      frontendControlActions: flattened.controlActions,
      frontendUnavailableActions: flattened.unavailableActions,
      postgresMappings: activeMappings.length,
      postgresWorkflowEligibleMappings: workflowEligibleMappings.length,
      postgresPolicyExcludedMappings: policyExcludedMappings.length,
      postgresAliasMappings: policyExcludedMappings.filter(
        (mapping) => resolvePluginMappingActionPolicy(mapping).actionRole === 'ALIAS'
      ).length,
      postgresControlMappings: policyExcludedMappings.filter(
        (mapping) => resolvePluginMappingActionPolicy(mapping).actionRole === 'CONTROL'
      ).length,
      postgresNotCertifiedMappings: policyExcludedMappings.filter(
        (mapping) =>
          resolvePluginMappingActionPolicy(mapping).actionExposure === 'NOT_CERTIFIED'
      ).length,
      exactRouteMethodMatches,
      canonicalRouteMatches,
      legacyRouteMatches,
      deprecatedRouteMatches,
      methodMismatches: methodMismatches.length,
      contentTypeMismatches: contentTypeMismatches.length,
      routeMismatches: routeMismatches.length,
      frontendOnlyActions: frontendOnly.length,
      engineOnlyMappings: engineOnly.length,
      placeholderSchemas: activeMappings.filter((mapping) => mapping.schemaStatus === 'PLACEHOLDER').length,
      verifiedSchemas: activeMappings.filter((mapping) => mapping.schemaStatus === 'VERIFIED').length,
    },
    methodMismatches: methodMismatches.slice(0, 100),
    contentTypeMismatches: contentTypeMismatches.slice(0, 100),
    routeMismatches: routeMismatches.slice(0, 100),
    frontendOnly: frontendOnly.slice(0, 100),
    engineOnly: engineOnly.slice(0, 100),
    policyExcluded: policyExcluded.slice(0, 100),
    verdict: 'SHADOW_COMPARISON_COMPLETE',
  };
}

export function createPluginMappingShadowFailure(input: {
  mode: PluginMappingModeState;
  error: unknown;
}): PluginMappingShadowFailureReport {
  const record = input.error && typeof input.error === 'object'
    ? input.error as Record<string, unknown>
    : {};
  return {
    schemaVersion: '1.0',
    generatedAt: new Date().toISOString(),
    mode: input.mode,
    visibleCatalogueSource: 'static-frontend',
    executionRoutingChanged: false,
    databaseWritesPerformed: 0,
    verdict: 'SHADOW_API_UNAVAILABLE',
    error: {
      name: String(record.name || 'Error'),
      message: String(record.message || input.error || 'Plugin mapping shadow request failed.'),
      code: typeof record.code === 'string' ? record.code : undefined,
      status: typeof record.status === 'number' ? record.status : undefined,
    },
  };
}

export function persistPluginMappingShadowReport(
  report: PersistedPluginMappingShadowReport,
  storage: Storage = window.sessionStorage
): void {
  try {
    storage.setItem(LAST_REPORT_KEY, JSON.stringify(report));
    const existing = JSON.parse(storage.getItem(REPORTS_KEY) || '[]');
    const reports = Array.isArray(existing) ? existing : [];
    storage.setItem(REPORTS_KEY, JSON.stringify([report, ...reports].slice(0, MAX_REPORTS)));
  } catch {
    // Shadow diagnostics must never affect the visible catalogue.
  }
}
