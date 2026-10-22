import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

let passed = 0;
let failed = 0;

function check(label, condition) {
  if (condition) {
    passed += 1;
    console.log(` PASS  ${label}`);
  } else {
    failed += 1;
    console.error(` FAIL  ${label}`);
  }
}

function expectThrows(label, fn, pattern) {
  try {
    fn();
    check(label, false);
  } catch (error) {
    check(label, pattern.test(String(error?.message ?? error)));
  }
}

function loadLoopModule() {
  const source = fs.readFileSync('src/lib/loopControl.ts', 'utf8');
  const transpiled = ts.transpileModule(source, {
    fileName: 'src/lib/loopControl.ts',
    reportDiagnostics: true,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      strict: true,
    },
  });

  const syntaxErrors = (transpiled.diagnostics ?? []).filter(
    (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error
  );
  check('loopControl.ts transpiles without syntax diagnostics', syntaxErrors.length === 0);

  const module = { exports: {} };
  const sandbox = {
    module,
    exports: module.exports,
    require(id) {
      throw new Error(`Unexpected runtime dependency from loopControl.ts: ${id}`);
    },
    console,
    Date,
    JSON,
    Object,
    Array,
    Number,
    String,
    Math,
    Set,
    Map,
    Error,
  };
  vm.runInNewContext(transpiled.outputText, sandbox, { filename: 'loopControl.compiled.cjs' });
  return module.exports;
}

const L = loadLoopModule();

// ── For Each ────────────────────────────────────────────────────────────────
const forEach = { id: 'foreach', name: 'For Each', type: 'workflow-for-each' };
let transition = L.advanceLoopState({
  action: forEach,
  frames: [],
  collectionValue: [{ id: 1 }, { id: 2 }, { id: 3 }],
  maxIterationsValue: 10,
  evaluate: () => true,
});
check('For Each enters Body', transition.route === L.LOOP_BODY_PORT);
check('For Each exposes first currentItem', transition.output.currentItem?.id === 1);
check('For Each currentIndex is zero-based', transition.output.currentIndex === 0);
check('For Each iteration is one-based', transition.output.iteration === 1);

let frames = L.captureLoopBodyOutput(transition.frames, { processed: 1 });
transition = L.advanceLoopState({
  action: forEach,
  frames,
  maxIterationsValue: 10,
  evaluate: () => true,
});
check('For Each advances to item 2', transition.output.currentItem?.id === 2);
check('For Each preserves completed result 1', transition.output.results.length === 1);

frames = L.captureLoopBodyOutput(transition.frames, { processed: 2 });
transition = L.advanceLoopState({
  action: forEach,
  frames,
  maxIterationsValue: 10,
  evaluate: () => true,
});
frames = L.captureLoopBodyOutput(transition.frames, { processed: 3 });
transition = L.advanceLoopState({
  action: forEach,
  frames,
  maxIterationsValue: 10,
  evaluate: () => true,
});
check('For Each exits through Done', transition.route === L.LOOP_DONE_PORT);
check('For Each records all three iteration results', transition.output.results.length === 3);
check('For Each pops its loop frame on Done', transition.frames.length === 0);

const datasetItems = L.normaliseLoopCollection({ rows: [{ id: 'A' }, { id: 'B' }] });
check('For Each accepts dataset rows', datasetItems.length === 2 && datasetItems[1].value.id === 'B');
const objectItems = L.normaliseLoopCollection({ east: 10, west: 20 });
check('For Each preserves object keys as currentKey', objectItems[0].key === 'east' && objectItems[1].key === 'west');
check('Loop maximum is hard-clamped to 10,000', L.normaliseLoopLimit(999999, 1000) === 10000);

// Scheduler identity contract: controller initial entry, body iteration and
// controller back-edge must all be distinct. Otherwise `executedExecutionKeys`
// would silently turn a loop back into a one-shot graph.
const identityFrame1 = L.createLoopFrame({
  action: forEach, kind: 'for-each', iteration: 1, currentIndex: 0,
  currentItem: 'A', maxIterations: 10, items: [],
});
const identityFrame2 = { ...identityFrame1, iteration: 2, currentIndex: 1, currentItem: 'B' };
check('Initial loop controller key is distinct from iteration-1 back-edge',
  L.loopExecutionKey('foreach', []) !== L.loopExecutionKey('foreach', [identityFrame1]));
check('Body execution key changes between loop iterations',
  L.loopExecutionKey('body', [identityFrame1]) !== L.loopExecutionKey('body', [identityFrame2]));

expectThrows(
  'For Each enforces maxIterations before partial execution',
  () => L.advanceLoopState({
    action: forEach,
    frames: [],
    collectionValue: [1, 2, 3],
    maxIterationsValue: 2,
    evaluate: () => true,
  }),
  /above its Maximum Iterations/
);

// ── While ───────────────────────────────────────────────────────────────────
const whileAction = { id: 'while', name: 'While', type: 'workflow-while' };
transition = L.advanceLoopState({
  action: whileAction,
  frames: [],
  condition: 'iteration <= 3',
  maxIterationsValue: 5,
  evaluate: (_condition, candidateFrames) => L.activeLoopFrame(candidateFrames).iteration <= 3,
});
for (let iteration = 1; iteration <= 3; iteration += 1) {
  check(`While executes iteration ${iteration}`, transition.route === L.LOOP_BODY_PORT);
  frames = L.captureLoopBodyOutput(transition.frames, { iteration });
  transition = L.advanceLoopState({
    action: whileAction,
    frames,
    condition: 'iteration <= 3',
    maxIterationsValue: 5,
    evaluate: (_condition, candidateFrames) => L.activeLoopFrame(candidateFrames).iteration <= 3,
  });
}
check('While exits when condition becomes false', transition.route === L.LOOP_DONE_PORT);
check('While records three results', transition.output.results.length === 3);

// ── Repeat Until ────────────────────────────────────────────────────────────
const repeatAction = { id: 'repeat', name: 'Repeat Until', type: 'workflow-repeat-until' };
transition = L.advanceLoopState({
  action: repeatAction,
  frames: [],
  condition: 'iteration >= 3',
  maxIterationsValue: 5,
  evaluate: (_condition, candidateFrames) => L.activeLoopFrame(candidateFrames).iteration >= 3,
});
check('Repeat Until always executes its first body', transition.route === L.LOOP_BODY_PORT);
for (let iteration = 1; iteration <= 3; iteration += 1) {
  frames = L.captureLoopBodyOutput(transition.frames, { iteration });
  transition = L.advanceLoopState({
    action: repeatAction,
    frames,
    condition: 'iteration >= 3',
    maxIterationsValue: 5,
    evaluate: (_condition, candidateFrames) => L.activeLoopFrame(candidateFrames).iteration >= 3,
  });
  if (iteration < 3) {
    check(`Repeat Until schedules iteration ${iteration + 1}`, transition.route === L.LOOP_BODY_PORT);
  }
}
check('Repeat Until exits when Until condition becomes true', transition.route === L.LOOP_DONE_PORT);
check('Repeat Until records three results', transition.output.results.length === 3);

// ── Nested context ──────────────────────────────────────────────────────────
const outer = L.createLoopFrame({
  action: { id: 'outer', name: 'Outer', type: 'workflow-for-each' },
  kind: 'for-each',
  iteration: 2,
  currentIndex: 1,
  currentItem: 'OUTER_ITEM',
  maxIterations: 10,
  items: [],
});
const inner = L.createLoopFrame({
  action: { id: 'inner', name: 'Inner', type: 'workflow-for-each' },
  kind: 'for-each',
  iteration: 4,
  currentIndex: 3,
  currentItem: 'INNER_ITEM',
  maxIterations: 10,
  items: [],
});
const aliases = L.loopRuntimeAliases([outer, inner]);
check('Nested currentItem resolves innermost item', aliases.currentItem === 'INNER_ITEM');
check('Nested currentIndex resolves innermost index', aliases.currentIndex === 3);
check('Nested iteration resolves innermost iteration', aliases.iteration === 4);
check('Nested loop.parent.currentItem resolves outer item', aliases.loop.parent.currentItem === 'OUTER_ITEM');
check('Nested execution key includes both loop frames', L.loopExecutionKey('node', [outer, inner]).includes('outer:2>inner:4'));

// ── Source integration guards ──────────────────────────────────────────────
const categories = fs.readFileSync('src/data/automationCategories.ts', 'utf8');
for (const type of [
  'workflow-for-each',
  'workflow-while',
  'workflow-repeat-until',
  'workflow-break',
  'workflow-continue',
]) {
  const matches = categories.match(new RegExp(`"type": "${type}"`, 'g')) ?? [];
  check(`${type} is registered exactly once`, matches.length === 1);
}

const workspace = fs.readFileSync('src/pages/WorkspaceEditorPage.tsx', 'utf8');
check('scheduler carries loopFrames per queue entry', workspace.includes('loopFrames: WorkflowLoopFrame[]'));
check('scheduler de-duplicates by executionKey', workspace.includes('executedExecutionKeys'));
check('scheduler integrates advanceLoopState', workspace.includes('advanceLoopState({'));
check('Break cancels queued current-iteration work', workspace.includes('Break cancels every not-yet-run task'));
check('Continue cancels queued current-iteration work', workspace.includes('Continue discards any sibling work'));
check('loop controller waits for sibling branch drain', workspace.includes('sameIterationWorkPending'));

const contextSource = fs.readFileSync('src/lib/executionContext.ts', 'utf8');
check('execution context exposes reserved currentItem', contextSource.includes('scope.currentItem = activeLoop.currentItem'));
check('execution context exposes reserved iteration', contextSource.includes('scope.iteration = activeLoop.iteration'));
check('retry attempt reset uses execution instance key', contextSource.includes('executionInstanceByNode'));

const bindingSource = fs.readFileSync('src/lib/bindingSources.ts', 'utf8');
check('Binding Picker includes Loop Context group', bindingSource.includes("id: 'loop-context'"));
check('Binding Picker exposes loop.parent.currentItem', bindingSource.includes('{{loop.parent.currentItem}}'));

const workflowNode = fs.readFileSync('src/components/WorkflowNode.tsx', 'utf8');
const startHelper = workflowNode.slice(
  workflowNode.indexOf('const isWorkflowStartAction'),
  workflowNode.indexOf('const isWorkflowEndAction')
);
check('loop nodes are not misclassified as Start by category', !startHelper.includes("category === 'workflow-control-001'"));

console.log(`\nV1 loop control tests: ${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
