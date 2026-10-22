'use strict';

const fs = require('fs');
const path = require('path');

const cfg = require('../config');
const { closePool } = require('../db/pool');
const {
  createEngineActionRegistryClient,
} = require('../services/engineActionRegistryClient');
const {
  createPluginEndpointMappingRepository,
} = require('../db/pluginEndpointMappingRepository');
const {
  createPluginRegistryDryRunService,
} = require('../services/pluginRegistryDryRunService');

function readArgument(name, fallback = null) {
  const index = process.argv.indexOf(name);
  if (index < 0 || index + 1 >= process.argv.length) return fallback;
  return process.argv[index + 1];
}

function hasFlag(name) {
  return process.argv.includes(name);
}

async function main() {
  const outputPath = readArgument(
    '--out',
    path.join('migration_backups', 'phase4b1-plugin-endpoint-mapping-dry-run.json')
  );
  const previewLimit = Number(readArgument('--preview-limit', '500')) || 500;
  const includeRecords = hasFlag('--include-records');

  const client = createEngineActionRegistryClient({
    engineUrl: cfg.ENGINE_URL,
    engineContextPath: cfg.PLUGIN_ENDPOINT_MAPPING_ENGINE_CONTEXT_PATH,
    registryPath: cfg.PLUGIN_ENDPOINT_MAPPING_REGISTRY_PATH,
    registryUrl: cfg.PLUGIN_ENDPOINT_MAPPING_REGISTRY_URL,
    timeoutMs: cfg.PLUGIN_ENDPOINT_MAPPING_REQUEST_TIMEOUT_MS,
  });
  const repository = createPluginEndpointMappingRepository({ schema: cfg.DB_SCHEMA });
  const service = createPluginRegistryDryRunService({
    client,
    repository,
    engineVersion: cfg.PLUGIN_ENDPOINT_MAPPING_ENGINE_VERSION,
    engineContextPath: cfg.PLUGIN_ENDPOINT_MAPPING_ENGINE_CONTEXT_PATH,
  });

  const report = await service.runDryRun({ includeRecords, previewLimit });
  const absolutePath = path.resolve(outputPath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  console.log(JSON.stringify(report, null, 2));
  console.log(`\nPlugin endpoint mapping dry-run written to: ${absolutePath}`);

  if (report.status !== 'success') process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error('Plugin endpoint mapping dry-run failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await closePool();
    } catch {
      // The inspection result is already reported; shutdown cleanup is best effort.
    }
  });
