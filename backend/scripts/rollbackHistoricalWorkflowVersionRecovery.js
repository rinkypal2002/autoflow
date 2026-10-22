'use strict';

require('dotenv').config();

const { pool, closePool } = require('../db/pool');

function parseArguments(argv) {
  const apply = argv.includes('--apply');
  const batchIndex =
    argv.indexOf('--batch-id');

  const batchId =
    batchIndex >= 0
      ? argv[batchIndex + 1]
      : null;

  return {
    apply,
    batchId,
  };
}

async function main() {
  const args =
    parseArguments(
      process.argv.slice(2)
    );

  if (!args.batchId) {
    throw new Error(
      'Provide --batch-id "<recovery-batch-id>".'
    );
  }

  console.log('============================================================');
  console.log(' AutoFlow Historical Version Recovery Rollback');
  console.log('============================================================');
  console.log(
    `Mode                       : ${args.apply ? 'APPLY' : 'DRY RUN'}`
  );
  console.log(
    `Recovery batch             : ${args.batchId}`
  );

  const client =
    await pool.connect();

  try {
    const versions =
      await client.query(
        `
          SELECT
            version.id,
            workflow.workflow_key,
            workflow.name,
            version.version_number,
            (
              SELECT count(*)::integer
              FROM autoflow.workflow_execution execution
              WHERE execution.workflow_version_id =
                    version.id
            ) AS execution_count,
            (
              SELECT count(*)::integer
              FROM autoflow.workflow_node node
              WHERE node.workflow_version_id =
                    version.id
            ) AS node_count
          FROM autoflow.workflow_version version
          JOIN autoflow.workflow workflow
            ON workflow.workspace_id =
               version.workspace_id
           AND workflow.id =
               version.workflow_id
          WHERE version.source_type =
                'MIGRATION'
            AND version.definition_json
                #>> '{metadata,recoveryBatchId}'
                = $1
          ORDER BY
            workflow.workflow_key,
            version.version_number
        `,
        [args.batchId]
      );

    console.log('');
    console.log(
      `Recovered versions found   : ${versions.rowCount}`
    );
    console.log(
      `Recovered nodes found      : ${versions.rows.reduce(
        (sum, row) =>
          sum + Number(row.node_count),
        0
      )}`
    );
    console.log(
      `Referencing executions     : ${versions.rows.reduce(
        (sum, row) =>
          sum + Number(row.execution_count),
        0
      )}`
    );

    versions.rows.forEach(
      (row) => {
        console.log('');
        console.log(
          `  ${row.name} (${row.workflow_key})`
        );
        console.log(
          `  Version               : ${row.version_number}`
        );
        console.log(
          `  Nodes                 : ${row.node_count}`
        );
        console.log(
          `  Executions            : ${row.execution_count}`
        );
      }
    );

    if (
      versions.rows.some(
        (row) =>
          Number(row.execution_count) > 0
      )
    ) {
      console.log('');
      console.log(
        'PostgreSQL changes         : NONE'
      );
      console.log(
        'RESULT                     : ROLLBACK BLOCKED BY EXECUTION REFERENCES'
      );
      process.exitCode = 1;
      return;
    }

    if (!args.apply) {
      console.log('');
      console.log(
        'PostgreSQL changes         : NONE'
      );
      console.log(
        'RESULT                     : HISTORICAL VERSION ROLLBACK DRY RUN PASSED'
      );
      return;
    }

    await client.query('BEGIN');

    try {
      await client.query(
        `
          SELECT pg_advisory_xact_lock(
            hashtext(
              'autoflow-historical-version-recovery-v1'
            )
          )
        `
      );

      const deleted =
        await client.query(
          `
            DELETE FROM autoflow.workflow_version
            WHERE source_type =
                  'MIGRATION'
              AND definition_json
                  #>> '{metadata,recoveryBatchId}'
                  = $1
            RETURNING id
          `,
          [args.batchId]
        );

      await client.query('COMMIT');

      console.log('');
      console.log(
        `Versions deleted           : ${deleted.rowCount}`
      );
      console.log(
        'Database transaction       : COMMITTED'
      );
      console.log(
        'RESULT                     : HISTORICAL VERSION RECOVERY ROLLED BACK'
      );
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // Preserve the original error.
      }

      throw error;
    }
  } finally {
    client.release();
  }
}

main()
  .catch((error) => {
    console.error('');
    console.error(
      'RESULT                     : HISTORICAL VERSION ROLLBACK FAILED'
    );
    console.error(
      error.stack || error.message
    );
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
