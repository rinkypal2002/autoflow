'use strict';

const assert = require('assert');
const express = require('express');
const http = require('http');
const {
  createPluginEndpointMappingRepository,
} = require('../db/pluginEndpointMappingRepository');
const {
  createPluginEndpointMappingReadRouter,
} = require('../routes/pluginEndpointMappingReadRoutes');

async function startServer(router) {
  const app = express();
  app.use('/api/plugin-mappings', router);
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  return { server, baseUrl: `http://127.0.0.1:${address.port}/api/plugin-mappings` };
}

async function requestJson(url) {
  const response = await fetch(url);
  return { status: response.status, body: await response.json() };
}

async function testReadRepositoryIsSelectOnly() {
  const statements = [];
  const repository = createPluginEndpointMappingRepository({
    schema: 'autoflow',
    queryFn: async (sql) => {
      statements.push(sql);
      if (/count\(\*\)/i.test(sql)) {
        return {
          rows: [{
            totalMappings: 343,
            activeMappings: 343,
            verifiedSchemas: 0,
            placeholderSchemas: 343,
          }],
        };
      }
      return {
        rows: [{
          engineVersion: 'v11.3',
          engineContextPath: '/engine',
          pluginId: 'excel',
          pluginName: 'Excel',
          category: 'Data and files',
          actionId: 'excel.readSheet',
          actionName: 'Read Sheet',
          httpMethod: 'POST',
          canonicalPath: '/api/v1/excel/read-sheet',
          legacyPath: '/excel/read-sheet',
          requestContentTypes: ['multipart/form-data'],
          responseContentTypes: ['application/json'],
          bodyType: 'multipart',
          schemaStatus: 'PLACEHOLDER',
          responseContractVersion: 'LEGACY',
          authenticationType: null,
          artifactBehavior: 'NONE',
          timeoutMs: 60000,
          enabled: true,
          deprecated: false,
          metadata: { legacyEndpoints: ['/excel/read-sheet'] },
          updatedAt: '2026-08-05T07:33:52.196Z',
        }],
      };
    },
  });

  const result = await repository.readMappings({
    engineVersion: 'v11.3',
    includeDeprecated: false,
    limit: 500,
    offset: 0,
  });
  assert.strictEqual(result.coverage.totalMappings, 343);
  assert.strictEqual(result.mappings.length, 1);
  assert.ok(statements.every((sql) => /^\s*SELECT\b/i.test(sql)));
  assert.ok(statements.every((sql) => !/\b(INSERT|UPDATE|DELETE|ALTER|DROP|TRUNCATE|CREATE)\b/i.test(sql)));
  assert.ok(!JSON.stringify(result).includes('inputSchemaJson'));
  assert.ok(!JSON.stringify(result).includes('outputSchemaJson'));
}

async function testDisabledRouteDoesNotCallRepository() {
  let calls = 0;
  const repository = { async readMappings() { calls += 1; return {}; } };
  const instance = await startServer(createPluginEndpointMappingReadRouter({
    enabled: false,
    repository,
    engineVersion: 'v11.3',
    schema: 'autoflow',
  }));
  try {
    const status = await requestJson(`${instance.baseUrl}/status`);
    assert.strictEqual(status.status, 200);
    assert.strictEqual(status.body.enabled, false);
    assert.strictEqual(status.body.readOnly, true);
    const mappings = await requestJson(instance.baseUrl);
    assert.strictEqual(mappings.status, 503);
    assert.strictEqual(mappings.body.code, 'PLUGIN_MAPPING_READ_API_DISABLED');
    assert.strictEqual(calls, 0);
  } finally {
    await new Promise((resolve) => instance.server.close(resolve));
  }
}

async function testEnabledRouteContract() {
  let input = null;
  const repository = {
    async readMappings(value) {
      input = value;
      return {
        table: 'autoflow.plugin_endpoint_mapping',
        engineVersion: value.engineVersion,
        coverage: {
          totalMappings: 343,
          activeMappings: 343,
          verifiedSchemas: 0,
          placeholderSchemas: 343,
          returnedMappings: 1,
          hasMore: true,
        },
        mappings: [{
          pluginId: 'excel',
          actionId: 'excel.readSheet',
          actionName: 'Read Sheet',
          httpMethod: 'POST',
          canonicalPath: '/api/v1/excel/read-sheet',
          schemaStatus: 'PLACEHOLDER',
          enabled: true,
          deprecated: false,
        }],
      };
    },
  };
  const instance = await startServer(createPluginEndpointMappingReadRouter({
    enabled: true,
    repository,
    engineVersion: 'v11.3',
    defaultLimit: 500,
    maxLimit: 1000,
    schema: 'autoflow',
  }));
  try {
    const result = await requestJson(`${instance.baseUrl}?limit=750&search=excel`);
    assert.strictEqual(result.status, 200);
    assert.strictEqual(result.body.status, 'success');
    assert.strictEqual(result.body.source, 'postgres');
    assert.strictEqual(result.body.readOnly, true);
    assert.strictEqual(result.body.writeEndpointAvailable, false);
    assert.strictEqual(result.body.coverage.totalMappings, 343);
    assert.strictEqual(result.body.mappings.length, 1);
    assert.strictEqual(input.limit, 750);
    assert.strictEqual(input.search, 'excel');
  } finally {
    await new Promise((resolve) => instance.server.close(resolve));
  }
}

async function main() {
  await testReadRepositoryIsSelectOnly();
  await testDisabledRouteDoesNotCallRepository();
  await testEnabledRouteContract();
  console.log('Phase 4C.1 plugin mapping read API tests: PASS');
  console.log('Read-model queries: SELECT only');
  console.log('Input/output schema payloads: excluded from catalogue list');
  console.log('Disabled-path database calls: 0');
  console.log('Write endpoint availability: 0');
  console.log('Frontend-compatible mapping contract: verified');
}

main().catch((error) => {
  console.error('Phase 4C.1 plugin mapping read API tests: FAIL');
  console.error(error);
  process.exitCode = 1;
});
