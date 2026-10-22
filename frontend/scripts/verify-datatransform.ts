/**
 * Repeatable check that the Data Transformation catalogue still matches the
 * backend and that its outputs bind at both design time and run time.
 *
 *   npx tsx scripts/verify-datatransform.ts
 */
import { createExecutionContext } from '../src/lib/executionContext';
import { evaluateToken } from '../src/lib/expression';
import { buildDeclaredCatalogue, mergeCatalogues } from '../src/lib/outputSchema';
import { buildBindingCatalogue } from '../src/lib/bindingSources';
import { automationCategories } from '../src/data/automationCategories';

const dt = automationCategories.find((c: any) => c.id === 'data-transform-017')!;
const filterDef: any = dt.actions.find((a: any) => a.type === 'filter-rows');
const profileDef: any = dt.actions.find((a: any) => a.type === 'profile');

console.log('=== DESIGN TIME (nothing has run yet) ===');
const actions: any[] = [
  { ...filterDef, id: 'n1', name: 'Filter Rows', x: 0, y: 0 },
  { ...profileDef, id: 'n2', name: 'Profile Dataset', x: 0, y: 0 },
];
const observed = buildBindingCatalogue({ action: actions[1], actions, connections: [], variables: [], records: [] });
const merged = mergeCatalogues(observed, buildDeclaredCatalogue(actions, []));
const declaredGroups = merged.filter((g: any) => String(g.id).startsWith('declared:'));
console.log('  declared groups:', declaredGroups.map((g: any) => g.label).join(', '));
declaredGroups[0]?.sources.slice(0, 5).forEach((s: any) => console.log(`    ${String(s.label).padEnd(22)} ${s.token}`));

console.log('\n=== RUN TIME (real backend response shape) ===');
const ctx = createExecutionContext({ workflowId: 'w', runId: 'r' });
ctx.recordNodeOutput({ id: 'n1', name: 'Filter Rows', type: 'filter-rows' } as any, {
  status: 'SUCCESS', message: 'Filter completed: 2 of 3 rows kept', processingTimeMs: 3,
  data: [
    { 'Project Name': 'Marketing_ssss', 'Task Name': 'Market Research', 'Days Required': 22 },
    { 'Project Name': 'Product Dev', 'Task Name': 'Prototype', 'Days Required': 1250 },
  ],
  rowCount: 2, columns: ['Project Name', 'Task Name', 'Days Required'],
  removedCount: 1, warnings: ['1 row(s) found no lookup match.'],
});
ctx.recordNodeOutput({ id: 'n2', name: 'Profile Dataset', type: 'profile' } as any, {
  status: 'SUCCESS', message: 'Profiled 3 column(s)', processingTimeMs: 2,
  data: [{ column: 'Days Required', type: 'INTEGER', nullCount: 0, suggestedSqlType: 'BIGINT' }],
  rowCount: 1, columns: ['column', 'type', 'nullCount', 'suggestedSqlType'],
});
const scope = ctx.buildScope({});

const tokens = [
  'previous.data', 'previous.rowCount', 'previous.columns',
  "steps['Filter Rows'].data", "steps['Profile Dataset'].data",
  "steps['Profile Dataset'].columns",
  "steps['Filter Rows'].data[0]['Project Name']",
  "steps['Filter Rows'].data['Task Name']",
  "steps['Profile Dataset'].data[0].suggestedSqlType",
  "steps['Filter Rows'].warnings",
  'previous.warnings',  // Profile node has none - absence here is correct
];
let bad = 0;
for (const t of tokens) {
  const r = evaluateToken(t, scope);
  if (!r.found && !t.startsWith('previous.warnings')) bad++;
  const v = r.value === undefined ? 'undefined'
    : Array.isArray(r.value) ? `Array(${r.value.length})`
    : typeof r.value === 'object' ? '{obj}' : JSON.stringify(r.value);
  console.log(`  ${r.found ? 'OK  ' : 'FAIL'} {{${t}}} -> ${v}`);
}
console.log(bad === 0 ? '\n  ALL BINDINGS RESOLVE' : `\n  ${bad} BROKEN`);
