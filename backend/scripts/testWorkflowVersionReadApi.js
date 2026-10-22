'use strict';

const assert = require('assert');
const http = require('http');
const express = require('express');
const {
  createWorkflowVersionReadRepository,
  mapVersionRow,
  sanitizeDefinition,
} = require('../db/workflowVersionReadRepository');
const {
  createPostgresWorkflowVersionRouter,
} = require('../routes/postgresWorkflowVersionRoutes');

const WORKFLOW = {
  workspaceInternalId: '11111111-1111-1111-1111-111111111111',
  workspaceKey: 'default',
  workflowInternalId: '22222222-2222-2222-2222-222222222222',
  workflowId: 'workflow-1',
  workflowName: 'Workflow One',
  currentVersionNumber: 3,
};

const VERSION_ROWS = [
  {
    id: '33333333-3333-3333-3333-333333333333',
    workflow_key: 'workflow-1', workflow_name: 'Workflow One',
    version_number: 3, version_label: 'v3', label: 'Database save v3',
    description: 'Latest', source_type: 'MANUAL', definition_schema_version: 1,
    definition_sha256: 'a'.repeat(64), action_count: 2, connection_count: 1,
    variable_count: 2, is_published: false, created_by: 'tester',
    created_at: '2026-08-04T10:00:00.000Z', is_current: true,
    definition_json: {
      name: 'Workflow One', actions: [{ id: 'a', properties: { password: 'never-return' } }, { id: 'b' }],
      connections: [{ id: 'c' }],
      variables: [
        { id: 'host', name: 'HOST', value: 'localhost', isSecret: false },
        { id: 'pwd', name: 'PASSWORD', value: 'secret', defaultValue: 'secret', isSecret: true },
      ],
    },
  },
  {
    id: '44444444-4444-4444-4444-444444444444',
    workflow_key: 'workflow-1', workflow_name: 'Workflow One',
    version_number: 2, version_label: 'v2', label: 'Database save v2',
    source_type: 'AUTOSAVE', definition_schema_version: 1,
    definition_sha256: 'b'.repeat(64), action_count: 1, connection_count: 0,
    variable_count: 0, is_published: false, created_by: 'tester',
    created_at: '2026-08-04T09:00:00.000Z', is_current: false,
    definition_json: { name: 'Workflow One', actions: [{ id: 'a' }], connections: [], variables: [] },
  },
];

function fakeRepositoryResult(input) {
  const versions = VERSION_ROWS.map((row) => mapVersionRow(row, {
    includeDefinition: input.includeDefinition,
  }));
  return { workflow: WORKFLOW, total: versions.length, limit: input.limit, offset: input.offset, versions };
}

async function startServer(router) {
  const app = express();
  app.use('/api/workspace', router);
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    server,
    baseUrl: `http://127.0.0.1:${server.address().port}/api/workspace`,
  };
}

async function getJson(url) {
  const response = await fetch(url);
  const body = await response.json();
  return { status: response.status, body };
}

async function testMappingAndRedaction() {
  const mapped = mapVersionRow(VERSION_ROWS[0], { includeDefinition: true });
  assert.strictEqual(mapped.versionNumber, 3);
  assert.strictEqual(mapped.isCurrent, true);
  assert.strictEqual(mapped.stats.actions, 2);
  assert.match(mapped.comparisonFingerprint, /^[0-9a-f]{8}$/);
  assert.strictEqual(mapped.state.actions[0].properties.password, '[REDACTED]');
  assert.strictEqual(mapped.state.variables[0].value, 'localhost');
  assert.strictEqual(mapped.state.variables[1].value, undefined);
  assert.strictEqual(mapped.state.variables[1].secretValueRedacted, true);
  assert.strictEqual(sanitizeDefinition({ clientSecret: 'x' }).clientSecret, '[REDACTED]');
}

async function testRepositoryReadOnly() {
  const statements = [];
  let call = 0;
  const fakeQuery = async (sql) => {
    statements.push(sql);
    call += 1;
    if (call === 1) return { rowCount: 1, rows: [WORKFLOW] };
    if (call === 2) return { rowCount: 1, rows: [{ total: 2 }] };
    if (call === 3) return { rowCount: 2, rows: VERSION_ROWS };
    if (call === 4) return { rowCount: 1, rows: [WORKFLOW] };
    return { rowCount: 1, rows: [VERSION_ROWS[0]] };
  };
  const repository = createWorkflowVersionReadRepository({ queryFn: fakeQuery });
  const list = await repository.listWorkflowVersions({
    workspaceKey: 'default', workflowId: 'workflow-1', limit: 40, offset: 0,
    includeDefinition: false, search: '', sourceType: '',
  });
  assert.strictEqual(list.versions.length, 2);
  assert.strictEqual(list.versions[0].state, undefined);
  assert.match(list.versions[0].comparisonFingerprint, /^[0-9a-f]{8}$/);
  const detail = await repository.getWorkflowVersion({
    workspaceKey: 'default', workflowId: 'workflow-1', versionIdentifier: 'current',
  });
  assert.strictEqual(detail.version.state.actions.length, 2);
  assert.ok(statements.every((sql) => !/^\s*(INSERT|UPDATE|DELETE|ALTER|DROP|TRUNCATE|CREATE)\b/i.test(sql)));
  assert.ok(statements.some((sql) => /autoflow\.workflow_version/.test(sql)));
}

async function testEnabledRoutes() {
  const calls = [];
  const repository = {
    async listWorkflowVersions(input) { calls.push(input); return fakeRepositoryResult(input); },
    async getWorkflowVersion(input) {
      calls.push(input);
      return { workflow: WORKFLOW, version: mapVersionRow(VERSION_ROWS[0], { includeDefinition: true }) };
    },
  };
  const { server, baseUrl } = await startServer(createPostgresWorkflowVersionRouter({
    enabled: true, workspaceKey: 'default', defaultLimit: 40, maxLimit: 100, repository,
  }));
  try {
    const status = await getJson(`${baseUrl}/version-history/status`);
    assert.strictEqual(status.status, 200);
    assert.strictEqual(status.body.enabled, true);
    assert.strictEqual(status.body.readOnly, true);
    assert.strictEqual(status.body.restoreEnabled, false);

    const list = await getJson(`${baseUrl}/workflows/workflow-1/versions`);
    assert.strictEqual(list.status, 200);
    assert.strictEqual(list.body.coverage.totalVersions, 2);
    assert.strictEqual(list.body.versions[0].state, undefined);
    assert.match(list.body.versions[0].comparisonFingerprint, /^[0-9a-f]{8}$/);
    assert.strictEqual(calls[0].includeDefinition, false);

    const withDefinition = await getJson(`${baseUrl}/workflows/workflow-1/versions?includeDefinition=true`);
    assert.strictEqual(withDefinition.status, 200);
    assert.strictEqual(withDefinition.body.versions[0].state.actions.length, 2);

    const detail = await getJson(`${baseUrl}/workflows/workflow-1/versions/current`);
    assert.strictEqual(detail.status, 200);
    assert.strictEqual(detail.body.version.isCurrent, true);
    assert.strictEqual(detail.body.version.state.actions.length, 2);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function testDisabledRoute() {
  let databaseCalls = 0;
  const repository = {
    async listWorkflowVersions() { databaseCalls += 1; return fakeRepositoryResult({}); },
    async getWorkflowVersion() { databaseCalls += 1; return {}; },
  };
  const { server, baseUrl } = await startServer(createPostgresWorkflowVersionRouter({
    enabled: false, repository,
  }));
  try {
    const response = await getJson(`${baseUrl}/workflows/workflow-1/versions`);
    assert.strictEqual(response.status, 503);
    assert.strictEqual(response.body.code, 'WORKFLOW_VERSION_HISTORY_API_DISABLED');
    assert.strictEqual(databaseCalls, 0);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function main() {
  await testMappingAndRedaction();
  await testRepositoryReadOnly();
  await testEnabledRoutes();
  await testDisabledRoute();
  console.log('Step 7B.6A workflow version-history read API tests: PASS');
  console.log('Read-model queries: SELECT only');
  console.log('Secret values in version definitions: redacted');
  console.log('Version restore writes: disabled');
  console.log('Disabled-path database calls: 0');
  console.log('Summary comparison fingerprints: verified');
  console.log('Frontend-compatible WorkflowVersion mapping: verified');
}

main().catch((error) => {
  console.error('Step 7B.6A workflow version-history read API tests: FAIL');
  console.error(error);
  process.exitCode = 1;
});
