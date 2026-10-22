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
const {
  mappingSetFingerprint,
  stableStringify,
  sha256,
} = require('../lib/pluginRegistryNormalization');

function readArg(name, fallback = null) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

async function writeJson(filePath, value) {
  const absolute = path.resolve(filePath);
  await fs.mkdir(path.dirname(absolute), { recursive: true });
  await fs.writeFile(absolute, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  return absolute;
}

async function main() {
  const confirmToken = readArg('--confirm');
  const expectedRegistrySha256 = readArg('--expected-registry-sha');
  const backupPath = readArg(
    '--backup',
    'migration_backups/phase4b2-plugin-endpoint-mapping-before-apply.json'
  );
  const reportPath = readArg(
    '--out',
    'migration_backups/phase4b2-plugin-endpoint-mapping-apply-report.json'
  );

  const client = createEngineActionRegistryClient({
    engineUrl: cfg.ENGINE_URL,
    engineContextPath: cfg.PLUGIN_ENDPOINT_MAPPING_ENGINE_CONTEXT_PATH,
    registryPath: cfg.PLUGIN_ENDPOINT_MAPPING_REGISTRY_PATH,
    registryUrl: cfg.PLUGIN_ENDPOINT_MAPPING_REGISTRY_URL,
    timeoutMs: cfg.PLUGIN_ENDPOINT_MAPPING_REQUEST_TIMEOUT_MS,
  });
  const repository = createPluginEndpointMappingRepository({
    schema: cfg.DB_SCHEMA,
  });
  const service = createPluginRegistryApplyService({
    client,
    repository,
    engineVersion: cfg.PLUGIN_ENDPOINT_MAPPING_ENGINE_VERSION,
    engineContextPath: cfg.PLUGIN_ENDPOINT_MAPPING_ENGINE_CONTEXT_PATH,
    writeEnabled: cfg.PLUGIN_ENDPOINT_MAPPING_WRITE_ENABLED,
    retireMissing: cfg.PLUGIN_ENDPOINT_MAPPING_RETIRE_MISSING,
  });

  const plan = await service.createPlan();
  if (plan.status !== 'success') {
    const error = new Error(
      `Apply plan is blocked: ${plan.problems.join('; ') || 'unknown validation problem'}`
    );
    error.code = 'PLUGIN_ENDPOINT_MAPPING_APPLY_PLAN_BLOCKED';
    throw error;
  }

  const backup = {
    generatedAt: new Date().toISOString(),
    mode: 'PLUGIN_ENDPOINT_MAPPING_PRE_APPLY_BACKUP',
    engineVersion: plan.engine.engineVersion,
    registrySha256: plan.engine.registrySha256,
    databaseFingerprint: plan.database.fingerprint,
    mappingCount: plan.existingRows.length,
    mappingsSha256: sha256(stableStringify(plan.existingRows)),
    normalizedMappingsFingerprint: mappingSetFingerprint(plan.existingRows),
    planSha256: plan.planSha256,
    planSummary: plan.summary,
    rows: plan.existingRows,
  };
  const backupAbsolute = await writeJson(backupPath, backup);

  const report = await service.applyPlan(plan, {
    confirmToken,
    expectedRegistrySha256,
  });
  report.backupFile = backupAbsolute;
  const reportAbsolute = await writeJson(reportPath, report);

  console.log(
    JSON.stringify(
      {
        status: report.status,
        verdict: report.verdict,
        transactionCommitted: report.transactionCommitted,
        engineVersion: report.engineVersion,
        registrySha256: report.registrySha256,
        batchId: report.batchId,
        beforeMappings: report.before.mappings,
        writes: report.writes,
        afterMappings: report.after.mappings,
        activeDesiredMappings:
          report.after.verification.activeDesiredMappings,
        remainingDifferences:
          report.after.verification.remainingDifferences,
        backupFile: backupAbsolute,
        reportFile: reportAbsolute,
      },
      null,
      2
    )
  );
}

main()
  .catch((error) => {
    console.error(
      `Plugin endpoint mapping apply failed [${error.code || 'ERROR'}]: ${error.message}`
    );
    if (error.details) console.error(JSON.stringify(error.details, null, 2));
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await closePool();
    } catch (error) {
      console.error('Failed to close PostgreSQL pool:', error.message);
    }
  });
