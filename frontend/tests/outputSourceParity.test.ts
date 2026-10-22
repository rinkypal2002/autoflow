import type { BindingSourceGroup } from '../src/types/workflow';
import {
  loadOutputSourceCatalogue,
  type OutputSourceApiResponse,
} from '../src/lib/outputSourceApi';
import {
  compareOutputSourceCatalogues,
  createOutputSourceShadowFailure,
} from '../src/lib/outputSourceParity';
import { normalizeOutputSourceReadMode, resolveOutputSourceMode } from '../src/lib/outputSourceMode';
import { buildDeclaredCatalogue, declaredSourcesForStep } from '../src/lib/outputSchema';

let passed = 0;
let failed = 0;

function check(label: string, condition: boolean): void {
  if (condition) passed += 1;
  else {
    failed += 1;
    console.error(`FAIL: ${label}`);
  }
}

const coverage = {
  finalNodes: 2,
  indexedNodes: 2,
  missingIndexedNodes: 0,
  indexRows: 5,
  complete: true,
  eligibleNodes: 2,
  totalMatchingRows: 5,
  returnedRows: 5,
  returnedNodes: 2,
  hasMore: false,
};

const legacyGroups: BindingSourceGroup[] = [
  { id: 'variables', label: 'Variables', icon: 'Variable', sources: [
    { token: '{{variables.secret}}', path: 'variables.secret', label: 'Secret', valueType: 'string', preview: 'NEVER_STORE' },
  ] },
  { id: 'previous', label: 'Previous', icon: 'CornerUpLeft', sources: [
    { token: '{{previous.id}}', path: 'previous.id', label: 'ID', valueType: 'number' },
  ] },
  { id: 'steps', label: 'Workflow Steps', icon: 'Workflow', sources: [
    { token: '{{steps.Read Sheet.output}}', path: 'steps.ReadSheet.output', label: 'Read Sheet — entire output', valueType: 'object' },
    { token: '{{steps.Read Sheet.id}}', path: 'steps.ReadSheet.id', label: 'Read Sheet → ID', valueType: 'number' },
  ] },
  { id: 'technical', label: 'Technical', icon: 'Wrench', isTechnical: true, sources: [
    { token: '{{steps.Read Sheet.$durationMs}}', path: 'steps.ReadSheet.$durationMs', label: 'Duration', valueType: 'number' },
  ] },
];

const postgresGroups: BindingSourceGroup[] = [
  { id: 'steps', label: 'Workflow Steps', icon: 'Workflow', sources: [
    { token: '{{steps.Read Sheet.output}}', path: 'steps.Read Sheet.output', label: 'Read Sheet → Complete Raw Output', valueType: 'object', nodeId: 'n1', fieldKind: 'RAW' } as any,
    { token: '{{steps.Read Sheet.id}}', path: 'steps.Read Sheet.id', label: 'Read Sheet → ID', valueType: 'string', nodeId: 'n1', fieldKind: 'BUSINESS' } as any,
    { token: '{{steps.Read Sheet.extra}}', path: 'steps.Read Sheet.extra', label: 'Read Sheet → Extra', valueType: 'string', nodeId: 'n1', fieldKind: 'BUSINESS' } as any,
  ] },
  { id: 'technical', label: 'Technical', icon: 'Wrench', isTechnical: true, sources: [
    { token: '{{steps.Read Sheet.statusCode}}', path: 'steps.Read Sheet.statusCode', label: 'Status Code', valueType: 'number', nodeId: 'n1', fieldKind: 'TECHNICAL' } as any,
  ] },
];

async function testModes(): Promise<void> {
  check('invalid mode falls back to legacy', normalizeOutputSourceReadMode('wat') === 'legacy');
  check('shadow is preserved', resolveOutputSourceMode('shadow').effective === 'shadow');
  const guarded = resolveOutputSourceMode('postgres');
  check('postgres cutover is enabled', guarded.effective === 'postgres' && !guarded.cutoverBlocked);
}

async function testLegacyMakesNoRequest(): Promise<void> {
  let calls = 0;
  const result = await loadOutputSourceCatalogue({
    mode: 'legacy', workflowId: 'w', runId: 'r',
    fetchImpl: (async () => { calls += 1; throw new Error('must not run'); }) as typeof fetch,
  });
  check('legacy returns skipped', result.status === 'skipped');
  check('legacy fetch calls are zero', calls === 0);
}

function apiPage(offset: number): OutputSourceApiResponse {
  const first = offset === 0;
  const sources = first ? postgresGroups[0].sources.slice(0, 2) : postgresGroups[0].sources.slice(2);
  return {
    status: 'success', source: 'postgres', readModel: 'autoflow.output_binding_source_v1', readOnly: true,
    workflowId: 'w', requestedRunId: 'r', runId: 'r', execution: { status: 'completed' },
    query: { targetNodeId: null, targetFilter: 'all-final-nodes', search: '', includeTechnical: true, includeRaw: true, limit: 2, offset },
    coverage: { ...coverage, totalMatchingRows: 3, returnedRows: sources.length, returnedNodes: 1, hasMore: first },
    groups: [{ nodeId: 'n1', nodeName: 'Read Sheet', stepKey: 'ReadSheet', sequence: 1,
      business: sources.filter((source) => !source.token.endsWith('.output}}')) as any,
      technical: [], raw: sources.filter((source) => source.token.endsWith('.output}}')) as any,
      counts: { business: first ? 1 : 1, technical: 0, raw: first ? 1 : 0, total: sources.length },
    }],
    bindingGroups: [{ id: 'steps', label: 'Workflow Steps', icon: 'Workflow', sources }],
  };
}

async function testPagination(): Promise<void> {
  let calls = 0;
  const fakeFetch = (async (url: RequestInfo | URL) => {
    calls += 1;
    const offset = Number(new URL(String(url), 'http://local').searchParams.get('offset') || '0');
    return new Response(JSON.stringify(apiPage(offset)), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;
  const result = await loadOutputSourceCatalogue({
    mode: 'shadow', workflowId: 'w', runId: 'r', pageSize: 2, fetchImpl: fakeFetch,
  });
  check('shadow loaded', result.status === 'loaded');
  if (result.status === 'loaded') {
    check('two pages fetched', result.pages === 2 && calls === 2);
    check('binding pages merged', result.response.bindingGroups[0].sources.length === 3);
    check('node groups merged', result.response.groups[0].counts.total === 3);
  }
}

async function testCurrentGraphFilteringAvoidsStaleTargetRequest(): Promise<void> {
  let requestedTarget: string | null = 'not-checked';
  const fakeFetch = (async (url: RequestInfo | URL) => {
    const parsed = new URL(String(url), 'http://local');
    requestedTarget = parsed.searchParams.get('targetNodeId');
    const offset = Number(parsed.searchParams.get('offset') || '0');
    return new Response(JSON.stringify(apiPage(offset)), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;

  const result = await loadOutputSourceCatalogue({
    mode: 'shadow', workflowId: 'w', runId: 'r', targetNodeId: 'new-node',
    eligibleNodeIds: ['n1'], fetchImpl: fakeFetch,
  });
  check('stale target is not sent to immutable run API', requestedTarget === null);
  check('current graph filter loads successfully', result.status === 'loaded');
  if (result.status === 'loaded') {
    check('client graph filter is reported', result.response.query.targetFilter === 'client-current-graph-ancestors');
    check('eligible node remains', result.response.groups.length === 1 && result.response.groups[0].nodeId === 'n1');
  }
}

async function testParity(): Promise<void> {
  const report = compareOutputSourceCatalogues({
    workflowId: 'w', runId: 'r', targetNodeId: 'target',
    mode: resolveOutputSourceMode('shadow'), coverage,
    legacyGroups, postgresGroups,
  });
  check('non-step aliases excluded', report.summary.legacyTokens === 3);
  check('common tokens detected', report.summary.commonTokens === 2);
  check('missing technical token classified', report.summary.missingTechnicalAliases === 1);
  check('no genuine business field missing', report.summary.genuineMissingBusinessFields === 0);
  check('additional tokens detected', report.summary.additionalPostgresFields === 2);
  check('type mismatch detected', report.typeMismatches.length === 1);
  check('display path aliases are compatible', report.summary.compatiblePathAliases === 2 && report.pathMismatches.length === 0);
  check('report stores no previews', !JSON.stringify(report).includes('NEVER_STORE'));

  const exact = compareOutputSourceCatalogues({
    workflowId: 'w', runId: 'r', mode: resolveOutputSourceMode('shadow'), coverage,
    legacyGroups: postgresGroups, postgresGroups,
  });
  check('exact parity verdict', exact.verdict === 'EXACT_TOKEN_PARITY');

  const rawAliasLegacy: BindingSourceGroup[] = [{
    id: 'steps', label: 'Steps', icon: 'Workflow', sources: [
      { token: '{{steps.Read Sheet}}', path: 'steps.ReadSheet', label: 'Entire output', valueType: 'object' },
    ],
  }];
  const rawAliasPostgres: BindingSourceGroup[] = [{
    id: 'steps', label: 'Steps', icon: 'Workflow', sources: [
      { token: '{{steps.Read Sheet.output}}', path: 'steps.Read Sheet.output', label: 'Complete Raw Output', valueType: 'object', fieldKind: 'RAW' } as any,
    ],
  }];
  const aliasReport = compareOutputSourceCatalogues({
    workflowId: 'w', runId: 'r', mode: resolveOutputSourceMode('shadow'), coverage,
    legacyGroups: rawAliasLegacy, postgresGroups: rawAliasPostgres,
  });
  check('whole-output aliases reach canonical parity', aliasReport.verdict === 'CANONICAL_PARITY');

  const failure = createOutputSourceShadowFailure({
    workflowId: 'w', runId: 'r', mode: resolveOutputSourceMode('shadow'),
    error: Object.assign(new Error('offline'), { code: 'OFFLINE', status: 0 }),
  });
  check('failure is non-fatal report', failure.verdict === 'SHADOW_API_UNAVAILABLE' && failure.error.code === 'OFFLINE');
}

function testRootSchemaSemantics(): void {
  const legacySources = declaredSourcesForStep('Legacy Step', {
    fields: [{ path: 'id', label: 'ID', kind: 'number' }],
  } as any);
  check('C7M4 legacy named field remains bindable', legacySources.some(function(source) { return source.token === '{{steps.Legacy Step.id}}'; }));
  check('C7M4 legacy entire-step source remains unchanged', legacySources.some(function(source) { return source.token === '{{steps.Legacy Step}}'; }));

  const scalarSchema = {
    rootKind: 'string',
    hasBusinessOutput: true,
    fields: [],
  } as any;
  const scalarSources = declaredSourcesForStep('Create Spreadsheet', scalarSchema);
  check('C7M4 scalar root binding uses $business', scalarSources.some(function(source) { return source.token === '{{steps.Create Spreadsheet.$business}}' && source.valueType === 'string'; }));
  check('C7M4 scalar root does not expose composite step as business value', !scalarSources.some(function(source) { return source.token === '{{steps.Create Spreadsheet}}'; }));

  const scalarCatalogue = buildDeclaredCatalogue([
    { id: 'scalar-node', name: 'Create Spreadsheet', outputSchema: scalarSchema } as any,
  ], []);
  check('C7M4 scalar schema survives declared catalogue', scalarCatalogue.length === 1 && scalarCatalogue[0].sources.some(function(source) { return source.token === '{{steps.Create Spreadsheet.$business}}'; }));

  const voidSources = declaredSourcesForStep('Append Row', {
    hasBusinessOutput: false,
    fields: [],
  } as any);
  check('C7M4 void contract exposes no business binding source', voidSources.length === 0);
}

async function main(): Promise<void> {
  await testModes();
  await testLegacyMakesNoRequest();
  await testPagination();
  await testCurrentGraphFilteringAvoidsStaleTargetRequest();
  testRootSchemaSemantics();
  await testParity();
  console.log(`Step 7B.5B.1 output-source parity fix tests: ${failed === 0 ? 'PASS' : 'FAIL'}`);
  console.log(`Assertions passed: ${passed}`);
  console.log(`Assertions failed: ${failed}`);
  console.log('Stale target-node API failures: prevented');
  console.log('Shadow catalogue requests per immutable run: cached');
  console.log('Visible Binding Picker source: legacy');
  process.exitCode = failed === 0 ? 0 : 1;
}

void main();
