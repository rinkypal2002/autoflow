'use strict';

/**
 * Read-only repository for PostgreSQL-backed workflow output sources.
 *
 * The repository resolves one persisted execution, optionally limits sources
 * to graph ancestors of a target node, and reads searchable binding rows from
 * autoflow.output_binding_source_v1. It never performs writes.
 */

const { query } = require('./pool');

class OutputSourceReadError extends Error {
  constructor(message, code, status = 400) {
    super(message);
    this.name = 'OutputSourceReadError';
    this.code = code;
    this.status = status;
  }
}

function asInteger(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
}

function createOutputSourceReadRepository(options = {}) {
  const queryFn = options.queryFn || query;

  async function resolveExecution({ workspaceKey, workflowId, runId = null }) {
    const result = await queryFn(
      `
        SELECT
          execution.id::text                  AS "executionInternalId",
          execution.execution_key             AS "runId",
          execution.workflow_version_id::text AS "workflowVersionInternalId",
          execution.status                    AS status,
          execution.started_at                AS "startedAt",
          execution.finished_at               AS "finishedAt",
          workflow.workflow_key               AS "workflowId",
          workflow.name                       AS "workflowName",
          workspace.workspace_key             AS "workspaceKey"
        FROM autoflow.workspace workspace
        JOIN autoflow.workflow workflow
          ON workflow.workspace_id = workspace.id
        JOIN autoflow.workflow_execution execution
          ON execution.workspace_id = workspace.id
         AND execution.workflow_id = workflow.id
        WHERE workspace.workspace_key = $1
          AND workflow.workflow_key = $2
          AND execution.deleted_at IS NULL
          AND ($3::text IS NULL OR execution.execution_key = $3)
        ORDER BY execution.started_at DESC, execution.id DESC
        LIMIT 1
      `,
      [workspaceKey, workflowId, runId]
    );

    if (result.rowCount !== 1) {
      throw new OutputSourceReadError(
        runId
          ? `Execution '${runId}' was not found for workflow '${workflowId}'.`
          : `No persisted execution was found for workflow '${workflowId}'.`,
        runId ? 'OUTPUT_SOURCE_EXECUTION_NOT_FOUND' : 'OUTPUT_SOURCE_WORKFLOW_HAS_NO_EXECUTIONS',
        404
      );
    }

    return result.rows[0];
  }

  async function resolveAncestorNodeIds(execution, targetNodeId) {
    if (!targetNodeId) return null;

    const target = await queryFn(
      `
        SELECT node_key AS "nodeId"
        FROM autoflow.workflow_node
        WHERE workflow_version_id = $1::uuid
          AND node_key = $2
        LIMIT 1
      `,
      [execution.workflowVersionInternalId, targetNodeId]
    );

    if (target.rowCount !== 1) {
      // A workflow may have been edited after this persisted run completed.
      // In that case the selected design-time node is not part of the run's
      // immutable workflow version. Returning an empty, safe scope is better
      // than failing the entire shadow comparison or exposing downstream data.
      return [];
    }

    const ancestors = await queryFn(
      `
        WITH RECURSIVE upstream(node_key, depth, path) AS (
          SELECT
            connection.source_node_key,
            1,
            ARRAY[connection.target_node_key, connection.source_node_key]::text[]
          FROM autoflow.workflow_connection connection
          WHERE connection.workflow_version_id = $1::uuid
            AND connection.target_node_key = $2
            AND connection.is_disabled = false

          UNION ALL

          SELECT
            connection.source_node_key,
            upstream.depth + 1,
            upstream.path || connection.source_node_key
          FROM autoflow.workflow_connection connection
          JOIN upstream
            ON connection.target_node_key = upstream.node_key
          WHERE connection.workflow_version_id = $1::uuid
            AND connection.is_disabled = false
            AND upstream.depth < 100
            AND NOT connection.source_node_key = ANY(upstream.path)
        )
        SELECT node_key AS "nodeId", min(depth)::integer AS depth
        FROM upstream
        GROUP BY node_key
        ORDER BY min(depth), node_key
      `,
      [execution.workflowVersionInternalId, targetNodeId]
    );

    return ancestors.rows.map((row) => String(row.nodeId));
  }

  async function readCoverage(execution, eligibleNodeIds) {
    const result = await queryFn(
      `
        SELECT
          count(*)::integer AS "finalNodes",
          count(*) FILTER (
            WHERE EXISTS (
              SELECT 1
              FROM autoflow.execution_output_index output
              WHERE output.node_execution_id = node.id
            )
          )::integer AS "indexedNodes",
          coalesce(sum((
            SELECT count(*)
            FROM autoflow.execution_output_index output
            WHERE output.node_execution_id = node.id
          )), 0)::integer AS "indexRows"
        FROM autoflow.node_execution node
        WHERE node.execution_id = $1::uuid
          AND node.is_final_attempt = true
          AND ($2::text[] IS NULL OR node.node_key = ANY($2::text[]))
      `,
      [execution.executionInternalId, eligibleNodeIds]
    );

    const row = result.rows[0] || {};
    const finalNodes = asInteger(row.finalNodes);
    const indexedNodes = asInteger(row.indexedNodes);

    return {
      finalNodes,
      indexedNodes,
      missingIndexedNodes: Math.max(0, finalNodes - indexedNodes),
      indexRows: asInteger(row.indexRows),
      complete: finalNodes === indexedNodes,
    };
  }

  function sourceWhereClause() {
    return `
      source."workflowId" = $1
      AND source."runId" = $2
      AND ($3::text[] IS NULL OR source."nodeId" = ANY($3::text[]))
      AND (
        source."fieldKind" = 'BUSINESS'
        OR ($4::boolean = true AND source."fieldKind" = 'TECHNICAL')
        OR ($5::boolean = true AND source."fieldKind" = 'RAW')
      )
      AND (
        $6::text = ''
        OR source.label ILIKE '%' || $6 || '%'
        OR source.path ILIKE '%' || $6 || '%'
        OR source.token ILIKE '%' || $6 || '%'
        OR source."nodeName" ILIKE '%' || $6 || '%'
        OR source."valueType" ILIKE '%' || $6 || '%'
      )
    `;
  }

  async function listOutputSources(input) {
    const execution = await resolveExecution(input);
    const eligibleNodeIds = await resolveAncestorNodeIds(
      execution,
      input.targetNodeId || null
    );
    const coverage = await readCoverage(execution, eligibleNodeIds);

    const params = [
      execution.workflowId,
      execution.runId,
      eligibleNodeIds,
      Boolean(input.includeTechnical),
      input.includeRaw !== false,
      String(input.search || '').trim(),
    ];

    const totalResult = await queryFn(
      `
        SELECT count(*)::integer AS total
        FROM autoflow.output_binding_source_v1 source
        WHERE ${sourceWhereClause()}
      `,
      params
    );

    const limit = Math.max(1, asInteger(input.limit, 500));
    const offset = Math.max(0, asInteger(input.offset, 0));
    const rowsResult = await queryFn(
      `
        SELECT
          source."workflowId",
          source."runId",
          source."nodeId",
          source."nodeName",
          source."stepKey",
          source.sequence,
          source."fieldKind",
          source.label,
          source."valueType",
          source.preview,
          source.path,
          source.token,
          source."isSecret"
        FROM autoflow.output_binding_source_v1 source
        WHERE ${sourceWhereClause()}
        ORDER BY
          source.sequence,
          CASE source."fieldKind"
            WHEN 'RAW' THEN 0
            WHEN 'BUSINESS' THEN 1
            WHEN 'TECHNICAL' THEN 2
            ELSE 9
          END,
          source.path
        LIMIT $7 OFFSET $8
      `,
      [...params, limit, offset]
    );

    const totalMatchingRows = asInteger(totalResult.rows[0] && totalResult.rows[0].total);

    return {
      execution,
      eligibleNodeIds,
      coverage,
      rows: rowsResult.rows,
      totalMatchingRows,
      limit,
      offset,
    };
  }

  return {
    resolveExecution,
    resolveAncestorNodeIds,
    readCoverage,
    listOutputSources,
  };
}

const defaultRepository = createOutputSourceReadRepository();

module.exports = {
  OutputSourceReadError,
  createOutputSourceReadRepository,
  listOutputSources: (...args) => defaultRepository.listOutputSources(...args),
};
