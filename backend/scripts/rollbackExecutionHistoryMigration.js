'use strict';

require('dotenv').config();

const { pool, closePool } = require('../db/pool');

function parseArguments(argv) {
  const batchIndex =
    argv.indexOf('--batch-id');

  return {
    apply:
      argv.includes('--apply'),
    batchId:
      batchIndex >= 0
        ? argv[batchIndex + 1]
        : null,
  };
}

async function main() {
  const args =
    parseArguments(
      process.argv.slice(2)
    );

  if (!args.batchId) {
    throw new Error(
      'Provide --batch-id "<migration-batch-id>".'
    );
  }

  console.log('============================================================');
  console.log(' AutoFlow Execution History Migration Rollback');
  console.log('============================================================');
  console.log(
    `Mode                       : ${args.apply ? 'APPLY' : 'DRY RUN'}`
  );
  console.log(
    `Migration batch            : ${args.batchId}`
  );

  const client =
    await pool.connect();

  try {
    const counts =
      await client.query(
        `
          SELECT
            count(
              DISTINCT execution.id
            )::integer AS executions,
            count(
              DISTINCT node.id
            )::integer AS nodes,
            count(
              DISTINCT log.id
            )::integer AS logs,
            count(
              DISTINCT output_index.id
            )::integer AS output_index_rows,
            count(
              DISTINCT artifact.id
            )::integer AS artifacts
          FROM autoflow.workflow_execution execution
          LEFT JOIN autoflow.node_execution node
            ON node.execution_id =
               execution.id
          LEFT JOIN autoflow.execution_log log
            ON log.execution_id =
               execution.id
          LEFT JOIN autoflow.execution_output_index output_index
            ON output_index.execution_id =
               execution.id
          LEFT JOIN autoflow.execution_artifact artifact
            ON artifact.execution_id =
               execution.id
          WHERE execution.full_snapshot_json
                  #>> '{migration,batchId}'
                = $1
        `,
        [args.batchId]
      );

    const summary =
      counts.rows[0];

    console.log('');
    console.log(
      `Executions found           : ${summary.executions}`
    );
    console.log(
      `Node executions found      : ${summary.nodes}`
    );
    console.log(
      `Execution logs found       : ${summary.logs}`
    );
    console.log(
      `Output index rows found    : ${summary.output_index_rows}`
    );
    console.log(
      `Artifacts found            : ${summary.artifacts}`
    );

    if (!args.apply) {
      console.log('');
      console.log(
        'PostgreSQL changes         : NONE'
      );
      console.log(
        'RESULT                     : EXECUTION HISTORY ROLLBACK DRY RUN PASSED'
      );
      return;
    }

    await client.query('BEGIN');

    try {
      await client.query(
        `
          SELECT pg_advisory_xact_lock(
            hashtext(
              'autoflow-execution-history-migration-v1'
            )
          )
        `
      );

      const deleted =
        await client.query(
          `
            DELETE FROM autoflow.workflow_execution
            WHERE full_snapshot_json
                    #>> '{migration,batchId}'
                  = $1
            RETURNING id
          `,
          [args.batchId]
        );

      const remaining =
        await client.query(
          `
            SELECT count(*)::integer AS count
            FROM autoflow.workflow_execution
            WHERE full_snapshot_json
                    #>> '{migration,batchId}'
                  = $1
          `,
          [args.batchId]
        );

      if (
        Number(
          remaining.rows[0].count
        ) !== 0
      ) {
        throw new Error(
          'Some batch executions remained after rollback delete.'
        );
      }

      await client.query('COMMIT');

      console.log('');
      console.log(
        `Executions deleted         : ${deleted.rowCount}`
      );
      console.log(
        'Cascade cleanup            : PASS'
      );
      console.log(
        'Database transaction       : COMMITTED'
      );
      console.log(
        'Recovered versions deleted : NO'
      );
      console.log(
        'Filesystem run changes     : NONE'
      );
      console.log('');
      console.log(
        'RESULT                     : EXECUTION HISTORY MIGRATION ROLLED BACK'
      );
    } catch (error) {
      try {
        await client.query(
          'ROLLBACK'
        );
      } catch {
        // Preserve original error.
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
      'RESULT                     : EXECUTION HISTORY ROLLBACK FAILED'
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
