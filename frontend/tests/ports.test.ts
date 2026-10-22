/**
 * Named output ports — branching behaviour.
 *
 * The suite is organised around the one property that matters most: an edge
 * with no `sourcePort` must behave exactly as it did before ports existed.
 * Every saved workflow on disk is in that state, so the compatibility section
 * is first and is the longest.
 */

import {
  countPortRecords,
  findPort,
  getOutputPorts,
  getPrimaryPort,
  hasDeclaredPorts,
  resolveConnectionPort,
  routeConnection,
  selectPortPayload,
  summarisePorts,
  validatePortWiring,
} from '../src/lib/ports';
import { createExecutionContext } from '../src/lib/executionContext';
import { resolveString } from '../src/lib/expression';
import { FILTER_ROWS_ACTION, VALIDATE_ACTION } from '../src/data/actions/dataTransformOperations';

let pass = 0, fail = 0;
const check = (name: string, actual: any, expected: any) => {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}\n        expected ${e}\n        actual   ${a}`); }
};

/* -------------------------------------------------------------------------- */

const matchedRows = [
  { Project: 'M2Z2', Task: 'WW', Days: 34 },
  { Project: 'PW', Task: 'Social Media Planning', Days: 22 },
];
const unmatchedRows = [{ Project: 'Marketing', Task: 'Market Research', Days: 13 }];

/** The shape the Filter plugin actually returns. */
const filterOutput = {
  status: 'SUCCESS',
  message: 'Filter completed: 2 of 3 rows kept',
  data: matchedRows,
  unmatchedData: unmatchedRows,
  matchedRowCount: 2,
  unmatchedRowCount: 1,
  rowCount: 2,
  processingTimeMs: 3,
};

const filterNode: any = {
  id: 'n_filter',
  name: 'Filter rows',
  type: 'filter-rows',
  category: 'data-transform',
  outputPorts: FILTER_ROWS_ACTION.outputPorts,
};

/** A pre-ports node: no declared ports at all. */
const legacyNode: any = { id: 'n_excel', name: 'Microsoft Excel Input', type: 'excel-read' };

/* ── 1. Declaration ────────────────────────────────────────────────────── */

console.log('\n[1] PORT DECLARATION');
check('Filter declares two ports', getOutputPorts(filterNode).length, 2);
check('port ids', getOutputPorts(filterNode).map(p => p.id), ['matched', 'unmatched']);
check('matched is the default', getPrimaryPort(filterNode)?.id, 'matched');
check('unmatched is toned as an exception', findPort(filterNode, 'unmatched')?.tone, 'exception');
check('legacy node declares none', getOutputPorts(legacyNode), []);
check('hasDeclaredPorts false for legacy', hasDeclaredPorts(legacyNode), false);
check('hasDeclaredPorts true for filter', hasDeclaredPorts(filterNode), true);
check('Validate declares valid/invalid', (VALIDATE_ACTION.outputPorts ?? []).map(p => p.id), ['valid', 'invalid']);

/* ── 2. Backward compatibility — the load-bearing section ──────────────── */

console.log('\n[2] BACKWARD COMPATIBILITY — an unported edge is unchanged');
const legacyEdge: any = { id: 'c1', sourceId: 'n_filter', targetId: 'n_db' };

check('no sourcePort resolves to no port', resolveConnectionPort(filterNode, legacyEdge), undefined);
check(
  'unported edge carries the FULL output',
  routeConnection(filterNode, legacyEdge, filterOutput).payload,
  filterOutput
);
check('unported edge is never suppressed', routeConnection(filterNode, legacyEdge, filterOutput).skipped, false);
check(
  'unported edge on a legacy node carries the full output',
  routeConnection(legacyNode, legacyEdge, { rows: [1, 2] }).payload,
  { rows: [1, 2] }
);
check(
  'empty string sourcePort is treated as unported',
  routeConnection(filterNode, { ...legacyEdge, sourcePort: '   ' }, filterOutput).payload,
  filterOutput
);
check(
  'an edge naming a port the node does not declare still carries data',
  routeConnection(filterNode, { ...legacyEdge, sourcePort: 'ghost' }, filterOutput).payload,
  filterOutput
);

/* ── 3. Port payload selection ─────────────────────────────────────────── */

console.log('\n[3] PORT PAYLOAD SELECTION');
const matchedEdge: any = { id: 'c2', sourceId: 'n_filter', targetId: 'n_db', sourcePort: 'matched' };
const unmatchedEdge: any = { id: 'c3', sourceId: 'n_filter', targetId: 'n_csv', sourcePort: 'unmatched' };

check('matched edge carries only matched rows', routeConnection(filterNode, matchedEdge, filterOutput).payload, matchedRows);
check('unmatched edge carries only unmatched rows', routeConnection(filterNode, unmatchedEdge, filterOutput).payload, unmatchedRows);
check('matched record count', routeConnection(filterNode, matchedEdge, filterOutput).recordCount, 2);
check('unmatched record count', routeConnection(filterNode, unmatchedEdge, filterOutput).recordCount, 1);
check('neither branch is suppressed when both have rows', [
  routeConnection(filterNode, matchedEdge, filterOutput).skipped,
  routeConnection(filterNode, unmatchedEdge, filterOutput).skipped,
], [false, false]);

// The wrapped form: same plugin, response nested under an envelope.
const wrapped = { success: true, statusCode: 200, data: { data: matchedRows, unmatchedData: unmatchedRows } };
check(
  'port paths are envelope-relative',
  selectPortPayload(wrapped, findPort(filterNode, 'unmatched')),
  unmatchedRows
);

/* ── 4. Both halves survive — nothing is discarded ─────────────────────── */

console.log('\n[4] BOTH OUTPUTS REMAIN AVAILABLE');
const summary = summarisePorts(filterNode, filterOutput);
check('two branches summarised', summary.map(s => [s.label, s.recordCount]), [['Matched', 2], ['Unmatched', 1]]);
check('neither branch is absent', summary.map(s => s.absent), [false, false]);

// Routing down the matched edge must not destroy the unmatched set.
const ctx = createExecutionContext({ runId: 'r1', workflowId: 'w1', workflowName: 'Filter test', variables: [] });
ctx.recordNodeOutput(filterNode, filterOutput);
const downstream = ctx.buildScope({
  currentAction: { id: 'n_db', name: 'Matched Data', type: 'db' } as any,
  previousNodeId: 'n_filter',
  previousPortId: 'matched',
  previousPortPayload: matchedRows,
});
check(
  'a matched-branch step still reaches the unmatched rows by step name',
  resolveString('{{steps.FilterRows.unmatchedData[0].Project}}', downstream),
  'Marketing'
);
check(
  'and the full upstream output stays addressable',
  resolveString('{{previous.$output.unmatchedRowCount}}', downstream),
  1
);

/* ── 5. Per-branch `previous` — the fan-out bug ────────────────────────── */

console.log('\n[5] PER-BRANCH previous');
// Simulate the real fan-out order: Filter runs, then Matched, then Unmatched.
const ctx2 = createExecutionContext({ runId: 'r2', workflowId: 'w1', workflowName: 'Fan out', variables: [] });
ctx2.recordNodeOutput(filterNode, filterOutput);
const matchedNode: any = { id: 'n_matched', name: 'Matched Data', type: 'csv-write' };
ctx2.recordNodeOutput(matchedNode, { written: 2, file: 'matched.csv' });

// Without an override, `previous` is whatever ran last — Matched Data.
const noOverride = ctx2.buildScope({ currentAction: { id: 'n_unmatched', name: 'Unmatched Data' } as any });
check('unqualified previous is the last node run', resolveString('{{previous.$nodeName}}', noOverride), 'Matched Data');

// With the branch override the unmatched step sees Filter, not Matched Data.
const branchScoped = ctx2.buildScope({
  currentAction: { id: 'n_unmatched', name: 'Unmatched Data' } as any,
  previousNodeId: 'n_filter',
  previousPortId: 'unmatched',
  previousPortPayload: unmatchedRows,
});
check('branch previous is the real predecessor', resolveString('{{previous.$nodeName}}', branchScoped), 'Filter rows');
check('branch previous records its port', resolveString('{{previous.$port}}', branchScoped), 'unmatched');
check('{{previous.rows}} is the unmatched slice', resolveString('{{previous.rows[0].Project}}', branchScoped), 'Marketing');
check('{{previous.data}} is the unmatched slice too', resolveString('{{previous.data[0].Project}}', branchScoped), 'Marketing');
check('{{previous.output}} is the slice, not the envelope', resolveString('{{previous.output[0].Days}}', branchScoped), 13);

/* ── 6. Empty-branch suppression ───────────────────────────────────────── */

console.log('\n[6] EMPTY BRANCH SUPPRESSION');
const cleanRun = { ...filterOutput, data: matchedRows, unmatchedData: [], unmatchedRowCount: 0 };

check('exception branch is not taken on a clean run', routeConnection(filterNode, unmatchedEdge, cleanRun).skipped, true);
check('the main branch is never suppressed', routeConnection(filterNode, matchedEdge, cleanRun).skipped, false);
check(
  'suppression is reported in plain language',
  routeConnection(filterNode, unmatchedEdge, cleanRun).reason,
  'Unmatched carried 0 records — branch not taken'
);
check(
  'a single edge can force an always-send report',
  routeConnection(filterNode, { ...unmatchedEdge, metadata: { routeWhenEmpty: true } }, cleanRun).skipped,
  false
);
check(
  'a port without skipWhenEmpty routes even when empty',
  routeConnection(filterNode, matchedEdge, { ...filterOutput, data: [] }).skipped,
  false
);

console.log('\n[6b] countPortRecords distinguishes "no rows" from "not countable"');
check('array', countPortRecords([1, 2, 3]), 3);
check('empty array', countPortRecords([]), 0);
check('null is zero', countPortRecords(null), 0);
check('undefined is zero', countPortRecords(undefined), 0);
check('scalar is not countable', countPortRecords('done'), null);
check('bare object is not countable', countPortRecords({ ok: true }), null);
check('object with rows counts them', countPortRecords({ rows: [1, 2] }), 2);

/* ── 7. Wiring validation ──────────────────────────────────────────────── */

console.log('\n[7] WIRING VALIDATION');
const dbNode: any = { id: 'n_db', name: 'Database Insert', type: 'db-insert' };
const csvNode: any = { id: 'n_csv', name: 'CSV Report', type: 'csv-write' };

check(
  'a fully wired filter reports nothing',
  validatePortWiring([filterNode, dbNode, csvNode], [matchedEdge, unmatchedEdge]),
  []
);

const legacyOnly = validatePortWiring([filterNode, dbNode], [legacyEdge]);
check('unported edges on a ported node are an info, not an error', legacyOnly.map(i => i.severity), ['info']);

const ghost = validatePortWiring([filterNode, dbNode], [{ ...matchedEdge, sourcePort: 'ghost' } as any]);
check('an edge from a removed port is an error', ghost.filter(i => i.severity === 'error').length, 1);

const halfWired = validatePortWiring([filterNode, dbNode], [matchedEdge]);
check(
  'an unconnected exception port warns about dropped rows',
  halfWired.filter(i => i.severity === 'warning' && i.portId === 'unmatched').length,
  1
);

const collided = validatePortWiring(
  [filterNode, dbNode],
  [matchedEdge, { ...unmatchedEdge, targetId: 'n_db' } as any]
);
check(
  'both branches into one step is a warning',
  collided.filter(i => i.severity === 'warning' && i.message.includes('run twice')).length,
  1
);
check('a node with no ports is never reported', validatePortWiring([legacyNode, dbNode], [legacyEdge]), []);

/* -------------------------------------------------------------------------- */

console.log(`\n${pass} passed, ${fail} failed\n`);
if (fail > 0) process.exit(1);
