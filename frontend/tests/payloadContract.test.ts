/**
 * Payload contract suite.
 *
 * Reproduces the reported failure — "the workflow succeeds until the last node,
 * which fails with a 400" — and proves the transformation layer fixes it
 * without changing the behaviour of payloads that already worked.
 *
 *   npm run test:payload-contract
 */

import { createExecutionContext } from '../src/lib/executionContext';
import { resolveDeep } from '../src/lib/expression';
import { deepParse } from '../src/lib/objectUtils';
import {
  canonicalType,
  coerceToContract,
  deepParseWithContract,
  renderAsText,
  validateAgainstContract,
  type PropertyContract,
} from '../src/lib/payloadContract';

let pass = 0;
let fail = 0;

const check = (name: string, actual: any, expected: any) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name}\n        expected ${e}\n        actual   ${a}`);
  }
};

/* -------------------------------------------------------------------------- */
/* The Microsoft Teams "send-chat" contract, copied from the service registry. */
/* -------------------------------------------------------------------------- */

const teamsContract: PropertyContract = {
  tenantId: { type: 'string', label: 'Tenant ID', required: true },
  channelId: { type: 'string', label: 'Channel ID', required: true },
  message: { type: 'string', label: 'Message', required: true },
  importance: { type: 'string', label: 'Importance', uiType: 'select' },
  emails: { type: 'array', label: 'Member Emails' },
};

console.log('\nTYPE CANONICALISATION');
check('string -> text', canonicalType({ type: 'string' }), 'text');
check('password -> text', canonicalType({ type: 'password' }), 'text');
check('select stays text', canonicalType({ type: 'string', uiType: 'select' }), 'text');
check('user-list -> array', canonicalType({ type: 'array', uiType: 'user-list' }), 'array');
check('file -> binary', canonicalType({ type: 'file' }), 'binary');
check('undeclared -> unknown', canonicalType(undefined), 'unknown');

/* -------------------------------------------------------------------------- */

console.log('\nROOT CAUSE 1 — container bound into a text field');

const ctx = createExecutionContext({
  runId: 'run_1',
  workflowId: 'wf_1',
  workflowName: 'Nightly Sync',
});

const readRows = { id: 'n1', name: 'Read Employees', type: 'db-query', category: 'database-004' } as any;
ctx.recordNodeOutput(readRows, {
  success: true,
  statusCode: 200,
  data: {
    rows: [
      { employeeId: 'E101', name: 'Umesh' },
      { employeeId: 'E102', name: 'Asha' },
    ],
    rowsAffected: 2,
  },
});

const scope = ctx.buildScope({});

// The exact node configuration a user builds in the canvas.
const nodeProperties = {
  tenantId: 'ACME',
  channelId: 'C-1',
  message: '{{previous.rows}}',
  emails: '{{previous.rows.first.employeeId}}',
};

const resolved = resolveDeep(nodeProperties, scope, { onMissing: 'keep' });

check('binding resolves to a real array (correct, by design)', Array.isArray((resolved as any).message), true);

// BEFORE — what the executor sends today.
const before = deepParse(resolved);
check('BEFORE: message is an array on the wire', Array.isArray((before as any).message), true);

// AFTER — with the contract layer.
const report = coerceToContract(deepParseWithContract(resolved, teamsContract), teamsContract);
check('AFTER: message is text', typeof report.payload.message, 'string');
check('AFTER: change was reported', report.issues.some((i) => i.path === 'message'), true);
check('AFTER: not a blocking error', report.errors.length, 0);
check(
  'AFTER: text is real JSON, so no data is lost',
  JSON.parse(report.payload.message)[0].employeeId,
  'E101'
);

/* -------------------------------------------------------------------------- */

console.log('\nROOT CAUSE 2 — deepParse corrupting legitimate JSON text');

const jsonTextNode = {
  tenantId: 'ACME',
  channelId: 'C-1',
  message: '{"orderId":"A-77","status":"shipped"}',
};

check(
  'BEFORE: deepParse turns the message into an object',
  typeof (deepParse(jsonTextNode) as any).message,
  'object'
);
check(
  'AFTER: contract-aware parse keeps it as text',
  typeof deepParseWithContract(jsonTextNode, teamsContract).message,
  'string'
);
check(
  'AFTER: the text is byte-identical',
  deepParseWithContract(jsonTextNode, teamsContract).message,
  '{"orderId":"A-77","status":"shipped"}'
);

/* -------------------------------------------------------------------------- */

console.log('\nROOT CAUSE 3 — scalar bound into a list field');

const single = coerceToContract({ emails: 'umesh@acme.com' }, teamsContract);
check('scalar is wrapped into a list', single.payload.emails, ['umesh@acme.com']);

const typedList = coerceToContract({ emails: 'a@x.com, b@x.com' }, teamsContract);
check('comma-separated text becomes a list', typedList.payload.emails, ['a@x.com', 'b@x.com']);

const alreadyList = coerceToContract({ emails: ['a@x.com'] }, teamsContract);
check('an existing list is untouched', alreadyList.changed, false);

/* -------------------------------------------------------------------------- */

console.log('\nREADABILITY — smart text rendering');

check('array of scalars joins readably', renderAsText(['a@x.com', 'b@x.com']), 'a@x.com, b@x.com');
check('object falls back to JSON', renderAsText({ total: 2 }), '{"total":2}');
check('number becomes text', renderAsText(42), '42');
check('null becomes empty text', renderAsText(null), '');
check('string passes through', renderAsText('hello'), 'hello');

/* -------------------------------------------------------------------------- */

console.log('\nNO REGRESSION — payloads that already worked');

const goodPayload = {
  tenantId: 'ACME',
  channelId: 'C-1',
  message: 'Nightly sync finished.',
  importance: 'high',
  emails: ['a@x.com'],
};
const untouched = coerceToContract(goodPayload, teamsContract);
check('a valid payload is unchanged', untouched.payload, goodPayload);
check('a valid payload reports no issues', untouched.issues.length, 0);

const extraKeys = coerceToContract(
  { ...goodPayload, undeclaredField: { keep: 'me' } },
  teamsContract
);
check(
  'fields absent from the contract pass through untouched',
  extraKeys.payload.undeclaredField,
  { keep: 'me' }
);

const noContract = coerceToContract(goodPayload, null);
check('a missing contract is a no-op', noContract.payload, goodPayload);

/* -------------------------------------------------------------------------- */

console.log('\nNUMBER / BOOLEAN CONTRACTS');

const settingsContract: PropertyContract = {
  timeoutInSeconds: { type: 'number', label: 'Timeout' },
  ignoreSslVerification: { type: 'boolean', label: 'Ignore SSL' },
};

check(
  'numeric text becomes a number',
  coerceToContract({ timeoutInSeconds: '60' }, settingsContract).payload.timeoutInSeconds,
  60
);
check(
  'boolean text becomes a boolean',
  coerceToContract({ ignoreSslVerification: 'true' }, settingsContract).payload.ignoreSslVerification,
  true
);
check(
  'unparseable number is a blocking error',
  coerceToContract({ timeoutInSeconds: 'soon' }, settingsContract).errors.length,
  1
);

/* -------------------------------------------------------------------------- */

console.log('\nPRE-FLIGHT VALIDATION');

const missing = validateAgainstContract({ tenantId: 'ACME', channelId: '', message: 'hi' }, teamsContract);
check('a missing required field is caught before sending', missing.some((i) => i.path === 'channelId' && i.severity === 'error'), true);

const unresolved = validateAgainstContract(
  { tenantId: 'ACME', channelId: 'C-1', message: '{{steps.Missing.value}}' },
  teamsContract
);
check('an unresolved binding is flagged', unresolved.some((i) => i.path === 'message'), true);

const clean = validateAgainstContract(goodPayload, teamsContract);
check('a complete payload raises nothing', clean.length, 0);

/* -------------------------------------------------------------------------- */

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
