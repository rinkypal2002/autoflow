'use strict';

const assert = require('assert');
const { ServerExecutionContext } = require('../orchestrator/executionContext');
const { createPluginExecutor } = require('../orchestrator/pluginExecutor');
const { createWorkflowOrchestrator } = require('../orchestrator/workflowOrchestrator');
const { assertOrch2LinearWorkflow } = require('../orchestrator/workflowGraph');
const {
  resolveDeep,
  resolveString,
} = require('../orchestrator/canonical/lib/expression');

function workflow() {
  return {
    id: 'wf-orch2',
    name: 'ORCH2 Binding Test',
    version: 12,
    variables: [
      { name: 'prefix', value: 'CERT' },
      { name: 'secretValue', value: 'do-not-carry', isSecret: true },
    ],
    actions: [
      { id: 's', type: 'workflow-start', name: 'Start', isControlNode: true },
      {
        id: 'p1',
        type: 'extract-fields',
        category: 'data-transform-017',
        name: 'Regex',
        properties: { text: 'INVOICE_NUMBER: INV-1001' },
        api: {
          url: '/engine/api/orch2/one',
          method: 'POST',
          body: { text: '{{text}}' },
        },
      },
      {
        id: 'p2',
        type: 'text-operation',
        category: 'data-transform-017',
        name: 'Compose Result',
        properties: {
          text: 'P={{previous.fields.invoiceNumber}}; S={{steps.Regex.fields.invoiceNumber}}; V={{vars.prefix}}',
          rows: '{{previous.items}}',
        },
        api: {
          url: '/engine/api/orch2/two',
          method: 'POST',
          body: {
            text: '{{text}}',
            rows: '{{rows}}',
          },
        },
      },
      { id: 'e', type: 'workflow-end', name: 'End', isControlNode: true },
    ],
    connections: [
      { id: 'c1', sourceId: 's', targetId: 'p1' },
      { id: 'c2', sourceId: 'p1', targetId: 'p2' },
      { id: 'c3', sourceId: 'p2', targetId: 'e' },
    ],
  };
}

(async () => {
  const typed = resolveString('{{previous.rows}}', {
    previous: { rows: [{ id: 1 }, { id: 2 }] },
  });
  assert.ok(Array.isArray(typed));
  assert.strictEqual(typed.length, 2);
  console.log(' PASS  ORCH-2 canonical resolver preserves whole-token native types');

  const quoted = resolveString("{{steps['Read Employee Excel'].rows[0].name | upper}}", {
    steps: { 'Read Employee Excel': { rows: [{ name: 'Umesh' }] } },
  });
  assert.strictEqual(quoted, 'UMESH');
  const fallback = resolveString("{{missing.value || 'fallback'}}", {});
  assert.strictEqual(fallback, 'fallback');
  console.log(' PASS  ORCH-2 canonical resolver supports quoted paths, filters and fallbacks');

  const wf = workflow();
  const ctx = new ServerExecutionContext({ runId: 'orch2-context-test', workflow: wf });
  const first = wf.actions[1];
  const draft = ctx.startNode(first, null);
  ctx.completeNode(first, draft, {
    fields: { invoiceNumber: 'INV-1001' },
    items: [{ amount: 10 }, { amount: 20 }],
  });
  const scope = ctx.buildScope({ currentAction: wf.actions[2] });
  assert.strictEqual(resolveString('{{previous.fields.invoiceNumber}}', scope), 'INV-1001');
  assert.strictEqual(resolveString('{{steps.Regex.fields.invoiceNumber}}', scope), 'INV-1001');
  assert.strictEqual(resolveString('{{vars.prefix}}', scope), 'CERT');
  assert.strictEqual(scope.vars.secretValue, undefined);
  console.log(' PASS  ORCH-2 server context exposes previous, steps and non-secret vars');

  const ordered = assertOrch2LinearWorkflow(wf);
  assert.deepStrictEqual(ordered.map((node) => node.id), ['s', 'p1', 'p2', 'e']);
  const branched = workflow();
  branched.connections[1].condition = '{{previous.ok}} == true';
  assert.throws(() => assertOrch2LinearWorkflow(branched), /does not support conditional/);
  console.log(' PASS  ORCH-2 accepts multi-plugin linear chains and still rejects branching');

  const requests = [];
  const executor = createPluginExecutor({
    repository: { listMappings: async () => [] },
    http: {
      request: async (request) => {
        requests.push(request);
        if (request.url.endsWith('/engine/api/orch2/one')) {
          return {
            status: 200,
            data: {
              fields: { invoiceNumber: 'INV-1001' },
              items: [{ amount: 10 }, { amount: 20 }],
            },
          };
        }
        return { status: 200, data: { received: request.data } };
      },
    },
  });

  const secondScopeContext = new ServerExecutionContext({ runId: 'orch2-payload-test', workflow: wf });
  const p1Draft = secondScopeContext.startNode(first, null);
  secondScopeContext.completeNode(first, p1Draft, {
    fields: { invoiceNumber: 'INV-1001' },
    items: [{ amount: 10 }, { amount: 20 }],
  });
  const execution = await executor.execute(wf.actions[2], {
    scope: secondScopeContext.buildScope({ currentAction: wf.actions[2] }),
  });
  assert.strictEqual(execution.request.body.text, 'P=INV-1001; S=INV-1001; V=CERT');
  assert.deepStrictEqual(execution.request.body.rows, [{ amount: 10 }, { amount: 20 }]);
  console.log(' PASS  ORCH-2 resolves carry-forward properties before legacy self body templates');

  requests.length = 0;
  const snapshots = [];
  const orchestrator = createWorkflowOrchestrator({
    workspaceKey: 'default',
    getWorkflow: async () => wf,
    upsertExecutionSnapshot: async (_workflowId, snapshot) => {
      snapshots.push(snapshot);
      return { executionId: 'exec-orch2-1', runId: snapshot.runId, status: snapshot.status };
    },
    pluginExecutor: executor,
  });
  const result = await orchestrator.executeWorkflow('wf-orch2');
  assert.strictEqual(result.status, 'completed');
  assert.ok(result.runId.startsWith('orch2-'));
  assert.strictEqual(result.nodeCount, 4);
  assert.deepStrictEqual(snapshots.map((snapshot) => snapshot.outputs.length), [0, 1, 2, 3, 4]);
  assert.strictEqual(snapshots.at(-1).status, 'completed');
  const compose = snapshots.at(-1).outputs.find((record) => record.nodeId === 'p2');
  assert.strictEqual(compose.input.text, 'P=INV-1001; S=INV-1001; V=CERT');
  assert.deepStrictEqual(compose.input.rows, [{ amount: 10 }, { amount: 20 }]);
  assert.deepStrictEqual(result.output.received, compose.input);
  console.log(' PASS  ORCH-2 executes and persists a real two-plugin binding chain incrementally');

  const deep = resolveDeep(
    { message: 'Invoice {{previous.fields.invoiceNumber}}', native: '{{previous.items}}' },
    {
      previous: {
        fields: { invoiceNumber: 'INV-1001' },
        items: [1, 2, 3],
      },
    }
  );
  assert.strictEqual(deep.message, 'Invoice INV-1001');
  assert.deepStrictEqual(deep.native, [1, 2, 3]);
  console.log(' PASS  ORCH-2 recursive resolution preserves mixed-string and native-value semantics');

  console.log('\nORCH-2 binding/context tests: 7 passed, 0 failed.');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
