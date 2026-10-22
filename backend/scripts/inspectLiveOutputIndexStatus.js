'use strict';

const fs = require('fs');
const path = require('path');
const { pool } = require('../db/pool');

function parseArgs(argv) {
  const args = { runId: null, out: null };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--run-id') args.runId = argv[++index] || null;
    else if (argv[index] === '--out') args.out = argv[++index] || null;
    else throw new Error(`Unknown argument '${argv[index]}'.`);
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const client = await pool.connect();
  try {
    await client.query('BEGIN READ ONLY');
    const target = args.runId
      ? await client.query(
          `SELECT id, execution_key, workflow_id, started_at, status
             FROM autoflow.workflow_execution
            WHERE execution_key = $1 AND deleted_at IS NULL
            ORDER BY started_at DESC LIMIT 1`,
          [args.runId]
        )
      : await client.query(
          `SELECT id, execution_key, workflow_id, started_at, status
             FROM autoflow.workflow_execution
            WHERE deleted_at IS NULL
            ORDER BY started_at DESC LIMIT 1`
        );
    if (target.rowCount !== 1) throw new Error('No matching workflow execution was found.');
    const execution = target.rows[0];
    const counts = await client.query(
      `SELECT
         count(*)::integer AS total,
         count(*) FILTER (WHERE field_kind='BUSINESS')::integer AS business,
         count(*) FILTER (WHERE field_kind='TECHNICAL')::integer AS technical,
         count(*) FILTER (WHERE field_kind='RAW')::integer AS raw,
         count(DISTINCT node_execution_id)::integer AS indexed_nodes
       FROM autoflow.execution_output_index
       WHERE execution_id = $1`,
      [execution.id]
    );
    const source = await client.query(
      `SELECT count(*)::integer AS final_nodes
         FROM autoflow.node_execution
        WHERE execution_id = $1 AND is_final_attempt = true`,
      [execution.id]
    );
    const quality = await client.query(
      `SELECT count(*)::integer AS duplicate_groups
         FROM (
           SELECT node_execution_id, binding_path
             FROM autoflow.execution_output_index
            WHERE execution_id = $1
            GROUP BY node_execution_id, binding_path
           HAVING count(*) > 1
         ) duplicates`,
      [execution.id]
    );
    const row = counts.rows[0];
    const report = {
      generatedAt: new Date().toISOString(),
      mode: 'READ_ONLY',
      execution: {
        runId: execution.execution_key,
        status: execution.status,
        startedAt: execution.started_at,
      },
      source: { finalNodes: Number(source.rows[0].final_nodes) || 0 },
      outputIndex: {
        total: Number(row.total) || 0,
        business: Number(row.business) || 0,
        technical: Number(row.technical) || 0,
        raw: Number(row.raw) || 0,
        indexedNodes: Number(row.indexed_nodes) || 0,
        duplicateBindingPathGroups: Number(quality.rows[0].duplicate_groups) || 0,
      },
      verdict: {
        status:
          Number(source.rows[0].final_nodes) === Number(row.indexed_nodes) &&
          Number(quality.rows[0].duplicate_groups) === 0
            ? 'LIVE_OUTPUT_INDEX_COVERAGE_VERIFIED'
            : 'LIVE_OUTPUT_INDEX_COVERAGE_INCOMPLETE',
        writesPerformed: 0,
        transaction: 'READ ONLY / ROLLBACK',
      },
    };
    await client.query('ROLLBACK');
    console.log(JSON.stringify(report, null, 2));
    if (args.out) {
      const targetPath = path.resolve(args.out);
      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
      fs.writeFileSync(targetPath, JSON.stringify(report, null, 2));
      console.log(`\nStatus report written to: ${targetPath}`);
    }
    if (report.verdict.status !== 'LIVE_OUTPUT_INDEX_COVERAGE_VERIFIED') {
      process.exitCode = 2;
    }
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch {}
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error('[Step 7B.4] Live output-index status inspection failed.');
  console.error(error);
  process.exitCode = 1;
});
