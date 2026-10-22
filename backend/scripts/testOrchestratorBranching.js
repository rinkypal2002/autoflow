'use strict';

const assert = require('assert');
const { ServerExecutionContext } = require('../orchestrator/executionContext');
const { createPluginExecutor } = require('../orchestrator/pluginExecutor');
const { createWorkflowOrchestrator } = require('../orchestrator/workflowOrchestrator');
const { assertOrch3Workflow } = require('../orchestrator/workflowGraph');
const { evaluateCondition, resolveString } = require('../orchestrator/canonical/lib/expression');
const { routeConnection } = require('../orchestrator/canonical/lib/ports');

function branchingWorkflow(unmatchedRows = []) {
  return {
    id: 'wf-orch3',
    name: 'ORCH3 Branching Test',
    version: 20,
    variables: [],
    actions: [
      { id: 's', type: 'workflow-start', name: 'Start', isControlNode: true },
      {
        id: 'split',
        type: 'filter-rows',
        category: 'data-transform-017',
        name: 'Split',
        properties: { mode: 'test' },
        outputPorts: [
          { id: 'matched', label: 'Matched', payloadPath: 'matched', isDefault: true, skipWhenEmpty: true },
          { id: 'unmatched', label: 'Unmatched', payloadPath: 'unmatched', skipWhenEmpty: true, tone: 'exception' },
        ],
        api: { url: '/engine/api/orch3/split', method: 'POST', body: { mode: '{{mode}}' } },
      },
      {
        id: 'matched-consumer',
        type: 'text-operation',
        category: 'data-transform-017',
        name: 'Matched Consumer',
        properties: {
          rows: '{{previous.rows}}',
          sourceFirstId: '{{steps.Split.matched[0].id}}',
        },
        api: {
          url: '/engine/api/orch3/matched',
          method: 'POST',
          body: { rows: '{{rows}}', sourceFirstId: '{{sourceFirstId}}' },
        },
      },
      {
        id: 'unmatched-consumer',
        type: 'text-operation',
        category: 'data-transform-017',
        name: 'Unmatched Consumer',
        properties: { rows: '{{previous.rows}}' },
        api: {
          url: '/engine/api/orch3/unmatched',
          method: 'POST',
          body: { rows: '{{rows}}' },
        },
      },
      { id: 'e', type: 'workflow-end', name: 'End', isControlNode: true },
    ],
    connections: [
      { id: 'c1', sourceId: 's', targetId: 'split' },
      {
        id: 'c2', sourceId: 'split', targetId: 'matched-consumer', sourcePort: 'matched',
        condition: '{{previous.rows | count}} > 0',
      },
      { id: 'c3', sourceId: 'split', targetId: 'unmatched-consumer', sourcePort: 'unmatched' },
      { id: 'c4', sourceId: 'matched-consumer', targetId: 'e' },
      { id: 'c5', sourceId: 'unmatched-consumer', targetId: 'e' },
    ],
    _testUnmatchedRows: unmatchedRows,
  };
}

function executorFor(wf, requests) {
  return createPluginExecutor({
    repository: { listMappings: async () => [] },
    http: {
      request: async (request) => {
        requests.push(request);
        if (request.url.endsWith('/engine/api/orch3/split')) {
          return {
            status: 200,
            data: {
              success: true,
              data: {
                matched: [{ id: 'M1', amount: 10 }],
                unmatched: wf._testUnmatchedRows || [],
              },
            },
          };
        }
        if (request.url.endsWith('/engine/api/orch3/matched')) {
          return { status: 200, data: { branch: 'matched', received: request.data.rows } };
        }
        if (request.url.endsWith('/engine/api/orch3/unmatched')) {
          return { status: 200, data: { branch: 'unmatched', received: request.data.rows } };
        }
        throw new Error(`Unexpected URL ${request.url}`);
      },
    },
  });
}

(async () => {
  const wf = branchingWorkflow([]);
  const split = wf.actions[1];
  const raw = { success: true, data: { matched: [{ id: 'M1' }], unmatched: [] } };
  const legacy = routeConnection(split, { sourcePort: null }, raw);
  const matched = routeConnection(split, { sourcePort: 'matched' }, raw);
  assert.strictEqual(legacy.payload, raw);
  assert.deepStrictEqual(matched.payload, [{ id: 'M1' }]);
  assert.strictEqual(matched.skipped, false);
  console.log(' PASS  ORCH-3 preserves legacy full-output edges and selects named port payloads');

  const empty = routeConnection(split, { sourcePort: 'unmatched' }, raw);
  const forced = routeConnection(split, { sourcePort: 'unmatched', metadata: { routeWhenEmpty: true } }, raw);
  assert.strictEqual(empty.skipped, true);
  assert.strictEqual(empty.recordCount, 0);
  assert.strictEqual(forced.skipped, false);
  console.log(' PASS  ORCH-3 suppresses opt-in empty branches and honors routeWhenEmpty');

  const ctx = new ServerExecutionContext({ runId: 'orch3-context', workflow: wf });
  const draft = ctx.startNode(split, null);
  ctx.completeNode(split, draft, raw);
  const branchScope = ctx.buildScope({
    currentAction: wf.actions[2],
    input: matched.payload,
    previousNodeId: 'split',
    previousPortId: 'matched',
    previousPortPayload: matched.payload,
  });
  assert.deepStrictEqual(resolveString('{{previous.rows}}', branchScope), [{ id: 'M1' }]);
  assert.strictEqual(resolveString('{{previous.$port}}', branchScope), 'matched');
  assert.deepStrictEqual(resolveString('{{previous.$output}}', branchScope), raw);
  assert.strictEqual(resolveString('{{steps.Split.matched[0].id}}', branchScope), 'M1');
  console.log(' PASS  ORCH-3 branch-local previous stays narrowed while steps/$output keep the full source result');

  const graph = assertOrch3Workflow(wf);
  assert.strictEqual(graph.outgoing.get('split').length, 2);
  assert.strictEqual(graph.incoming.get('e').length, 2);
  const cyclic = branchingWorkflow([]);
  cyclic.connections.push({ id: 'cycle', sourceId: 'matched-consumer', targetId: 'split' });
  assert.throws(() => assertOrch3Workflow(cyclic), /cycle/i);
  console.log(' PASS  ORCH-3 accepts acyclic fan-out/fan-in graphs and rejects cycles before ORCH-4');

  assert.strictEqual(evaluateCondition('{{previous.rows | count}} > 0', branchScope), true);
  assert.strictEqual(evaluateCondition('{{previous.rows | count}} == 0', branchScope), false);
  console.log(' PASS  ORCH-3 conditions reuse the canonical sandboxed evaluator');

  const inlineDatasetRequests = [];
  const inlineDatasetExecutor = createPluginExecutor({
    repository: { listMappings: async () => [] },
    http: {
      request: async (request) => {
        inlineDatasetRequests.push(request);
        return {
          status: 200,
          data: { success: true, data: request.data.data, unmatchedData: [] },
        };
      },
    },
  });
  await inlineDatasetExecutor.execute({
    id: 'inline-filter',
    type: 'filter-rows',
    name: 'Filter Rows',
    properties: {
      data: '[{"invoice":"INV-1001","status":"OPEN"},{"invoice":"INV-2002","status":"CLOSED"}]',
      conditions: [{ column: 'status', operator: 'EQUALS', value: 'OPEN' }],
      matchAny: false,
      invert: false,
      storeUnmatched: true,
    },
    propertyConfig: {
      data: { type: 'array', uiType: 'dataset-source' },
      conditions: { type: 'array' },
      matchAny: { type: 'boolean' },
      invert: { type: 'boolean' },
      storeUnmatched: { type: 'boolean' },
    },
    api: {
      url: '/engine/api/data-transform/filter-rows',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: {
        data: '{{data}}',
        conditions: '{{conditions}}',
        matchAny: '{{matchAny}}',
        invert: '{{invert}}',
        storeUnmatched: '{{storeUnmatched}}',
      },
    },
  }, { scope: {} });
  assert.strictEqual(inlineDatasetRequests.length, 1);
  assert.ok(Array.isArray(inlineDatasetRequests[0].data.data));
  assert.deepStrictEqual(inlineDatasetRequests[0].data.data[0], { invoice: 'INV-1001', status: 'OPEN' });
  console.log(' PASS  ORCH-3 contract coercion parses inline dataset JSON into a real array before engine dispatch');

  const requests = [];
  const snapshots = [];
  const orchestrator = createWorkflowOrchestrator({
    workspaceKey: 'default',
    getWorkflow: async () => wf,
    upsertExecutionSnapshot: async (_workflowId, snapshot) => {
      snapshots.push(snapshot);
      return { executionId: 'exec-orch3-empty', runId: snapshot.runId, status: snapshot.status };
    },
    pluginExecutor: executorFor(wf, requests),
  });
  const result = await orchestrator.executeWorkflow(wf.id);
  assert.ok(result.runId.startsWith('orch3-'));
  assert.strictEqual(result.status, 'completed');
  assert.strictEqual(result.nodeCount, 4);
  assert.deepStrictEqual(snapshots.at(-1).outputs.map((record) => record.nodeId), [
    's', 'split', 'matched-consumer', 'e',
  ]);
  const matchedRequest = requests.find((request) => request.url.endsWith('/engine/api/orch3/matched'));
  assert.deepStrictEqual(matchedRequest.data.rows, [{ id: 'M1', amount: 10 }]);
  assert.strictEqual(matchedRequest.data.sourceFirstId, 'M1');
  assert.ok(!requests.some((request) => request.url.endsWith('/engine/api/orch3/unmatched')));
  console.log(' PASS  ORCH-3 executes a real ported branch, resolves bindings and persists the skipped empty branch safely');

  const both = branchingWorkflow([{ id: 'U1', amount: 99 }]);
  const bothRequests = [];
  const bothSnapshots = [];
  const bothOrchestrator = createWorkflowOrchestrator({
    workspaceKey: 'default',
    getWorkflow: async () => both,
    upsertExecutionSnapshot: async (_workflowId, snapshot) => {
      bothSnapshots.push(snapshot);
      return { executionId: 'exec-orch3-both', runId: snapshot.runId, status: snapshot.status };
    },
    pluginExecutor: executorFor(both, bothRequests),
  });
  const bothResult = await bothOrchestrator.executeWorkflow(both.id);
  assert.strictEqual(bothResult.nodeCount, 5);
  assert.deepStrictEqual(bothSnapshots.at(-1).outputs.map((record) => record.nodeId), [
    's', 'split', 'matched-consumer', 'unmatched-consumer', 'e',
  ]);
  const unmatchedRequest = bothRequests.find((request) => request.url.endsWith('/engine/api/orch3/unmatched'));
  assert.deepStrictEqual(unmatchedRequest.data.rows, [{ id: 'U1', amount: 99 }]);
  assert.strictEqual(bothSnapshots.at(-1).outputs.filter((record) => record.nodeId === 'e').length, 1);
  console.log(' PASS  ORCH-3 drains both live branches and executes a fan-in target only once');

  const invalid = branchingWorkflow([]);
  invalid.connections[1].condition = '{{previous.missing}} == true';
  invalid.connections[2].metadata = { routeWhenEmpty: false };
  const invalidRequests = [];
  const invalidOrchestrator = createWorkflowOrchestrator({
    workspaceKey: 'default',
    getWorkflow: async () => invalid,
    upsertExecutionSnapshot: async () => ({ executionId: 'exec-orch3-suppressed' }),
    pluginExecutor: executorFor(invalid, invalidRequests),
  });
  await assert.rejects(() => invalidOrchestrator.executeWorkflow(invalid.id), /without reaching End|suppressed/i);
  console.log(' PASS  ORCH-3 fails explicitly when every runtime path to End is suppressed');

  console.log('\nORCH-3 branching/ports tests: 9 passed, 0 failed.');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
