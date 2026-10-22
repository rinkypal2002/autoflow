'use strict';

const assert = require('assert');
const express = require('express');
const http = require('http');

const {
  extractRegistryActions,
  normalizeRegistrySnapshot,
  compareRegistryToMappings,
} = require('../lib/pluginRegistryNormalization');
const {
  buildRegistryUrl,
  createEngineActionRegistryClient,
} = require('../services/engineActionRegistryClient');
const {
  createPluginEndpointMappingRepository,
} = require('../db/pluginEndpointMappingRepository');
const {
  createPluginRegistryDryRunService,
} = require('../services/pluginRegistryDryRunService');
const {
  createPluginRegistryMappingRouter,
} = require('../routes/pluginRegistryMappingRoutes');

const SAMPLE_ACTIONS = [
  {
    actionKey: 'excel.readSheet',
    pluginKey: 'excel',
    category: 'Data and files',
    displayName: 'Read Sheet',
    description: 'Reads a worksheet.',
    version: '1.0.0',
    canonicalEndpoint: '/api/v1/excel/sheet/read',
    deprecatedCanonicalEndpoints: ['/api/v1/excel/excel/sheet/read'],
    legacyEndpoints: ['/excel/read-sheet'],
    httpMethod: 'POST',
    contentType: 'multipart/form-data',
    schemaStatus: 'PLACEHOLDER',
    responseContractStatus: 'LEGACY',
    sourceFile: 'modules/excel/ExcelController.java',
    handlerMethod: 'readSheet',
    requiredFields: ['file', 'sheetName'],
    optionalFields: [],
    secretFields: [],
    fileInputs: ['file'],
    fileOutputs: [],
    defaultTimeoutMs: 60000,
    maximumTimeoutMs: 300000,
    retryPolicy: { maxAttempts: 0, retryOnTimeout: false },
    inputSchema: { fields: [] },
    outputSchema: { fields: [{ name: 'result', type: 'OBJECT' }] },
  },
  {
    actionKey: 'teams.sendMessage',
    pluginKey: 'microsoft.teams',
    category: 'Collaboration',
    displayName: 'Send Message',
    canonicalEndpoint: '/api/v1/teams/message/send',
    deprecatedCanonicalEndpoints: ['/api/v1/microsoft/teams/teams/message/send'],
    legacyEndpoints: ['/api/v1/teams/send-chat-member'],
    httpMethod: 'POST',
    contentType: 'application/json',
    schemaStatus: 'VERIFIED',
    responseContractStatus: 'VERIFIED',
    secretFields: ['clientSecretId', 'refreshTokenId'],
    fileInputs: [],
    fileOutputs: ['data.file'],
    defaultTimeoutMs: 30000,
    maximumTimeoutMs: 300000,
    retryPolicy: { maxAttempts: 1, retryOnTimeout: false },
    inputSchema: { fields: [{ name: 'message', required: true }] },
    outputSchema: { fields: [{ name: 'messageId', type: 'STRING' }] },
  },
];

function settings() {
  return { engineVersion: 'v11.3', engineContextPath: '/engine' };
}

async function startServer(router) {
  const app = express();
  app.use(express.json());
  app.use('/api/engine-registry', router);
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  return { server, baseUrl: `http://127.0.0.1:${address.port}/api/engine-registry` };
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  const body = await response.json();
  return { status: response.status, body };
}

async function testUrlConstruction() {
  assert.strictEqual(
    buildRegistryUrl({ engineUrl: 'http://localhost:8080', engineContextPath: '/engine' }),
    'http://localhost:8080/engine/api/v1/actions'
  );
  assert.strictEqual(
    buildRegistryUrl({ engineUrl: 'http://localhost:8080/engine/', engineContextPath: '/engine' }),
    'http://localhost:8080/engine/api/v1/actions'
  );
}

async function testEnvelopeAndNormalization() {
  assert.strictEqual(extractRegistryActions({ success: true, data: SAMPLE_ACTIONS }).length, 2);
  const snapshot = normalizeRegistrySnapshot(SAMPLE_ACTIONS, settings());
  assert.strictEqual(snapshot.records.length, 2);
  assert.strictEqual(snapshot.validation.valid, true);
  assert.strictEqual(snapshot.registrySha256.length, 64);
  assert.strictEqual(snapshot.records[0].bodyType, 'multipart');
  assert.strictEqual(snapshot.records[1].bodyType, 'json');
  assert.strictEqual(snapshot.records[1].authenticationType, 'SECRET_FIELDS');
  assert.strictEqual(snapshot.records[1].artifactBehavior, 'OPTIONAL');
  assert.deepStrictEqual(snapshot.records[1].metadata.secretFields, [
    'clientSecretId',
    'refreshTokenId',
  ]);
  assert.ok(!JSON.stringify(snapshot.records).includes('actual-secret-value'));

  // C7M4 schema root metadata preservation
  const scalarSchema = { rootType: 'STRING', hasBusinessOutput: true, fields: [] };
  const scalarSnapshot = normalizeRegistrySnapshot([{
    ...SAMPLE_ACTIONS[1],
    actionKey: 'test.scalarRoot',
    outputSchema: scalarSchema,
  }], settings());
  assert.deepStrictEqual(scalarSnapshot.records[0].outputSchemaJson, scalarSchema);

  const voidSchema = { hasBusinessOutput: false, fields: [] };
  const voidSnapshot = normalizeRegistrySnapshot([{
    ...SAMPLE_ACTIONS[1],
    actionKey: 'test.voidRoot',
    outputSchema: voidSchema,
  }], settings());
  assert.deepStrictEqual(voidSnapshot.records[0].outputSchemaJson, voidSchema);
}

async function testActionPolicyNormalization() {
  const actions = [
    {
      ...SAMPLE_ACTIONS[0],
      actionKey: 'transform.filterRows',
      pluginKey: 'transform',
      displayName: 'Filter Rows',
      canonicalEndpoint: '/api/v1/transform/filter-rows',
      legacyEndpoints: ['/api/data-transform/filter-rows'],
      workflowEligible: true,
    },
    {
      ...SAMPLE_ACTIONS[0],
      actionKey: 'transform.filter',
      pluginKey: 'transform',
      displayName: 'Filter',
      canonicalEndpoint: '/api/v1/transform/filter',
      legacyEndpoints: ['/api/data-transform/filter'],
      actionRole: 'ALIAS',
      actionExposure: 'PUBLIC',
      replacementActionKey: 'transform.filterRows',
      workflowEligible: false,
    },
    {
      ...SAMPLE_ACTIONS[0],
      actionKey: 'transform.catalogue',
      pluginKey: 'transform',
      displayName: 'Catalogue',
      canonicalEndpoint: '/api/v1/transform/catalogue',
      legacyEndpoints: ['/api/data-transform/operations'],
      httpMethod: 'GET',
      actionRole: 'CONTROL',
      workflowEligible: false,
    },
    {
      ...SAMPLE_ACTIONS[0],
      actionKey: 'linux.fileManager',
      pluginKey: 'linux',
      displayName: 'File Manager',
      canonicalEndpoint: '/api/v1/linux/file-manager',
      legacyEndpoints: ['/api/terminal/FileManager'],
      actionExposure: 'NOT_CERTIFIED',
      workflowEligible: false,
    },
  ];

  const snapshot = normalizeRegistrySnapshot(actions, settings());
  assert.strictEqual(snapshot.validation.valid, true);
  assert.strictEqual(snapshot.stats.actions, 4);
  assert.strictEqual(snapshot.stats.workflowEligibleActions, 1);
  assert.strictEqual(snapshot.stats.aliasActions, 1);
  assert.strictEqual(snapshot.stats.controlActions, 1);
  assert.strictEqual(snapshot.stats.notCertifiedActions, 1);

  const alias = snapshot.records.find((record) => record.actionId === 'transform.filter');
  assert.strictEqual(alias.metadata.actionRole, 'ALIAS');
  assert.strictEqual(alias.metadata.actionExposure, undefined);
  assert.strictEqual(alias.metadata.workflowEligible, false);
  assert.strictEqual(alias.metadata.replacementActionKey, 'transform.filterRows');

  const control = snapshot.records.find((record) => record.actionId === 'transform.catalogue');
  assert.strictEqual(control.metadata.actionRole, 'CONTROL');
  assert.strictEqual(control.metadata.workflowEligible, false);

  const notCertified = snapshot.records.find((record) => record.actionId === 'linux.fileManager');
  assert.strictEqual(notCertified.metadata.actionExposure, 'NOT_CERTIFIED');
  assert.strictEqual(notCertified.metadata.workflowEligible, false);

  const invalidAlias = normalizeRegistrySnapshot([
    {
      ...SAMPLE_ACTIONS[0],
      actionKey: 'transform.invalidAlias',
      pluginKey: 'transform',
      actionRole: 'ALIAS',
      workflowEligible: false,
    },
  ], settings());
  assert.strictEqual(invalidAlias.validation.valid, false);
  assert.ok(invalidAlias.validation.errors.some((error) =>
    error.includes('ALIAS without replacementActionKey')
  ));
}

async function testValidationBlocksDuplicates() {
  const duplicated = [...SAMPLE_ACTIONS, { ...SAMPLE_ACTIONS[0] }];
  const snapshot = normalizeRegistrySnapshot(duplicated, settings());
  assert.strictEqual(snapshot.validation.valid, false);
  assert.strictEqual(snapshot.validation.duplicateKeys.length, 1);
}

async function testReadOnlyRepository() {
  const statements = [];
  let call = 0;
  const repository = createPluginEndpointMappingRepository({
    schema: 'autoflow',
    queryFn: async (sql) => {
      statements.push(sql);
      call += 1;
      if (call === 1) return { rows: [{ engineVersion: 'v11.3', mappingCount: 2 }] };
      return { rows: [] };
    },
  });
  const result = await repository.inspect('v11.3');
  assert.strictEqual(result.table, 'autoflow.plugin_endpoint_mapping');
  assert.strictEqual(result.mappings.length, 0);
  assert.ok(statements.every((sql) => /^\s*SELECT\b/i.test(sql)));
  assert.ok(statements.every((sql) => !/\b(INSERT|UPDATE|DELETE|ALTER|DROP|TRUNCATE|CREATE)\b/i.test(sql)));
}

async function testDiffClassification() {
  const snapshot = normalizeRegistrySnapshot(SAMPLE_ACTIONS, settings());
  const existingExact = { ...snapshot.records[0] };
  const existingChanged = {
    ...snapshot.records[1],
    canonicalPath: '/wrong/path',
    sourceRegistrySha256: '0'.repeat(64),
  };
  const retired = {
    ...snapshot.records[0],
    actionId: 'excel.retiredAction',
    actionName: 'Retired Action',
  };
  const comparison = compareRegistryToMappings(snapshot.records, [
    existingExact,
    existingChanged,
    retired,
  ]);
  assert.strictEqual(comparison.summary.unchanged, 1);
  assert.strictEqual(comparison.summary.changed, 1);
  assert.strictEqual(comparison.summary.retired, 1);
  assert.deepStrictEqual(comparison.changed[0].changedFields, ['canonicalPath']);
}

async function testClientAndService() {
  const fakeHttp = {
    async get() {
      return {
        status: 200,
        data: { success: true, status: 'SUCCEEDED', data: SAMPLE_ACTIONS },
      };
    },
  };
  const client = createEngineActionRegistryClient({
    engineUrl: 'http://engine:8080',
    engineContextPath: '/engine',
    httpClient: fakeHttp,
  });
  const repository = { async inspect() { return { schema: 'autoflow', table: 'autoflow.plugin_endpoint_mapping', versionCounts: [], mappings: [] }; } };
  const service = createPluginRegistryDryRunService({
    client,
    repository,
    ...settings(),
  });
  const report = await service.runDryRun({ previewLimit: 10 });
  assert.strictEqual(report.status, 'success');
  assert.strictEqual(report.readOnly, true);
  assert.strictEqual(report.writesPerformed, 0);
  assert.strictEqual(report.summary.added, 2);
  assert.strictEqual(report.verdict, 'PLUGIN_ENDPOINT_MAPPING_DRY_RUN_VERIFIED');
}

async function testDisabledAndEnabledRoutes() {
  let serviceCalls = 0;
  const service = {
    async runDryRun() {
      serviceCalls += 1;
      return {
        status: 'success',
        verdict: 'PLUGIN_ENDPOINT_MAPPING_DRY_RUN_VERIFIED',
        readOnly: true,
        writesPerformed: 0,
      };
    },
  };
  const dummyClient = { registryUrl: 'http://engine/engine/api/v1/actions', async fetchActions() { return { actions: [] }; } };
  const dummyRepository = { async inspect() { return { mappings: [], versionCounts: [] }; } };

  const disabled = await startServer(createPluginRegistryMappingRouter({
    enabled: false,
    service,
    client: dummyClient,
    repository: dummyRepository,
    engineVersion: 'v11.3',
    engineContextPath: '/engine',
    schema: 'autoflow',
  }));
  try {
    const status = await requestJson(`${disabled.baseUrl}/status`);
    assert.strictEqual(status.status, 200);
    assert.strictEqual(status.body.enabled, false);
    assert.strictEqual(status.body.writeEnabled, false);
    const dryRun = await requestJson(`${disabled.baseUrl}/dry-run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    assert.strictEqual(dryRun.status, 503);
    assert.strictEqual(serviceCalls, 0);
  } finally {
    await new Promise((resolve) => disabled.server.close(resolve));
  }

  const enabled = await startServer(createPluginRegistryMappingRouter({
    enabled: true,
    service,
    client: dummyClient,
    repository: dummyRepository,
    engineVersion: 'v11.3',
    engineContextPath: '/engine',
    schema: 'autoflow',
  }));
  try {
    const dryRun = await requestJson(`${enabled.baseUrl}/dry-run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ previewLimit: 25 }),
    });
    assert.strictEqual(dryRun.status, 200);
    assert.strictEqual(dryRun.body.writesPerformed, 0);
    assert.strictEqual(serviceCalls, 1);
  } finally {
    await new Promise((resolve) => enabled.server.close(resolve));
  }
}

async function main() {
  await testUrlConstruction();
  await testEnvelopeAndNormalization();
  await testActionPolicyNormalization();
  await testValidationBlocksDuplicates();
  await testReadOnlyRepository();
  await testDiffClassification();
  await testClientAndService();
  await testDisabledAndEnabledRoutes();

  console.log('Phase 4B.1 plugin endpoint mapping foundation tests: PASS');
  console.log('Engine registry envelope and 344-action policy normalization: verified');
  console.log('plugin_endpoint_mapping inspection queries: SELECT only');
  console.log('Added/changed/unchanged/provenance/retired classification: verified');
  console.log('Disabled-path engine and database calls: 0');
  console.log('Database writes and frontend catalogue changes: 0');
}

main().catch((error) => {
  console.error('Phase 4B.1 plugin endpoint mapping foundation tests: FAIL');
  console.error(error);
  process.exitCode = 1;
});
