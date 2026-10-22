'use strict';

const crypto = require('crypto');
const {
  normalizeRegistrySnapshot,
  compareRegistryToMappings,
  mappingSetFingerprint,
  stableStringify,
  sha256,
} = require('../lib/pluginRegistryNormalization');

function createBatchId() {
  return `phase4b2-${crypto.randomBytes(8).toString('hex')}`;
}

function createPluginRegistryApplyService(options = {}) {
  if (!options.client || typeof options.client.fetchActions !== 'function') {
    throw new TypeError('Plugin registry apply service requires an engine registry client.');
  }
  if (!options.repository || typeof options.repository.inspect !== 'function') {
    throw new TypeError('Plugin registry apply service requires a mapping repository.');
  }

  const client = options.client;
  const repository = options.repository;
  const settings = {
    engineVersion: options.engineVersion,
    engineContextPath: options.engineContextPath || '/engine',
  };
  const writeEnabled = Boolean(options.writeEnabled);
  const retireMissing = options.retireMissing !== false;

  async function createPlan() {
    const startedAt = Date.now();
    const engineSnapshot = await client.fetchActions();
    const normalized = normalizeRegistrySnapshot(engineSnapshot.actions, settings);
    const database = await repository.inspect(settings.engineVersion);
    const comparison = compareRegistryToMappings(
      normalized.records,
      database.mappings
    );
    const problems = [...normalized.validation.errors];

    return {
      generatedAt: new Date().toISOString(),
      mode: 'TRANSACTIONAL_PLUGIN_ENDPOINT_MAPPING_APPLY_PLAN',
      status: problems.length === 0 ? 'success' : 'error',
      verdict:
        problems.length === 0
          ? 'PLUGIN_ENDPOINT_MAPPING_APPLY_READY'
          : 'PLUGIN_ENDPOINT_MAPPING_APPLY_BLOCKED',
      readOnly: true,
      writesPerformed: 0,
      durationMs: Date.now() - startedAt,
      engine: {
        registryUrl: engineSnapshot.registryUrl,
        fetchedAt: engineSnapshot.fetchedAt,
        responseStatus: engineSnapshot.responseStatus,
        responseMessage: engineSnapshot.responseMessage,
        engineVersion: settings.engineVersion,
        engineContextPath: settings.engineContextPath,
        registrySha256: normalized.registrySha256,
        ...normalized.stats,
      },
      database: {
        schema: database.schema,
        table: database.table,
        targetEngineVersion: settings.engineVersion,
        existingTargetMappings: database.mappings.length,
        fingerprint:
          database.fingerprint || mappingSetFingerprint(database.mappings),
        versionCounts: database.versionCounts,
      },
      summary: comparison.summary,
      validation: normalized.validation,
      problems,
      warnings: [...normalized.validation.warnings],
      retireMissing,
      desiredRecords: normalized.records,
      existingRows: database.mappings,
      planSha256: sha256(
        stableStringify({
          registrySha256: normalized.registrySha256,
          databaseFingerprint:
            database.fingerprint || mappingSetFingerprint(database.mappings),
          summary: comparison.summary,
          retireMissing,
        })
      ),
    };
  }

  async function applyPlan(plan, input = {}) {
    if (!writeEnabled) {
      const error = new Error(
        'Plugin endpoint mapping writes are disabled. Set PLUGIN_ENDPOINT_MAPPING_WRITE_ENABLED=true only for the controlled CLI apply.'
      );
      error.code = 'PLUGIN_ENDPOINT_MAPPING_WRITES_DISABLED';
      throw error;
    }
    if (!plan || plan.status !== 'success' || plan.problems.length > 0) {
      const error = new Error('Plugin endpoint mapping apply plan is not safe to apply.');
      error.code = 'PLUGIN_ENDPOINT_MAPPING_APPLY_PLAN_BLOCKED';
      throw error;
    }
    if (input.confirmToken !== 'APPLY_PLUGIN_ENDPOINT_MAPPING') {
      const error = new Error(
        'Explicit confirmation token APPLY_PLUGIN_ENDPOINT_MAPPING is required.'
      );
      error.code = 'PLUGIN_ENDPOINT_MAPPING_CONFIRMATION_REQUIRED';
      throw error;
    }
    if (
      input.expectedRegistrySha256 &&
      input.expectedRegistrySha256 !== plan.engine.registrySha256
    ) {
      const error = new Error('Live registry SHA-256 does not match the expected value.');
      error.code = 'PLUGIN_ENDPOINT_MAPPING_REGISTRY_SHA_MISMATCH';
      throw error;
    }

    const batchId = input.batchId || createBatchId();
    const startedAt = Date.now();
    const result = await repository.applyRegistrySnapshot({
      engineVersion: settings.engineVersion,
      desiredRecords: plan.desiredRecords,
      expectedDatabaseFingerprint: plan.database.fingerprint,
      retireMissing,
      batchId,
    });

    return {
      generatedAt: new Date().toISOString(),
      mode: 'TRANSACTIONAL_PLUGIN_ENDPOINT_MAPPING_APPLY',
      status: 'success',
      verdict: 'PLUGIN_ENDPOINT_MAPPING_APPLY_VERIFIED',
      readOnly: false,
      transactionCommitted: true,
      durationMs: Date.now() - startedAt,
      engineVersion: settings.engineVersion,
      registrySha256: plan.engine.registrySha256,
      planSha256: plan.planSha256,
      batchId,
      before: {
        mappings: result.beforeRows.length,
        fingerprint: result.beforeFingerprint,
        summary: result.comparisonBefore,
      },
      writes: result.writes,
      after: {
        mappings: result.afterRows.length,
        fingerprint: result.afterFingerprint,
        verification: result.verification,
      },
      rollbackBackupRequired: true,
    };
  }

  return {
    createPlan,
    applyPlan,
  };
}

module.exports = {
  createBatchId,
  createPluginRegistryApplyService,
};
