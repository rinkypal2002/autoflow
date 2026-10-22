'use strict';

const assert = require('assert');
const { createPluginExecutor } = require('../orchestrator/pluginExecutor');
const { createWorkflowOrchestrator } = require('../orchestrator/workflowOrchestrator');
const { assertOrch4BWhileWorkflow } = require('../orchestrator/workflowGraph');
const { evaluateCondition } = require('../orchestrator/canonical/lib/expression');
const {
  LOOP_BODY_PORT,
  LOOP_DONE_PORT,
  advanceLoopState,
  captureLoopBodyOutput,
  loopExecutionKey,
  loopRuntimeAliases,
} = require('../orchestrator/canonical/lib/loopControl');

function conditionScope(frames) {
  const aliases = loopRuntimeAliases(frames);
  return {
    ...aliases,
    runtime: { ...aliases },
  };
}

function whileWorkflow(condition = '{{iteration}} <= 3', maxIterations = 1000) {
  return {
    id: 'wf-orch4b',
    name: 'ORCH4B While Test',
    version: 41,
    variables: [],
    actions: [
      { id: 's', type: 'workflow-start', name: 'Start', isControlNode: true },
      {
        id: 'loop',
        type: 'workflow-while',
        name: 'While',
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
        name: 'While Body',
        properties: {
          iteration: '{{iteration}}',
          currentIndex: '{{currentIndex}}',
        },
        api: {
          url: '/engine/api/orch4b/body',
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
        if (!request.url.endsWith('/engine/api/orch4b/body')) {
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
  const loopAction = whileWorkflow().actions[1];
  let frames = [];
  const results = [];
  for (;;) {
    const transition = advanceLoopState({
      action: loopAction,
      frames,
      inputData: results.at(-1) || { seed: true },
      condition: '{{iteration}} <= 3',
      maxIterationsValue: 1000,
      evaluate: (condition, candidateFrames) =>
        evaluateCondition(condition, conditionScope(candidateFrames)),
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
  console.log(' PASS  ORCH-4B ports canonical pre-test While semantics and exits when iteration 4 makes the condition false');

  const first = advanceLoopState({
    action: loopAction,
    frames: [],
    inputData: { seed: true },
    condition: '{{iteration}} <= 3',
    maxIterationsValue: 1000,
    evaluate: (condition, candidateFrames) =>
      evaluateCondition(condition, conditionScope(candidateFrames)),
  });
  assert.strictEqual(first.route, LOOP_BODY_PORT);
  const aliases = loopRuntimeAliases(first.frames);
  assert.strictEqual(aliases.iteration, 1);
  assert.strictEqual(aliases.currentIndex, 0);
  assert.strictEqual(aliases.currentKey, 0);
  assert.strictEqual(loopExecutionKey('body', first.frames), 'body@@loop:1');
  console.log(' PASS  ORCH-4B exposes one-based iteration, zero-based index/key and stable per-iteration execution keys');

  const graph = assertOrch4BWhileWorkflow(whileWorkflow());
  assert.strictEqual(graph.loop.id, 'loop');
  assert.strictEqual(graph.bodyPlugin.id, 'body');
  assert.strictEqual(graph.bodyConnection.sourcePort, 'body');
  assert.strictEqual(graph.doneConnection.sourcePort, 'done');
  const wrongControl = whileWorkflow();
  wrongControl.actions[1] = { ...wrongControl.actions[1], type: 'workflow-for-each', name: 'For Each' };
  assert.throws(() => assertOrch4BWhileWorkflow(wrongControl), /While|unsupported control/i);
  const wrongCycle = whileWorkflow();
  wrongCycle.connections[2] = { id: 'c3', sourceId: 'body', targetId: 'body' };
  assert.throws(() => assertOrch4BWhileWorkflow(wrongCycle), /controlled cycle|wiring/i);
  console.log(' PASS  ORCH-4B accepts only the certified Start -> While Body -> plugin -> While / Done -> End cycle');

  const wf = whileWorkflow();
  const requests = [];
  const snapshots = [];
  const orchestrator = createWorkflowOrchestrator({
    workspaceKey: 'default',
    getWorkflow: async () => wf,
    upsertExecutionSnapshot: async (_workflowId, snapshot) => {
      snapshots.push(snapshot);
      return { executionId: 'exec-orch4b', runId: snapshot.runId, status: snapshot.status };
    },
    pluginExecutor: executorFor(requests),
  });
  const result = await orchestrator.executeWorkflow(wf.id);
  assert.ok(result.runId.startsWith('orch4b-'));
  assert.strictEqual(result.status, 'completed');
  assert.strictEqual(requests.length, 3);
  assert.deepStrictEqual(requests.map((request) => request.data.iteration), [1, 2, 3]);
  assert.deepStrictEqual(requests.map((request) => request.data.currentIndex), [0, 1, 2]);
  assert.strictEqual(result.nodeCount, 9);
  assert.deepStrictEqual(result.output.map((row) => row.output.iteration), [1, 2, 3]);
  console.log(' PASS  ORCH-4B executes a real three-iteration While loop with server-side iteration bindings');

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
  console.log(' PASS  ORCH-4B persists separate While/body execution instances and executes End once');

  const initiallyFalse = whileWorkflow('{{iteration}} < 1');
  const falseRequests = [];
  const falseSnapshots = [];
  const falseOrchestrator = createWorkflowOrchestrator({
    workspaceKey: 'default',
    getWorkflow: async () => initiallyFalse,
    upsertExecutionSnapshot: async (_workflowId, snapshot) => {
      falseSnapshots.push(snapshot);
      return { executionId: 'exec-orch4b-false', runId: snapshot.runId, status: snapshot.status };
    },
    pluginExecutor: executorFor(falseRequests),
  });
  const falseResult = await falseOrchestrator.executeWorkflow(initiallyFalse.id);
  assert.strictEqual(falseResult.status, 'completed');
  assert.strictEqual(falseRequests.length, 0);
  assert.strictEqual(falseResult.nodeCount, 3);
  assert.deepStrictEqual(falseResult.output, []);
  assert.deepStrictEqual(falseSnapshots.at(-1).outputs.map((record) => record.nodeId), ['s', 'loop', 'e']);
  console.log(' PASS  ORCH-4B evaluates While before the first Body and routes immediately to Done when false');

  const guarded = whileWorkflow('{{iteration}} <= 3', 2);
  const guardSnapshots = [];
  const guardedOrchestrator = createWorkflowOrchestrator({
    workspaceKey: 'default',
    getWorkflow: async () => guarded,
    upsertExecutionSnapshot: async (_workflowId, snapshot) => {
      guardSnapshots.push(snapshot);
      return { executionId: 'exec-orch4b-guard', runId: snapshot.runId, status: snapshot.status };
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
  console.log(' PASS  ORCH-4B enforces the canonical While Maximum Iterations guard and persists loop failure');

  console.log('\nORCH-4B While tests: 7 passed, 0 failed.');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
