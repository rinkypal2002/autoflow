'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

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

async function readBatchCounts(client, batchId) {
  return readCounts(
    client,
    `WHERE metadata #>> '{backfill,batchId}' = $1`,
    [batchId]
  );
}

async function readBatchDistribution(client) {
  const result = await client.query(
    `
      SELECT
        coalesce(metadata #>> '{backfill,batchId}', '<UNTAGGED>') AS batch_id,
        count(*)::integer AS rows,
        count(DISTINCT node_execution_id)::integer AS node_executions,
        min(created_at) AS first_created_at,
        max(created_at) AS last_created_at
      FROM autoflow.execution_output_index
      GROUP BY coalesce(metadata #>> '{backfill,batchId}', '<UNTAGGED>')
      ORDER BY batch_id
    `
  );
  return result.rows.map((row) => ({
    batchId: row.batch_id,
    rows: Number(row.rows) || 0,
    nodeExecutions: Number(row.node_executions) || 0,
    firstCreatedAt: row.first_created_at || null,
    lastCreatedAt: row.last_created_at || null,
  }));
}

async function fetchFinalNodes(client) {
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
        node.row_version,
        node.updated_at,
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
    `
  );
}

function stableStringify(value) {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value), 'utf8').digest('hex');
}

function calculateSourceFingerprint(rows) {
  const hash = crypto.createHash('sha256');
  for (const row of rows) {
    hash.update(String(row.node_execution_id || ''));
    hash.update('|');
    hash.update(String(row.execution_id || ''));
    hash.update('|');
    hash.update(String(row.row_version || 0));
    hash.update('|');
    hash.update(row.updated_at ? new Date(row.updated_at).toISOString() : '');
    hash.update('|');
    hash.update(stableStringify(row.output_json));
    hash.update('|');
    hash.update(stableStringify(row.node_json));
    hash.update('\n');
  }
  return hash.digest('hex');
}

function deriveBatchId(sourceFingerprint) {
  if (!/^[a-f0-9]{64}$/i.test(String(sourceFingerprint || ''))) {
    throw new Error('A valid SHA-256 source fingerprint is required.');
  }
  return `step7b3-${String(sourceFingerprint).slice(0, 20).toLowerCase()}`;
}

function annotateProjectionRows(rows, context) {
  return (Array.isArray(rows) ? rows : []).map((row) => ({
    ...row,
    metadata: {
      ...(row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
        ? row.metadata
        : {}),
      backfill: {
        phase: 'Database Phase 3 Step 7B.3',
        batchId: context.batchId,
        sourceFingerprint: context.sourceFingerprint,
        sourceType: 'FINAL_NODE_EXECUTION',
        schemaSource: context.schemaSource,
      },
    },
  }));
}

function countProjection(summary, projection) {
  summary.total += projection.rows.length;
  summary.business += projection.counts.BUSINESS;
  summary.technical += projection.counts.TECHNICAL;
  summary.raw += projection.counts.RAW;
  summary.secret += projection.counts.SECRET;
  summary.declaredSchemaNodes += projection.schemaSource === 'DECLARED_SCHEMA' ? 1 : 0;
  summary.heuristicNodes += projection.schemaSource === 'OBSERVED_HEURISTIC' ? 1 : 0;
  summary.truncatedNodes += projection.truncated ? 1 : 0;
}

function assertEqual(label, actual, expected) {
  if (actual !== expected) {
    throw new Error(`${label} mismatch: expected ${expected}, received ${actual}.`);
  }
}

function assertExpected(label, actual, expected) {
  if (expected === null || expected === undefined || expected === 0) return;
  assertEqual(label, actual, expected);
}

function writeJsonReport(targetPath, report) {
  if (!targetPath) return null;
  const target = path.resolve(targetPath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, JSON.stringify(report, null, 2), 'utf8');
  return target;
}

function readJsonReport(targetPath) {
  const target = path.resolve(targetPath);
  return JSON.parse(fs.readFileSync(target, 'utf8'));
}

function resolveBatchId({ batchId, reportPath }) {
  if (batchId) return String(batchId).trim();
  if (!reportPath) {
    throw new Error('Provide either --batch-id or --report.');
  }
  const report = readJsonReport(reportPath);
  const resolved = report && report.batch && report.batch.batchId;
  if (!resolved) {
    throw new Error(`The report '${reportPath}' does not contain batch.batchId.`);
  }
  return String(resolved);
}

async function validateIndexRows(client, nodeIds = null) {
  const params = [];
  let where = '';
  if (Array.isArray(nodeIds) && nodeIds.length) {
    params.push(nodeIds);
    where = 'WHERE output.node_execution_id = ANY($1::uuid[])';
  }

  const quality = await client.query(
    `
      SELECT
        count(*) FILTER (
          WHERE output.is_secret = true
            AND (output.value_preview IS NOT NULL OR output.value_json IS NOT NULL)
        )::integer AS secret_leak_rows,
        count(*) FILTER (
          WHERE output.field_kind NOT IN ('BUSINESS', 'TECHNICAL', 'RAW')
        )::integer AS invalid_kinds,
        count(*) FILTER (
          WHERE output.execution_id <> node.execution_id
        )::integer AS execution_mismatch_rows,
        count(*) FILTER (
          WHERE node.is_final_attempt = false
        )::integer AS non_final_attempt_rows
      FROM autoflow.execution_output_index output
      JOIN autoflow.node_execution node
        ON node.id = output.node_execution_id
      ${where}
    `,
    params
  );

  const duplicate = await client.query(
    `
      SELECT count(*)::integer AS duplicate_groups
      FROM (
        SELECT output.node_execution_id, output.binding_path
        FROM autoflow.execution_output_index output
        ${where}
        GROUP BY output.node_execution_id, output.binding_path
        HAVING count(*) > 1
      ) duplicates
    `,
    params
  );

  const row = quality.rows[0] || {};
  return {
    secretLeakRows: Number(row.secret_leak_rows) || 0,
    invalidKinds: Number(row.invalid_kinds) || 0,
    executionMismatchRows: Number(row.execution_mismatch_rows) || 0,
    nonFinalAttemptRows: Number(row.non_final_attempt_rows) || 0,
    duplicateBindingPathGroups: Number(duplicate.rows[0] && duplicate.rows[0].duplicate_groups) || 0,
  };
}

async function countBindingViewRows(client, nodeIds = null) {
  const params = [];
  let where = '';
  if (Array.isArray(nodeIds) && nodeIds.length) {
    params.push(nodeIds.map(String));
    where = 'WHERE source."nodeId" = ANY($1::text[])';
  }
  const result = await client.query(
    `SELECT count(*)::integer AS total FROM autoflow.output_binding_source_v1 source ${where}`,
    params
  );
  return Number(result.rows[0] && result.rows[0].total) || 0;
}

module.exports = {
  normalizeCountRow,
  readCounts,
  readBatchCounts,
  readBatchDistribution,
  fetchFinalNodes,
  stableStringify,
  sha256,
  calculateSourceFingerprint,
  deriveBatchId,
  annotateProjectionRows,
  countProjection,
  assertEqual,
  assertExpected,
  writeJsonReport,
  readJsonReport,
  resolveBatchId,
  validateIndexRows,
  countBindingViewRows,
};
