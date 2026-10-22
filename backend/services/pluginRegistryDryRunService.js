'use strict';

const {
  normalizeRegistrySnapshot,
  compareRegistryToMappings,
} = require('../lib/pluginRegistryNormalization');

function trimChange(change, includeRecords) {
  if (includeRecords) return change;
  const copy = { ...change };
  delete copy.desired;
  delete copy.existing;
  return copy;
}

function createPluginRegistryDryRunService(options = {}) {
  if (!options.client || typeof options.client.fetchActions !== 'function') {
    throw new TypeError('Plugin registry dry-run service requires an engine registry client.');
  }
  if (!options.repository || typeof options.repository.inspect !== 'function') {
    throw new TypeError('Plugin registry dry-run service requires a mapping repository.');
  }

  const client = options.client;
  const repository = options.repository;
  const settings = {
    engineVersion: options.engineVersion,
    engineContextPath: options.engineContextPath || '/engine',
  };

  async function runDryRun(input = {}) {
    const previewLimit = Math.min(500, Math.max(1, Number(input.previewLimit) || 50));
    const includeRecords = Boolean(input.includeRecords);
    const startedAt = Date.now();

    const engineSnapshot = await client.fetchActions();
    const normalized = normalizeRegistrySnapshot(engineSnapshot.actions, settings);
    const database = await repository.inspect(settings.engineVersion);
    const comparison = compareRegistryToMappings(
      normalized.records,
      database.mappings
    );

    const problems = [...normalized.validation.errors];
    const warnings = [...normalized.validation.warnings];
    const verdict = problems.length === 0
      ? 'PLUGIN_ENDPOINT_MAPPING_DRY_RUN_VERIFIED'
      : 'PLUGIN_ENDPOINT_MAPPING_DRY_RUN_BLOCKED';

    return {
      generatedAt: new Date().toISOString(),
      mode: 'READ_ONLY_PLUGIN_ENDPOINT_MAPPING_DRY_RUN',
      status: problems.length === 0 ? 'success' : 'error',
      verdict,
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
        versionCounts: database.versionCounts,
      },
      validation: normalized.validation,
      summary: comparison.summary,
      problems,
      warnings,
      changes: {
        added: comparison.added.slice(0, previewLimit).map((item) => trimChange(item, includeRecords)),
        changed: comparison.changed.slice(0, previewLimit).map((item) => trimChange(item, includeRecords)),
        provenanceOnly: comparison.provenanceOnly.slice(0, previewLimit),
        retired: comparison.retired.slice(0, previewLimit).map((item) => trimChange(item, includeRecords)),
        unchanged: comparison.unchanged.slice(0, previewLimit),
        previewLimit,
        truncated: {
          added: comparison.added.length > previewLimit,
          changed: comparison.changed.length > previewLimit,
          provenanceOnly: comparison.provenanceOnly.length > previewLimit,
          retired: comparison.retired.length > previewLimit,
          unchanged: comparison.unchanged.length > previewLimit,
        },
      },
      records: includeRecords ? normalized.records : undefined,
    };
  }

  return {
    runDryRun,
  };
}

module.exports = {
  createPluginRegistryDryRunService,
};
