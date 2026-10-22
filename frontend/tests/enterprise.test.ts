/**
 * Verification suite for the enterprise runtime layer added in Phase 4:
 * retries/backoff, the debugger, versioning, scheduling, queueing and typed
 * variables.
 *
 * Written against the real `src/lib` modules — the same code the executor runs,
 * not a copy — so a regression here is a regression in the product.
 *
 *   npm run test:enterprise
 */

import {
  computeBackoffDelay,
  describeRetryOutcome,
  extractStatusCode,
  isRetryableError,
  NodeTimeoutError,
  normalizeRetryPolicy,
  policyHasRetries,
  resolveErrorStrategy,
  runGuarded,
  runWithRetry,
  withTimeout,
} from '../src/lib/retryPolicy';
import { createDebugSession } from '../src/lib/workflowDebugger';
import {
  captureVersion,
  diffVersions,
  nextVersionNumber,
  restoreVersion,
} from '../src/lib/workflowVersioning';
import {
  cronMatches,
  describeCron,
  evaluateSchedule,
  formatInterval,
  nextCronRun,
  parseCron,
  parseInterval,
} from '../src/lib/scheduler';
import { createExecutionQueue, mapWithConcurrency } from '../src/lib/executionQueue';
import {
  coerceVariableValue,
  effectiveValue,
  toRuntimeValues,
  validateVariable,
  validateVariables,
} from '../src/lib/variableTypes';
import { createExecutionContext } from '../src/lib/executionContext';

let pass = 0, fail = 0;
const check = (name: string, actual: any, expected: any) => {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}\n        expected ${e}\n        actual   ${a}`); }
};
const ok = (name: string, condition: boolean) => check(name, Boolean(condition), true);

const main = async () => {

/* ========================================================================== */
console.log('\n[1] Retry policy normalisation');
/* ========================================================================== */

check('no config = one attempt', normalizeRetryPolicy({}).maxAttempts, 1);
check('retries:2 = 3 attempts', normalizeRetryPolicy({ retries: 2 }).maxAttempts, 3);
check('retryDelay respected', normalizeRetryPolicy({ retries: 1, retryDelay: 250 }).initialDelayMs, 250);
check('timeout read from action', normalizeRetryPolicy({ timeout: 5000 }).timeoutMs, 5000);
check('timeout read from api', normalizeRetryPolicy({ api: { timeout: 9000 } }).timeoutMs, 9000);
check('nested policy honoured', normalizeRetryPolicy({ api: { retryPolicy: { maxAttempts: 4, strategy: 'linear' } } }).strategy, 'linear');
check('attempts clamped', normalizeRetryPolicy({ retries: 999 }).maxAttempts, 25);
check('policyHasRetries false by default', policyHasRetries(normalizeRetryPolicy({})), false);
check('policyHasRetries true when set', policyHasRetries(normalizeRetryPolicy({ retries: 1 })), true);

/* ========================================================================== */
console.log('\n[2] Backoff maths');
/* ========================================================================== */

const fixed = normalizeRetryPolicy({ retries: 5, retryDelay: 100, api: { retryPolicy: { strategy: 'fixed', jitter: false } } });
check('fixed 1', computeBackoffDelay(fixed, 1), 100);
check('fixed 3', computeBackoffDelay(fixed, 3), 100);

const linear = normalizeRetryPolicy({ retries: 5, retryDelay: 100, api: { retryPolicy: { strategy: 'linear', jitter: false } } });
check('linear 1', computeBackoffDelay(linear, 1), 100);
check('linear 3', computeBackoffDelay(linear, 3), 300);

const expo = normalizeRetryPolicy({ retries: 5, retryDelay: 100, api: { retryPolicy: { strategy: 'exponential', jitter: false } } });
check('exponential 1', computeBackoffDelay(expo, 1), 100);
check('exponential 4', computeBackoffDelay(expo, 4), 800);

const capped = normalizeRetryPolicy({ retries: 20, retryDelay: 1000, api: { retryPolicy: { jitter: false, maxDelayMs: 5000 } } });
check('capped at maxDelay', computeBackoffDelay(capped, 12), 5000);
ok('jitter stays within band', (() => {
  const jittered = normalizeRetryPolicy({ retries: 3, retryDelay: 1000, api: { retryPolicy: { strategy: 'fixed', jitter: true } } });
  const value = computeBackoffDelay(jittered, 1, () => 0);
  return value >= 500 && value <= 1000;
})());

/* ========================================================================== */
console.log('\n[3] Error classification');
/* ========================================================================== */

check('503 retryable', isRetryableError({ status: 503 }), true);
check('429 retryable', isRetryableError({ status: 429 }), true);
check('404 not retryable', isRetryableError({ status: 404 }), false);
check('401 not retryable', isRetryableError({ status: 401 }), false);
check('timeout retryable', isRetryableError(new Error('Request timed out')), true);
check('ECONNRESET retryable', isRetryableError(new Error('socket ECONNRESET')), true);
check('unauthorized not retryable', isRetryableError(new Error('Unauthorized')), false);
check('explicit flag wins', isRetryableError({ status: 500, retryable: false }), false);
check('status wins over wording', isRetryableError({ status: 404, message: 'network' }), false);
check('extract nested status', extractStatusCode({ response: { status: 502 } }), 502);
check('extract from message', extractStatusCode(new Error('API error: status 503')), 503);

/* ========================================================================== */
console.log('\n[4] runWithRetry');
/* ========================================================================== */

let calls = 0;
const recovered = await runWithRetry(
  async () => { calls += 1; if (calls < 3) throw new Error('ECONNRESET'); return 'done'; },
  { ...normalizeRetryPolicy({ retries: 4 }), initialDelayMs: 1, maxDelayMs: 1, jitter: false }
);
check('recovers on 3rd attempt', [recovered.ok, recovered.value, recovered.attempts], [true, 'done', 3]);

calls = 0;
const exhausted = await runWithRetry(
  async () => { calls += 1; throw new Error('503 service unavailable'); },
  { ...normalizeRetryPolicy({ retries: 2 }), initialDelayMs: 1, maxDelayMs: 1, jitter: false }
);
check('gives up after budget', [exhausted.ok, exhausted.attempts], [false, 3]);

calls = 0;
const permanent = await runWithRetry(
  async () => { calls += 1; throw Object.assign(new Error('Not found'), { status: 404 }); },
  { ...normalizeRetryPolicy({ retries: 5 }), initialDelayMs: 1, maxDelayMs: 1, jitter: false }
);
check('permanent failure not retried', [permanent.ok, permanent.attempts], [false, 1]);

const singleAttempt = await runWithRetry(async () => 'x', normalizeRetryPolicy({}));
check('unconfigured node runs once', singleAttempt.attempts, 1);

let aborted = 0;
const abortOutcome = await runWithRetry(
  async () => { aborted += 1; throw new Error('503'); },
  { ...normalizeRetryPolicy({ retries: 5 }), initialDelayMs: 1, maxDelayMs: 1, jitter: false },
  { shouldAbort: () => aborted >= 2 }
);
check('abort stops the retry loop', [abortOutcome.ok, aborted], [false, 2]);
ok('outcome describes itself', /attempt/.test(describeRetryOutcome(exhausted)));

/* ========================================================================== */
console.log('\n[5] Timeouts');
/* ========================================================================== */

const slow = new Promise((resolve) => setTimeout(() => resolve('late'), 60));
let timedOut = false;
try { await withTimeout(slow, 10, 'Slow node'); } catch (error: any) { timedOut = error instanceof NodeTimeoutError; }
check('withTimeout rejects', timedOut, true);
check('fast promise passes through', await withTimeout(Promise.resolve('fast'), 50), 'fast');
check('zero disables timeout', await withTimeout(Promise.resolve('always'), 0), 'always');

const timeoutOutcome = await runWithRetry(
  () => new Promise((resolve) => setTimeout(() => resolve('never'), 100)),
  { ...normalizeRetryPolicy({ retries: 1, timeout: 10 }), initialDelayMs: 1, jitter: false }
);
check('timeout recorded on outcome', [timeoutOutcome.ok, timeoutOutcome.timedOut], [false, true]);

/* ========================================================================== */
console.log('\n[6] Error strategy / try-catch-finally');
/* ========================================================================== */

check('default continues', resolveErrorStrategy({}).action, 'continue');
check('stop honoured', resolveErrorStrategy({ onError: 'stop' }).action, 'stop');
check('fallback resolves', resolveErrorStrategy({ onError: 'fallback', fallbackActionId: 'n9' }, new Set(['n9'])).action, 'fallback');
check('unreachable fallback degrades', resolveErrorStrategy({ onError: 'fallback', fallbackActionId: 'gone' }, new Set(['n9'])).action, 'continue');
check('exhausted retry continues', resolveErrorStrategy({ onError: 'retry' }).action, 'continue');

let cleanup = 0;
const guarded = await runGuarded({
  try: async () => { throw new Error('boom'); },
  catch: async () => 'recovered',
  finally: async () => { cleanup += 1; },
});
check('catch recovers, finally runs', [guarded.ok, guarded.value, guarded.recovered, cleanup], [true, 'recovered', true, 1]);

cleanup = 0;
const guardedOk = await runGuarded({ try: async () => 'fine', finally: async () => { cleanup += 1; } });
check('finally runs on success', [guardedOk.ok, guardedOk.value, cleanup], [true, 'fine', 1]);

let finallyError: string | null = null;
const guardedCleanupFails = await runGuarded({
  try: async () => { throw new Error('real failure'); },
  finally: async () => { throw new Error('cleanup failed'); },
  onFinallyError: (error) => { finallyError = error.message; },
});
check('cleanup error never masks the real one', [guardedCleanupFails.error?.message, finallyError], ['real failure', 'cleanup failed']);

/* ========================================================================== */
console.log('\n[7] Debugger');
/* ========================================================================== */

const session = createDebugSession();
const nodeA: any = { id: 'a', name: 'Read Excel' };
const nodeB: any = { id: 'b', name: 'Insert Database' };

check('no breakpoints initially', session.getBreakpoints().length, 0);
check('toggle adds', session.toggleBreakpoint('a'), true);
check('toggle removes', session.toggleBreakpoint('a'), false);

session.setBreakpoint('b', { enabled: true });
session.setEnabled(true);
session.beginRun();

check('active ids expose the breakpoint', [...session.activeBreakpointIds()], ['b']);
check('node without a breakpoint runs through', await session.beforeNode(nodeA, {}, 1), 'continue');

// A breakpoint parks the loop; resuming releases it.
let released = false;
const parked = session.beforeNode(nodeB, {}, 2).then((gate) => { released = true; return gate; });
await new Promise((resolve) => setTimeout(resolve, 5));
check('run is parked at the breakpoint', [session.isPaused(), released], [true, false]);
check('paused node reported', session.getPausedAt()?.nodeName, 'Insert Database');
session.resume();
check('resume releases the gate', await parked, 'continue');

// Conditional breakpoints.
session.setBreakpoint('a', { enabled: true, condition: 'previous.rowsAffected === 0' });
check('condition false does not stop', await session.beforeNode(nodeA, { previous: { rowsAffected: 5 } }, 3), 'continue');
const conditionHit = session.beforeNode(nodeA, { previous: { rowsAffected: 0 } }, 4);
await new Promise((resolve) => setTimeout(resolve, 5));
check('condition true stops', session.isPaused(), true);
session.resume();
await conditionHit;

// Tracepoints log instead of stopping.
session.setBreakpoint('a', { enabled: true, condition: undefined, logOnly: true });
check('log-only never parks', await session.beforeNode(nodeA, {}, 5), 'continue');
check('log-only leaves state running', session.isPaused(), false);

// Abort unwinds a parked run.
session.setBreakpoint('b', { enabled: true, logOnly: false });
const aborting = session.beforeNode(nodeB, {}, 6);
await new Promise((resolve) => setTimeout(resolve, 5));
session.abort();
check('abort returns the abort gate', await aborting, 'abort');

// Watches read the live scope.
session.addWatch('previous.employeeId');
const watches = session.evaluateWatches({ previous: { employeeId: 'E101' } });
check('watch resolves', watches[0].value, 'E101');
const missingWatch = session.evaluateWatches({ previous: {} });
ok('unresolved watch explains itself', Boolean(missingWatch[0].error));

// Breakpoints survive the run, as in an IDE.
session.endRun();
check('breakpoints survive endRun', session.getBreakpoints().length > 0, true);

/* ========================================================================== */
console.log('\n[8] Retry keeps step numbering intact');
/* ========================================================================== */

const ctx = createExecutionContext({ runId: 'r1', workflowId: 'w1' });
const stepOne: any = { id: 's1', name: 'Read Excel', type: 'excel' };
const stepTwo: any = { id: 's2', name: 'Insert Database', type: 'sql' };

ctx.recordNodeStart(stepOne);
ctx.recordNodeOutput(stepOne, { employeeId: 'E101' });
// A retry re-enters recordNodeStart; the sequence must not advance.
ctx.recordNodeStart(stepTwo);
ctx.recordNodeStart(stepTwo);
ctx.recordNodeStart(stepTwo);
ctx.recordNodeOutput(stepTwo, { rowsAffected: 1 });

const records = ctx.getRecords();
check('sequences stay contiguous', records.map((record) => record.sequence), [1, 2]);
check('attempt count is reported', records[1].attempt, 3);
check('first node still attempt 1', records[0].attempt, 1);

/* ========================================================================== */
console.log('\n[9] Versioning');
/* ========================================================================== */

check('first version', nextVersionNumber(undefined), '1.0.0');
check('patch bump', nextVersionNumber('1.2.3'), '1.2.4');
check('partial version', nextVersionNumber('2'), '2.0.1');

const baseState = {
  name: 'Onboarding',
  actions: [
    { id: 'a', name: 'Read Excel', type: 'excel', properties: { path: 'in.xlsx' }, status: 'completed' },
    { id: 'b', name: 'Insert DB', type: 'sql', properties: {} },
  ] as any,
  connections: [{ id: 'c1', sourceId: 'a', targetId: 'b' }] as any,
  variables: [{ id: 'v1', name: 'tenantId', type: 'string', value: 'ACME' }] as any,
};

const v1 = captureVersion(baseState, { workflowId: 'w1', version: '1.0.0' });
check('runtime state stripped', (v1.state.actions[0] as any).status, undefined);
check('stats captured', [v1.stats.actions, v1.stats.connections, v1.stats.variables], [2, 1, 1]);

const v2 = captureVersion(
  {
    ...baseState,
    actions: [
      { id: 'a', name: 'Read Employee Excel', type: 'excel', properties: { path: 'in.xlsx' } },
      { id: 'c', name: 'Send Email', type: 'email', properties: {} },
    ] as any,
  },
  { workflowId: 'w1', version: '1.0.1' }
);

const diff = diffVersions(v1, v2);
check('diff counts', [diff.summary.added, diff.summary.removed, diff.summary.modified], [1, 1, 1]);
check('rename detected as a field change', diff.entries.find((e) => e.id === 'a')?.changes[0].field, 'name');
check('identical versions produce no diff', diffVersions(v1, captureVersion(baseState, { workflowId: 'w1', version: '1.0.0' })).identical, true);

const restored = restoreVersion(v1);
restored.actions[0].name = 'Mutated';
check('restore returns a copy', v1.state.actions[0].name, 'Read Excel');

/* ========================================================================== */
console.log('\n[10] Cron + scheduling');
/* ========================================================================== */

check('valid cron parses', parseCron('0 9 * * 1-5').ok, true);
check('macro expands', parseCron('@daily').fields?.hours, [0]);
check('step values', parseCron('*/15 * * * *').fields?.minutes, [0, 15, 30, 45]);
check('named days', parseCron('0 9 * * mon,fri').fields?.daysOfWeek, [1, 5]);
check('sunday as 7', parseCron('0 0 * * 7').fields?.daysOfWeek, [0]);
check('wrong field count rejected', parseCron('0 9 * *').ok, false);
check('bad minute rejected', parseCron('99 * * * *').ok, false);
check('garbage rejected', parseCron('not a cron').ok, false);

const weekday9am = parseCron('0 9 * * 1-5').fields!;
check('matches Monday 09:00', cronMatches(weekday9am, new Date(2026, 6, 27, 9, 0)), true);
check('rejects Sunday 09:00', cronMatches(weekday9am, new Date(2026, 6, 26, 9, 0)), false);
check('rejects Monday 09:01', cronMatches(weekday9am, new Date(2026, 6, 27, 9, 1)), false);

const next = nextCronRun('0 9 * * 1-5', new Date(2026, 6, 27, 10, 0));
check('next run is the following weekday 09:00', [next?.getDate(), next?.getHours()], [28, 9]);
check('impossible cron returns null', nextCronRun('0 0 30 2 *'), null);

check('interval seconds', parseInterval('30s'), 30_000);
check('interval minutes', parseInterval('5m'), 300_000);
check('compound interval', parseInterval('1h30m'), 5_400_000);
check('bare number is ms', parseInterval('4500'), 4500);
check('bad interval rejected', parseInterval('soon'), null);
check('interval formats back', formatInterval(5_400_000), '1h 30m');

const intervalEval = evaluateSchedule({ enabled: true, type: 'interval', value: '5m' }, new Date(2026, 6, 27, 10, 0));
check('interval next run', intervalEval.nextRun?.getMinutes(), 5);
check('invalid schedule reports why', evaluateSchedule({ enabled: true, type: 'interval', value: 'nope' }).ok, false);
check('disabled schedule has no next run', evaluateSchedule({ enabled: false, type: 'cron', value: '@daily' }).nextRun, null);
ok('cron describes itself', describeCron('0 9 * * 1-5').includes('Monday'));

/* ========================================================================== */
console.log('\n[11] Execution queue');
/* ========================================================================== */

const queue = createExecutionQueue({ concurrency: 2 });
let peak = 0, active = 0;
const track = async (ms: number) => {
  active += 1; peak = Math.max(peak, active);
  await new Promise((resolve) => setTimeout(resolve, ms));
  active -= 1;
  return ms;
};

await Promise.all([10, 10, 10, 10, 10].map((ms) => queue.add(() => track(ms))));
check('concurrency ceiling respected', peak <= 2, true);
check('all tasks completed', queue.stats().completed, 5);

const order: string[] = [];
const serial = createExecutionQueue({ concurrency: 1 });
const priorityRun = [
  serial.add(async () => { order.push('low'); }, { priority: 1 }),
  serial.add(async () => { order.push('high'); }, { priority: 10 }),
  serial.add(async () => { order.push('mid'); }, { priority: 5 }),
];
await Promise.all(priorityRun);
check('higher priority runs first', order, ['low', 'high', 'mid']);

const failing = createExecutionQueue({ concurrency: 1 });
let caught = '';
await failing.add(async () => { throw new Error('nope'); }).catch((error: Error) => { caught = error.message; });
check('task failure surfaces', [caught, failing.stats().failed], ['nope', 1]);

const mapped = await mapWithConcurrency([1, 2, 3], 2, async (item) => {
  if (item === 2) throw new Error('bad item');
  return item * 10;
});
check('map keeps good results despite a failure', mapped.map((entry) => entry.ok ? entry.value : 'ERR'), [10, 'ERR', 30]);
check('map preserves order', mapped.map((entry) => entry.index), [0, 1, 2]);

await queue.onIdle();
check('onIdle resolves when drained', queue.stats().pending, 0);

/* ========================================================================== */
console.log('\n[12] Typed variables');
/* ========================================================================== */

check('string coercion', coerceVariableValue(42, 'string').value, '42');
check('number coercion', coerceVariableValue('42', 'number').value, 42);
check('number with separators', coerceVariableValue('1,250', 'number').value, 1250);
check('bad number rejected', coerceVariableValue('abc', 'number').ok, false);
check('boolean words', [coerceVariableValue('yes', 'boolean').value, coerceVariableValue('off', 'boolean').value], [true, false]);
check('json array parsed', coerceVariableValue('["a","b"]', 'array').value, ['a', 'b']);
check('comma list becomes array', coerceVariableValue('a, b, c', 'array').value, ['a', 'b', 'c']);
check('json object parsed', coerceVariableValue('{"k":1}', 'object').value, { k: 1 });
check('bad object rejected', coerceVariableValue('{oops', 'object').ok, false);
check('binding token passes through untouched', coerceVariableValue('{{previous.count}}', 'number').value, '{{previous.count}}');

check('required + empty fails', validateVariable({ id: 'v', name: 'employeeId', type: 'string', value: '', required: true } as any).length, 1);
check('valid variable passes', validateVariable({ id: 'v', name: 'employeeId', type: 'string', value: 'E101' } as any).length, 0);
check('min rule enforced', validateVariable({ id: 'v', name: 'retries', type: 'number', value: 2, validationRules: { min: 5 } } as any)[0].rule, 'min');
check('pattern rule enforced', validateVariable({ id: 'v', name: 'email', type: 'string', value: 'nope', validationRules: { pattern: '^\\S+@\\S+$' } } as any)[0].rule, 'pattern');
check('enum rule enforced', validateVariable({ id: 'v', name: 'env', type: 'string', value: 'staging', validationRules: { enum: ['dev', 'prod'] } } as any)[0].rule, 'enum');
check('deferred value is not judged early', validateVariable({ id: 'v', name: 'count', type: 'number', value: '{{previous.total}}', validationRules: { min: 10 } } as any).length, 0);

const duplicates = validateVariables([
  { id: '1', name: 'tenantId', type: 'string', value: 'A' },
  { id: '2', name: 'tenantId', type: 'string', value: 'B' },
] as any);
check('duplicate names reported', [duplicates.valid, duplicates.errors[0].rule], [false, 'duplicate']);

check('default fills in when value is blank', effectiveValue({ id: 'v', name: 'n', type: 'number', value: '', defaultValue: 7 } as any), 7);
check('runtime values are coerced', toRuntimeValues([{ id: 'v', name: 'count', type: 'number', value: '5' }] as any), { count: 5 });

/* ========================================================================== */
console.log('\n==============================================');
console.log(`  ${pass} passed, ${fail} failed`);
console.log('==============================================\n');
if (fail > 0) process.exit(1);

};

main().catch((error) => {
  console.error('Suite crashed:', error);
  process.exit(1);
});
