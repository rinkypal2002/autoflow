'use strict';

const assert = require('assert');
const { createPluginExecutor } = require('../orchestrator/pluginExecutor');
const { createWorkflowOrchestrator } = require('../orchestrator/workflowOrchestrator');
const { assertOrch4AForEachWorkflow } = require('../orchestrator/workflowGraph');
const {
  LOOP_BODY_PORT,
  LOOP_DONE_PORT,
  advanceLoopState,
  captureLoopBodyOutput,
  loopExecutionKey,
  loopRuntimeAliases,
} = require('../orchestrator/canonical/lib/loopControl');

function forEachWorkflow(collection = [
  { invoice: 'INV-1001' },
  { invoice: 'INV-2002' },
  { invoice: 'INV-3003' },
], maxIterations = 10000) {
  return {
    id: 'wf-orch4a',
    name: 'ORCH4A For Each Test',
    version: 40,
    variables: [],
    actions: [
      { id: 's', type: 'workflow-start', name: 'Start', isControlNode: true },
      {
        id: 'loop',
        type: 'workflow-for-each',
        name: 'For Each',
        isControlNode: true,
        properties: {
          collection: JSON.stringify(collection),
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
        name: 'Loop Body',
        properties: {
          invoice: '{{currentItem.invoice}}',
          currentIndex: '{{currentIndex}}',
          iteration: '{{iteration}}',
        },
        api: {
          url: '/engine/api/orch4a/body',
          method: 'POST',
          body: {
            invoice: '{{invoice}}',
            currentIndex: '{{currentIndex}}',
            iteration: '{{iteration}}',
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
        if (!request.url.endsWith('/engine/api/orch4a/body')) {
          throw new Error(`Unexpected URL ${request.url}`);
        }
        return {
          status: 200,
          data: {
            invoice: request.data.invoice,
            currentIndex: request.data.currentIndex,
            iteration: request.data.iteration,
          },
        };
      },
    },
  });
}

(async () => {
  const loopAction = forEachWorkflow().actions[1];
  let frames = [];
  let transition = advanceLoopState({
    action: loopAction,
    frames,
    collectionValue: [{ id: 'A' }, { id: 'B' }],
    maxIterationsValue: 10000,
    evaluate: () => false,
  });
  assert.strictEqual(transition.route, LOOP_BODY_PORT);
  assert.strictEqual(transition.output.currentItem.id, 'A');
  assert.strictEqual(transition.output.currentIndex, 0);
  frames = captureLoopBodyOutput(transition.frames, { seen: 'A' });
  transition = advanceLoopState({
    action: loopAction,
    frames,
    collectionValue: [{ id: 'A' }, { id: 'B' }],
    maxIterationsValue: 10000,
    evaluate: () => false,
  });
  assert.strictEqual(transition.route, LOOP_BODY_PORT);
  assert.strictEqual(transition.output.currentItem.id, 'B');
  frames = captureLoopBodyOutput(transition.frames, { seen: 'B' });
  transition = advanceLoopState({
    action: loopAction,
    frames,
    collectionValue: [{ id: 'A' }, { id: 'B' }],
    maxIterationsValue: 10000,
    evaluate: () => false,
  });
  assert.strictEqual(transition.route, LOOP_DONE_PORT);
  assert.deepStrictEqual(transition.output.results.map((row) => row.output.seen), ['A', 'B']);
  console.log(' PASS  ORCH-4A ports the canonical For Each Body/Done state machine and aggregates iteration results');

  const firstFrames = advanceLoopState({
    action: loopAction,
    frames: [],
    collectionValue: [{ invoice: 'INV-1' }],
    maxIterationsValue: 10000,
    evaluate: () => false,
  }).frames;
  const aliases = loopRuntimeAliases(firstFrames);
  assert.strictEqual(aliases.currentItem.invoice, 'INV-1');
  assert.strictEqual(aliases.currentIndex, 0);
  assert.strictEqual(aliases.currentKey, 0);
  assert.strictEqual(aliases.iteration, 1);
  assert.strictEqual(loopExecutionKey('body', firstFrames), 'body@@loop:1');
  console.log(' PASS  ORCH-4A exposes currentItem/currentIndex/currentKey/iteration and stable per-iteration execution keys');

  const graph = assertOrch4AForEachWorkflow(forEachWorkflow());
  assert.strictEqual(graph.loop.id, 'loop');
  assert.strictEqual(graph.bodyPlugin.id, 'body');
  assert.strictEqual(graph.bodyConnection.sourcePort, 'body');
  assert.strictEqual(graph.doneConnection.sourcePort, 'done');
  const wrongControl = forEachWorkflow();
  wrongControl.actions[1] = { ...wrongControl.actions[1], type: 'workflow-while', name: 'While' };
  assert.throws(() => assertOrch4AForEachWorkflow(wrongControl), /For Each|ForEach/i);
  const wrongCycle = forEachWorkflow();
  wrongCycle.connections[2] = { id: 'c3', sourceId: 'body', targetId: 'body' };
  assert.throws(() => assertOrch4AForEachWorkflow(wrongCycle), /controlled cycle|wiring/i);
  console.log(' PASS  ORCH-4A accepts only the certified Start -> For Each Body -> plugin -> For Each / Done -> End cycle');

  const wf = forEachWorkflow();
  const requests = [];
  const snapshots = [];
  const orchestrator = createWorkflowOrchestrator({
    workspaceKey: 'default',
    getWorkflow: async () => wf,
    upsertExecutionSnapshot: async (_workflowId, snapshot) => {
      snapshots.push(snapshot);
      return { executionId: 'exec-orch4a', runId: snapshot.runId, status: snapshot.status };
    },
    pluginExecutor: executorFor(requests),
  });
  const result = await orchestrator.executeWorkflow(wf.id);
  assert.ok(result.runId.startsWith('orch4a-'));
  assert.strictEqual(result.status, 'completed');
  assert.strictEqual(requests.length, 3);
  assert.deepStrictEqual(requests.map((request) => request.data.invoice), ['INV-1001', 'INV-2002', 'INV-3003']);
  assert.deepStrictEqual(requests.map((request) => request.data.currentIndex), [0, 1, 2]);
  assert.deepStrictEqual(requests.map((request) => request.data.iteration), [1, 2, 3]);
  assert.strictEqual(result.nodeCount, 9);
  assert.deepStrictEqual(result.output.map((row) => row.output.invoice), ['INV-1001', 'INV-2002', 'INV-3003']);
  console.log(' PASS  ORCH-4A executes a real three-item For Each loop with server-side currentItem bindings');

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
  console.log(' PASS  ORCH-4A persists separate physical execution instances per iteration and executes End once');

  const empty = forEachWorkflow([]);
  const emptyRequests = [];
  const emptySnapshots = [];
  const emptyOrchestrator = createWorkflowOrchestrator({
    workspaceKey: 'default',
    getWorkflow: async () => empty,
    upsertExecutionSnapshot: async (_workflowId, snapshot) => {
      emptySnapshots.push(snapshot);
      return { executionId: 'exec-orch4a-empty', runId: snapshot.runId, status: snapshot.status };
    },
    pluginExecutor: executorFor(emptyRequests),
  });
  const emptyResult = await emptyOrchestrator.executeWorkflow(empty.id);
  assert.strictEqual(emptyResult.status, 'completed');
  assert.strictEqual(emptyRequests.length, 0);
  assert.strictEqual(emptyResult.nodeCount, 3);
  assert.deepStrictEqual(emptyResult.output, []);
  assert.deepStrictEqual(emptySnapshots.at(-1).outputs.map((record) => record.nodeId), ['s', 'loop', 'e']);
  console.log(' PASS  ORCH-4A routes an empty For Each collection directly through Done without executing the Body');

  const guarded = forEachWorkflow([{ id: 1 }, { id: 2 }, { id: 3 }], 2);
  const guardSnapshots = [];
  const guardedOrchestrator = createWorkflowOrchestrator({
    workspaceKey: 'default',
    getWorkflow: async () => guarded,
    upsertExecutionSnapshot: async (_workflowId, snapshot) => {
      guardSnapshots.push(snapshot);
      return { executionId: 'exec-orch4a-guard', runId: snapshot.runId, status: snapshot.status };
    },
    pluginExecutor: executorFor([]),
  });
  await assert.rejects(
    () => guardedOrchestrator.executeWorkflow(guarded.id),
    /Maximum Iterations guard \(2\)/i
  );
  assert.strictEqual(guardSnapshots.at(-1).status, 'failed');
  assert.strictEqual(guardSnapshots.at(-1).outputs.at(-1).nodeId, 'loop');
  assert.strictEqual(guardSnapshots.at(-1).outputs.at(-1).status, 'failed');
  console.log(' PASS  ORCH-4A enforces the canonical Maximum Iterations guard and persists loop failure');

  console.log('\nORCH-4A For Each tests: 7 passed, 0 failed.');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
