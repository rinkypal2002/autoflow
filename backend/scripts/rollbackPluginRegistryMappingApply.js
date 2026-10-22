'use strict';

const fs = require('fs/promises');
const path = require('path');

const cfg = require('../config');
const { closePool } = require('../db/pool');
const {
  createPluginEndpointMappingRepository,
} = require('../db/pluginEndpointMappingRepository');
const {
  mappingSetFingerprint,
  stableStringify,
  sha256,
} = require('../lib/pluginRegistryNormalization');

function readArg(name, fallback = null) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

async function main() {
  if (!cfg.PLUGIN_ENDPOINT_MAPPING_WRITE_ENABLED) {
    const error = new Error(
      'Plugin endpoint mapping writes are disabled. Enable the write flag only for the controlled rollback.'
    );
    error.code = 'PLUGIN_ENDPOINT_MAPPING_WRITES_DISABLED';
    throw error;
  }
  if (readArg('--confirm') !== 'ROLLBACK_PLUGIN_ENDPOINT_MAPPING') {
    const error = new Error(
      'Explicit confirmation token ROLLBACK_PLUGIN_ENDPOINT_MAPPING is required.'
    );
    error.code = 'PLUGIN_ENDPOINT_MAPPING_ROLLBACK_CONFIRMATION_REQUIRED';
    throw error;
  }

  const backupPath = readArg(
    '--backup',
    'migration_backups/phase4b2-plugin-endpoint-mapping-before-apply.json'
  );
  const outPath = readArg(
    '--out',
    'migration_backups/phase4b2-plugin-endpoint-mapping-rollback-report.json'
  );
  const backupAbsolute = path.resolve(backupPath);
  const backup = JSON.parse(await fs.readFile(backupAbsolute, 'utf8'));
  if (!Array.isArray(backup.rows)) {
    throw new Error('Rollback backup does not contain a rows array.');
  }
  if (backup.engineVersion !== cfg.PLUGIN_ENDPOINT_MAPPING_ENGINE_VERSION) {
    throw new Error(
      `Backup engine version ${backup.engineVersion} does not match configured version ${cfg.PLUGIN_ENDPOINT_MAPPING_ENGINE_VERSION}.`
    );
  }
  if (sha256(stableStringify(backup.rows)) !== backup.mappingsSha256) {
    throw new Error('Rollback backup SHA-256 validation failed.');
  }
  if (mappingSetFingerprint(backup.rows) !== backup.normalizedMappingsFingerprint) {
    throw new Error('Rollback backup normalized fingerprint validation failed.');
  }

  const repository = createPluginEndpointMappingRepository({ schema: cfg.DB_SCHEMA });
  const result = await repository.replaceEngineVersionSnapshot({
    engineVersion: backup.engineVersion,
    rows: backup.rows,
    batchId: `rollback-${Date.now()}`,
  });
  const report = {
    generatedAt: new Date().toISOString(),
    mode: 'TRANSACTIONAL_PLUGIN_ENDPOINT_MAPPING_ROLLBACK',
    status: 'success',
    verdict: 'PLUGIN_ENDPOINT_MAPPING_ROLLBACK_VERIFIED',
    transactionCommitted: true,
    backupFile: backupAbsolute,
    ...result,
  };
  const absolute = path.resolve(outPath);
  await fs.mkdir(path.dirname(absolute), { recursive: true });
  await fs.writeFile(absolute, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(report, null, 2));
  console.log(`\nRollback report written to: ${absolute}`);
}

main()
  .catch((error) => {
    console.error(
      `Plugin endpoint mapping rollback failed [${error.code || 'ERROR'}]: ${error.message}`
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await closePool();
    } catch (error) {
      console.error('Failed to close PostgreSQL pool:', error.message);
    }
  });
