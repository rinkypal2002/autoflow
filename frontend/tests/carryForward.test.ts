import { createExecutionContext } from '../src/lib/executionContext';
import { resolveDeep, resolveString, evaluateCondition } from '../src/lib/expression';
import {
  buildStepPreviewRows,
  filterStepPreviewRows,
  projectBusinessData,
  summarizePreviewRows,
  unwrapEnvelope,
} from '../src/lib/carryForward';
import { buildBindingCatalogue } from '../src/lib/bindingSources';

let pass = 0, fail = 0;
const check = (name: string, actual: any, expected: any) => {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}\n        expected ${e}\n        actual   ${a}`); }
};

const ctx = createExecutionContext({
  runId: 'run_1', workflowId: 'wf_1', workflowName: 'Onboarding',
  variables: [
    { id: 'v1', name: 'tenantId', type: 'string', value: 'ACME' },
    { id: 'v2', name: 'apiKey', type: 'string', value: 'super-secret', isSecret: true },
  ],
});

// ── Node 1: the exact payload from the brief ───────────────────────────────
const n1: any = { id: 'n1', name: 'Read Employee Excel', type: 'excel-read', category: 'excel' };
ctx.recordNodeOutput(n1, { employeeId: 'E101', name: 'Umesh', department: 'IT' });

const s1 = ctx.buildScope({ currentAction: n1 });
console.log('\n[1] Bare shorthand + namespaces from node 1');
check('{{employeeId}}',                        resolveString('{{employeeId}}', s1), 'E101');
check('{{name}}',                              resolveString('{{name}}', s1), 'Umesh');
check('{{department}}',                        resolveString('{{department}}', s1), 'IT');
check('{{previous.employeeId}}',               resolveString('{{previous.employeeId}}', s1), 'E101');
check('{{steps.ReadEmployeeExcel.employeeId}}',resolveString('{{steps.ReadEmployeeExcel.employeeId}}', s1), 'E101');
check("{{steps['Read Employee Excel'].name}}", resolveString("{{steps['Read Employee Excel'].name}}", s1), 'Umesh');
check('{{nodes.n1.output.department}}',        resolveString('{{nodes.n1.output.department}}', s1), 'IT');
check('{{vars.tenantId}}',                     resolveString('{{vars.tenantId}}', s1), 'ACME');

// ── Node 2 runs; node 3 must still see node 1 (the real carry-forward test) ─
const n2: any = { id: 'n2', name: 'Fetch Manager', type: 'http', category: 'api' };
ctx.recordNodeOutput(n2, { status: 200, data: { managerId: 'M9', rows: [{ email: 'a@b.c' }] } });
const n3: any = { id: 'n3', name: 'Send Email', type: 'email', category: 'mail' };
const s3 = ctx.buildScope({ currentAction: n3 });

console.log('\n[2] Node 3 reaching PAST node 2 back to node 1');
check('node1 still reachable by name',  resolveString('{{steps.ReadEmployeeExcel.employeeId}}', s3), 'E101');
check('node1 bare key survives',        resolveString('{{department}}', s3), 'IT');
check('previous is now node 2',         resolveString('{{previous.status}}', s3), 200);
// The envelope key is no longer re-spread over the payload it wrapped, so a
// business field is addressed directly rather than through `data.`. That change
// is what made `{{previous.data}}` mean the rows of an Excel read instead of the
// wrapper object around them — see the note in `executionContext.buildScope`.
// The old `data.`-prefixed form remains available through `output`.
check('nested path into node 2',        resolveString('{{steps.FetchManager.managerId}}', s3), 'M9');
check('array index',                    resolveString('{{steps.FetchManager.rows[0].email}}', s3), 'a@b.c');
check('old wrapped form via output',    resolveString('{{steps.FetchManager.output.data.managerId}}', s3), 'M9');

console.log('\n[3] Type preservation, mixed strings, fallbacks, filters');
check('whole-token keeps object',  resolveString('{{steps.FetchManager.$business}}', s3), { managerId: 'M9', rows: [{ email: 'a@b.c' }] });
check('mixed interpolation',       resolveString('Hi {{name}} of {{department}}', s3), 'Hi Umesh of IT');
check('fallback ||',               resolveString("{{missing.key || 'default'}}", s3), 'default');
check('fallback chain to real',    resolveString("{{nope || employeeId}}", s3), 'E101');
check('filter upper',              resolveString('{{name | upper}}', s3), 'UMESH');
check('filter default',            resolveString("{{blank | default:'n/a'}}", s3), 'n/a');
check('unresolved kept verbatim',  resolveString('{{totallyMissing}}', s3), '{{totallyMissing}}');

console.log('\n[4] Deep resolution of a whole request body');
check('nested body', resolveDeep({
  to: '{{name}}', meta: { emp: '{{employeeId}}', dept: '{{previous.status}}' },
  tags: ['{{department}}', 'static'],
}, s3), { to: 'Umesh', meta: { emp: 'E101', dept: 200 }, tags: ['IT', 'static'] });

console.log('\n[5] Sandboxed conditions (no eval)');
check('equality',   evaluateCondition("{{department}} == 'IT'", s3), true);
check('numeric >=', evaluateCondition('{{previous.status}} >= 200', s3), true);
check('false path', evaluateCondition("{{department}} == 'HR'", s3), false);
check('no code exec', evaluateCondition("globalThis.x = 1", s3), false);

console.log('\n[6] Variables written mid-run, and precedence');
ctx.setVariable('managerId', 'M9');
check('new var visible', resolveString('{{managerId}}', ctx.buildScope({})), 'M9');
check('own property wins over carry-forward',
  resolveString('{{name}}', ctx.buildScope({ selfValues: { name: 'OVERRIDE' } })), 'OVERRIDE');

console.log('\n[7] Snapshot round-trip + secret masking');
const snap = ctx.snapshot({ status: 'completed' });
check('secret masked',   snap.variables.apiKey, '••••••••');
check('plain var intact',snap.variables.tenantId, 'ACME');
check("nodes captured",  snap.outputs.length, 2);
const restored = (require('../src/lib/executionContext').WorkflowExecutionContext).restore(snap);
check('restored binding works', resolveString('{{steps.ReadEmployeeExcel.employeeId}}', restored.buildScope({})), 'E101');

// ── Business projection: wrappers hidden, business data promoted ───────────
console.log('\n[8] Carry-forward cleanup — business data vs technical detail');

const wrapped = {
  success: true,
  statusCode: 200,
  message: 'Success',
  data: { employeeId: 'E101', name: 'Umesh', department: 'IT' },
};

const projection = projectBusinessData(wrapped);
check('wrapper stripped',        projection.fields.map((f) => f.path), ['employeeId', 'name', 'department']);
check('technical diverted',      projection.technical.map((f) => f.path), ['success', 'statusCode', 'message']);
check('envelope path recorded',  projection.envelopePath, 'data');
check('unwrapped payload',       unwrapEnvelope(wrapped).payload, { employeeId: 'E101', name: 'Umesh', department: 'IT' });

// An un-wrapped payload must NOT be treated as an envelope.
check('no false unwrap', projectBusinessData({ ticketId: 'T-1', status: 'Open' }).fields.map((f) => f.path), ['ticketId', 'status']);
check('numeric status is technical', projectBusinessData({ status: 200, orderId: 'SO-9' }).technical.map((f) => f.path), ['status']);

const ctx2 = createExecutionContext({ runId: 'run_2', workflowId: 'wf_2', workflowName: 'Cleanup' });
const w1: any = { id: 'w1', name: 'Read Employee Excel', type: 'excel-read' };
const w2: any = { id: 'w2', name: 'Insert Database', type: 'db-insert' };
ctx2.recordNodeOutput(w1, wrapped, { durationMs: 12 });
ctx2.recordNodeOutput(w2, { success: true, rowsAffected: 3, insertedId: 77, executionTime: 40, headers: { a: 1 } }, { durationMs: 40 });
const s8 = ctx2.buildScope({});

check('friendly business token',   resolveString('{{steps.Read Employee Excel.employeeId}}', s8), 'E101');
check('step-key form still works', resolveString('{{steps.ReadEmployeeExcel.department}}', s8), 'IT');
check('original wrapped path',     resolveString('{{steps.Read Employee Excel.output.data.employeeId}}', s8), 'E101');
check('technical still bindable',  resolveString('{{steps.Read Employee Excel.statusCode}}', s8), 200);
check('execution status reserved', resolveString('{{steps.Read Employee Excel.$status}}', s8), 'completed');
check('previous business field',   resolveString('{{previous.rowsAffected}}', s8), 3);
check('bare key unwrapped',        resolveString('{{employeeId}}', s8), 'E101');
check('clean record accessor',     resolveString('{{steps.Read Employee Excel.$business}}', s8), { employeeId: 'E101', name: 'Umesh', department: 'IT' });
check('technical accessor',        resolveString('{{previous.$technical.executionTime}}', s8), 40);
check('getBusinessOutput',         ctx2.getBusinessOutput('ReadEmployeeExcel'), { employeeId: 'E101', name: 'Umesh', department: 'IT' });

// ── Preview Data: every step, tabular, searchable ──────────────────────────
console.log('\n[9] Preview Data rows');

const rows = buildStepPreviewRows(ctx2.getRecords());
check('one row per step',        rows.length, 2);
check('row order',               rows.map((r) => r.stepName), ['Read Employee Excel', 'Insert Database']);
check('plugin name humanised',   rows[0].pluginName, 'Excel Read');
check('business summary',        rows[0].outputSummary, 'Employee ID: E101  ·  Name: Umesh  ·  Department: IT');
check('key fields carry tokens', rows[0].keyFields.map((f) => f.token), [
  '{{steps.Read Employee Excel.employeeId}}',
  '{{steps.Read Employee Excel.name}}',
  '{{steps.Read Employee Excel.department}}',
]);
check('technical kept aside',    rows[0].technical.map((f) => f.key), ['success', 'statusCode', 'message']);
check('search by value',         filterStepPreviewRows(rows, { term: 'umesh' }).map((r) => r.stepName), ['Read Employee Excel']);
check('search by field name',    filterStepPreviewRows(rows, { term: 'rowsaffected' }).map((r) => r.stepName), ['Insert Database']);
check('search by label',         filterStepPreviewRows(rows, { term: 'rows affected' }).map((r) => r.stepName), ['Insert Database']);
check('search by plugin',        filterStepPreviewRows(rows, { term: 'db insert' }).map((r) => r.stepName), ['Insert Database']);
check('status filter',           filterStepPreviewRows(rows, { status: 'failed' }).length, 0);
check('counts',                  summarizePreviewRows(rows).completed, 2);

// ── Binding catalogue grouping ─────────────────────────────────────────────
console.log('\n[10] Binding catalogue grouping');

const catalogue = buildBindingCatalogue({
  action: { id: 'w3', name: 'Send Email', type: 'email-send' } as any,
  actions: [w1, w2, { id: 'w3', name: 'Send Email', type: 'email-send' } as any],
  connections: [
    { id: 'c1', sourceId: 'w1', targetId: 'w2' } as any,
    { id: 'c2', sourceId: 'w2', targetId: 'w3' } as any,
  ],
  variables: [{ id: 'v1', name: 'EmployeeId', type: 'string', value: 'E101' } as any],
  records: ctx2.getRecords(),
});

check('group order', catalogue.map((g) => g.id), ['variables', 'previous', 'steps', 'runtime', 'technical']);
check('group labels', catalogue.map((g) => g.label), [
  'Variables', 'Previous Step', 'Workflow Steps', 'Runtime', 'Technical Details',
]);
check('technical is collapsed', catalogue[4].defaultCollapsed, true);
check('technical is flagged',   catalogue[4].isTechnical, true);
check('namespaced variable token', catalogue[0].sources[0].token, '{{variables.EmployeeId}}');

const businessTokens = catalogue
  .filter((g) => !g.isTechnical)
  .flatMap((g) => g.sources.map((s) => s.token));
const leaked = ['statusCode', 'headers', 'success', 'executionTime', 'rawJson', 'stackTrace']
  .filter((noise) => businessTokens.some((token) => token.includes(noise)));
check('no technical noise in default picker', leaked, []);
check('business token present', businessTokens.includes('{{steps.Read Employee Excel.employeeId}}'), true);
check('technical token available', catalogue[4].sources.some((s) => s.token === '{{steps.Read Employee Excel.statusCode}}'), true);


// ── C7L1: scalar / array / null envelope contract ────────────────────────────

console.log('\n[C7L1] Scalar / array / null envelope contract');

const arrayEnvelope = {
  success: true,
  message: 'OK',
  data: [{ id: 1 }, { id: 2 }],
};

const stringEnvelope = {
  success: true,
  message: 'Created',
  data: 'spreadsheet-123',
};

const integerEnvelope = {
  success: true,
  message: 'Found',
  data: 456,
};

const booleanEnvelope = {
  success: true,
  message: 'Complete',
  data: true,
};

const nullEnvelope = {
  success: true,
  message: 'Completed',
  data: null,
};

const businessDataField = {
  id: 'ORDER-1',
  data: [{ sku: 'ABC' }],
};

const businessStatusDataField = {
  status: 'Open',
  data: [{ ticketId: 'T-1' }],
};

check(
  'C7L1 object envelope still unwraps',
  unwrapEnvelope({ success: true, data: { id: 1 } }),
  { payload: { id: 1 }, path: 'data' }
);

check(
  'C7L1 array envelope unwraps',
  unwrapEnvelope(arrayEnvelope),
  { payload: [{ id: 1 }, { id: 2 }], path: 'data' }
);

check(
  'C7L1 string envelope unwraps',
  unwrapEnvelope(stringEnvelope),
  { payload: 'spreadsheet-123', path: 'data' }
);

check(
  'C7L1 integer envelope unwraps',
  unwrapEnvelope(integerEnvelope),
  { payload: 456, path: 'data' }
);

check(
  'C7L1 boolean envelope unwraps',
  unwrapEnvelope(booleanEnvelope),
  { payload: true, path: 'data' }
);

check(
  'C7L1 null envelope unwraps',
  unwrapEnvelope(nullEnvelope),
  { payload: null, path: 'data' }
);

check(
  'C7L1 business id + data is not an envelope',
  unwrapEnvelope(businessDataField),
  { payload: businessDataField, path: '' }
);

check(
  'C7L1 business status + array data is not an envelope',
  unwrapEnvelope(businessStatusDataField),
  { payload: businessStatusDataField, path: '' }
);

check(
  "C7L3 single-key data envelope unwraps",
  unwrapEnvelope({ data: "spreadsheet-only" }),
  { payload: "spreadsheet-only", path: "data" }
);

check(
  "C7L3 single-key result array envelope unwraps",
  unwrapEnvelope({ result: [{ id: 1 }, { id: 2 }] }),
  { payload: [{ id: 1 }, { id: 2 }], path: "result" }
);
const c7lCtx = createExecutionContext({
  runId: 'run_c7l',
  workflowId: 'wf_c7l',
  workflowName: 'Envelope Compatibility',
});

const scalarNode: any = {
  id: 'scalar_node',
  name: 'Create Spreadsheet',
  type: 'google-sheets-create',
};

c7lCtx.recordNodeOutput(scalarNode, stringEnvelope);

const scalarScope = c7lCtx.buildScope({});

check(
  'C7L1 scalar business accessor',
  resolveString('{{steps.CreateSpreadsheet.$business}}', scalarScope),
  'spreadsheet-123'
);

check(
  'C7L1 scalar raw output remains available',
  resolveString('{{steps.CreateSpreadsheet.output.data}}', scalarScope),
  'spreadsheet-123'
);

check(
  'C7L1 scalar raw message remains available',
  resolveString('{{steps.CreateSpreadsheet.output.message}}', scalarScope),
  'Created'
);
console.log(`\n${'='.repeat(46)}\n  ${pass} passed, ${fail} failed\n${'='.repeat(46)}`);
process.exit(fail === 0 ? 0 : 1);
