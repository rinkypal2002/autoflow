'use strict';

/**
 * Phase 3 Step 7B.3 — controlled committed output-index backfill.
 *
 * This command is intentionally separate from the rollback-only Step 7B.2
 * script. It requires an explicit confirmation phrase, applies the complete
 * final-node dataset in one transaction, validates all constraints and quality
 * gates, then commits. The existing workflow and node execution snapshots are
 * never modified.
 */

const {
  readCounts,
  readBatchCounts,
  readBatchDistribution,
  fetchFinalNodes,
  calculateSourceFingerprint,
  deriveBatchId,
  annotateProjectionRows,
  countProjection,
  assertEqual,
  assertExpected,
  writeJsonReport,
  validateIndexRows,
  countBindingViewRows,
} = require('./outputIndexBackfillCommon');
const {
  DEFAULT_OPTIONS,
  extractOutputSchema,
  projectExecutionOutput,
} = require('../db/outputProjection');

const CONFIRMATION = 'APPLY_OUTPUT_INDEX_BACKFILL';

function parseArgs(argv) {
  const options = {
    confirm: '',
    out: null,
    expectedNodes: 0,
    expectedRows: 0,
    progressEvery: 50,
    sampleLimit: 20,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--confirm') options.confirm = String(argv[++index] || '');
    else if (arg === '--out') options.out = argv[++index];
    else if (arg === '--expected-node-executions') options.expectedNodes = Math.max(0, Number(argv[++index]) || 0);
    else if (arg === '--expected-index-rows') options.expectedRows = Math.max(0, Number(argv[++index]) || 0);
    else if (arg === '--progress-every') options.progressEvery = Math.max(1, Number(argv[++index]) || 50);
    else if (arg === '--sample-limit') options.sampleLimit = Math.max(1, Number(argv[++index]) || 20);
    else if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg === '--limit' || arg === '--force' || arg === '--truncate') {
      throw new Error(`${arg} is intentionally unsupported. Step 7B.3 applies the complete dataset and never force-clears unrelated rows.`);
    } else {
      throw new Error(`Unknown argument '${arg}'.`);
    }
  }
  return options;
}

function printHelp() {
  console.log(`Usage:\n  node scripts/applyExecutionOutputIndexBackfill.js --confirm ${CONFIRMATION} [--expected-node-executions N] [--expected-index-rows N] [--progress-every N] [--sample-limit N] [--out FILE]\n\nPreconditions:\n  1. Stop the Node/Express backend so no workflow runs are written during the maintenance transaction.\n  2. Step 7B.2 full dry run must have passed.\n  3. execution_output_index must be empty, or contain only the same deterministic Step 7B.3 batch for an idempotent re-run.`);
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

  const { pool, closePool } = require('../db/pool');
  const client = await pool.connect();
  const startedAt = new Date().toISOString();
  let transactionOpen = false;
  let report = null;

  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
    transactionOpen = true;
    await client.query("SET LOCAL lock_timeout = '15s'");
    await client.query("SET LOCAL statement_timeout = '10min'");

    const lockResult = await client.query(
      "SELECT pg_try_advisory_xact_lock(hashtext('autoflow:phase3:step7b3:output-index-apply')) AS locked"
    );
    if (!lockResult.rows[0] || lockResult.rows[0].locked !== true) {
      throw new Error('Another Step 7B.3 apply/rollback process currently holds the advisory lock.');
    }

    // Briefly freeze execution persistence and output-index writes while the
    // complete historical set is projected and committed atomically.
    await client.query('LOCK TABLE autoflow.workflow_execution IN SHARE MODE');
    await client.query('LOCK TABLE autoflow.node_execution IN SHARE MODE');
    await client.query('LOCK TABLE autoflow.execution_output_index IN SHARE ROW EXCLUSIVE MODE');

    const beforeCounts = await readCounts(client);
    const beforeDistribution = await readBatchDistribution(client);
    const nodeResult = await fetchFinalNodes(client);
    if (!nodeResult.rowCount) {
      throw new Error('No eligible final node executions were found.');
    }

    const sourceFingerprint = calculateSourceFingerprint(nodeResult.rows);
    const batchId = deriveBatchId(sourceFingerprint);
    const selectedNodeIds = nodeResult.rows.map((row) => row.node_execution_id);
    const selectedNodeKeys = nodeResult.rows.map((row) => row.node_key);

    assertExpected('Eligible final node execution count', nodeResult.rowCount, args.expectedNodes);

    const existingSameBatch = await readBatchCounts(client, batchId);
    const otherRows = beforeCounts.total - existingSameBatch.total;
    if (otherRows !== 0) {
      throw new Error(
        `execution_output_index contains ${otherRows} row(s) outside deterministic batch '${batchId}'. ` +
        'Step 7B.3 refuses to delete or replace unrelated rows.'
      );
    }

    report = {
      generatedAt: new Date().toISOString(),
      startedAt,
      mode: 'COMMITTED_BACKFILL',
      safety: {
        explicitConfirmation: true,
        completeDatasetOnly: true,
        advisoryLock: true,
        sourceTablesLockedAgainstWrites: true,
        executionSnapshotsModified: false,
        unrelatedOutputIndexRowsReplaced: false,
      },
      database: {
        database: process.env.DB_NAME || 'autoflow',
        schema: process.env.DB_SCHEMA || 'autoflow',
      },
      configuration: DEFAULT_OPTIONS,
      batch: {
        batchId,
        sourceFingerprint,
        phase: 'Database Phase 3 Step 7B.3',
        idempotentReapply: existingSameBatch.total > 0,
      },
      source: {
        selectedNodeExecutions: nodeResult.rowCount,
        selectedExecutions: new Set(nodeResult.rows.map((row) => row.execution_id)).size,
        selectedWorkflows: new Set(nodeResult.rows.map((row) => row.workflow_key)).size,
        beforeCounts,
        beforeBatchDistribution: beforeDistribution,
        existingSameBatch,
      },
      projected: {
        total: 0,
        business: 0,
        technical: 0,
        raw: 0,
        secret: 0,
        declaredSchemaNodes: 0,
        heuristicNodes: 0,
        truncatedNodes: 0,
      },
      inserted: {
        total: 0,
        processedNodeExecutions: 0,
      },
      verification: {
        transactionCounts: null,
        batchCounts: null,
        bindingViewRows: 0,
        expectedBindingViewRows: 0,
        quality: null,
        postCommitCounts: null,
        postCommitBatchCounts: null,
        sourceNodeCountAfterCommit: null,
      },
      samples: {
        truncated: [],
        errors: [],
      },
      verdict: null,
    };

    process.env.EXECUTION_OUTPUT_INDEX_WRITE_ENABLED = 'true';
    const { replaceForNodeExecution } = require('../db/executionOutputIndexRepository');

    for (let index = 0; index < nodeResult.rows.length; index += 1) {
      const row = nodeResult.rows[index];
      try {
        const outputSchema = extractOutputSchema(row.node_json);
        const projection = projectExecutionOutput({
          output: row.output_json,
          nodeJson: row.node_json,
          outputSchema,
          stepName: row.node_name || row.node_key,
          nodeKey: row.node_key,
        });

        countProjection(report.projected, projection);
        if (projection.truncated && report.samples.truncated.length < args.sampleLimit) {
          report.samples.truncated.push({
            workflowId: row.workflow_key,
            runId: row.execution_key,
            nodeId: row.node_key,
            nodeName: row.node_name,
            projectedRows: projection.rows.length,
          });
        }

        const taggedRows = annotateProjectionRows(projection.rows, {
          batchId,
          sourceFingerprint,
          schemaSource: projection.schemaSource,
        });
        const result = await replaceForNodeExecution(client, {
          executionId: row.execution_id,
          nodeExecutionId: row.node_execution_id,
          rows: taggedRows,
        });
        report.inserted.total += result.inserted;
        report.inserted.processedNodeExecutions += 1;
      } catch (error) {
        if (report.samples.errors.length < args.sampleLimit) {
          report.samples.errors.push({
            workflowId: row.workflow_key,
            runId: row.execution_key,
            nodeId: row.node_key,
            nodeName: row.node_name,
            error: error.message,
          });
        }
        throw error;
      }

      if ((index + 1) % args.progressEvery === 0 || index + 1 === nodeResult.rows.length) {
        console.log(`[Step 7B.3] Projected and inserted ${index + 1}/${nodeResult.rows.length} final node executions.`);
      }
    }

    assertEqual('Inserted row count', report.inserted.total, report.projected.total);
    assertEqual('Processed node execution count', report.inserted.processedNodeExecutions, nodeResult.rowCount);
    assertExpected('Projected output-index row count', report.projected.total, args.expectedRows);
    if (report.projected.truncatedNodes > 0) {
      throw new Error(`${report.projected.truncatedNodes} node projections were truncated. Apply is blocked.`);
    }

    const transactionCounts = await readCounts(client);
    const batchCounts = await readBatchCounts(client, batchId);
    const quality = await validateIndexRows(client, selectedNodeIds);
    const bindingViewRows = await countBindingViewRows(client, selectedNodeKeys);
    const expectedBindingViewRows = report.projected.total - report.projected.secret;

    assertEqual('Transaction total', transactionCounts.total, report.projected.total);
    assertEqual('Transaction business rows', transactionCounts.business, report.projected.business);
    assertEqual('Transaction technical rows', transactionCounts.technical, report.projected.technical);
    assertEqual('Transaction raw rows', transactionCounts.raw, report.projected.raw);
    assertEqual('Transaction secret rows', transactionCounts.secret, report.projected.secret);
    assertEqual('Indexed node execution coverage', transactionCounts.nodeExecutions, nodeResult.rowCount);
    assertEqual('Raw root coverage', transactionCounts.raw, nodeResult.rowCount);
    assertEqual('Batch total', batchCounts.total, report.projected.total);
    assertEqual('Batch node coverage', batchCounts.nodeExecutions, nodeResult.rowCount);
    assertEqual('Binding view rows', bindingViewRows, expectedBindingViewRows);
    assertEqual('Secret leak rows', quality.secretLeakRows, 0);
    assertEqual('Invalid kinds', quality.invalidKinds, 0);
    assertEqual('Execution mismatch rows', quality.executionMismatchRows, 0);
    assertEqual('Non-final-attempt rows', quality.nonFinalAttemptRows, 0);
    assertEqual('Duplicate binding paths', quality.duplicateBindingPathGroups, 0);

    report.verification.transactionCounts = transactionCounts;
    report.verification.batchCounts = batchCounts;
    report.verification.bindingViewRows = bindingViewRows;
    report.verification.expectedBindingViewRows = expectedBindingViewRows;
    report.verification.quality = quality;

    await client.query('COMMIT');
    transactionOpen = false;

    const postCommitCounts = await readCounts(client);
    const postCommitBatchCounts = await readBatchCounts(client, batchId);
    const sourceCountResult = await client.query(
      `
        SELECT count(*)::integer AS total
        FROM autoflow.node_execution node
        JOIN autoflow.workflow_execution execution ON execution.id = node.execution_id
        WHERE node.is_final_attempt = true
          AND execution.deleted_at IS NULL
      `
    );
    const sourceNodeCountAfterCommit = Number(sourceCountResult.rows[0] && sourceCountResult.rows[0].total) || 0;

    assertEqual('Post-commit total', postCommitCounts.total, report.projected.total);
    assertEqual('Post-commit batch total', postCommitBatchCounts.total, report.projected.total);
    assertEqual('Post-commit source node count', sourceNodeCountAfterCommit, nodeResult.rowCount);

    report.verification.postCommitCounts = postCommitCounts;
    report.verification.postCommitBatchCounts = postCommitBatchCounts;
    report.verification.sourceNodeCountAfterCommit = sourceNodeCountAfterCommit;
    report.verdict = {
      status: 'OUTPUT_INDEX_BACKFILL_APPLIED',
      blockers: [],
      writesCommitted: report.projected.total,
      transaction: 'COMMITTED',
      readyForReadApi: true,
      rollbackCommand: `npm run rollback:output-index-backfill -- --batch-id ${batchId} --confirm ROLLBACK_OUTPUT_INDEX_BACKFILL`,
    };

    console.log(JSON.stringify(report, null, 2));
    const target = writeJsonReport(args.out, report);
    if (target) console.log(`\nCommitted backfill report written to: ${target}`);
  } catch (error) {
    if (transactionOpen) {
      try {
        await client.query('ROLLBACK');
        transactionOpen = false;
      } catch (rollbackError) {
        console.error('[Step 7B.3] PostgreSQL rollback failed:', rollbackError);
      }
    }
    throw error;
  } finally {
    process.env.EXECUTION_OUTPUT_INDEX_WRITE_ENABLED = 'false';
    client.release();
    await closePool();
  }
}

run().catch((error) => {
  console.error('[Step 7B.3] Committed output-index backfill failed.');
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
