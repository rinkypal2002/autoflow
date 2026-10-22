import {
  clearPluginMappingCache,
  loadPluginMappings,
  type PluginMappingApiResponse,
  type PluginEndpointMappingReadRecord,
} from '../src/lib/pluginMappingApi';
import {
  comparePluginMappings,
  createPluginMappingShadowFailure,
  flattenFrontendPluginActions,
  persistPluginMappingShadowReport,
} from '../src/lib/pluginMappingParity';
import { resolvePluginMappingMode } from '../src/lib/pluginMappingMode';
import type { AutomationCategory } from '../src/types/workflow';

let passed = 0;
let failed = 0;
function check(condition: unknown, message: string): void {
  if (condition) passed += 1;
  else {
    failed += 1;
    console.error(`FAIL: ${message}`);
  }
}

const categories: AutomationCategory[] = [
  {
    id: 'workflow-control-001',
    name: 'Workflow Control',
    icon: 'Workflow',
    color: 'bg-slate-500',
    description: 'Control',
    actions: [
      {
        id: 'start', type: 'workflow-start', category: 'workflow-control-001', name: 'Start',
        description: 'Start', icon: 'Play', isControlNode: true,
      } as any,
    ],
  },
  {
    id: 'unavailable-connector-999',
    name: 'Unavailable Connector',
    icon: 'Lock',
    color: 'bg-amber-500',
    description: 'Quarantined connector',
    control: {
      enabled: false,
      availability: {
        state: 'unavailable',
        code: 'BACKEND_CONNECTOR_NOT_INSTALLED',
        reason: 'Backend connector not installed',
      },
    },
    actions: [
      {
        id: 'blocked-a', type: 'blocked-a', category: 'unavailable-connector-999', name: 'Blocked A',
        description: 'Blocked', icon: 'Lock',
        api: { url: '/engine/unavailable/blocked-a', method: 'POST' },
      } as any,
      {
        id: 'blocked-b', type: 'blocked-b', category: 'unavailable-connector-999', name: 'Blocked B',
        description: 'Blocked', icon: 'Lock',
        api: { url: 'https://example.invalid/blocked-b', method: 'GET' },
      } as any,
    ],
  },
  {
    id: 'excel-automation-011',
    name: 'Excel',
    icon: 'Table',
    color: 'bg-green-500',
    description: 'Excel',
    actions: [
      {
        id: 'read', type: 'read-sheet', category: 'excel-automation-011', name: 'Read Sheet',
        description: 'Read', icon: 'Search',
        api: { url: 'http://localhost:8080/engine/excel/read-sheet', method: 'POST', bodyType: 'form-data' },
      } as any,
      {
        id: 'write', type: 'write-sheet', category: 'excel-automation-011', name: 'Write Sheet',
        description: 'Write', icon: 'Save',
        api: { url: '/engine/api/v1/excel/write-sheet', method: 'GET', headers: { 'Content-Type': 'application/json' } },
      } as any,
      {
        id: 'missing', type: 'missing-action', category: 'excel-automation-011', name: 'Missing Action',
        description: 'Missing', icon: 'X',
        api: { url: '/engine/api/v1/excel/missing-action', method: 'POST' },
      } as any,
      {
        id: 'route', type: 'route-mismatch', category: 'excel-automation-011', name: 'Rename Sheet',
        description: 'Route mismatch', icon: 'Pen',
        api: { url: '/engine/api/excel/rename-old', method: 'POST' },
      } as any,
    ],
  },
];

function mapping(overrides: Partial<PluginEndpointMappingReadRecord>): PluginEndpointMappingReadRecord {
  return {
    engineVersion: 'v11.3',
    engineContextPath: '/engine',
    pluginId: 'excel',
    pluginName: 'Excel',
    category: 'Data and files',
    actionId: 'excel.readSheet',
    actionName: 'Read Sheet',
    httpMethod: 'POST',
    canonicalPath: '/api/v1/excel/read-sheet',
    legacyPath: '/excel/read-sheet',
    requestContentTypes: ['multipart/form-data'],
    responseContentTypes: ['application/json'],
    bodyType: 'multipart',
    schemaStatus: 'PLACEHOLDER',
    responseContractVersion: 'LEGACY',
    enabled: true,
    deprecated: false,
    metadata: { legacyEndpoints: ['/excel/read-sheet'] },
    ...overrides,
  };
}

const mappings: PluginEndpointMappingReadRecord[] = [
  mapping({}),
  mapping({
    actionId: 'excel.writeSheet',
    actionName: 'Write Sheet',
    canonicalPath: '/api/v1/excel/write-sheet',
    legacyPath: '/excel/write-sheet',
    requestContentTypes: ['application/json'],
    bodyType: 'json',
    httpMethod: 'POST',
  }),
  mapping({
    actionId: 'excel.renameSheet',
    actionName: 'Rename Sheet',
    canonicalPath: '/api/v1/excel/rename-sheet',
    legacyPath: '/excel/rename-sheet',
    requestContentTypes: ['application/json'],
    bodyType: 'json',
  }),
  mapping({
    actionId: 'excel.engineOnly',
    actionName: 'Engine Only',
    canonicalPath: '/api/v1/excel/engine-only',
  }),
];

function apiResponse(): PluginMappingApiResponse {
  return {
    status: 'success',
    source: 'postgres',
    table: 'autoflow.plugin_endpoint_mapping',
    readOnly: true,
    writeEndpointAvailable: false,
    engineVersion: 'v11.3',
    query: { pluginId: '', search: '', includeDeprecated: false, limit: 500, offset: 0 },
    coverage: {
      totalMappings: mappings.length,
      activeMappings: mappings.length,
      verifiedSchemas: 0,
      placeholderSchemas: mappings.length,
      returnedMappings: mappings.length,
      hasMore: false,
    },
    mappings,
  };
}

class MemoryStorage {
  private values = new Map<string, string>();
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
  removeItem(key: string): void { this.values.delete(key); }
  clear(): void { this.values.clear(); }
  key(index: number): string | null { return [...this.values.keys()][index] ?? null; }
  get length(): number { return this.values.size; }
}

async function main(): Promise<void> {
  const legacy = resolvePluginMappingMode('legacy');
  const shadow = resolvePluginMappingMode('shadow');
  const postgres = resolvePluginMappingMode('postgres');
  check(legacy.effective === 'legacy', 'legacy remains legacy');
  check(shadow.effective === 'shadow', 'shadow remains shadow');
  check(postgres.effective === 'shadow', 'postgres cutover is blocked');
  check(postgres.cutoverBlocked === true, 'blocked cutover is reported');

  let legacyCalls = 0;
  const skipped = await loadPluginMappings({
    mode: 'legacy',
    fetchImpl: (async () => {
      legacyCalls += 1;
      return new Response();
    }) as typeof fetch,
  });
  check(skipped.status === 'skipped', 'legacy mode skips API');
  check(legacyCalls === 0, 'legacy mode makes zero network calls');

  clearPluginMappingCache();
  let calls = 0;
  const fetchImpl = (async () => {
    calls += 1;
    await new Promise((resolve) => setTimeout(resolve, 5));
    return new Response(JSON.stringify(apiResponse()), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;
  const [loadedA, loadedB] = await Promise.all([
    loadPluginMappings({ mode: 'shadow', fetchImpl }),
    loadPluginMappings({ mode: 'shadow', fetchImpl }),
  ]);
  check(calls === 1, 'in-flight requests are deduplicated');
  check(loadedA.status === 'loaded', 'first shadow load succeeds');
  check(loadedB.status === 'loaded', 'second shadow load succeeds');
  check(loadedB.status === 'loaded' && loadedB.cacheHit === true, 'shared cache is reported');
  check(loadedA.status === 'loaded' && loadedA.response.mappings.length === 4, 'mapping rows are returned');
  check(loadedA.status === 'loaded' && loadedA.response.writeEndpointAvailable === false, 'write endpoint remains unavailable');

  const flat = flattenFrontendPluginActions(categories);
  check(flat.totalActions === 7, 'all visible frontend actions counted');
  check(flat.controlActions === 1, 'control action counted separately');
  check(flat.unavailableActions === 2, 'unavailable actions counted separately');
  check(flat.descriptors.length === 4, 'executable actions flattened');
  check(flat.descriptors[0].endpoint === '/excel/read-sheet', 'engine context stripped from absolute URL');
  check(flat.descriptors[0].contentType === 'multipart/form-data', 'form-data normalized');

  const report = comparePluginMappings({ mode: shadow, categories, mappings });
  check(report.summary.frontendActions === 7, 'frontend visible total recorded');
  check(report.summary.frontendExecutableActions === 4, 'executable count excludes unavailable package');
  check(report.summary.frontendUnavailableActions === 2, 'unavailable count recorded');
  check(report.summary.postgresMappings === 4, 'PostgreSQL count recorded');
  check(report.summary.postgresWorkflowEligibleMappings === 4, 'default mappings remain workflow eligible');
  check(report.summary.postgresPolicyExcludedMappings === 0, 'no policy exclusions are invented');
  check(report.policyExcluded.length === 0, 'policy exclusion details are empty by default');
  check(report.summary.exactRouteMethodMatches === 1, 'exact route/method match recorded');
  check(report.summary.legacyRouteMatches === 1, 'legacy endpoint match recorded');
  check(report.summary.methodMismatches === 1, 'method mismatch recorded');
  check(report.summary.routeMismatches === 1, 'route mismatch candidate recorded');
  check(report.summary.frontendOnlyActions === 1, 'frontend-only action recorded');
  check(report.summary.engineOnlyMappings === 1, 'engine-only mapping recorded');
  check(report.summary.placeholderSchemas === 4, 'placeholder schemas recorded');
  check(report.visibleCatalogueSource === 'static-frontend', 'visible catalogue remains static');
  check(report.executionRoutingChanged === false, 'execution routing remains unchanged');
  check(report.databaseWritesPerformed === 0, 'shadow comparison performs no writes');

  const policyMappings: PluginEndpointMappingReadRecord[] = [
    ...mappings,
    mapping({
      pluginId: 'transform',
      pluginName: 'Transform',
      actionId: 'transform.filter',
      actionName: 'Filter',
      canonicalPath: '/api/v1/transform/filter',
      legacyPath: '/api/data-transform/filter',
      metadata: {
        legacyEndpoints: ['/api/data-transform/filter'],
        actionRole: 'ALIAS',
        workflowEligible: false,
        replacementActionKey: 'transform.filterRows',
      },
    }),
    mapping({
      pluginId: 'transform',
      pluginName: 'Transform',
      actionId: 'transform.catalogue',
      actionName: 'Catalogue',
      canonicalPath: '/api/v1/transform/catalogue',
      legacyPath: '/api/data-transform/operations',
      httpMethod: 'GET',
      metadata: {
        legacyEndpoints: ['/api/data-transform/operations'],
        actionRole: 'CONTROL',
        workflowEligible: false,
      },
    }),
    mapping({
      pluginId: 'linux',
      pluginName: 'Linux',
      actionId: 'linux.fileManager',
      actionName: 'File Manager',
      canonicalPath: '/api/v1/linux/file-manager',
      legacyPath: '/api/terminal/FileManager',
      metadata: {
        legacyEndpoints: ['/api/terminal/FileManager'],
        actionExposure: 'NOT_CERTIFIED',
        workflowEligible: false,
      },
    }),
  ];
  const policyReport = comparePluginMappings({
    mode: shadow,
    categories,
    mappings: policyMappings,
  });
  check(policyReport.summary.postgresMappings === 7, 'all active mappings remain counted');
  check(policyReport.summary.postgresWorkflowEligibleMappings === 4, 'policy keeps four mappings workflow eligible');
  check(policyReport.summary.postgresPolicyExcludedMappings === 3, 'three explicit policy exclusions counted');
  check(policyReport.summary.postgresAliasMappings === 1, 'alias mapping counted');
  check(policyReport.summary.postgresControlMappings === 1, 'control mapping counted');
  check(policyReport.summary.postgresNotCertifiedMappings === 1, 'not-certified mapping counted');
  check(policyReport.summary.engineOnlyMappings === 1, 'policy exclusions do not become engine-only findings');
  check(policyReport.policyExcluded.length === 3, 'policy exclusion details are retained');
  check(
    policyReport.policyExcluded.some((item) =>
      item.actionId === 'transform.filter' &&
      item.actionRole === 'ALIAS' &&
      item.replacementActionKey === 'transform.filterRows'
    ),
    'alias replacement metadata is reported'
  );
  check(
    policyReport.policyExcluded.some((item) =>
      item.actionId === 'linux.fileManager' &&
      item.actionExposure === 'NOT_CERTIFIED'
    ),
    'not-certified exposure metadata is reported'
  );

  const storage = new MemoryStorage() as unknown as Storage;
  persistPluginMappingShadowReport(report, storage);
  check(storage.getItem('autoflow:plugin-mapping-shadow:last:v1') !== null, 'last report persisted');
  check(storage.getItem('autoflow:plugin-mapping-shadow:reports:v1') !== null, 'bounded report history persisted');

  const failure = createPluginMappingShadowFailure({
    mode: shadow,
    error: Object.assign(new Error('offline'), { code: 'OFFLINE', status: 503 }),
  });
  check(failure.verdict === 'SHADOW_API_UNAVAILABLE', 'API failure is non-blocking');
  check(failure.visibleCatalogueSource === 'static-frontend', 'failure preserves static catalogue');
  check(failure.executionRoutingChanged === false, 'failure preserves execution routing');

  const phase4c3dCategories: AutomationCategory[] = [
    {
      id: 'phase4c3d-ai', name: 'AI Bridge', icon: 'Bot', color: 'bg-indigo-500', description: 'Regression',
      actions: [{
        id: 'chat-json', type: 'chat-json', category: 'phase4c3d-ai', name: 'Chat JSON', description: '', icon: 'Bot',
        api: { url: '/engine/ai/chat', method: 'POST', bodyType: 'json', headers: { 'Content-Type': 'application/json' } },
      } as any],
    },
    {
      id: 'phase4c3d-asana', name: 'Asana', icon: 'List', color: 'bg-rose-500', description: 'Regression',
      actions: [{
        id: 'get-workspaces', type: 'get-workspaces', category: 'phase4c3d-asana', name: 'Get Workspaces', description: '', icon: 'List',
        api: { url: '/engine/asana/get-workspaces', method: 'POST', bodyType: 'json', headers: { 'Content-Type': 'application/json' } },
      } as any],
    },
  ];
  const phase4c3dMappings: PluginEndpointMappingReadRecord[] = [
    mapping({ pluginId: 'ai.bridge', pluginName: 'AI Bridge', actionId: 'ai.chat', actionName: 'Chat', canonicalPath: '/api/v1/ai/chat', legacyPath: '/ai/chat', requestContentTypes: ['multipart/form-data'], bodyType: 'multipart', metadata: { legacyEndpoints: ['/ai/chat'] } }),
    mapping({ pluginId: 'ai.bridge', pluginName: 'AI Bridge', actionId: 'ai.chatJson', actionName: 'Chat JSON', canonicalPath: '/api/v1/ai/chat-json', legacyPath: '/ai/chat', requestContentTypes: ['application/json'], bodyType: 'json', metadata: { legacyEndpoints: ['/ai/chat'] } }),
    mapping({ pluginId: 'asana', pluginName: 'Asana', actionId: 'asana.getWorkspaces', actionName: 'Get Workspaces', canonicalPath: '/api/v1/asana/get-workspaces', legacyPath: '/asana/get-workspaces', requestContentTypes: ['*/*'], bodyType: 'json', metadata: { legacyEndpoints: ['/asana/get-workspaces'] } }),
  ];
  const phase4c3dReport = comparePluginMappings({ mode: shadow, categories: phase4c3dCategories, mappings: phase4c3dMappings });
  check(phase4c3dReport.summary.contentTypeMismatches === 0, 'exact sibling and wildcard are compatible');
  check(phase4c3dReport.engineOnly.some((item) => item.actionId === 'ai.chat'), 'generic multipart sibling remains unused');
  check(!phase4c3dReport.engineOnly.some((item) => item.actionId === 'ai.chatJson'), 'exact JSON sibling is selected');

  if (failed > 0) {
    console.error('Phase 4C.1 plugin mapping frontend shadow tests: FAIL');
    console.error(`Assertions passed: ${passed}`);
    console.error(`Assertions failed: ${failed}`);
    process.exitCode = 1;
    return;
  }
  console.log('Phase 4C.1 plugin mapping frontend shadow tests: PASS');
  console.log(`Assertions passed: ${passed}`);
  console.log('Legacy mode network calls: 0');
  console.log('PostgreSQL mapping requests: cached and in-flight deduplicated');
  console.log('Visible catalogue source: static frontend');
  console.log('Plugin execution routing changes: 0');
  console.log('Database writes: 0');
}

void main();
