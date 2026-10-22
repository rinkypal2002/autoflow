import type { AutomationCategory } from '../types/workflow';
import type { PluginEndpointMappingReadRecord } from './pluginMappingApi';
import {
  flattenFrontendPluginActions,
  isWorkflowEligiblePluginMapping,
  type FrontendPluginActionDescriptor,
  type PluginMappingDifferenceSample,
  type PluginMappingParityReport,
} from './pluginMappingParity';

export type PluginMappingFindingSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
export type PluginMappingEndpointOwnership =
  | 'ENGINE_LOCAL'
  | 'LOCAL_SEPARATE_SERVICE'
  | 'EXTERNAL_SERVICE'
  | 'DYNAMIC_OR_UNKNOWN';

export type PluginMappingFindingType =
  | 'METHOD_MISMATCH'
  | 'ROUTE_MISMATCH'
  | 'PLUGIN_OWNERSHIP_MISMATCH'
  | 'CONTENT_TYPE_MISMATCH'
  | 'ROUTE_PREFIX_DRIFT'
  | 'PATH_TEMPLATE_ENCODING_DRIFT'
  | 'FRONTEND_ONLY_ENGINE_ACTION'
  | 'EXTERNAL_ACTION_NOT_REGISTERED'
  | 'SEPARATE_SERVICE_ACTION_NOT_REGISTERED'
  | 'SEPARATE_SERVICE_PROVIDER_REGISTERED'
  | 'ENGINE_ONLY_ACTION'
  | 'LEGACY_ROUTE_IN_USE'
  | 'PLACEHOLDER_SCHEMA_PLUGIN';

export interface PluginMappingRemediationFinding {
  id: string;
  severity: PluginMappingFindingSeverity;
  findingType: PluginMappingFindingType;
  blockingCutover: boolean;
  autoFixSafe: false;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  categoryId?: string;
  categoryName?: string;
  actionType?: string;
  actionName: string;
  endpointOwnership?: PluginMappingEndpointOwnership;
  executionProviderId?: string;
  frontendEndpoint?: string;
  frontendRawEndpoint?: string;
  frontendMethod?: string;
  frontendContentType?: string;
  pluginId?: string;
  actionId?: string;
  engineCanonicalPath?: string;
  engineLegacyPath?: string | null;
  engineMethod?: string;
  engineContentTypes?: string[];
  schemaStatus?: string;
  rootCause: string;
  recommendedAction: string;
}

export interface PluginMappingPriorityRow {
  owner: string;
  critical: number;
  high: number;
  medium: number;
  low: number;
  info: number;
  blocking: number;
  total: number;
}

export interface PluginMappingRemediationReport {
  schemaVersion: '1.0';
  generatedAt: string;
  status: 'success';
  verdict: 'PLUGIN_MAPPING_REMEDIATION_REPORT_COMPLETE';
  source: 'static-frontend-vs-postgres';
  readOnly: true;
  databaseWritesPerformed: 0;
  visibleCatalogueSource: 'static-frontend';
  executionRoutingChanged: false;
  paritySummary: PluginMappingParityReport['summary'];
  summary: {
    findings: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
    info: number;
    blockingCutover: number;
    methodMismatches: number;
    routeMismatches: number;
    pluginOwnershipMismatches: number;
    contentTypeMismatches: number;
    frontendOnlyActions: number;
    engineOnlyActions: number;
    policyExcludedActions: number;
    legacyRouteBacklog: number;
    placeholderSchemaPlugins: number;
  };
  priorities: PluginMappingPriorityRow[];
  policyExclusions: PluginMappingDifferenceSample[];
  recommendedBatches: Array<{
    order: number;
    title: string;
    findingTypes: PluginMappingFindingType[];
    gate: string;
  }>;
  findings: PluginMappingRemediationFinding[];
}

interface ActionMatch {
  frontend: FrontendPluginActionDescriptor;
  rawEndpoint: string;
  mapping?: PluginEndpointMappingReadRecord;
  matchKind: 'canonical' | 'legacy' | 'deprecated' | 'method-mismatch' | 'route-mismatch' | 'unmatched';
  expectedMethod?: string;
  contentTypeMismatch: boolean;
  likelyCandidate?: PluginEndpointMappingReadRecord;
  ownership: PluginMappingEndpointOwnership;
}

const CATEGORY_PLUGIN_OWNERS: Record<string, string[]> = {
  'microsoft-teams-010': ['teams'],
  'excel-automation-011': ['excel'],
  'google-drive-012': ['googledrive'],
  'google-sheets-042': ['googlesheets'],
  'onedrive-013': ['onedrive'],
  'json-automation-014': ['json'],
  'xml-automation-015': ['xml'],
  'web-gui-016': ['browser'],
  'data-transform-017': ['transform'],
  'file-operations-040': ['file'],
  'sftp-019': ['sftp'],
  'zohodesk-020': ['zohodesk'],
  'sharepoint-021': ['sharepoint'],
  'amazon-s3-022': ['aws.s3'],
  'amazon-ec2-023': ['aws.ec2'],
  'docker-024': ['docker'],
  'rest-integration-025': ['rest'],
  'totp-generator-026': ['totp'],
  'text-processing-027': ['textfile'],
  'java-filter-flow-028': ['flow'],
  'jenkins-029': ['jenkins'],
  'linux-operations-030': ['linux'],
  'mongodb-031': ['mongodb'],
  'jumpcloud-032': ['jumpcloud'],
  'asana-033': ['asana'],
  'adobe-sign-034': ['adobe'],
  'fast2sms-035': ['fastsms'],
  'statistics-036': ['analytics'],
  'ai-bridge-037': ['ai'],
  'system-management-038': ['system'],
  'outlook-018': ['mail'],
  'database-plugins-039': ['database'],
  'vulnerability-triage-041': ['vulnerability-scanner'],
};

interface SeparateServiceProviderPolicy {
  providerId: string;
  categoryId: string;
  actionType: string;
  method: string;
  path: string;
}

const SEPARATE_SERVICE_PROVIDER_POLICIES: SeparateServiceProviderPolicy[] = [
  {
    providerId: 'VulnerabilityScanner',
    categoryId: 'vulnerability-triage-041',
    actionType: 'vuln-analyze-verdicts',
    method: 'POST',
    path: '/VulnerabilityScanner/api/triage/run',
  },
];

const SEVERITY_ORDER: Record<PluginMappingFindingSeverity, number> = {
  CRITICAL: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
  INFO: 4,
};

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

function normalizedName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function endpointCandidates(
  mapping: PluginEndpointMappingReadRecord
): Array<{ path: string; kind: 'canonical' | 'legacy' | 'deprecated' }> {
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

function classifyOwnership(rawEndpoint: string): PluginMappingEndpointOwnership {
  const value = rawEndpoint.trim();
  if (!value) return 'DYNAMIC_OR_UNKNOWN';
  if (value.includes('{{') && !/^https?:\/\//i.test(value)) return 'DYNAMIC_OR_UNKNOWN';
  try {
    const url = new URL(value, 'http://autoflow.local');
    const hostname = url.hostname.toLowerCase();
    if (hostname === 'autoflow.local') return 'ENGINE_LOCAL';
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return url.pathname.startsWith('/engine/') || url.pathname === '/engine'
        ? 'ENGINE_LOCAL'
        : 'LOCAL_SEPARATE_SERVICE';
    }
    return 'EXTERNAL_SERVICE';
  } catch {
    return value.startsWith('/engine/') ? 'ENGINE_LOCAL' : 'DYNAMIC_OR_UNKNOWN';
  }
}

function registeredSeparateServiceProvider(
  match: ActionMatch
): SeparateServiceProviderPolicy | undefined {
  if (match.ownership !== 'LOCAL_SEPARATE_SERVICE') return undefined;
  const method = normalizeMethod(match.frontend.method);
  const endpointPath = normalizePath(match.rawEndpoint);
  return SEPARATE_SERVICE_PROVIDER_POLICIES.find((policy) =>
    policy.categoryId === match.frontend.categoryId &&
    policy.actionType === match.frontend.actionType &&
    policy.method === method &&
    normalizePath(policy.path) === endpointPath
  );
}

function pathTokens(path: string): Set<string> {
  return new Set(
    normalizePath(path)
      .toLowerCase()
      .replace(/%7b/gi, '{')
      .replace(/%7d/gi, '}')
      .split(/[^a-z0-9]+/)
      .filter((value) => value.length > 1 && !['api', 'v1', 'engine'].includes(value))
  );
}

function tokenSimilarity(left: string, right: string): number {
  const a = pathTokens(left);
  const b = pathTokens(right);
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const token of a) if (b.has(token)) intersection += 1;
  return intersection / Math.max(a.size, b.size);
}

function findLikelyCandidate(
  frontend: FrontendPluginActionDescriptor,
  mappings: PluginEndpointMappingReadRecord[]
): PluginEndpointMappingReadRecord | undefined {
  const expectedOwners = CATEGORY_PLUGIN_OWNERS[frontend.categoryId] ?? [];
  const decoded = decodeURIComponent(frontend.endpoint)
    .replace(/\{\{([^{}]+)\}\}/g, '{$1}')
    .replace(/^\/sftp-plugin(?=\/)/, '');

  const transformedMatches = mappings.filter((mapping) =>
    endpointCandidates(mapping).some((candidate) => candidate.path === normalizePath(decoded))
  );
  const transformedMethodMatches = transformedMatches.filter(
    (mapping) => normalizeMethod(mapping.httpMethod) === frontend.method
  );
  const exactTransformed = transformedMethodMatches
    .map((mapping) => ({ mapping, rank: contentCompatibilityRank(frontend, mapping) }))
    .sort((left, right) => right.rank - left.rank)[0]?.mapping
    ?? transformedMatches[0];
  if (exactTransformed) return exactTransformed;

  const sameOwner = mappings.filter((mapping) => expectedOwners.includes(mapping.pluginId));
  const exactName = sameOwner.filter(
    (mapping) => normalizedName(mapping.actionName) === normalizedName(frontend.actionName)
  );
  if (exactName.length === 1) return exactName[0];

  const ranked = sameOwner
    .map((mapping) => ({ mapping, score: tokenSimilarity(frontend.endpoint, mapping.canonicalPath) }))
    .filter((item) => item.score >= 0.6)
    .sort((a, b) => b.score - a.score);
  if (ranked.length > 0 && (ranked.length === 1 || ranked[0].score > ranked[1].score)) {
    return ranked[0].mapping;
  }
  return undefined;
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

function rawEndpointMap(categories: AutomationCategory[]): Map<string, string> {
  const values = new Map<string, string>();
  for (const category of categories) {
    for (const action of category.actions ?? []) {
      if (!action.api?.url) continue;
      values.set(`${category.id}::${action.type}`, String(action.api.url));
    }
  }
  return values;
}

function analyzeMatches(
  categories: AutomationCategory[],
  mappings: PluginEndpointMappingReadRecord[]
): { matches: ActionMatch[]; engineOnly: PluginEndpointMappingReadRecord[] } {
  const flattened = flattenFrontendPluginActions(categories);
  const rawEndpoints = rawEndpointMap(categories);
  const activeMappings = mappings.filter((mapping) => mapping.enabled && !mapping.deprecated);
  const usedMappings = new Set<string>();
  const key = (mapping: PluginEndpointMappingReadRecord): string =>
    `${mapping.engineVersion}::${mapping.pluginId}::${mapping.actionId}`;
  const matches: ActionMatch[] = [];

  for (const frontend of flattened.descriptors) {
    const rawEndpoint = rawEndpoints.get(`${frontend.categoryId}::${frontend.actionType}`) ?? frontend.endpoint;
    const pathMatches = activeMappings.flatMap((mapping) =>
      endpointCandidates(mapping)
        .filter((candidate) => candidate.path === frontend.endpoint)
        .map((candidate) => ({ mapping, kind: candidate.kind }))
    );
    const methodMatches = pathMatches.filter(
      ({ mapping }) => normalizeMethod(mapping.httpMethod) === frontend.method
    );
    const exact = methodMatches
      .map((candidate) => ({ candidate, rank: contentCompatibilityRank(frontend, candidate.mapping) }))
      .sort((left, right) => right.rank - left.rank)[0]?.candidate;
    if (exact) {
      usedMappings.add(key(exact.mapping));
      matches.push({
        frontend,
        rawEndpoint,
        mapping: exact.mapping,
        matchKind: exact.kind,
        contentTypeMismatch: !contentCompatible(frontend, exact.mapping),
        ownership: classifyOwnership(rawEndpoint),
      });
      continue;
    }
    if (pathMatches.length > 0) {
      const mapping = pathMatches[0].mapping;
      usedMappings.add(key(mapping));
      matches.push({
        frontend,
        rawEndpoint,
        mapping,
        matchKind: 'method-mismatch',
        expectedMethod: normalizeMethod(mapping.httpMethod),
        contentTypeMismatch: false,
        ownership: classifyOwnership(rawEndpoint),
      });
      continue;
    }

    const likelyCandidate = findLikelyCandidate(frontend, activeMappings);
    const transformedPath = decodeURIComponent(frontend.endpoint)
      .replace(/\{\{([^{}]+)\}\}/g, '{$1}')
      .replace(/^\/sftp-plugin(?=\/)/, '');
    const transformedExact = likelyCandidate
      ? endpointCandidates(likelyCandidate).some(
          (candidate) => candidate.path === normalizePath(transformedPath)
        )
      : false;
    if (transformedExact) {
      if (likelyCandidate) usedMappings.add(key(likelyCandidate));
      matches.push({
        frontend,
        rawEndpoint,
        matchKind: 'unmatched',
        contentTypeMismatch: false,
        likelyCandidate,
        ownership: classifyOwnership(rawEndpoint),
      });
      continue;
    }

    const expectedOwners = CATEGORY_PLUGIN_OWNERS[frontend.categoryId] ?? [];
    const routeCandidate = activeMappings.filter((mapping) => {
      if (normalizedName(mapping.actionName) !== normalizedName(frontend.actionName)) return false;
      return expectedOwners.length === 0 || expectedOwners.includes(mapping.pluginId);
    });
    if (routeCandidate.length === 1) {
      usedMappings.add(key(routeCandidate[0]));
      matches.push({
        frontend,
        rawEndpoint,
        mapping: routeCandidate[0],
        matchKind: 'route-mismatch',
        expectedMethod: normalizeMethod(routeCandidate[0].httpMethod),
        contentTypeMismatch: false,
        ownership: classifyOwnership(rawEndpoint),
      });
      continue;
    }

    if (likelyCandidate) usedMappings.add(key(likelyCandidate));
    matches.push({
      frontend,
      rawEndpoint,
      matchKind: 'unmatched',
      contentTypeMismatch: false,
      likelyCandidate,
      ownership: classifyOwnership(rawEndpoint),
    });
  }

  return {
    matches,
    engineOnly: activeMappings.filter((mapping) => !usedMappings.has(key(mapping))),
  };
}

function findingId(type: PluginMappingFindingType, parts: Array<string | undefined>): string {
  return `${type}:${parts.filter(Boolean).join(':')}`.toLowerCase().replace(/[^a-z0-9:._-]+/g, '-');
}

function baseFinding(
  match: ActionMatch,
  findingType: PluginMappingFindingType,
  severity: PluginMappingFindingSeverity,
  rootCause: string,
  recommendedAction: string,
  confidence: 'HIGH' | 'MEDIUM' | 'LOW' = 'HIGH'
): PluginMappingRemediationFinding {
  return {
    id: findingId(findingType, [match.frontend.categoryId, match.frontend.actionType]),
    severity,
    findingType,
    blockingCutover: severity === 'CRITICAL' || severity === 'HIGH' || severity === 'MEDIUM',
    autoFixSafe: false,
    confidence,
    categoryId: match.frontend.categoryId,
    categoryName: match.frontend.categoryName,
    actionType: match.frontend.actionType,
    actionName: match.frontend.actionName,
    endpointOwnership: match.ownership,
    frontendEndpoint: match.frontend.endpoint,
    frontendRawEndpoint: match.rawEndpoint,
    frontendMethod: match.frontend.method,
    frontendContentType: match.frontend.contentType,
    pluginId: match.mapping?.pluginId ?? match.likelyCandidate?.pluginId,
    actionId: match.mapping?.actionId ?? match.likelyCandidate?.actionId,
    engineCanonicalPath: match.mapping?.canonicalPath ?? match.likelyCandidate?.canonicalPath,
    engineLegacyPath: match.mapping?.legacyPath ?? match.likelyCandidate?.legacyPath,
    engineMethod: match.mapping?.httpMethod ?? match.likelyCandidate?.httpMethod,
    engineContentTypes: match.mapping?.requestContentTypes ?? match.likelyCandidate?.requestContentTypes,
    schemaStatus: match.mapping?.schemaStatus ?? match.likelyCandidate?.schemaStatus,
    rootCause,
    recommendedAction,
  };
}

function expectedPluginOwners(categoryId: string): string[] {
  return CATEGORY_PLUGIN_OWNERS[categoryId] ?? [];
}

function addMatchFindings(
  match: ActionMatch,
  findings: PluginMappingRemediationFinding[]
): void {
  if (match.matchKind === 'method-mismatch') {
    findings.push(baseFinding(
      match,
      'METHOD_MISMATCH',
      'CRITICAL',
      `Frontend uses ${match.frontend.method}, while the matched engine route requires ${match.expectedMethod}.`,
      'Confirm the real request payload, update the frontend HTTP method, and run a connector-level regression test before cutover.'
    ));
    return;
  }

  if (match.matchKind === 'route-mismatch') {
    findings.push(baseFinding(
      match,
      'ROUTE_MISMATCH',
      'CRITICAL',
      'Action name and plugin ownership identify one engine action, but the frontend route does not match any registered route.',
      'Replace the frontend route with the verified engine route only after checking path parameters and saved-workflow compatibility.'
    ));
    return;
  }

  if (match.matchKind === 'unmatched') {
    const normalized = normalizePath(match.frontend.endpoint);
    const decoded = decodeURIComponent(normalized).replace(/\{\{([^{}]+)\}\}/g, '{$1}');
    if (match.likelyCandidate) {
      const candidatePaths = endpointCandidates(match.likelyCandidate).map((candidate) => candidate.path);
      const stripped = decoded.replace(/^\/sftp-plugin(?=\/)/, '');
      const type: PluginMappingFindingType = candidatePaths.includes(normalizePath(stripped))
        ? 'ROUTE_PREFIX_DRIFT'
        : decoded !== normalized
          ? 'PATH_TEMPLATE_ENCODING_DRIFT'
          : 'ROUTE_MISMATCH';
      findings.push(baseFinding(
        match,
        type,
        type === 'ROUTE_MISMATCH' ? 'CRITICAL' : 'HIGH',
        'A likely engine action exists, but an extra module prefix, encoded path template, or stale route prevents exact matching.',
        'Normalize the route against the registered legacy/canonical path and preserve path-variable substitution in an execution regression test.',
        'MEDIUM'
      ));
      return;
    }

    const rawLower = match.rawEndpoint.toLowerCase();
    const expectedOwners = expectedPluginOwners(match.frontend.categoryId);
    const foreignOwner = Object.entries(CATEGORY_PLUGIN_OWNERS).find(([, owners]) =>
      owners.some((owner) => rawLower.includes(`/${owner.replace('.', '/')}/`) || rawLower.includes(`/${owner}/`))
    );
    if (foreignOwner && !foreignOwner[1].some((owner) => expectedOwners.includes(owner))) {
      findings.push(baseFinding(
        match,
        'PLUGIN_OWNERSHIP_MISMATCH',
        'CRITICAL',
        'The frontend action points to a route owned by another plugin family.',
        'Correct the cross-plugin endpoint before any catalogue or routing cutover, then test both affected plugin families.'
      ));
      return;
    }

    if (match.ownership === 'ENGINE_LOCAL') {
      findings.push(baseFinding(
        match,
        'FRONTEND_ONLY_ENGINE_ACTION',
        'HIGH',
        'The frontend exposes an engine-local action that is absent from the registered engine mapping set.',
        'Either register and implement the engine action or remove/disable the frontend action; do not silently route it through another plugin.'
      ));
      return;
    }
    if (match.ownership === 'EXTERNAL_SERVICE') {
      findings.push(baseFinding(
        match,
        'EXTERNAL_ACTION_NOT_REGISTERED',
        'MEDIUM',
        'This action calls a third-party endpoint directly and is intentionally outside the Products Engine registry.',
        'Define an explicit external-action ownership policy so a PostgreSQL catalogue cutover does not hide or misroute this action.'
      ));
      return;
    }
    const registeredProvider = registeredSeparateServiceProvider(match);
    if (registeredProvider) {
      const finding = baseFinding(
        match,
        'SEPARATE_SERVICE_PROVIDER_REGISTERED',
        'INFO',
        `This action is explicitly owned by the registered ${registeredProvider.providerId} separate-service execution provider.`,
        'Retain the action in the static frontend catalogue and certify the provider endpoint independently of the Products Engine registry.'
      );
      finding.executionProviderId = registeredProvider.providerId;
      findings.push(finding);
      return;
    }

    findings.push(baseFinding(
      match,
      'SEPARATE_SERVICE_ACTION_NOT_REGISTERED',
      'MEDIUM',
      'This action targets a separate local service rather than the Products Engine action registry.',
      'Register the service as a separate execution provider or explicitly retain it in the static catalogue during cutover.'
    ));
    return;
  }

  if (match.mapping) {
    const owners = expectedPluginOwners(match.frontend.categoryId);
    if (owners.length > 0 && !owners.includes(match.mapping.pluginId)) {
      findings.push(baseFinding(
        match,
        'PLUGIN_OWNERSHIP_MISMATCH',
        'CRITICAL',
        `Frontend category ownership expects ${owners.join(' or ')}, but route matching selected ${match.mapping.pluginId}.`,
        'Correct the contaminated frontend route and add a category-to-plugin ownership assertion to prevent future duplicate-route collisions.'
      ));
    }

    if (match.contentTypeMismatch) {
      findings.push(baseFinding(
        match,
        'CONTENT_TYPE_MISMATCH',
        'HIGH',
        `Frontend sends ${match.frontend.contentType}, while the registry declares ${(match.mapping.requestContentTypes ?? []).join(', ') || 'no request type'}.`,
        'Verify the real controller signature, then align bodyType/headers and payload construction. Placeholder schemas prevent automatic repair.',
        match.mapping.schemaStatus === 'VERIFIED' ? 'HIGH' : 'MEDIUM'
      ));
    }

    if (match.matchKind === 'legacy') {
      findings.push(baseFinding(
        match,
        'LEGACY_ROUTE_IN_USE',
        'LOW',
        'The action still executes through a legacy route instead of the canonical registry route.',
        'Migrate to the canonical route in a later compatibility batch after critical contract drift is closed.'
      ));
    }
  }
}

function aggregatePriorities(findings: PluginMappingRemediationFinding[]): PluginMappingPriorityRow[] {
  const rows = new Map<string, PluginMappingPriorityRow>();
  for (const finding of findings) {
    const owner = finding.categoryName || finding.pluginId || 'Unassigned';
    const row = rows.get(owner) ?? {
      owner,
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      info: 0,
      blocking: 0,
      total: 0,
    };
    row[finding.severity.toLowerCase() as 'critical' | 'high' | 'medium' | 'low' | 'info'] += 1;
    if (finding.blockingCutover) row.blocking += 1;
    row.total += 1;
    rows.set(owner, row);
  }
  return [...rows.values()].sort((a, b) =>
    b.critical - a.critical ||
    b.high - a.high ||
    b.medium - a.medium ||
    b.blocking - a.blocking ||
    a.owner.localeCompare(b.owner)
  );
}

export function buildPluginMappingRemediationReport(input: {
  categories: AutomationCategory[];
  mappings: PluginEndpointMappingReadRecord[];
  parityReport: PluginMappingParityReport;
}): PluginMappingRemediationReport {
  const activeMappings = input.mappings.filter((mapping) => mapping.enabled && !mapping.deprecated);
  const workflowEligibleMappings = activeMappings.filter(isWorkflowEligiblePluginMapping);
  const analysis = analyzeMatches(input.categories, workflowEligibleMappings);
  const findings: PluginMappingRemediationFinding[] = [];

  for (const match of analysis.matches) addMatchFindings(match, findings);

  for (const mapping of analysis.engineOnly) {
    findings.push({
      id: findingId('ENGINE_ONLY_ACTION', [mapping.pluginId, mapping.actionId]),
      severity: 'MEDIUM',
      findingType: 'ENGINE_ONLY_ACTION',
      blockingCutover: true,
      autoFixSafe: false,
      confidence: 'HIGH',
      actionName: mapping.actionName,
      pluginId: mapping.pluginId,
      actionId: mapping.actionId,
      engineCanonicalPath: mapping.canonicalPath,
      engineLegacyPath: mapping.legacyPath,
      engineMethod: mapping.httpMethod,
      engineContentTypes: mapping.requestContentTypes,
      schemaStatus: mapping.schemaStatus,
      rootCause: 'The engine registry contains an active action that is not represented by the current frontend catalogue mapping.',
      recommendedAction: 'Choose an explicit visibility policy: add it to the catalogue, keep it hidden, or mark it internal before database catalogue cutover.',
    });
  }

  const placeholderByPlugin = new Map<string, number>();
  for (const mapping of activeMappings) {
    if (mapping.schemaStatus !== 'PLACEHOLDER') continue;
    placeholderByPlugin.set(mapping.pluginId, (placeholderByPlugin.get(mapping.pluginId) ?? 0) + 1);
  }
  for (const [pluginId, count] of placeholderByPlugin.entries()) {
    findings.push({
      id: findingId('PLACEHOLDER_SCHEMA_PLUGIN', [pluginId]),
      severity: 'MEDIUM',
      findingType: 'PLACEHOLDER_SCHEMA_PLUGIN',
      blockingCutover: true,
      autoFixSafe: false,
      confidence: 'HIGH',
      actionName: `${pluginId} schema coverage`,
      pluginId,
      schemaStatus: 'PLACEHOLDER',
      rootCause: `${count} active action(s) for this plugin still use placeholder input/output schemas.`,
      recommendedAction: 'Verify controller request DTOs and business outputs action-by-action before treating the registry as a complete execution contract.',
    });
  }

  findings.sort((a, b) =>
    SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
    a.findingType.localeCompare(b.findingType) ||
    (a.categoryName || a.pluginId || '').localeCompare(b.categoryName || b.pluginId || '') ||
    a.actionName.localeCompare(b.actionName)
  );

  const count = (severity: PluginMappingFindingSeverity): number =>
    findings.filter((finding) => finding.severity === severity).length;
  const typeCount = (type: PluginMappingFindingType): number =>
    findings.filter((finding) => finding.findingType === type).length;

  return {
    schemaVersion: '1.0',
    generatedAt: new Date().toISOString(),
    status: 'success',
    verdict: 'PLUGIN_MAPPING_REMEDIATION_REPORT_COMPLETE',
    source: 'static-frontend-vs-postgres',
    readOnly: true,
    databaseWritesPerformed: 0,
    visibleCatalogueSource: 'static-frontend',
    executionRoutingChanged: false,
    paritySummary: input.parityReport.summary,
    summary: {
      findings: findings.length,
      critical: count('CRITICAL'),
      high: count('HIGH'),
      medium: count('MEDIUM'),
      low: count('LOW'),
      info: count('INFO'),
      blockingCutover: findings.filter((finding) => finding.blockingCutover).length,
      methodMismatches: typeCount('METHOD_MISMATCH'),
      routeMismatches:
        typeCount('ROUTE_MISMATCH') +
        typeCount('ROUTE_PREFIX_DRIFT') +
        typeCount('PATH_TEMPLATE_ENCODING_DRIFT'),
      pluginOwnershipMismatches: typeCount('PLUGIN_OWNERSHIP_MISMATCH'),
      contentTypeMismatches: typeCount('CONTENT_TYPE_MISMATCH'),
      frontendOnlyActions:
        typeCount('FRONTEND_ONLY_ENGINE_ACTION') +
        typeCount('EXTERNAL_ACTION_NOT_REGISTERED') +
        typeCount('SEPARATE_SERVICE_ACTION_NOT_REGISTERED'),
      engineOnlyActions: typeCount('ENGINE_ONLY_ACTION'),
      policyExcludedActions: input.parityReport.summary.postgresPolicyExcludedMappings,
      legacyRouteBacklog: typeCount('LEGACY_ROUTE_IN_USE'),
      placeholderSchemaPlugins: typeCount('PLACEHOLDER_SCHEMA_PLUGIN'),
    },
    priorities: aggregatePriorities(findings),
    policyExclusions: input.parityReport.policyExcluded,
    recommendedBatches: [
      {
        order: 1,
        title: 'Critical route, method, and plugin ownership defects',
        findingTypes: ['METHOD_MISMATCH', 'ROUTE_MISMATCH', 'PLUGIN_OWNERSHIP_MISMATCH'],
        gate: 'Zero critical findings and connector-level regression tests pass.',
      },
      {
        order: 2,
        title: 'Route prefix, path-template, and missing engine ownership',
        findingTypes: [
          'ROUTE_PREFIX_DRIFT',
          'PATH_TEMPLATE_ENCODING_DRIFT',
          'FRONTEND_ONLY_ENGINE_ACTION',
          'EXTERNAL_ACTION_NOT_REGISTERED',
          'SEPARATE_SERVICE_ACTION_NOT_REGISTERED',
        ],
        gate: 'Every frontend action has an explicit execution provider and visibility policy.',
      },
      {
        order: 3,
        title: 'Request content-type and verified schema contracts',
        findingTypes: ['CONTENT_TYPE_MISMATCH', 'PLACEHOLDER_SCHEMA_PLUGIN'],
        gate: 'Request DTO, multipart, and output contracts are verified plugin family by plugin family.',
      },
      {
        order: 4,
        title: 'Engine-only catalogue visibility decisions',
        findingTypes: ['ENGINE_ONLY_ACTION'],
        gate: 'Each engine-only action is classified as visible, hidden, internal, or deprecated.',
      },
      {
        order: 5,
        title: 'Canonical route migration',
        findingTypes: ['LEGACY_ROUTE_IN_USE'],
        gate: 'Legacy compatibility remains available until saved-workflow migration is certified.',
      },
    ],
    findings,
  };
}

function csvCell(value: unknown): string {
  const text = Array.isArray(value) ? value.join('|') : String(value ?? '');
  return `"${text.replace(/"/g, '""')}"`;
}

export function pluginMappingRemediationToCsv(report: PluginMappingRemediationReport): string {
  const columns: Array<keyof PluginMappingRemediationFinding> = [
    'severity',
    'findingType',
    'blockingCutover',
    'confidence',
    'categoryName',
    'actionName',
    'actionType',
    'endpointOwnership',
    'executionProviderId',
    'frontendEndpoint',
    'frontendMethod',
    'frontendContentType',
    'pluginId',
    'actionId',
    'engineCanonicalPath',
    'engineMethod',
    'engineContentTypes',
    'schemaStatus',
    'rootCause',
    'recommendedAction',
  ];
  return [
    columns.map(csvCell).join(','),
    ...report.findings.map((finding) => columns.map((column) => csvCell(finding[column])).join(',')),
  ].join('\r\n');
}

export function pluginMappingRemediationToMarkdown(report: PluginMappingRemediationReport): string {
  const lines = [
    '# Phase 4C.2A Plugin Mapping Remediation Report',
    '',
    `Generated: ${report.generatedAt}`,
    '',
    '## Safety',
    '',
    `- Read-only: ${report.readOnly}`,
    `- Database writes: ${report.databaseWritesPerformed}`,
    `- Visible catalogue source: ${report.visibleCatalogueSource}`,
    `- Execution routing changed: ${report.executionRoutingChanged}`,
    '',
    '## Summary',
    '',
    '| Metric | Count |',
    '|---|---:|',
    `| Visible frontend actions | ${report.paritySummary.frontendActions} |`,
    `| Executable frontend actions | ${report.paritySummary.frontendExecutableActions} |`,
    `| Unavailable frontend actions | ${report.paritySummary.frontendUnavailableActions} |`,
    `| PostgreSQL mappings | ${report.paritySummary.postgresMappings} |`,
    `| Workflow-eligible PostgreSQL mappings | ${report.paritySummary.postgresWorkflowEligibleMappings} |`,
    `| Policy-excluded PostgreSQL mappings | ${report.paritySummary.postgresPolicyExcludedMappings} |`,
    `| Findings | ${report.summary.findings} |`,
    `| Critical | ${report.summary.critical} |`,
    `| High | ${report.summary.high} |`,
    `| Medium | ${report.summary.medium} |`,
    `| Low | ${report.summary.low} |`,
    `| Blocking cutover | ${report.summary.blockingCutover} |`,
    `| Legacy route backlog | ${report.summary.legacyRouteBacklog} |`,
    '',
    '## Explicit policy exclusions',
    '',
    '| Plugin | Action | Role | Exposure | Replacement |',
    '|---|---|---|---|---|',
    ...report.policyExclusions.map((item) =>
      `| ${item.pluginId || ''} | ${item.actionId || item.actionName} | ${item.actionRole || ''} | ${item.actionExposure || ''} | ${item.replacementActionKey || ''} |`
    ),
    '',
    '## Priority owners',
    '',
    '| Owner | Critical | High | Medium | Low | Blocking | Total |',
    '|---|---:|---:|---:|---:|---:|---:|',
    ...report.priorities.slice(0, 30).map((row) =>
      `| ${row.owner} | ${row.critical} | ${row.high} | ${row.medium} | ${row.low} | ${row.blocking} | ${row.total} |`
    ),
    '',
    '## Recommended batches',
    '',
    ...report.recommendedBatches.flatMap((batch) => [
      `### ${batch.order}. ${batch.title}`,
      '',
      `Finding types: ${batch.findingTypes.join(', ')}`,
      '',
      `Gate: ${batch.gate}`,
      '',
    ]),
    '## Critical findings',
    '',
    ...report.findings
      .filter((finding) => finding.severity === 'CRITICAL')
      .flatMap((finding) => [
        `### ${finding.categoryName || finding.pluginId || 'Unassigned'} â€” ${finding.actionName}`,
        '',
        `- Type: ${finding.findingType}`,
        `- Frontend: ${finding.frontendMethod || ''} ${finding.frontendEndpoint || ''}`,
        `- Engine: ${finding.engineMethod || ''} ${finding.engineCanonicalPath || ''}`,
        `- Cause: ${finding.rootCause}`,
        `- Action: ${finding.recommendedAction}`,
        '',
      ]),
  ];
  return `${lines.join('\n')}\n`;
}
