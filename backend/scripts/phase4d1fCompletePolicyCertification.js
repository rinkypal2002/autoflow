'use strict';

const fs = require('fs');
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

const EXPECTED_REGISTRY_SHA =
  'd1770f9b2838d894a91f853a2481f54a4b44e205db24dc78e6adf07d90e250c6';

const ALIAS_MAP = {
  'transform.calculate': 'transform.addCalculatedColumn',
  'transform.rename': 'transform.renameColumns',
  'transform.sequence': 'transform.addSequence',
  'transform.sort': 'transform.sortRows',
  'transform.split': 'transform.splitColumn',
  'transform.stringOperation': 'transform.textOperation',
  'transform.filter': 'transform.filterRows',
  'transform.select': 'transform.selectColumns',
  'transform.concat': 'transform.mergeColumns',
  'transform.merge': 'transform.union',
};

const LINUX_ACTIONS = [
  'linux.closeSession',
  'linux.fileManager',
  'linux.listSessions',
  'linux.networkTools',
  'linux.packageManager',
  'linux.processManager',
  'linux.serviceManager',
  'linux.serviceStatus',
  'linux.systemMonitor',
];

const PROTECTED_FIELDS = [
  'engineVersion',
  'pluginId',
  'actionId',
  'httpMethod',
  'canonicalPath',
  'legacyPath',
  'requestContentTypes',
  'responseContentTypes',
  'bodyType',
  'schemaStatus',
  'responseContractVersion',
  'authenticationType',
  'artifactBehavior',
  'timeoutMs',
  'enabled',
  'deprecated',
];

function normalizeChangedField(value) {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') {
    return value.field || value.name || value.path || JSON.stringify(value);
  }
  return String(value);
}

function effectivePolicy(record) {
  const metadata =
    record && record.metadata && typeof record.metadata === 'object'
      ? record.metadata
      : {};

  return {
    actionRole: metadata.actionRole || 'WORKFLOW',
    actionExposure: metadata.actionExposure || 'PUBLIC',
    replacementActionKey: metadata.replacementActionKey || '',
    workflowEligible:
      metadata.workflowEligible === undefined
        ? true
        : metadata.workflowEligible,
    sourceRegistrySha256: record ? record.sourceRegistrySha256 : null,
  };
}

function csvQuote(value) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

async function main() {
  const outputDirectory = process.env.D1F_POSTDEPLOY_DIR;
  if (!outputDirectory) {
    throw new Error('D1F_POSTDEPLOY_DIR is missing');
  }

  if (cfg.PLUGIN_ENDPOINT_MAPPING_WRITE_ENABLED !== false) {
    throw new Error(
      'PLUGIN_ENDPOINT_MAPPING_WRITE_ENABLED must remain false'
    );
  }

  if (cfg.PLUGIN_ENDPOINT_MAPPING_RETIRE_MISSING !== false) {
    throw new Error(
      'PLUGIN_ENDPOINT_MAPPING_RETIRE_MISSING must remain false'
    );
  }

  const dryRunPath = path.join(
    outputDirectory,
    'phase4d1f-postdeploy-mapping-dry-run.json'
  );

  if (!fs.existsSync(dryRunPath)) {
    throw new Error(`Post-deployment dry-run report is missing: ${dryRunPath}`);
  }

  const dryRun = JSON.parse(fs.readFileSync(dryRunPath, 'utf8'));

  const expectedActionIds = [
    ...Object.keys(ALIAS_MAP),
    'transform.catalogue',
    ...LINUX_ACTIONS,
  ].sort();

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
    writeEnabled: false,
    retireMissing: false,
  });

  const plan = await service.createPlan();

  const desiredRecords = Array.isArray(plan.desiredRecords)
    ? plan.desiredRecords
    : [];

  const changedRecords =
    dryRun.changes && Array.isArray(dryRun.changes.changed)
      ? dryRun.changes.changed
      : [];

  const actualChangedIds = [
    ...new Set(changedRecords.map((record) => String(record.actionId))),
  ].sort();

  const missingActions = expectedActionIds.filter(
    (actionId) => !actualChangedIds.includes(actionId)
  );

  const unexpectedActions = actualChangedIds.filter(
    (actionId) => !expectedActionIds.includes(actionId)
  );

  const nonMetadataChanges = changedRecords
    .filter((record) => {
      const fields = (record.changedFields || []).map(normalizeChangedField);
      return fields.length !== 1 || fields[0] !== 'metadata';
    })
    .map((record) => ({
      actionId: record.actionId,
      changedFields: (record.changedFields || []).map(normalizeChangedField),
    }));

  const protectedChanges = [];

  for (const record of changedRecords) {
    const fields = PROTECTED_FIELDS.filter(
      (field) =>
        JSON.stringify(record.existing && record.existing[field]) !==
        JSON.stringify(record.desired && record.desired[field])
    );

    if (fields.length > 0) {
      protectedChanges.push({
        actionId: record.actionId,
        fields,
      });
    }
  }

  const desiredByActionId = new Map(
    desiredRecords.map((record) => [String(record.actionId), record])
  );

  const rows = [];
  const policyErrors = [];

  for (const actionId of expectedActionIds) {
    const record = desiredByActionId.get(actionId);

    if (!record) {
      policyErrors.push(`Missing desired record: ${actionId}`);
      continue;
    }

    const policy = effectivePolicy(record);

    rows.push({
      actionId,
      pluginId: record.pluginId,
      actionRole: policy.actionRole,
      actionExposure: policy.actionExposure,
      replacementActionKey: policy.replacementActionKey,
      workflowEligible: policy.workflowEligible,
      sourceRegistrySha256: policy.sourceRegistrySha256,
    });

    if (Object.prototype.hasOwnProperty.call(ALIAS_MAP, actionId)) {
      if (
        policy.actionRole !== 'ALIAS' ||
        policy.actionExposure !== 'PUBLIC' ||
        policy.replacementActionKey !== ALIAS_MAP[actionId] ||
        policy.workflowEligible !== false
      ) {
        policyErrors.push(`Invalid alias policy: ${actionId}`);
      }
    } else if (actionId === 'transform.catalogue') {
      if (
        policy.actionRole !== 'CONTROL' ||
        policy.actionExposure !== 'PUBLIC' ||
        policy.replacementActionKey !== '' ||
        policy.workflowEligible !== false
      ) {
        policyErrors.push(`Invalid control policy: ${actionId}`);
      }
    } else if (LINUX_ACTIONS.includes(actionId)) {
      if (
        policy.actionRole !== 'WORKFLOW' ||
        policy.actionExposure !== 'NOT_CERTIFIED' ||
        policy.replacementActionKey !== '' ||
        policy.workflowEligible !== false
      ) {
        policyErrors.push(`Invalid Linux policy: ${actionId}`);
      }
    }
  }

  const provenanceMismatches = desiredRecords
    .filter(
      (record) => record.sourceRegistrySha256 !== EXPECTED_REGISTRY_SHA
    )
    .map((record) => record.actionId);

  const summary = {
    desired: Number(plan.summary && plan.summary.desired),
    added: Number(plan.summary && plan.summary.added),
    changed: Number(plan.summary && plan.summary.changed),
    unchanged: Number(plan.summary && plan.summary.unchanged),
    provenanceOnly: Number(plan.summary && plan.summary.provenanceOnly),
    retired: Number(plan.summary && plan.summary.retired),
  };

  const errors = [...policyErrors];

  if (plan.status !== 'success') {
    errors.push('Plan status is not success');
  }

  if ((plan.problems || []).length > 0) {
    errors.push('Plan contains problems');
  }

  if (plan.engine.registrySha256 !== EXPECTED_REGISTRY_SHA) {
    errors.push('Registry SHA mismatch');
  }

  if (desiredRecords.length !== 344) {
    errors.push(`Expected 344 desired records, found ${desiredRecords.length}`);
  }

  if (changedRecords.length !== 20) {
    errors.push(`Expected 20 changed records, found ${changedRecords.length}`);
  }

  if (
    summary.added !== 0 ||
    summary.changed !== 20 ||
    summary.provenanceOnly !== 324 ||
    summary.retired !== 0
  ) {
    errors.push(
      `Unexpected plan summary: ${JSON.stringify(summary)}`
    );
  }

  if (missingActions.length > 0) {
    errors.push(
      `Missing expected changed actions: ${missingActions.join(',')}`
    );
  }

  if (unexpectedActions.length > 0) {
    errors.push(
      `Unexpected changed actions: ${unexpectedActions.join(',')}`
    );
  }

  if (nonMetadataChanges.length > 0) {
    errors.push('Non-metadata changes detected');
  }

  if (protectedChanges.length > 0) {
    errors.push('Protected field changes detected');
  }

  if (provenanceMismatches.length > 0) {
    errors.push('Desired-record provenance mismatch');
  }

  const evidence = {
    generatedAt: new Date().toISOString(),
    mode: 'READ_ONLY_COMPLETE_INTERNAL_POLICY_CERTIFICATION',
    status: errors.length === 0 ? 'success' : 'failed',
    registrySha256: plan.engine.registrySha256,
    planStatus: plan.status,
    desiredRecords: desiredRecords.length,
    summary,
    changedRecords: changedRecords.length,
    expectedPolicyRecords: expectedActionIds.length,
    missingActions,
    unexpectedActions,
    nonMetadataChanges,
    protectedChanges,
    provenanceMismatches,
    policyErrors: errors,
    databaseWrites: 0,
    rows,
  };

  const jsonOutput = path.join(
    outputDirectory,
    'phase4d1f-complete-policy-certification.json'
  );

  const csvOutput = path.join(
    outputDirectory,
    'phase4d1f-complete-policy-certification.csv'
  );

  fs.writeFileSync(jsonOutput, `${JSON.stringify(evidence, null, 2)}\n`);

  const csvLines = [
    [
      'actionId',
      'pluginId',
      'actionRole',
      'actionExposure',
      'replacementActionKey',
      'workflowEligible',
      'sourceRegistrySha256',
    ].join(','),
    ...rows.map((row) =>
      [
        row.actionId,
        row.pluginId,
        row.actionRole,
        row.actionExposure,
        row.replacementActionKey,
        row.workflowEligible,
        row.sourceRegistrySha256,
      ]
        .map(csvQuote)
        .join(',')
    ),
  ];

  fs.writeFileSync(csvOutput, `${csvLines.join('\n')}\n`);

  console.log(`Plan status: ${plan.status}`);
  console.log(`Registry SHA256: ${plan.engine.registrySha256}`);
  console.log(`Desired records: ${desiredRecords.length}`);
  console.log(`Changed records: ${changedRecords.length}`);
  console.log(`Provenance-only records: ${summary.provenanceOnly}`);
  console.log(`Expected policy records: ${expectedActionIds.length}`);
  console.log(`Missing expected actions: ${missingActions.length}`);
  console.log(`Unexpected actions: ${unexpectedActions.length}`);
  console.log(`Non-metadata changed records: ${nonMetadataChanges.length}`);
  console.log(`Protected field changes: ${protectedChanges.length}`);
  console.log(`Provenance mismatches: ${provenanceMismatches.length}`);
  console.log(`Policy errors: ${errors.length}`);

  console.table(
    rows.map(({ sourceRegistrySha256, ...row }) => row)
  );

  console.log('Database writes: 0');
  console.log(`JSON evidence: ${jsonOutput}`);
  console.log(`CSV evidence: ${csvOutput}`);

  if (errors.length > 0) {
    throw new Error(errors.join('; '));
  }

  console.log('Phase 4D1F complete policy contract: PASS');
}

main()
  .catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await closePool();
    } catch (error) {
      console.error(`Failed to close PostgreSQL pool: ${error.message}`);
      process.exitCode = 1;
    }
  });
