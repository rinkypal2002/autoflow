'use strict';

const fs = require('fs/promises');
const path = require('path');

const cfg = require('../config');
const { closePool } = require('../db/pool');
const {
  createPluginEndpointMappingRepository,
} = require('../db/pluginEndpointMappingRepository');
const {
  createEngineActionRegistryClient,
} = require('../services/engineActionRegistryClient');
const {
  createPluginRegistryApplyService,
} = require('../services/pluginRegistryApplyService');

function readArg(name, fallback = null) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

async function main() {
  const outPath = readArg(
    '--out',
    'migration_backups/phase4b2-plugin-endpoint-mapping-verification.json'
  );
  const client = createEngineActionRegistryClient({
    engineUrl: cfg.ENGINE_URL,
    engineContextPath: cfg.PLUGIN_ENDPOINT_MAPPING_ENGINE_CONTEXT_PATH,
    registryPath: cfg.PLUGIN_ENDPOINT_MAPPING_REGISTRY_PATH,
    registryUrl: cfg.PLUGIN_ENDPOINT_MAPPING_REGISTRY_URL,
    timeoutMs: cfg.PLUGIN_ENDPOINT_MAPPING_REQUEST_TIMEOUT_MS,
  });
  const repository = createPluginEndpointMappingRepository({ schema: cfg.DB_SCHEMA });
  const service = createPluginRegistryApplyService({
    client,
    repository,
    engineVersion: cfg.PLUGIN_ENDPOINT_MAPPING_ENGINE_VERSION,
    engineContextPath: cfg.PLUGIN_ENDPOINT_MAPPING_ENGINE_CONTEXT_PATH,
    writeEnabled: false,
    retireMissing: cfg.PLUGIN_ENDPOINT_MAPPING_RETIRE_MISSING,
  });

  const plan = await service.createPlan();
  const remaining = {
    added: plan.summary.added,
    changed: plan.summary.changed,
    provenanceOnly: plan.summary.provenanceOnly,
    retired: plan.summary.retired,
  };
  const verified =
    plan.status === 'success' &&
    Object.values(remaining).every((count) => count === 0) &&
    plan.database.existingTargetMappings >= plan.engine.actions;
  const report = {
    generatedAt: new Date().toISOString(),
    mode: 'READ_ONLY_PLUGIN_ENDPOINT_MAPPING_POST_APPLY_VERIFICATION',
    status: verified ? 'success' : 'error',
    verdict: verified
      ? 'PLUGIN_ENDPOINT_MAPPING_APPLY_VERIFIED'
      : 'PLUGIN_ENDPOINT_MAPPING_APPLY_VERIFICATION_BLOCKED',
    readOnly: true,
    writesPerformed: 0,
    engine: {
      engineVersion: plan.engine.engineVersion,
      actions: plan.engine.actions,
      plugins: plan.engine.plugins,
      registrySha256: plan.engine.registrySha256,
      validationErrors: plan.validation.errors.length,
    },
    database: plan.database,
    remainingDifferences: remaining,
    warnings: plan.warnings,
  };

  const absolute = path.resolve(outPath);
  await fs.mkdir(path.dirname(absolute), { recursive: true });
  await fs.writeFile(absolute, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(report, null, 2));
  console.log(`\nVerification written to: ${absolute}`);
  if (!verified) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(`Plugin endpoint mapping verification failed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await closePool();
    } catch (error) {
      console.error('Failed to close PostgreSQL pool:', error.message);
    }
  });
