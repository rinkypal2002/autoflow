'use strict';

/**
 * Read-only readiness analysis for autoflow.execution_output_index.
 *
 * The script starts a PostgreSQL READ ONLY transaction, projects every final
 * node output in memory, reports the expected index footprint, and rolls back.
 * It never inserts, updates or deletes application data.
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
  const options = { out: null, limit: 0, sampleLimit: 20 };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--out') options.out = argv[++index];
    else if (arg === '--limit') options.limit = Math.max(0, Number(argv[++index]) || 0);
    else if (arg === '--sample-limit') options.sampleLimit = Math.max(1, Number(argv[++index]) || 20);
    else if (arg === '--help' || arg === '-h') options.help = true;
  }
  return options;
}

function printHelp() {
  console.log(`Usage:\n  node scripts/analyzeExecutionOutputIndexReadiness.js [--limit N] [--sample-limit N] [--out FILE]\n\nThis command is read-only. It projects final node outputs in memory and does not populate execution_output_index.`);
}

function bytes(value) {
  try {
    return Buffer.byteLength(JSON.stringify(value), 'utf8');
  } catch {
    return 0;
  }
}

function average(total, count) {
  return count ? Math.round((total / count) * 100) / 100 : 0;
}

function addSample(list, item, limit) {
  if (list.length < limit) list.push(item);
}

async function tableExists(client, relation) {
  const result = await client.query('SELECT to_regclass($1) AS relation', [relation]);
  return Boolean(result.rows[0] && result.rows[0].relation);
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const client = await pool.connect();
  const startedAt = new Date().toISOString();

  try {
    await client.query('BEGIN TRANSACTION READ ONLY');

    for (const relation of [
      'autoflow.node_execution',
      'autoflow.workflow_node',
      'autoflow.execution_output_index',
    ]) {
      if (!(await tableExists(client, relation))) {
        throw new Error(`Required relation '${relation}' was not found.`);
      }
    }

    const existingResult = await client.query(`
      SELECT
        count(*)::integer AS total,
        count(DISTINCT execution_id)::integer AS executions,
        count(DISTINCT node_execution_id)::integer AS node_executions
      FROM autoflow.execution_output_index
    `);

    const limitSql = args.limit > 0 ? 'LIMIT $1' : '';
    const parameters = args.limit > 0 ? [args.limit] : [];
    const nodeResult = await client.query(
      `
        SELECT
          node.id AS node_execution_id,
          node.execution_id,
          execution.execution_key,
          workflow.workflow_key,
          node.node_key,
          node.node_name,
          node.action_id,
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
      parameters
    );

    const summary = {
      generatedAt: new Date().toISOString(),
      mode: 'READ_ONLY',
      startedAt,
      database: {
        database: process.env.DB_NAME || 'autoflow',
        schema: process.env.DB_SCHEMA || 'autoflow',
      },
      configuration: DEFAULT_OPTIONS,
      source: {
        finalNodeExecutions: nodeResult.rowCount,
        distinctExecutions: new Set(nodeResult.rows.map((row) => row.execution_id)).size,
        distinctWorkflows: new Set(nodeResult.rows.map((row) => row.workflow_key)).size,
        existingOutputIndex: existingResult.rows[0],
      },
      projection: {
        totalRows: 0,
        businessRows: 0,
        technicalRows: 0,
        rawRows: 0,
        secretRows: 0,
        declaredSchemaNodes: 0,
        heuristicNodes: 0,
        truncatedNodes: 0,
        duplicateBindingPaths: 0,
        emptyOutputs: 0,
        largestOutputBytes: 0,
        averageOutputBytes: 0,
        largestProjectedRows: 0,
        averageProjectedRows: 0,
      },
      samples: {
        truncated: [],
        secrets: [],
        largestOutputs: [],
        duplicatePaths: [],
        errors: [],
      },
      verdict: null,
    };

    let totalOutputBytes = 0;
    let totalProjectedRows = 0;
    const sizeSamples = [];

    for (const row of nodeResult.rows) {
      try {
        const outputSize = bytes(row.output_json);
        totalOutputBytes += outputSize;
        summary.projection.largestOutputBytes = Math.max(summary.projection.largestOutputBytes, outputSize);

        const outputSchema = extractOutputSchema(row.node_json);
        const projection = projectExecutionOutput({
          output: row.output_json,
          nodeJson: row.node_json,
          outputSchema,
          stepName: row.node_name || row.node_key,
          nodeKey: row.node_key,
        });

        const paths = projection.rows.map((item) => item.bindingPath);
        const duplicateCount = paths.length - new Set(paths).size;
        summary.projection.duplicateBindingPaths += duplicateCount;
        summary.projection.totalRows += projection.rows.length;
        summary.projection.businessRows += projection.counts.BUSINESS;
        summary.projection.technicalRows += projection.counts.TECHNICAL;
        summary.projection.rawRows += projection.counts.RAW;
        summary.projection.secretRows += projection.counts.SECRET;
        summary.projection.declaredSchemaNodes += outputSchema ? 1 : 0;
        summary.projection.heuristicNodes += outputSchema ? 0 : 1;
        summary.projection.truncatedNodes += projection.truncated ? 1 : 0;
        summary.projection.emptyOutputs += row.output_json === null || row.output_json === undefined ? 1 : 0;
        summary.projection.largestProjectedRows = Math.max(summary.projection.largestProjectedRows, projection.rows.length);
        totalProjectedRows += projection.rows.length;

        if (projection.truncated) {
          addSample(summary.samples.truncated, {
            workflowId: row.workflow_key,
            runId: row.execution_key,
            nodeId: row.node_key,
            nodeName: row.node_name,
            projectedRows: projection.rows.length,
          }, args.sampleLimit);
        }

        if (projection.counts.SECRET) {
          addSample(summary.samples.secrets, {
            workflowId: row.workflow_key,
            runId: row.execution_key,
            nodeId: row.node_key,
            nodeName: row.node_name,
            secretRows: projection.counts.SECRET,
          }, args.sampleLimit);
        }

        if (duplicateCount) {
          addSample(summary.samples.duplicatePaths, {
            workflowId: row.workflow_key,
            runId: row.execution_key,
            nodeId: row.node_key,
            duplicateCount,
          }, args.sampleLimit);
        }

        sizeSamples.push({
          workflowId: row.workflow_key,
          runId: row.execution_key,
          nodeId: row.node_key,
          nodeName: row.node_name,
          outputBytes: outputSize,
          projectedRows: projection.rows.length,
          schemaSource: projection.schemaSource,
        });
      } catch (error) {
        addSample(summary.samples.errors, {
          workflowId: row.workflow_key,
          runId: row.execution_key,
          nodeId: row.node_key,
          error: error.message,
        }, args.sampleLimit);
      }
    }

    summary.projection.averageOutputBytes = average(totalOutputBytes, nodeResult.rowCount);
    summary.projection.averageProjectedRows = average(totalProjectedRows, nodeResult.rowCount);
    summary.samples.largestOutputs = sizeSamples
      .sort((a, b) => b.outputBytes - a.outputBytes)
      .slice(0, args.sampleLimit);

    const blockers = [];
    if (summary.samples.errors.length) blockers.push('PROJECTION_ERRORS');
    if (summary.projection.duplicateBindingPaths) blockers.push('DUPLICATE_BINDING_PATHS');
    if (summary.projection.truncatedNodes) blockers.push('TRUNCATED_NODES_REQUIRE_REVIEW');

    summary.verdict = {
      status: blockers.length ? 'REVIEW_REQUIRED' : 'READY_FOR_DRY_RUN_BACKFILL',
      blockers,
      writesPerformed: 0,
      transaction: 'READ ONLY / ROLLBACK',
    };

    await client.query('ROLLBACK');

    console.log(JSON.stringify(summary, null, 2));
    if (args.out) {
      const target = path.resolve(args.out);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, JSON.stringify(summary, null, 2), 'utf8');
      console.log(`\nReadiness report written to: ${target}`);
    }
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { /* best effort */ }
    throw error;
  } finally {
    client.release();
    await closePool();
  }
}

run().catch((error) => {
  console.error('[Step 7B.1] Output-index readiness analysis failed.');
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
