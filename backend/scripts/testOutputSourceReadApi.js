'use strict';

const assert = require('assert');
const http = require('http');
const express = require('express');

const {
  createOutputSourceReadRepository,
} = require('../db/outputSourceReadRepository');
const {
  createPostgresOutputSourceRouter,
  groupRows,
  buildBindingGroups,
} = require('../routes/postgresOutputSourceRoutes');

const SAMPLE_ROWS = [
  {
    workflowId: 'workflow-1', runId: 'run-1', nodeId: 'node-a',
    nodeName: 'Read Sheet', stepKey: 'ReadSheet', sequence: 1,
    fieldKind: 'RAW', label: 'Complete Raw Output', valueType: 'OBJECT',
    preview: '{rows}', path: 'steps.Read Sheet.output',
    token: '{{steps.Read Sheet.output}}', isSecret: false,
  },
  {
    workflowId: 'workflow-1', runId: 'run-1', nodeId: 'node-a',
    nodeName: 'Read Sheet', stepKey: 'ReadSheet', sequence: 1,
    fieldKind: 'BUSINESS', label: 'Rows', valueType: 'ARRAY',
    preview: 'Array(2)', path: 'steps.Read Sheet.rows',
    token: '{{steps.Read Sheet.rows}}', isSecret: false,
  },
  {
    workflowId: 'workflow-1', runId: 'run-1', nodeId: 'node-a',
    nodeName: 'Read Sheet', stepKey: 'ReadSheet', sequence: 1,
    fieldKind: 'TECHNICAL', label: 'Status Code', valueType: 'INTEGER',
    preview: '200', path: 'steps.Read Sheet.statusCode',
    token: '{{steps.Read Sheet.statusCode}}', isSecret: false,
  },
  {
    workflowId: 'workflow-1', runId: 'run-1', nodeId: 'node-b',
    nodeName: 'Filter Rows', stepKey: 'FilterRows', sequence: 2,
    fieldKind: 'BUSINESS', label: 'Count', valueType: 'INTEGER',
    preview: '2', path: 'steps.Filter Rows.count',
    token: '{{steps.Filter Rows.count}}', isSecret: false,
  },
];

function fakeResult(input) {
  const rows = SAMPLE_ROWS.filter((row) =>
    (input.includeTechnical || row.fieldKind !== 'TECHNICAL') &&
    (input.includeRaw !== false || row.fieldKind !== 'RAW') &&
    (!input.targetNodeId || row.nodeId === 'node-a')
  );
  return {
    execution: {
      executionInternalId: '11111111-1111-1111-1111-111111111111',
      runId: input.runId || 'run-1',
      workflowVersionInternalId: '22222222-2222-2222-2222-222222222222',
      workflowId: input.workflowId,
      workflowName: 'Workflow One',
      workspaceKey: input.workspaceKey,
      status: 'completed',
      startedAt: '2026-08-04T08:00:00.000Z',
      finishedAt: '2026-08-04T08:00:04.000Z',
    },
    eligibleNodeIds: input.targetNodeId ? ['node-a'] : null,
    coverage: {
      finalNodes: input.targetNodeId ? 1 : 2,
      indexedNodes: input.targetNodeId ? 1 : 2,
      missingIndexedNodes: 0,
      indexRows: rows.length,
      complete: true,
    },
    rows,
    totalMatchingRows: rows.length,
    limit: input.limit,
    offset: input.offset,
  };
}

async function startServer(router) {
  const app = express();
  app.use('/api/workspace', router);
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  return {
    server,
    baseUrl: `http://127.0.0.1:${address.port}/api/workspace`,
  };
}

async function getJson(url) {
  const response = await fetch(url);
  const body = await response.json();
  return { status: response.status, body };
}

async function testMapper() {
  const groups = groupRows(SAMPLE_ROWS);
  assert.strictEqual(groups.length, 2);
  assert.strictEqual(groups[0].raw.length, 1);
  assert.strictEqual(groups[0].business.length, 1);
  assert.strictEqual(groups[0].technical.length, 1);
  assert.strictEqual(groups[0].technical[0].valueType, 'number');

  const bindingGroups = buildBindingGroups(groups, true);
  assert.strictEqual(bindingGroups.length, 2);
  assert.strictEqual(bindingGroups[0].id, 'steps');
  assert.strictEqual(bindingGroups[1].id, 'technical');
  assert.strictEqual(bindingGroups[1].defaultCollapsed, true);
}

async function testRepositoryIsReadOnly() {
  const statements = [];
  let call = 0;
  const fakeQuery = async (sql) => {
    statements.push(sql);
    call += 1;
    if (call === 1) return { rowCount: 1, rows: [{
      executionInternalId: '11111111-1111-1111-1111-111111111111',
      runId: 'run-1',
      workflowVersionInternalId: '22222222-2222-2222-2222-222222222222',
      workflowId: 'workflow-1', workflowName: 'Workflow One',
      workspaceKey: 'default', status: 'completed',
    }] };
    if (call === 2) return { rowCount: 1, rows: [{ nodeId: 'node-b' }] };
    if (call === 3) return { rowCount: 1, rows: [{ nodeId: 'node-a', depth: 1 }] };
    if (call === 4) return { rowCount: 1, rows: [{ finalNodes: 1, indexedNodes: 1, indexRows: 3 }] };
    if (call === 5) return { rowCount: 1, rows: [{ total: 3 }] };
    return { rowCount: 3, rows: SAMPLE_ROWS.slice(0, 3) };
  };

  const repository = createOutputSourceReadRepository({ queryFn: fakeQuery });
  const result = await repository.listOutputSources({
    workspaceKey: 'default', workflowId: 'workflow-1', runId: 'run-1',
    targetNodeId: 'node-b', includeTechnical: true, includeRaw: true,
    search: '', limit: 500, offset: 0,
  });
  assert.strictEqual(result.rows.length, 3);
  assert.deepStrictEqual(result.eligibleNodeIds, ['node-a']);
  assert.strictEqual(result.coverage.complete, true);
  assert.ok(statements.every((sql) => !/^\s*(INSERT|UPDATE|DELETE|ALTER|DROP|TRUNCATE|CREATE)\b/i.test(sql)));
  assert.ok(statements.some((sql) => /output_binding_source_v1/.test(sql)));
  assert.ok(statements.some((sql) => /WITH RECURSIVE upstream/.test(sql)));
}


async function testMissingTargetUsesSafeEmptyScope() {
  const statements = [];
  let call = 0;
  const fakeQuery = async (sql) => {
    statements.push(sql);
    call += 1;
    if (call === 1) return { rowCount: 1, rows: [{
      executionInternalId: '11111111-1111-1111-1111-111111111111',
      runId: 'run-old',
      workflowVersionInternalId: '22222222-2222-2222-2222-222222222222',
      workflowId: 'workflow-1', workflowName: 'Workflow One',
      workspaceKey: 'default', status: 'completed',
    }] };
    if (call === 2) return { rowCount: 0, rows: [] };
    if (call === 3) return { rowCount: 1, rows: [{ finalNodes: 0, indexedNodes: 0, indexRows: 0 }] };
    if (call === 4) return { rowCount: 1, rows: [{ total: 0 }] };
    return { rowCount: 0, rows: [] };
  };

  const repository = createOutputSourceReadRepository({ queryFn: fakeQuery });
  const result = await repository.listOutputSources({
    workspaceKey: 'default', workflowId: 'workflow-1', runId: 'run-old',
    targetNodeId: 'node-added-after-run', includeTechnical: true, includeRaw: true,
    search: '', limit: 500, offset: 0,
  });

  assert.deepStrictEqual(result.eligibleNodeIds, []);
  assert.strictEqual(result.rows.length, 0);
  assert.strictEqual(result.coverage.finalNodes, 0);
  assert.ok(statements.every((sql) => !/^\s*(INSERT|UPDATE|DELETE|ALTER|DROP|TRUNCATE|CREATE)/i.test(sql)));
}

async function testEnabledRoutes() {
  const calls = [];
  const repository = {
    async listOutputSources(input) {
      calls.push(input);
      return fakeResult(input);
    },
  };
  const { server, baseUrl } = await startServer(createPostgresOutputSourceRouter({
    enabled: true,
    workspaceKey: 'default',
    defaultLimit: 500,
    maxLimit: 2000,
    repository,
  }));

  try {
    const status = await getJson(`${baseUrl}/output-source/status`);
    assert.strictEqual(status.status, 200);
    assert.strictEqual(status.body.enabled, true);
    assert.strictEqual(status.body.readOnly, true);

    const legacySafe = await getJson(`${baseUrl}/workflows/workflow-1/output-sources`);
    assert.strictEqual(legacySafe.status, 200);
    assert.strictEqual(legacySafe.body.query.includeTechnical, false);
    assert.strictEqual(legacySafe.body.query.includeRaw, true);
    assert.strictEqual(legacySafe.body.coverage.totalMatchingRows, 3);
    assert.strictEqual(legacySafe.body.bindingGroups.length, 1);
    assert.strictEqual(legacySafe.body.readOnly, true);

    const filtered = await getJson(
      `${baseUrl}/workflows/workflow-1/output-sources?runId=run-1&targetNodeId=node-b&includeTechnical=true&search=rows`
    );
    assert.strictEqual(filtered.status, 200);
    assert.strictEqual(filtered.body.query.targetFilter, 'graph-ancestors');
    assert.strictEqual(filtered.body.bindingGroups.length, 2);
    assert.strictEqual(calls.at(-1).targetNodeId, 'node-b');
    assert.strictEqual(calls.at(-1).search, 'rows');

    const runDetail = await getJson(`${baseUrl}/workflows/workflow-1/runs/run-1/outputs`);
    assert.strictEqual(runDetail.status, 200);
    assert.strictEqual(runDetail.body.requestedRunId, 'run-1');
    assert.strictEqual(runDetail.body.query.includeTechnical, true);

    const invalid = await getJson(`${baseUrl}/workflows/..%2Fbad/output-sources`);
    assert.strictEqual(invalid.status, 400);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function testDisabledRoute() {
  let databaseCalls = 0;
  const repository = {
    async listOutputSources() {
      databaseCalls += 1;
      return fakeResult({ workflowId: 'workflow-1', workspaceKey: 'default' });
    },
  };
  const { server, baseUrl } = await startServer(createPostgresOutputSourceRouter({
    enabled: false,
    repository,
  }));
  try {
    const response = await getJson(`${baseUrl}/workflows/workflow-1/output-sources`);
    assert.strictEqual(response.status, 503);
    assert.strictEqual(response.body.code, 'OUTPUT_SOURCE_API_DISABLED');
    assert.strictEqual(databaseCalls, 0);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function main() {
  await testMapper();
  await testRepositoryIsReadOnly();
  await testMissingTargetUsesSafeEmptyScope();
  await testEnabledRoutes();
  await testDisabledRoute();
  console.log('Step 7B.5A output-source read API tests: PASS');
  console.log('Read-model queries: SELECT / WITH RECURSIVE only');
  console.log('Technical details default: hidden');
  console.log('Disabled-path database calls: 0');
  console.log('Graph-aware target filtering: verified');
  console.log('Stale design-time target nodes: safe empty scope');
}

main().catch((error) => {
  console.error('Step 7B.5A output-source read API tests: FAIL');
  console.error(error);
  process.exitCode = 1;
});
