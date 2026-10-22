import type { BindingSourceGroup } from '../src/types/workflow';
import { resolveVisibleOutputSourceCatalogue } from '../src/lib/outputSourceCutover';
import { resolveOutputSourceMode } from '../src/lib/outputSourceMode';

let passed = 0;
let failed = 0;

function check(label: string, condition: boolean): void {
  if (condition) passed += 1;
  else {
    failed += 1;
    console.error(`FAIL: ${label}`);
  }
}

const legacy: BindingSourceGroup[] = [
  { id: 'variables', label: 'Variables', icon: 'Variable', sources: [
    { token: '{{variables.region}}', path: 'variables.region', label: 'Region', valueType: 'string' },
  ] },
  { id: 'previous', label: 'Previous Step', icon: 'CornerUpLeft', sources: [
    { token: '{{previous.id}}', path: 'previous.id', label: 'ID', valueType: 'number' },
  ] },
  { id: 'steps', label: 'Workflow Steps', icon: 'Workflow', sources: [
    { token: '{{steps.Read Sheet.output}}', path: 'steps.ReadSheet.output', label: 'Entire output', valueType: 'object' },
    { token: '{{steps.Read Sheet.id}}', path: 'steps.ReadSheet.id', label: 'ID', valueType: 'number' },
    { token: '{{steps.Read Sheet.$business.id}}', path: 'steps.ReadSheet.$business.id', label: 'ID alias', valueType: 'number' },
  ] },
  { id: 'declared:new-node', label: 'Future Step', icon: 'Braces', sources: [
    { token: '{{steps.Future Step.result}}', path: 'steps.FutureStep.result', label: 'Result', valueType: 'unknown' },
  ] },
  { id: 'runtime', label: 'Runtime', icon: 'Clock', sources: [
    { token: '{{run.id}}', path: 'run.id', label: 'Run ID', valueType: 'string' },
  ] },
  { id: 'technical', label: 'Technical Details', icon: 'Wrench', isTechnical: true, sources: [
    { token: '{{steps.Read Sheet.$status}}', path: 'steps.ReadSheet.$status', label: 'Status', valueType: 'string' },
  ] },
];

const postgres: BindingSourceGroup[] = [
  { id: 'steps', label: 'Workflow Steps', icon: 'Workflow', sources: [
    { token: '{{steps.Read Sheet.output}}', path: 'steps.Read Sheet.output', label: 'Complete Raw Output', valueType: 'object' },
    { token: '{{steps.Read Sheet.id}}', path: 'steps.Read Sheet.id', label: 'ID from PostgreSQL', valueType: 'number' },
    { token: '{{steps.Read Sheet.name}}', path: 'steps.Read Sheet.name', label: 'Name', valueType: 'string' },
  ] },
  { id: 'technical', label: 'Technical Details', icon: 'Wrench', isTechnical: true, sources: [
    { token: '{{steps.Read Sheet.statusCode}}', path: 'steps.Read Sheet.statusCode', label: 'Status Code', valueType: 'number' },
  ] },
];

const coverage = {
  finalNodes: 1,
  indexedNodes: 1,
  missingIndexedNodes: 0,
  indexRows: 4,
  complete: true,
  eligibleNodes: 1,
  totalMatchingRows: 4,
  returnedRows: 4,
  returnedNodes: 1,
  hasMore: false,
};

function tokens(groups: BindingSourceGroup[]): string[] {
  return groups.flatMap((group) => group.sources.map((source) => source.token));
}

function main(): void {
  const postgresMode = resolveOutputSourceMode('postgres');
  check('postgres mode is active', postgresMode.effective === 'postgres' && !postgresMode.cutoverBlocked);

  const legacyResult = resolveVisibleOutputSourceCatalogue({
    mode: resolveOutputSourceMode('legacy'), legacyGroups: legacy, postgresGroups: postgres, coverage,
  });
  check('legacy renders legacy', legacyResult.source === 'legacy' && legacyResult.reason === 'legacy-mode');

  const shadowResult = resolveVisibleOutputSourceCatalogue({
    mode: resolveOutputSourceMode('shadow'), legacyGroups: legacy, postgresGroups: postgres, coverage,
  });
  check('shadow still renders legacy', shadowResult.source === 'legacy' && shadowResult.reason === 'shadow-mode');

  const loadingResult = resolveVisibleOutputSourceCatalogue({
    mode: postgresMode, legacyGroups: legacy, loading: true,
  });
  check('loading safely falls back', loadingResult.source === 'legacy-fallback' && loadingResult.reason === 'loading');

  const errorResult = resolveVisibleOutputSourceCatalogue({
    mode: postgresMode, legacyGroups: legacy, error: 'offline',
  });
  check('API failure safely falls back', errorResult.reason === 'api-error');

  const incompleteResult = resolveVisibleOutputSourceCatalogue({
    mode: postgresMode, legacyGroups: legacy, postgresGroups: postgres,
    coverage: { ...coverage, complete: false, missingIndexedNodes: 1 },
    runMatches: true, targetMatches: true,
  });
  check('incomplete coverage safely falls back', incompleteResult.reason === 'incomplete-coverage');

  const active = resolveVisibleOutputSourceCatalogue({
    mode: postgresMode, legacyGroups: legacy, postgresGroups: postgres, coverage,
    runMatches: true, targetMatches: true,
  });
  const visibleTokens = tokens(active.groups);
  const compatibility = active.groups.find((group) => group.id === 'legacy-compatibility');
  const visibleSteps = active.groups.find((group) => group.id === 'steps');
  const visibleTechnical = active.groups.find((group) => group.id === 'technical');

  check('PostgreSQL activates with complete coverage', active.source === 'postgres' && active.reason === 'postgres-active');
  check('PostgreSQL step label is primary', visibleSteps?.sources.some((source) => source.label === 'ID from PostgreSQL') === true);
  check('PostgreSQL additional field is visible', visibleTokens.includes('{{steps.Read Sheet.name}}'));
  check('variables remain visible', visibleTokens.includes('{{variables.region}}'));
  check('previous-step shortcut remains visible', visibleTokens.includes('{{previous.id}}'));
  check('runtime values remain visible', visibleTokens.includes('{{run.id}}'));
  check('declared future outputs remain visible', visibleTokens.includes('{{steps.Future Step.result}}'));
  check('legacy alias remains selectable', visibleTokens.includes('{{steps.Read Sheet.$business.id}}'));
  check('legacy status alias remains selectable', visibleTokens.includes('{{steps.Read Sheet.$status}}'));
  check('compatibility aliases are collapsed', Boolean(compatibility?.defaultCollapsed));
  check('technical details remain collapsed', Boolean(visibleTechnical?.defaultCollapsed && visibleTechnical.isTechnical));
  check('no duplicate visible tokens', visibleTokens.length === new Set(visibleTokens).size);
  check('all legacy tokens are preserved', tokens(legacy).every((token) => visibleTokens.includes(token)));
  check('cutover metrics count compatibility aliases', active.metrics.compatibilityAliases === 2);

  console.log(`Step 7B.5C controlled Binding Picker cutover tests: ${failed === 0 ? 'PASS' : 'FAIL'}`);
  console.log(`Assertions passed: ${passed}`);
  console.log(`Assertions failed: ${failed}`);
  console.log('PostgreSQL step outputs: primary when coverage is complete');
  console.log('Legacy binding tokens: preserved through compatibility aliases');
  console.log('Automatic fallback: verified');
  process.exitCode = failed === 0 ? 0 : 1;
}

main();
