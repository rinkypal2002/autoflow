'use strict';

const assert = require('assert');
const { createPluginExecutor } = require('../orchestrator/pluginExecutor');
const { createWorkflowOrchestrator } = require('../orchestrator/workflowOrchestrator');
const { assertOrch4CRepeatUntilWorkflow } = require('../orchestrator/workflowGraph');
const { evaluateCondition } = require('../orchestrator/canonical/lib/expression');
const {
  LOOP_BODY_PORT,
  LOOP_DONE_PORT,
  advanceLoopState,
  captureLoopBodyOutput,
  loopExecutionKey,
  loopRuntimeAliases,
} = require('../orchestrator/canonical/lib/loopControl');

function conditionScope(frames, previous = undefined) {
  const aliases = loopRuntimeAliases(frames);
  return {
    previous,
    ...aliases,
    runtime: { ...aliases },
  };
}

function repeatUntilWorkflow(condition = '{{iteration}} >= 3', maxIterations = 1000) {
  return {
    id: 'wf-orch4c',
    name: 'ORCH4C Repeat Until Test',
    version: 42,
    variables: [],
    actions: [
      { id: 's', type: 'workflow-start', name: 'Start', isControlNode: true },
      {
        id: 'loop',
        type: 'workflow-repeat-until',
        name: 'Repeat Until',
        isControlNode: true,
        properties: {
          condition,
          maxIterations,
        },
        outputPorts: [
          { id: 'body', label: 'Body', payloadPath: 'body', isDefault: true },
          { id: 'done', label: 'Done', payloadPath: 'results', optional: true },
        ],
      },
      {
        id: 'body',
        type: 'extract-fields',
        category: 'data-transform-017',
        name: 'Repeat Body',
        properties: {
          iteration: '{{iteration}}',
          currentIndex: '{{currentIndex}}',
        },
        api: {
          url: '/engine/api/orch4c/body',
          method: 'POST',
          body: {
            iteration: '{{iteration}}',
            currentIndex: '{{currentIndex}}',
          },
        },
      },
      { id: 'e', type: 'workflow-end', name: 'End', isControlNode: true },
    ],
    connections: [
      { id: 'c1', sourceId: 's', targetId: 'loop' },
      { id: 'c2', sourceId: 'loop', targetId: 'body', sourcePort: 'body' },
      { id: 'c3', sourceId: 'body', targetId: 'loop' },
      { id: 'c4', sourceId: 'loop', targetId: 'e', sourcePort: 'done' },
    ],
  };
}

function executorFor(requests) {
  return createPluginExecutor({
    repository: { listMappings: async () => [] },
    http: {
      request: async (request) => {
        requests.push(request);
        if (!request.url.endsWith('/engine/api/orch4c/body')) {
          throw new Error(`Unexpected URL ${request.url}`);
        }
        return {
          status: 200,
          data: {
            iteration: request.data.iteration,
            currentIndex: request.data.currentIndex,
          },
        };
      },
    },
  });
}

(async () => {
  const loopAction = repeatUntilWorkflow().actions[1];
  let frames = [];
  const results = [];
  for (;;) {
    const previous = results.at(-1) || { seed: true };
    const transition = advanceLoopState({
      action: loopAction,
      frames,
      inputData: previous,
      condition: '{{iteration}} >= 3',
      maxIterationsValue: 1000,
      evaluate: (condition, candidateFrames) =>
        evaluateCondition(condition, conditionScope(candidateFrames, previous)),
    });
    if (transition.route === LOOP_DONE_PORT) {
      assert.deepStrictEqual(
        transition.output.results.map((row) => row.output.iteration),
        [1, 2, 3]
      );
      break;
    }
    assert.strictEqual(transition.route, LOOP_BODY_PORT);
    const aliases = loopRuntimeAliases(transition.frames);
    assert.strictEqual(aliases.currentIndex, aliases.iteration - 1);
    const output = { iteration: aliases.iteration };
    results.push(output);
    frames = captureLoopBodyOutput(transition.frames, output);
  }
  console.log(' PASS  ORCH-4C ports canonical post-test Repeat Until semantics and exits after iteration 3 makes the condition true');

  const first = advanceLoopState({
    action: loopAction,
    frames: [],
    inputData: { seed: true },
    condition: '{{iteration}} >= 1',
    maxIterationsValue: 1000,
    evaluate: () => true,
  });
  assert.strictEqual(first.route, LOOP_BODY_PORT);
  const aliases = loopRuntimeAliases(first.frames);
  assert.strictEqual(aliases.iteration, 1);
  assert.strictEqual(aliases.currentIndex, 0);
  assert.strictEqual(aliases.currentKey, 0);
  assert.strictEqual(loopExecutionKey('body', first.frames), 'body@@loop:1');
  console.log(' PASS  ORCH-4C exposes one-based iteration, zero-based index/key and stable per-iteration execution keys');

  const graph = assertOrch4CRepeatUntilWorkflow(repeatUntilWorkflow());
  assert.strictEqual(graph.loop.id, 'loop');
  assert.strictEqual(graph.bodyPlugin.id, 'body');
  assert.strictEqual(graph.bodyConnection.sourcePort, 'body');
  assert.strictEqual(graph.doneConnection.sourcePort, 'done');
  const wrongControl = repeatUntilWorkflow();
  wrongControl.actions[1] = { ...wrongControl.actions[1], type: 'workflow-while', name: 'While' };
  assert.throws(() => assertOrch4CRepeatUntilWorkflow(wrongControl), /Repeat Until|unsupported control/i);
  const wrongCycle = repeatUntilWorkflow();
  wrongCycle.connections[2] = { id: 'c3', sourceId: 'body', targetId: 'body' };
  assert.throws(() => assertOrch4CRepeatUntilWorkflow(wrongCycle), /controlled cycle|wiring/i);
  console.log(' PASS  ORCH-4C accepts only the certified Start -> Repeat Until Body -> plugin -> Repeat Until / Done -> End cycle');

  const wf = repeatUntilWorkflow();
  const requests = [];
  const snapshots = [];
  const orchestrator = createWorkflowOrchestrator({
    workspaceKey: 'default',
    getWorkflow: async () => wf,
    upsertExecutionSnapshot: async (_workflowId, snapshot) => {
      snapshots.push(snapshot);
      return { executionId: 'exec-orch4c', runId: snapshot.runId, status: snapshot.status };
    },
    pluginExecutor: executorFor(requests),
  });
  const result = await orchestrator.executeWorkflow(wf.id);
  assert.ok(result.runId.startsWith('orch4c-'));
  assert.strictEqual(result.status, 'completed');
  assert.strictEqual(requests.length, 3);
  assert.deepStrictEqual(requests.map((request) => request.data.iteration), [1, 2, 3]);
  assert.deepStrictEqual(requests.map((request) => request.data.currentIndex), [0, 1, 2]);
  assert.strictEqual(result.nodeCount, 9);
  assert.deepStrictEqual(result.output.map((row) => row.output.iteration), [1, 2, 3]);
  console.log(' PASS  ORCH-4C executes a real three-iteration Repeat Until loop with server-side iteration bindings');

  const finalRecords = snapshots.at(-1).executionInstances;
  const bodyRecords = finalRecords.filter((record) => record.nodeId === 'body');
  const loopRecords = finalRecords.filter((record) => record.nodeId === 'loop');
  assert.deepStrictEqual(bodyRecords.map((record) => record.executionInstanceKey), [
    'body@@loop:1', 'body@@loop:2', 'body@@loop:3',
  ]);
  assert.deepStrictEqual(loopRecords.map((record) => record.executionInstanceKey), [
    'loop', 'loop@@loop:1', 'loop@@loop:2', 'loop@@loop:3',
  ]);
  assert.strictEqual(new Set(finalRecords.map((record) => record.executionInstanceKey)).size, finalRecords.length);
  assert.strictEqual(finalRecords.filter((record) => record.nodeId === 'e').length, 1);
  console.log(' PASS  ORCH-4C persists separate Repeat Until/body execution instances and executes End once');

  const immediatelyTrue = repeatUntilWorkflow('{{iteration}} >= 1');
  const trueRequests = [];
  const trueSnapshots = [];
  const trueOrchestrator = createWorkflowOrchestrator({
    workspaceKey: 'default',
    getWorkflow: async () => immediatelyTrue,
    upsertExecutionSnapshot: async (_workflowId, snapshot) => {
      trueSnapshots.push(snapshot);
      return { executionId: 'exec-orch4c-true', runId: snapshot.runId, status: snapshot.status };
    },
    pluginExecutor: executorFor(trueRequests),
  });
  const trueResult = await trueOrchestrator.executeWorkflow(immediatelyTrue.id);
  assert.strictEqual(trueResult.status, 'completed');
  assert.strictEqual(trueRequests.length, 1);
  assert.strictEqual(trueResult.nodeCount, 5);
  assert.deepStrictEqual(trueResult.output.map((row) => row.output.iteration), [1]);
  assert.deepStrictEqual(trueSnapshots.at(-1).outputs.map((record) => record.nodeId), ['s', 'loop', 'body', 'loop', 'e']);
  console.log(' PASS  ORCH-4C always executes the first Body before evaluating the Until condition');

  const guarded = repeatUntilWorkflow('{{iteration}} >= 3', 2);
  const guardSnapshots = [];
  const guardedOrchestrator = createWorkflowOrchestrator({
    workspaceKey: 'default',
    getWorkflow: async () => guarded,
    upsertExecutionSnapshot: async (_workflowId, snapshot) => {
      guardSnapshots.push(snapshot);
      return { executionId: 'exec-orch4c-guard', runId: snapshot.runId, status: snapshot.status };
    },
    pluginExecutor: executorFor([]),
  });
  await assert.rejects(
    () => guardedOrchestrator.executeWorkflow(guarded.id),
    /Maximum Iterations \(2\)|exceeded Maximum Iterations \(2\)/i
  );
  assert.strictEqual(guardSnapshots.at(-1).status, 'failed');
  assert.strictEqual(guardSnapshots.at(-1).outputs.at(-1).nodeId, 'loop');
  assert.strictEqual(guardSnapshots.at(-1).outputs.at(-1).status, 'failed');
  console.log(' PASS  ORCH-4C enforces the canonical Repeat Until Maximum Iterations guard and persists loop failure');

  console.log('\nORCH-4C Repeat Until tests: 7 passed, 0 failed.');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
