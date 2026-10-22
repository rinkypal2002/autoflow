'use strict';

/** Phase 3 Step 7B.3 — read-only post-apply verifier. */

const {
  readCounts,
  readBatchCounts,
  readBatchDistribution,
  resolveBatchId,
  validateIndexRows,
  countBindingViewRows,
  writeJsonReport,
} = require('./outputIndexBackfillCommon');

function parseArgs(argv) {
  const options = { batchId: '', report: '', out: null };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--batch-id') options.batchId = String(argv[++index] || '');
    else if (arg === '--report') options.report = String(argv[++index] || '');
    else if (arg === '--out') options.out = argv[++index];
    else if (arg === '--help' || arg === '-h') options.help = true;
    else throw new Error(`Unknown argument '${arg}'.`);
  }
  return options;
}

function printHelp() {
  console.log('Usage:\n  node scripts/verifyExecutionOutputIndexBackfill.js [--batch-id ID | --report APPLY_REPORT] [--out FILE]\n\nThe verifier uses BEGIN TRANSACTION READ ONLY and ROLLBACK.');
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const { pool, closePool } = require('../db/pool');
  const client = await pool.connect();
  let transactionOpen = false;
  try {
    await client.query('BEGIN TRANSACTION READ ONLY');
    transactionOpen = true;

    const counts = await readCounts(client);
    const distribution = await readBatchDistribution(client);
    const batchId = args.batchId || args.report
      ? resolveBatchId({ batchId: args.batchId, reportPath: args.report })
      : null;
    const batchCounts = batchId ? await readBatchCounts(client, batchId) : null;
    const quality = await validateIndexRows(client);
    const bindingViewRows = await countBindingViewRows(client);

    const sourceResult = await client.query(
      `
        SELECT
          count(*)::integer AS final_node_executions,
          count(DISTINCT node.execution_id)::integer AS executions,
          count(DISTINCT node.workflow_id)::integer AS workflows
        FROM autoflow.node_execution node
        JOIN autoflow.workflow_execution execution ON execution.id = node.execution_id
        WHERE node.is_final_attempt = true
          AND execution.deleted_at IS NULL
      `
    );
    const source = {
      finalNodeExecutions: Number(sourceResult.rows[0] && sourceResult.rows[0].final_node_executions) || 0,
      executions: Number(sourceResult.rows[0] && sourceResult.rows[0].executions) || 0,
      workflows: Number(sourceResult.rows[0] && sourceResult.rows[0].workflows) || 0,
    };

    const blockers = [];
    if (counts.total === 0) blockers.push('execution_output_index is empty.');
    if (counts.nodeExecutions !== source.finalNodeExecutions) blockers.push('Indexed node-execution coverage does not match final node executions.');
    if (counts.raw !== source.finalNodeExecutions) blockers.push('RAW root coverage does not match final node executions.');
    if (bindingViewRows !== counts.total - counts.secret) blockers.push('output_binding_source_v1 row count does not match searchable rows.');
    if (quality.secretLeakRows) blockers.push('Secret preview/value leak rows were found.');
    if (quality.invalidKinds) blockers.push('Invalid output field kinds were found.');
    if (quality.executionMismatchRows) blockers.push('Execution/node ownership mismatches were found.');
    if (quality.nonFinalAttemptRows) blockers.push('Output index rows point to non-final attempts.');
    if (quality.duplicateBindingPathGroups) blockers.push('Duplicate node binding paths were found.');
    if (batchId && (!batchCounts || batchCounts.total === 0)) blockers.push(`No rows were found for batch '${batchId}'.`);
    if (batchId && batchCounts && batchCounts.total !== counts.total) blockers.push('The requested batch does not own every current output-index row.');

    const report = {
      generatedAt: new Date().toISOString(),
      mode: 'READ_ONLY_VERIFY',
      database: {
        database: process.env.DB_NAME || 'autoflow',
        schema: process.env.DB_SCHEMA || 'autoflow',
      },
      batch: batchId ? { batchId, counts: batchCounts } : null,
      source,
      outputIndex: {
        counts,
        batchDistribution: distribution,
        bindingViewRows,
        quality,
      },
      verdict: {
        status: blockers.length ? 'OUTPUT_INDEX_BACKFILL_NOT_VERIFIED' : 'OUTPUT_INDEX_BACKFILL_VERIFIED',
        blockers,
        writesPerformed: 0,
        transaction: 'READ ONLY / ROLLBACK',
      },
    };

    await client.query('ROLLBACK');
    transactionOpen = false;
    console.log(JSON.stringify(report, null, 2));
    const target = writeJsonReport(args.out, report);
    if (target) console.log(`\nVerification report written to: ${target}`);
    if (blockers.length) process.exitCode = 2;
  } finally {
    if (transactionOpen) {
      try { await client.query('ROLLBACK'); } catch { /* best effort */ }
    }
    client.release();
    await closePool();
  }
}

run().catch((error) => {
  console.error('[Step 7B.3] Output-index verification failed.');
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
