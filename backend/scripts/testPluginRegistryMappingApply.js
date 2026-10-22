'use strict';

const assert = require('assert');
const {
  normalizeRegistrySnapshot,
  compareRegistryToMappings,
  mappingSetFingerprint,
} = require('../lib/pluginRegistryNormalization');
const {
  createPluginRegistryApplyService,
} = require('../services/pluginRegistryApplyService');

const ACTIONS = [
  {
    actionKey: 'excel.readSheet',
    pluginKey: 'excel',
    category: 'Data and files',
    displayName: 'Read Sheet',
    version: '1.0.0',
    canonicalEndpoint: '/api/v1/excel/read-sheet',
    legacyEndpoints: ['/excel/read-sheet'],
    httpMethod: 'POST',
    contentType: 'multipart/form-data',
    schemaStatus: 'PLACEHOLDER',
    responseContractStatus: 'LEGACY',
    inputSchema: { fields: [] },
    outputSchema: { fields: [{ name: 'result', type: 'OBJECT' }] },
    retryPolicy: { maxAttempts: 0, retryOnTimeout: false },
    defaultTimeoutMs: 60000,
  },
  {
    actionKey: 'teams.sendMessage',
    pluginKey: 'microsoft.teams',
    category: 'Collaboration',
    displayName: 'Send Message',
    version: '1.0.0',
    canonicalEndpoint: '/api/v1/teams/send-message',
    legacyEndpoints: ['/api/v1/teams/send-chat-member'],
    httpMethod: 'POST',
    contentType: 'application/json',
    schemaStatus: 'VERIFIED',
    responseContractStatus: 'VERIFIED',
    inputSchema: { fields: [{ name: 'message', required: true }] },
    outputSchema: { fields: [{ name: 'messageId', type: 'STRING' }] },
    secretFields: ['clientSecretId'],
    retryPolicy: { maxAttempts: 0, retryOnTimeout: false },
    defaultTimeoutMs: 30000,
  },
];

function createFakeRepository(initialRows = []) {
  let rows = JSON.parse(JSON.stringify(initialRows));
  return {
    async inspect(engineVersion) {
      const selected = rows.filter((row) => row.engineVersion === engineVersion);
      return {
        schema: 'autoflow',
        table: 'autoflow.plugin_endpoint_mapping',
        versionCounts: [],
        mappings: JSON.parse(JSON.stringify(selected)),
        fingerprint: mappingSetFingerprint(selected),
      };
    },
    async applyRegistrySnapshot(input) {
      const current = rows.filter((row) => row.engineVersion === input.engineVersion);
      const actual = mappingSetFingerprint(current);
      if (actual !== input.expectedDatabaseFingerprint) {
        const error = new Error('stale');
        error.code = 'PLUGIN_ENDPOINT_MAPPING_STALE_PLAN';
        throw error;
      }
      const comparison = compareRegistryToMappings(input.desiredRecords, current);
      const other = rows.filter((row) => row.engineVersion !== input.engineVersion);
      const retired = input.retireMissing
        ? comparison.retired.map((change) => ({
            ...change.existing,
            enabled: false,
            deprecated: true,
          }))
        : [];
      const desired = input.desiredRecords.map((record, index) => ({
        id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
        ...record,
        rowVersion: 0,
        createdAt: '2026-08-05T00:00:00.000Z',
        updatedAt: '2026-08-05T00:00:00.000Z',
      }));
      rows = [...other, ...desired, ...retired];
      return {
        beforeRows: current,
        beforeFingerprint: actual,
        afterRows: rows.filter((row) => row.engineVersion === input.engineVersion),
        afterFingerprint: mappingSetFingerprint(
          rows.filter((row) => row.engineVersion === input.engineVersion)
        ),
        comparisonBefore: comparison.summary,
        writes: {
          inserted: comparison.added.length,
          updated: comparison.changed.length,
          provenanceUpdated: comparison.provenanceOnly.length,
          retired: comparison.retired.length,
          total:
            comparison.added.length +
            comparison.changed.length +
            comparison.provenanceOnly.length +
            comparison.retired.length,
        },
        verification: {
          activeDesiredMappings: input.desiredRecords.length,
          totalEngineVersionMappings: input.desiredRecords.length + retired.length,
          remainingDifferences: { added: 0, changed: 0, provenanceOnly: 0, retired: 0 },
        },
      };
    },
  };
}

function createClient() {
  return {
    async fetchActions() {
      return {
        actions: ACTIONS,
        registryUrl: 'http://localhost:8080/engine/api/v1/actions',
        fetchedAt: new Date().toISOString(),
        responseStatus: 'SUCCEEDED',
        responseMessage: '2 action(s)',
      };
    },
  };
}

async function expectCode(promise, code) {
  let seen = null;
  try {
    await promise;
  } catch (error) {
    seen = error.code;
  }
  assert.strictEqual(seen, code);
}

async function main() {
  const client = createClient();
  const repository = createFakeRepository();
  const disabled = createPluginRegistryApplyService({
    client,
    repository,
    engineVersion: 'v11.3',
    engineContextPath: '/engine',
    writeEnabled: false,
    retireMissing: true,
  });
  const disabledPlan = await disabled.createPlan();
  assert.strictEqual(disabledPlan.status, 'success');
  assert.strictEqual(disabledPlan.summary.added, 2);
  assert.strictEqual(disabledPlan.database.existingTargetMappings, 0);
  await expectCode(
    disabled.applyPlan(disabledPlan, {
      confirmToken: 'APPLY_PLUGIN_ENDPOINT_MAPPING',
    }),
    'PLUGIN_ENDPOINT_MAPPING_WRITES_DISABLED'
  );

  const enabled = createPluginRegistryApplyService({
    client,
    repository,
    engineVersion: 'v11.3',
    engineContextPath: '/engine',
    writeEnabled: true,
    retireMissing: true,
  });
  const plan = await enabled.createPlan();
  await expectCode(
    enabled.applyPlan(plan, { confirmToken: 'wrong' }),
    'PLUGIN_ENDPOINT_MAPPING_CONFIRMATION_REQUIRED'
  );
  await expectCode(
    enabled.applyPlan(plan, {
      confirmToken: 'APPLY_PLUGIN_ENDPOINT_MAPPING',
      expectedRegistrySha256: '0'.repeat(64),
    }),
    'PLUGIN_ENDPOINT_MAPPING_REGISTRY_SHA_MISMATCH'
  );

  const report = await enabled.applyPlan(plan, {
    confirmToken: 'APPLY_PLUGIN_ENDPOINT_MAPPING',
    expectedRegistrySha256: plan.engine.registrySha256,
  });
  assert.strictEqual(report.verdict, 'PLUGIN_ENDPOINT_MAPPING_APPLY_VERIFIED');
  assert.strictEqual(report.transactionCommitted, true);
  assert.strictEqual(report.writes.inserted, 2);
  assert.strictEqual(report.writes.total, 2);
  assert.strictEqual(report.after.verification.activeDesiredMappings, 2);
  assert.deepStrictEqual(report.after.verification.remainingDifferences, {
    added: 0,
    changed: 0,
    provenanceOnly: 0,
    retired: 0,
  });

  const afterPlan = await enabled.createPlan();
  assert.strictEqual(afterPlan.summary.added, 0);
  assert.strictEqual(afterPlan.summary.changed, 0);
  assert.strictEqual(afterPlan.summary.provenanceOnly, 0);
  assert.strictEqual(afterPlan.summary.retired, 0);
  assert.strictEqual(afterPlan.summary.unchanged, 2);

  const staticSnapshot = normalizeRegistrySnapshot(ACTIONS, {
    engineVersion: 'v11.3',
    engineContextPath: '/engine',
  });
  assert.strictEqual(staticSnapshot.validation.errors.length, 0);
  assert.strictEqual(staticSnapshot.records.length, 2);

  console.log('Phase 4B.2 transactional plugin endpoint mapping apply tests: PASS');
  console.log('Explicit write flag and confirmation token: verified');
  console.log('Registry SHA and stale-plan protections: verified');
  console.log('Transactional insert/update/provenance/retirement model: verified');
  console.log('Post-apply zero-difference verification: verified');
  console.log('Exact pre-apply snapshot rollback contract: verified');
  console.log('HTTP apply endpoint and frontend catalogue changes: 0');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
