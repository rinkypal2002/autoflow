'use strict';

/** Phase 3 Step 7B.3 — targeted, idempotent batch rollback. */

const {
  readCounts,
  readBatchCounts,
  readBatchDistribution,
  resolveBatchId,
  writeJsonReport,
} = require('./outputIndexBackfillCommon');

const CONFIRMATION = 'ROLLBACK_OUTPUT_INDEX_BACKFILL';

function parseArgs(argv) {
  const options = { batchId: '', report: '', confirm: '', out: null, expectedRows: 0 };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--batch-id') options.batchId = String(argv[++index] || '');
    else if (arg === '--report') options.report = String(argv[++index] || '');
    else if (arg === '--confirm') options.confirm = String(argv[++index] || '');
    else if (arg === '--expected-rows') options.expectedRows = Math.max(0, Number(argv[++index]) || 0);
    else if (arg === '--out') options.out = argv[++index];
    else if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg === '--all' || arg === '--truncate' || arg === '--force') {
      throw new Error(`${arg} is intentionally unsupported. Rollback deletes only one tagged Step 7B.3 batch.`);
    } else throw new Error(`Unknown argument '${arg}'.`);
  }
  return options;
}

function printHelp() {
  console.log(`Usage:\n  node scripts/rollbackExecutionOutputIndexBackfill.js (--batch-id ID | --report APPLY_REPORT) --confirm ${CONFIRMATION} [--expected-rows N] [--out FILE]\n\nRollback deletes only rows tagged with the requested Step 7B.3 batch ID.`);
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }
  if (args.confirm !== CONFIRMATION) {
    throw new Error(`Explicit confirmation is required: --confirm ${CONFIRMATION}`);
  }

  const batchId = resolveBatchId({ batchId: args.batchId, reportPath: args.report });
  const { pool, closePool } = require('../db/pool');
  const client = await pool.connect();
  let transactionOpen = false;

  try {
    await client.query('BEGIN');
    transactionOpen = true;
    await client.query("SET LOCAL lock_timeout = '15s'");
    await client.query("SET LOCAL statement_timeout = '5min'");

    const lockResult = await client.query(
      "SELECT pg_try_advisory_xact_lock(hashtext('autoflow:phase3:step7b3:output-index-apply')) AS locked"
    );
    if (!lockResult.rows[0] || lockResult.rows[0].locked !== true) {
      throw new Error('Another Step 7B.3 apply/rollback process currently holds the advisory lock.');
    }
    await client.query('LOCK TABLE autoflow.execution_output_index IN SHARE ROW EXCLUSIVE MODE');

    const beforeCounts = await readCounts(client);
    const beforeDistribution = await readBatchDistribution(client);
    const batchBefore = await readBatchCounts(client, batchId);
    if (args.expectedRows > 0 && batchBefore.total !== 0 && batchBefore.total !== args.expectedRows) {
      throw new Error(`Batch '${batchId}' contains ${batchBefore.total} rows; expected ${args.expectedRows}.`);
    }

    let deletedRows = 0;
    let status = 'OUTPUT_INDEX_BACKFILL_ALREADY_ROLLED_BACK';
    if (batchBefore.total > 0) {
      const deletion = await client.query(
        `DELETE FROM autoflow.execution_output_index WHERE metadata #>> '{backfill,batchId}' = $1`,
        [batchId]
      );
      deletedRows = deletion.rowCount;
      if (deletedRows !== batchBefore.total) {
        throw new Error(`Rollback delete count mismatch: expected ${batchBefore.total}, deleted ${deletedRows}.`);
      }
      status = 'OUTPUT_INDEX_BACKFILL_ROLLED_BACK';
    }

    const batchInsideTransaction = await readBatchCounts(client, batchId);
    if (batchInsideTransaction.total !== 0) {
      throw new Error(`Batch '${batchId}' still has ${batchInsideTransaction.total} rows inside the rollback transaction.`);
    }

    await client.query('COMMIT');
    transactionOpen = false;

    const afterCounts = await readCounts(client);
    const afterDistribution = await readBatchDistribution(client);
    const batchAfter = await readBatchCounts(client, batchId);
    if (batchAfter.total !== 0) {
      throw new Error(`Batch '${batchId}' still has ${batchAfter.total} rows after commit.`);
    }

    const report = {
      generatedAt: new Date().toISOString(),
      mode: 'TARGETED_BATCH_ROLLBACK',
      database: {
        database: process.env.DB_NAME || 'autoflow',
        schema: process.env.DB_SCHEMA || 'autoflow',
      },
      batch: { batchId },
      before: {
        counts: beforeCounts,
        batchCounts: batchBefore,
        distribution: beforeDistribution,
      },
      rollback: {
        deletedRows,
        unrelatedRowsDeleted: 0,
        executionSnapshotsModified: false,
        transaction: 'COMMITTED',
      },
      after: {
        counts: afterCounts,
        batchCounts: batchAfter,
        distribution: afterDistribution,
      },
      verdict: {
        status,
        blockers: [],
        rowsDeleted: deletedRows,
        idempotent: true,
      },
    };

    console.log(JSON.stringify(report, null, 2));
    const target = writeJsonReport(args.out, report);
    if (target) console.log(`\nRollback report written to: ${target}`);
  } catch (error) {
    if (transactionOpen) {
      try { await client.query('ROLLBACK'); } catch (rollbackError) {
        console.error('[Step 7B.3] PostgreSQL rollback failed:', rollbackError);
      }
    }
    throw error;
  } finally {
    client.release();
    await closePool();
  }
}

run().catch((error) => {
  console.error('[Step 7B.3] Output-index rollback failed.');
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
