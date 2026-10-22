'use strict';

require('dotenv').config();

const fsp = require('fs/promises');
const path = require('path');

const { query, withTransaction, closePool } = require('../db/pool');

function parseArguments(argv) {
  return {
    apply: argv.includes('--apply'),
    dryRun: !argv.includes('--apply'),
  };
}

function containsPersistedSecret(definition) {
  const variables = Array.isArray(definition?.variables)
    ? definition.variables
    : [];

  return variables.some((variable) => {
    if (!variable || typeof variable !== 'object') return false;

    const isSecret =
      variable.isSecret === true || variable.scope === 'secret';

    if (!isSecret) return false;

    return (
      (variable.value !== undefined && variable.value !== null) ||
      (variable.defaultValue !== undefined &&
        variable.defaultValue !== null)
    );
  });
}

function safeTimestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

async function loadAffectedVersions() {
  const result = await query(`
    SELECT
      version.id,
      version.workspace_id,
      version.workflow_id,
      version.version_number,
      version.definition_sha256,
      version.created_at,
      workflow.workflow_key,
      workflow.name AS workflow_name,
      version.definition_json
    FROM autoflow.workflow_version version
    JOIN autoflow.workflow workflow
      ON workflow.workspace_id = version.workspace_id
     AND workflow.id = version.workflow_id
    WHERE version.source_type = 'MIGRATION'
      AND version.created_by = 'filesystem-migration'
    ORDER BY workflow.workflow_key, version.version_number
  `);

  return result.rows.filter((row) =>
    containsPersistedSecret(row.definition_json)
  );
}

async function writeMetadataManifest(backendDir, affected) {
  const directory = path.join(
    backendDir,
    'migration_backups',
    `secret-definition-remediation-${safeTimestamp()}`
  );

  await fsp.mkdir(directory, { recursive: true });

  const manifest = {
    formatVersion: 1,
    createdAt: new Date().toISOString(),
    purpose:
      'Record workflow-version IDs removed because their full definition JSON retained secret variable values.',
    secretValuesIncluded: false,
    affectedVersions: affected.map((row) => ({
      versionId: row.id,
      workspaceId: row.workspace_id,
      workflowId: row.workflow_id,
      workflowKey: row.workflow_key,
      workflowName: row.workflow_name,
      versionNumber: Number(row.version_number),
      definitionSha256: row.definition_sha256,
      createdAt: row.created_at,
    })),
  };

  const manifestPath = path.join(directory, 'remediation-manifest.json');
  await fsp.writeFile(
    manifestPath,
    JSON.stringify(manifest, null, 2),
    'utf8'
  );

  return { directory, manifestPath };
}

async function deleteAffectedVersions(affected) {
  const versionIds = affected.map((row) => row.id);
  const workspaceId = affected[0].workspace_id;

  return withTransaction(async (client) => {
    const executionCheck = await client.query(
      `
        SELECT count(*)::integer AS execution_count
        FROM autoflow.workflow_execution
        WHERE workflow_version_id = ANY($1::uuid[])
      `,
      [versionIds]
    );

    const executionCount =
      executionCheck.rows[0]?.execution_count || 0;

    if (executionCount > 0) {
      throw new Error(
        `Refusing remediation because ${executionCount} workflow execution(s) ` +
          'already reference affected versions.'
      );
    }

    const deleted = await client.query(
      `
        DELETE FROM autoflow.workflow_version
        WHERE id = ANY($1::uuid[])
        RETURNING id, workflow_id, version_number
      `,
      [versionIds]
    );

    await client.query(
      `
        INSERT INTO autoflow.audit_log (
          workspace_id,
          actor_type,
          actor_id,
          action,
          entity_type,
          entity_key,
          success,
          after_json,
          metadata
        )
        VALUES (
          $1,
          'SYSTEM',
          'secret-definition-remediation',
          'REMOVE_UNSAFE_MIGRATION_VERSIONS',
          'workflow_version',
          'filesystem-migration',
          true,
          $2::jsonb,
          $3::jsonb
        )
      `,
      [
        workspaceId,
        JSON.stringify({
          deletedVersionCount: deleted.rowCount,
        }),
        JSON.stringify({
          reason:
            'Secret variable values were retained inside definition_json by the initial migration implementation.',
          nextAction:
            'Rerun migrateFilesystemWorkspaceToPostgres.js --apply using Fix 3.',
        }),
      ]
    );

    return deleted.rowCount;
  });
}

async function main() {
  const args = parseArguments(process.argv.slice(2));
  const backendDir = path.resolve(__dirname, '..');

  console.log('============================================================');
  console.log(' AutoFlow Imported Secret Definition Remediation - Fix 3');
  console.log('============================================================');
  console.log(`Mode                  : ${args.apply ? 'APPLY' : 'DRY RUN'}`);

  const affected = await loadAffectedVersions();

  console.log(`Affected versions     : ${affected.length}`);

  for (const row of affected) {
    console.log(
      `  - ${row.workflow_key} | ${row.workflow_name} | v${row.version_number}`
    );
  }

  if (affected.length === 0) {
    console.log('');
    console.log('RESULT                : NO UNSAFE DEFINITIONS FOUND');
    return;
  }

  if (!args.apply) {
    console.log('');
    console.log('Database changes      : NONE');
    console.log('Secret values printed : NO');
    console.log('');
    console.log('RESULT                : REMEDIATION DRY RUN PASSED');
    console.log('');
    console.log(
      'Run with --apply to remove only these imported versions, then rerun the migration.'
    );
    return;
  }

  const manifest = await writeMetadataManifest(backendDir, affected);
  console.log(`Manifest created      : ${manifest.manifestPath}`);

  const deletedCount = await deleteAffectedVersions(affected);

  console.log(`Versions removed      : ${deletedCount}`);
  console.log('Executions affected   : 0');
  console.log('Secret values printed : NO');
  console.log('');
  console.log('RESULT                : UNSAFE DEFINITIONS REMOVED');
  console.log('');
  console.log(
    'Next: run migrateFilesystemWorkspaceToPostgres.js --apply to recreate sanitized versions.'
  );
}

main()
  .catch((error) => {
    console.error('');
    console.error('RESULT                : REMEDIATION FAILED');
    console.error(error.stack || error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await closePool();
    } catch (error) {
      console.error(
        '[database] Failed to close PostgreSQL pool:',
        error.message
      );
      process.exitCode = 1;
    }
  });
