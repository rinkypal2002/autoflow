'use strict';

const assert = require('assert');
const { createWorkflowOrchestrator } = require('../orchestrator/workflowOrchestrator');
const { assertOrch1LinearWorkflow } = require('../orchestrator/workflowGraph');
const { resolveSelfTemplate } = require('../orchestrator/pluginExecutor');

function workflow() {
  return {
    id: 'wf-test',
    name: 'ORCH1 Test',
    version: 7,
    variables: [],
    actions: [
      { id: 's', type: 'workflow-start', name: 'Start', isControlNode: true },
      {
        id: 'p', type: 'extract-fields', category: 'data-transform-017', name: 'Regex',
        properties: { text: 'Invoice 42', rules: [{ name: 'invoice', pattern: 'Invoice (\\d+)', group: 1 }] },
        api: { url: '/engine/api/data-transform/extract-fields', method: 'POST', body: { text: '{{text}}', rules: '{{rules}}' } },
      },
      { id: 'e', type: 'workflow-end', name: 'End', isControlNode: true },
    ],
    connections: [
      { id: 'c1', sourceId: 's', targetId: 'p' },
      { id: 'c2', sourceId: 'p', targetId: 'e' },
    ],
  };
}

(async () => {
  const ordered = assertOrch1LinearWorkflow(workflow());
  assert.deepStrictEqual(ordered.map((node) => node.id), ['s', 'p', 'e']);
  console.log(' PASS  ORCH-1 validates Start -> plugin -> End');

  const branched = workflow();
  branched.connections[0].condition = 'true';
  assert.throws(() => assertOrch1LinearWorkflow(branched), /does not support conditional/);
  console.log(' PASS  ORCH-1 rejects branching before ORCH-3');

  const resolved = resolveSelfTemplate(
    { text: '{{text}}', rules: '{{rules}}', label: 'Run {{text}}' },
    { text: 'Invoice 42', rules: [{ name: 'invoice' }] }
  );
  assert.strictEqual(resolved.text, 'Invoice 42');
  assert.ok(Array.isArray(resolved.rules));
  assert.strictEqual(resolved.label, 'Run Invoice 42');
  console.log(' PASS  ORCH-1 self-property templates preserve types');

  assert.throws(
    () => resolveSelfTemplate('{{previous.text}}', {}),
    /does not resolve cross-node binding/
  );
  console.log(' PASS  ORCH-1 explicitly rejects carry-forward bindings');

  const snapshots = [];
  const fakePlugin = {
    execute: async () => ({
      output: { fields: { invoice: '42' } },
      request: { body: { text: 'Invoice 42' }, method: 'POST', routeSource: 'test' },
    }),
  };
  const orchestrator = createWorkflowOrchestrator({
    workspaceKey: 'default',
    getWorkflow: async () => workflow(),
    upsertExecutionSnapshot: async (_workflowId, snapshot) => {
      snapshots.push(snapshot);
      return { executionId: 'exec-1', runId: snapshot.runId, status: snapshot.status };
    },
    pluginExecutor: fakePlugin,
  });
  const result = await orchestrator.executeWorkflow('wf-test');
  assert.strictEqual(result.status, 'completed');
  assert.strictEqual(result.nodeCount, 3);
  assert.deepStrictEqual(snapshots.map((snapshot) => snapshot.outputs.length), [0, 1, 2, 3]);
  assert.strictEqual(snapshots.at(-1).status, 'completed');
  assert.deepStrictEqual(snapshots.at(-1).outputs.map((record) => record.nodeName), ['Start', 'Regex', 'End']);
  console.log(' PASS  ORCH-1 server executor persists Start, plugin, End incrementally');

  console.log('\nORCH-1 foundation tests: 5 passed, 0 failed.');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
