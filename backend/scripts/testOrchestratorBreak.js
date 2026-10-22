'use strict';

const assert = require('assert');
const { createWorkflowOrchestrator } = require('../orchestrator/workflowOrchestrator');
const { assertOrch4DBreakWorkflow } = require('../orchestrator/workflowGraph');

function breakWorkflow(collection = ['INV-1001', 'INV-2002', 'INV-3003']) {
  return {
    id: 'wf-orch4d',
    name: 'ORCH4D Break Test',
    version: 70,
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
          maxIterations: 10000,
        },
        outputPorts: [
          { id: 'body', label: 'Body', payloadPath: 'body', isDefault: true },
          { id: 'done', label: 'Done', payloadPath: 'results', optional: true },
        ],
      },
      {
        id: 'break',
        type: 'workflow-break',
        name: 'Break',
        isControlNode: true,
        properties: {},
      },
      { id: 'e', type: 'workflow-end', name: 'End', isControlNode: true },
    ],
    connections: [
      { id: 'c1', sourceId: 's', targetId: 'loop' },
      { id: 'c2', sourceId: 'loop', targetId: 'break', sourcePort: 'body' },
      { id: 'c3', sourceId: 'loop', targetId: 'e', sourcePort: 'done' },
    ],
  };
}

(async () => {
  const wf = breakWorkflow();

  const graph = assertOrch4DBreakWorkflow(wf);
  assert.strictEqual(graph.loop.id, 'loop');
  assert.strictEqual(graph.breakAction.id, 'break');
  assert.strictEqual(graph.bodyConnection.sourcePort, 'body');
  assert.strictEqual(graph.doneConnection.sourcePort, 'done');
  assert.strictEqual(graph.outgoing.get('break'), undefined);
  console.log(' PASS  ORCH-4D accepts the property-free Break contract and routes it from the active For Each Body');

  const wrongOutgoing = breakWorkflow();
  wrongOutgoing.connections.push({ id: 'c4', sourceId: 'break', targetId: 'loop' });
  assert.throws(
    () => assertOrch4DBreakWorkflow(wrongOutgoing),
    /3 active connections|outgoing edge|Done path/i
  );
  const wrongLoop = breakWorkflow();
  wrongLoop.actions[1] = { ...wrongLoop.actions[1], type: 'workflow-while', name: 'While' };
  assert.throws(
    () => assertOrch4DBreakWorkflow(wrongLoop),
    /For Each|ForEach/i
  );
  console.log(' PASS  ORCH-4D rejects Break back-edges and unsupported loop shapes instead of approximating semantics');

  const snapshots = [];
  let pluginCalls = 0;
  const orchestrator = createWorkflowOrchestrator({
    workspaceKey: 'default',
    getWorkflow: async () => wf,
    upsertExecutionSnapshot: async (_workflowId, snapshot) => {
      snapshots.push(snapshot);
      return { executionId: 'exec-orch4d', runId: snapshot.runId, status: snapshot.status };
    },
    pluginExecutor: {
      execute: async () => {
        pluginCalls += 1;
        throw new Error('Break must not dispatch an engine plugin');
      },
    },
  });

  const result = await orchestrator.executeWorkflow(wf.id);
  assert.ok(result.runId.startsWith('orch4d-'));
  assert.strictEqual(result.status, 'completed');
  assert.strictEqual(result.nodeCount, 5);
  assert.strictEqual(pluginCalls, 0);
  assert.ok(Array.isArray(result.output));
  assert.strictEqual(result.output.length, 1);
  assert.strictEqual(result.output[0].iteration, 1);
  assert.strictEqual(result.output[0].item, 'INV-1001');
  console.log(' PASS  ORCH-4D executes only the first For Each iteration and immediately exits through Done');

  const finalSnapshot = snapshots.at(-1);
  const finalRecords = finalSnapshot.executionInstances;
  assert.deepStrictEqual(finalRecords.map((record) => record.nodeId), [
    's', 'loop', 'break', 'loop', 'e',
  ]);
  const breakRecord = finalRecords.find((record) => record.nodeId === 'break');
  assert.strictEqual(breakRecord.executionInstanceKey, 'break@@loop:1');
  assert.strictEqual(breakRecord.output.signal, 'break');
  assert.strictEqual(breakRecord.output.iteration, 1);
  const loopRecords = finalRecords.filter((record) => record.nodeId === 'loop');
  assert.deepStrictEqual(loopRecords.map((record) => record.executionInstanceKey), [
    'loop',
    'loop@@loop:1',
  ]);
  assert.strictEqual(loopRecords[1].output.done, true);
  assert.strictEqual(loopRecords[1].output.broken, true);
  assert.strictEqual(loopRecords[1].output.iteration, 1);
  console.log(' PASS  ORCH-4D persists Break plus a separate Break-induced loop Done transition with broken=true');

  assert.strictEqual(new Set(finalRecords.map((record) => record.executionInstanceKey)).size, 5);
  assert.strictEqual(finalRecords.filter((record) => record.nodeId === 'break').length, 1);
  assert.strictEqual(finalRecords.filter((record) => record.nodeId === 'e').length, 1);
  assert.strictEqual(finalSnapshot.status, 'completed');
  assert.strictEqual(finalSnapshot.metrics.failed, 0);
  console.log(' PASS  ORCH-4D preserves physical execution-instance uniqueness and executes End exactly once');

  const empty = breakWorkflow([]);
  const emptySnapshots = [];
  const emptyOrchestrator = createWorkflowOrchestrator({
    workspaceKey: 'default',
    getWorkflow: async () => empty,
    upsertExecutionSnapshot: async (_workflowId, snapshot) => {
      emptySnapshots.push(snapshot);
      return { executionId: 'exec-orch4d-empty', runId: snapshot.runId, status: snapshot.status };
    },
    pluginExecutor: {
      execute: async () => {
        throw new Error('Empty For Each must not execute Break as a plugin');
      },
    },
  });
  const emptyResult = await emptyOrchestrator.executeWorkflow(empty.id);
  assert.strictEqual(emptyResult.status, 'completed');
  assert.strictEqual(emptyResult.nodeCount, 3);
  assert.deepStrictEqual(emptyResult.output, []);
  assert.deepStrictEqual(emptySnapshots.at(-1).executionInstances.map((record) => record.nodeId), [
    's', 'loop', 'e',
  ]);
  console.log(' PASS  ORCH-4D keeps canonical empty-collection behavior: Body and Break are skipped and Done reaches End');

  const huge = breakWorkflow(Array.from({ length: 3 }, (_, index) => `INV-${index + 1}`));
  huge.actions[1].properties.maxIterations = 2;
  const guardSnapshots = [];
  const guardOrchestrator = createWorkflowOrchestrator({
    workspaceKey: 'default',
    getWorkflow: async () => huge,
    upsertExecutionSnapshot: async (_workflowId, snapshot) => {
      guardSnapshots.push(snapshot);
      return { executionId: 'exec-orch4d-guard', runId: snapshot.runId, status: snapshot.status };
    },
    pluginExecutor: { execute: async () => { throw new Error('not expected'); } },
  });
  await assert.rejects(
    () => guardOrchestrator.executeWorkflow(huge.id),
    /Maximum Iterations guard \(2\)/i
  );
  assert.strictEqual(guardSnapshots.at(-1).status, 'failed');
  assert.strictEqual(guardSnapshots.at(-1).executionInstances.at(-1).nodeId, 'loop');
  assert.strictEqual(guardSnapshots.at(-1).executionInstances.at(-1).status, 'failed');
  console.log(' PASS  ORCH-4D retains the canonical For Each Maximum Iterations safety guard before Break can run');

  console.log('\nORCH-4D Break tests: 7 passed, 0 failed.');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
