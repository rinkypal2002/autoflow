'use strict';

/**
 * PostgreSQL repository for autoflow.execution_output_index.
 *
 * Step 7B.4 wires this repository into executionRepository.js behind the
 * EXECUTION_OUTPUT_INDEX_WRITE_ENABLED feature flag. Backfill tools may use the
 * explicit transaction-scoped override; ordinary runtime calls cannot bypass
 * the router/config flag.
 */

const { query } = require('./pool');

const VALID_KINDS = new Set(['BUSINESS', 'TECHNICAL', 'RAW']);

function writeEnabled(override = null) {
  if (override === true) return true;
  if (override === false) return false;
  return String(process.env.EXECUTION_OUTPUT_INDEX_WRITE_ENABLED || 'false')
    .trim()
    .toLowerCase() === 'true';
}

function assertWriteEnabled(override = null) {
  if (!writeEnabled(override)) {
    const error = new Error(
      'Execution output-index writes are disabled. Set EXECUTION_OUTPUT_INDEX_WRITE_ENABLED=true only during an approved Phase 3 cutover.'
    );
    error.code = 'OUTPUT_INDEX_WRITES_DISABLED';
    error.status = 503;
    throw error;
  }
}

function validateRow(row) {
  const required = [
    'fieldKey', 'displayName', 'fieldPath', 'bindingPath', 'valueType',
    'fieldKind',
  ];
  for (const key of required) {
    if (!String(row && row[key] !== undefined ? row[key] : '').trim()) {
      throw new Error(`Output-index row is missing ${key}.`);
    }
  }
  if (!VALID_KINDS.has(row.fieldKind)) {
    throw new Error(`Invalid output-index fieldKind '${row.fieldKind}'.`);
  }
  if (row.isSecret && (row.valuePreview !== null || row.valueJson !== null)) {
    throw new Error('Secret output-index rows must not carry a preview or JSON value.');
  }
}

function normalizeRow(row) {
  validateRow(row);
  return {
    fieldKey: String(row.fieldKey),
    displayName: String(row.displayName),
    parentPath: row.parentPath ? String(row.parentPath) : null,
    fieldPath: String(row.fieldPath),
    bindingPath: String(row.bindingPath),
    valueType: String(row.valueType),
    fieldKind: row.fieldKind,
    ordinalPosition: Math.max(0, Number(row.ordinalPosition) || 0),
    isSecret: Boolean(row.isSecret),
    isSearchable: row.isSearchable !== false && !row.isSecret,
    valuePreview: row.isSecret || row.valuePreview === undefined
      ? null
      : row.valuePreview,
    valueJson: row.isSecret || row.valueJson === undefined
      ? null
      : row.valueJson,
    metadata: row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
      ? row.metadata
      : {},
  };
}

async function replaceForNodeExecution(client, input) {
  assertWriteEnabled(input && input.writeEnabled);
  if (!client || typeof client.query !== 'function') {
    throw new TypeError('replaceForNodeExecution requires an active transaction client.');
  }

  const executionId = String(input.executionId || '');
  const nodeExecutionId = String(input.nodeExecutionId || '');
  if (!executionId || !nodeExecutionId) {
    throw new Error('executionId and nodeExecutionId are required.');
  }

  const rows = Array.isArray(input.rows) ? input.rows.map(normalizeRow) : [];
  const bindingPaths = new Set();
  for (const row of rows) {
    if (bindingPaths.has(row.bindingPath)) {
      throw new Error(`Duplicate output-index binding path '${row.bindingPath}'.`);
    }
    bindingPaths.add(row.bindingPath);
  }

  await client.query(
    'DELETE FROM autoflow.execution_output_index WHERE node_execution_id = $1',
    [nodeExecutionId]
  );

  for (const row of rows) {
    await client.query(
      `
        INSERT INTO autoflow.execution_output_index (
          execution_id,
          node_execution_id,
          field_key,
          display_name,
          parent_path,
          field_path,
          binding_path,
          value_type,
          field_kind,
          ordinal_position,
          is_secret,
          is_searchable,
          value_preview,
          value_json,
          metadata
        )
        VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,$15::jsonb
        )
      `,
      [
        executionId,
        nodeExecutionId,
        row.fieldKey,
        row.displayName,
        row.parentPath,
        row.fieldPath,
        row.bindingPath,
        row.valueType,
        row.fieldKind,
        row.ordinalPosition,
        row.isSecret,
        row.isSearchable,
        row.valuePreview,
        row.valueJson === null ? null : JSON.stringify(row.valueJson),
        JSON.stringify(row.metadata),
      ]
    );
  }

  return { deletedAndReplaced: true, inserted: rows.length };
}

async function deleteOtherAttemptsForNodeExecution(client, input) {
  assertWriteEnabled(input && input.writeEnabled);
  if (!client || typeof client.query !== 'function') {
    throw new TypeError(
      'deleteOtherAttemptsForNodeExecution requires an active transaction client.'
    );
  }

  const executionId = String(input.executionId || '');
  const nodeExecutionId = String(input.nodeExecutionId || '');
  const nodeKey = String(input.nodeKey || '');
  if (!executionId || !nodeExecutionId || !nodeKey) {
    throw new Error(
      'executionId, nodeExecutionId and nodeKey are required.'
    );
  }

  const result = await client.query(
    `
      DELETE FROM autoflow.execution_output_index output
      USING autoflow.node_execution node
      WHERE output.node_execution_id = node.id
        AND node.execution_id = $1
        AND node.node_key = $2
        AND node.id <> $3
    `,
    [executionId, nodeKey, nodeExecutionId]
  );

  return { deletedRows: Number(result.rowCount) || 0 };
}

async function countRows(executionId = null) {
  const result = await query(
    `
      SELECT
        count(*)::integer AS total,
        count(*) FILTER (WHERE field_kind = 'BUSINESS')::integer AS business,
        count(*) FILTER (WHERE field_kind = 'TECHNICAL')::integer AS technical,
        count(*) FILTER (WHERE field_kind = 'RAW')::integer AS raw,
        count(*) FILTER (WHERE is_secret = true)::integer AS secret
      FROM autoflow.execution_output_index
      WHERE ($1::uuid IS NULL OR execution_id = $1::uuid)
    `,
    [executionId]
  );
  return result.rows[0];
}

async function listBindingSources({ workflowId, runId = null, search = '', includeTechnical = false, limit = 500 }) {
  const result = await query(
    `
      SELECT *
      FROM autoflow.output_binding_source_v1 source
      WHERE source."workflowId" = $1
        AND ($2::text IS NULL OR source."runId" = $2)
        AND ($3::boolean = true OR source."fieldKind" <> 'TECHNICAL')
        AND (
          $4::text = ''
          OR source.label ILIKE '%' || $4 || '%'
          OR source.path ILIKE '%' || $4 || '%'
          OR source."nodeName" ILIKE '%' || $4 || '%'
        )
      ORDER BY source.sequence, source."fieldKind", source.path
      LIMIT $5
    `,
    [workflowId, runId, Boolean(includeTechnical), String(search || ''), Math.min(2000, Math.max(1, Number(limit) || 500))]
  );
  return result.rows;
}

module.exports = {
  writeEnabled,
  assertWriteEnabled,
  validateRow,
  normalizeRow,
  replaceForNodeExecution,
  deleteOtherAttemptsForNodeExecution,
  countRows,
  listBindingSources,
};
