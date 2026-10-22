'use strict';

/**
 * Phase 3 Step 7B.2 — transactional DRY-RUN backfill.
 *
 * Safety guarantees:
 *   - this script has no apply/commit mode;
 *   - every database mutation occurs inside one transaction;
 *   - the transaction is always rolled back;
 *   - the output-index row count is verified again after rollback;
 *   - existing Phase 2 execution snapshots are never modified.
 */

const fs = require('fs');
const path = require('path');
const { pool, closePool } = require('../db/pool');
const {
  DEFAULT_OPTIONS,
  extractOutputSchema,
  projectExecutionOutput,
} = require('../db/outputProjection');

function parseArgs(argv) {
  const options = { out: null, limit: 0, sampleLimit: 20, progressEvery: 50 };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--out') options.out = argv[++index];
    else if (arg === '--limit') options.limit = Math.max(0, Number(argv[++index]) || 0);
    else if (arg === '--sample-limit') options.sampleLimit = Math.max(1, Number(argv[++index]) || 20);
    else if (arg === '--progress-every') options.progressEvery = Math.max(1, Number(argv[++index]) || 50);
    else if (arg === '--apply' || arg === '--commit') {
      throw new Error(`${arg} is not supported by Step 7B.2. This package is DRY-RUN only.`);
    } else if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else {
      throw new Error(`Unknown argument '${arg}'.`);
    }
  }
  return options;
}

function printHelp() {
  console.log(`Usage:\n  node scripts/dryRunExecutionOutputIndexBackfill.js [--limit N] [--sample-limit N] [--progress-every N] [--out FILE]\n\nThis command performs real constraint-checked INSERT/DELETE statements inside a PostgreSQL transaction and ALWAYS ROLLS BACK. It has no apply mode.`);
}

function countProjection(summary, projection) {
  summary.projected.total += projection.rows.length;
  summary.projected.business += projection.counts.BUSINESS;
  summary.projected.technical += projection.counts.TECHNICAL;
  summary.projected.raw += projection.counts.RAW;
  summary.projected.secret += projection.counts.SECRET;
  summary.projected.declaredSchemaNodes += projection.schemaSource === 'DECLARED_SCHEMA' ? 1 : 0;
  summary.projected.heuristicNodes += projection.schemaSource === 'OBSERVED_HEURISTIC' ? 1 : 0;
  summary.projected.truncatedNodes += projection.truncated ? 1 : 0;
}

function normalizeCountRow(row) {
  return {
    total: Number(row && row.total) || 0,
    business: Number(row && row.business) || 0,
    technical: Number(row && row.technical) || 0,
    raw: Number(row && row.raw) || 0,
    secret: Number(row && row.secret) || 0,
    nodeExecutions: Number(row && row.node_executions) || 0,
    executions: Number(row && row.executions) || 0,
  };
}

async function readCounts(client, whereSql = '', params = []) {
  const result = await client.query(
    `
      SELECT
        count(*)::integer AS total,
        count(*) FILTER (WHERE field_kind = 'BUSINESS')::integer AS business,
        count(*) FILTER (WHERE field_kind = 'TECHNICAL')::integer AS technical,
        count(*) FILTER (WHERE field_kind = 'RAW')::integer AS raw,
        count(*) FILTER (WHERE is_secret = true)::integer AS secret,
        count(DISTINCT node_execution_id)::integer AS node_executions,
        count(DISTINCT execution_id)::integer AS executions
      FROM autoflow.execution_output_index
      ${whereSql}
    `,
    params
  );
  return normalizeCountRow(result.rows[0]);
}

async function fetchFinalNodes(client, limit) {
  const limitSql = limit > 0 ? 'LIMIT $1' : '';
  const params = limit > 0 ? [limit] : [];
  return client.query(
    `
      SELECT
        node.id AS node_execution_id,
        node.execution_id,
        execution.execution_key,
        workflow.workflow_key,
        node.node_key,
        node.node_name,
        node.action_id,
        node.sequence_number,
        node.status,
        node.business_output_json AS output_json,
        definition.node_json
      FROM autoflow.node_execution node
      JOIN autoflow.workflow_execution execution
        ON execution.id = node.execution_id
      JOIN autoflow.workflow workflow
        ON workflow.id = node.workflow_id
       AND workflow.workspace_id = node.workspace_id
      LEFT JOIN autoflow.workflow_node definition
        ON definition.workspace_id = node.workspace_id
       AND definition.workflow_id = node.workflow_id
       AND definition.workflow_version_id = node.workflow_version_id
       AND definition.node_key = node.node_key
      WHERE node.is_final_attempt = true
        AND execution.deleted_at IS NULL
      ORDER BY execution.started_at, node.sequence_number, node.node_key
      ${limitSql}
    `,
    params
  );
}

function expectedTransactionalCounts(before, selectedExisting, projected, selectedNodeCount, selectedExecutionCount) {
  return {
    total: before.total - selectedExisting.total + projected.total,
    business: before.business - selectedExisting.business + projected.business,
    technical: before.technical - selectedExisting.technical + projected.technical,
    raw: before.raw - selectedExisting.raw + projected.raw,
    secret: before.secret - selectedExisting.secret + projected.secret,
    nodeExecutions: before.nodeExecutions - selectedExisting.nodeExecutions + selectedNodeCount,
    // Existing and selected execution sets can overlap, so execution distinct-count parity is
    // verified separately from the selected rows rather than predicted arithmetically.
    selectedExecutionCount,
  };
}

function assertEqual(label, actual, expected) {
  if (actual !== expected) {
    throw new Error(`${label} mismatch: expected ${expected}, received ${actual}.`);
  }
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const client = await pool.connect();
  const startedAt = new Date().toISOString();
  let transactionOpen = false;
  let beforeCounts = null;
  let report = null;

  try {
    beforeCounts = await readCounts(client);

    await client.query('BEGIN');
    transactionOpen = true;
    await client.query("SET LOCAL lock_timeout = '10s'");

    const lockResult = await client.query(
      "SELECT pg_try_advisory_xact_lock(hashtext('autoflow:phase3:step7b2:output-index-dry-run')) AS locked"
    );
    if (!lockResult.rows[0] || lockResult.rows[0].locked !== true) {
      throw new Error('Another output-index backfill process currently holds the advisory lock.');
    }

    const nodeResult = await fetchFinalNodes(client, args.limit);
    const nodeIds = nodeResult.rows.map((row) => row.node_execution_id);
    const selectedExisting = nodeIds.length
      ? await readCounts(client, 'WHERE node_execution_id = ANY($1::uuid[])', [nodeIds])
      : normalizeCountRow({});

    report = {
      generatedAt: new Date().toISOString(),
      startedAt,
      mode: 'DRY_RUN_BACKFILL',
      safety: {
        applyModeAvailable: false,
        transaction: 'BEGIN / CONSTRAINT-CHECKED WRITES / ROLLBACK',
        advisoryLock: true,
        executionSnapshotsModified: false,
      },
      database: {
        database: process.env.DB_NAME || 'autoflow',
        schema: process.env.DB_SCHEMA || 'autoflow',
      },
      configuration: DEFAULT_OPTIONS,
      source: {
        selectedNodeExecutions: nodeResult.rowCount,
        selectedExecutions: new Set(nodeResult.rows.map((row) => row.execution_id)).size,
        selectedWorkflows: new Set(nodeResult.rows.map((row) => row.workflow_key)).size,
        beforeCounts,
        selectedExistingCounts: selectedExisting,
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
        expectedTransactionCounts: null,
        selectedTransactionCounts: null,
        searchableViewRowsForSelectedNodes: 0,
        secretLeakRows: 0,
        duplicateBindingPathGroups: 0,
        invalidKinds: 0,
        rollbackCounts: null,
        rollbackParity: false,
      },
      samples: {
        truncated: [],
        errors: [],
      },
      verdict: null,
    };

    // Repository writes are enabled only for this DRY-RUN process. The script has
    // no commit branch and the PostgreSQL transaction is rolled back in all paths.
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

        countProjection(report, projection);
        if (projection.truncated && report.samples.truncated.length < args.sampleLimit) {
          report.samples.truncated.push({
            workflowId: row.workflow_key,
            runId: row.execution_key,
            nodeId: row.node_key,
            nodeName: row.node_name,
            projectedRows: projection.rows.length,
          });
        }

        const result = await replaceForNodeExecution(client, {
          executionId: row.execution_id,
          nodeExecutionId: row.node_execution_id,
          rows: projection.rows,
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
        console.log(`[Step 7B.2] Projected and inserted ${index + 1}/${nodeResult.rows.length} node executions inside the rollback transaction.`);
      }
    }

    assertEqual('Inserted row count', report.inserted.total, report.projected.total);
    assertEqual('Processed node count', report.inserted.processedNodeExecutions, nodeResult.rowCount);
    if (report.projected.truncatedNodes > 0) {
      throw new Error(`${report.projected.truncatedNodes} node projections were truncated; review is required before backfill.`);
    }

    const transactionCounts = await readCounts(client);
    const selectedTransactionCounts = nodeIds.length
      ? await readCounts(client, 'WHERE node_execution_id = ANY($1::uuid[])', [nodeIds])
      : normalizeCountRow({});
    const expected = expectedTransactionalCounts(
      beforeCounts,
      selectedExisting,
      report.projected,
      nodeResult.rowCount,
      report.source.selectedExecutions
    );

    assertEqual('Transaction total', transactionCounts.total, expected.total);
    assertEqual('Transaction business', transactionCounts.business, expected.business);
    assertEqual('Transaction technical', transactionCounts.technical, expected.technical);
    assertEqual('Transaction raw', transactionCounts.raw, expected.raw);
    assertEqual('Transaction secret', transactionCounts.secret, expected.secret);
    assertEqual('Selected transaction total', selectedTransactionCounts.total, report.projected.total);
    assertEqual('Selected transaction business', selectedTransactionCounts.business, report.projected.business);
    assertEqual('Selected transaction technical', selectedTransactionCounts.technical, report.projected.technical);
    assertEqual('Selected transaction raw', selectedTransactionCounts.raw, report.projected.raw);
    assertEqual('Selected transaction node executions', selectedTransactionCounts.nodeExecutions, nodeResult.rowCount);

    const validationResult = await client.query(
      `
        SELECT
          count(*) FILTER (
            WHERE is_secret = true
              AND (value_preview IS NOT NULL OR value_json IS NOT NULL)
          )::integer AS secret_leak_rows,
          count(*) FILTER (
            WHERE field_kind NOT IN ('BUSINESS', 'TECHNICAL', 'RAW')
          )::integer AS invalid_kinds
        FROM autoflow.execution_output_index
        WHERE node_execution_id = ANY($1::uuid[])
      `,
      [nodeIds]
    );

    const duplicateResult = await client.query(
      `
        SELECT count(*)::integer AS duplicate_groups
        FROM (
          SELECT node_execution_id, binding_path
          FROM autoflow.execution_output_index
          WHERE node_execution_id = ANY($1::uuid[])
          GROUP BY node_execution_id, binding_path
          HAVING count(*) > 1
        ) duplicates
      `,
      [nodeIds]
    );

    const viewResult = await client.query(
      `
        SELECT count(*)::integer AS total
        FROM autoflow.output_binding_source_v1 source
        WHERE source."nodeId" = ANY($1::text[])
          AND source."runId" = ANY($2::text[])
      `,
      [
        nodeResult.rows.map((row) => row.node_key),
        [...new Set(nodeResult.rows.map((row) => row.execution_key))],
      ]
    );

    report.verification.transactionCounts = transactionCounts;
    report.verification.expectedTransactionCounts = expected;
    report.verification.selectedTransactionCounts = selectedTransactionCounts;
    report.verification.searchableViewRowsForSelectedNodes = Number(viewResult.rows[0].total) || 0;
    report.verification.secretLeakRows = Number(validationResult.rows[0].secret_leak_rows) || 0;
    report.verification.invalidKinds = Number(validationResult.rows[0].invalid_kinds) || 0;
    report.verification.duplicateBindingPathGroups = Number(duplicateResult.rows[0].duplicate_groups) || 0;

    assertEqual('Secret leak rows', report.verification.secretLeakRows, 0);
    assertEqual('Invalid field kinds', report.verification.invalidKinds, 0);
    assertEqual('Duplicate binding-path groups', report.verification.duplicateBindingPathGroups, 0);

    await client.query('ROLLBACK');
    transactionOpen = false;

    const rollbackCounts = await readCounts(client);
    report.verification.rollbackCounts = rollbackCounts;
    report.verification.rollbackParity = JSON.stringify(rollbackCounts) === JSON.stringify(beforeCounts);
    if (!report.verification.rollbackParity) {
      throw new Error('Output-index counts changed after rollback.');
    }

    report.verdict = {
      status: 'DRY_RUN_BACKFILL_VERIFIED',
      blockers: [],
      writesCommitted: 0,
      transaction: 'ROLLED_BACK',
      readyForApplyPackage: true,
    };

    console.log(JSON.stringify(report, null, 2));
    if (args.out) {
      const target = path.resolve(args.out);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, JSON.stringify(report, null, 2), 'utf8');
      console.log(`\nDry-run backfill report written to: ${target}`);
    }
  } catch (error) {
    if (transactionOpen) {
      try {
        await client.query('ROLLBACK');
        transactionOpen = false;
      } catch (rollbackError) {
        console.error('[Step 7B.2] PostgreSQL rollback failed:', rollbackError);
      }
    }

    // Best-effort rollback parity check, included in the error message when it fails.
    try {
      if (beforeCounts) {
        const afterFailureCounts = await readCounts(client);
        if (JSON.stringify(afterFailureCounts) !== JSON.stringify(beforeCounts)) {
          error.message += ` Output-index counts differ after failure: before=${JSON.stringify(beforeCounts)}, after=${JSON.stringify(afterFailureCounts)}.`;
        }
      }
    } catch (verificationError) {
      error.message += ` Rollback verification also failed: ${verificationError.message}.`;
    }
    throw error;
  } finally {
    process.env.EXECUTION_OUTPUT_INDEX_WRITE_ENABLED = 'false';
    client.release();
    await closePool();
  }
}

run().catch((error) => {
  console.error('[Step 7B.2] DRY-RUN output-index backfill failed.');
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
