'use strict';

const { query, withTransaction } = require('./pool');

const ALLOWED_STATUSES = new Set([
  'idle',
  'queued',
  'running',
  'completed',
  'success',
  'error',
  'failed',
  'skipped',
  'paused',
  'waiting',
  'cancelled',
  'timed_out',
  'partial',
]);

const ALLOWED_BUCKETS = new Set([
  'apiResponse',
  'databaseResult',
  'fileReference',
  'extractedText',
  'computed',
  'generic',
]);

const ALLOWED_LOG_LEVELS = new Set([
  'info',
  'warning',
  'error',
  'success',
  'debug',
]);

const SENSITIVE_KEY_PATTERN =
  /(^|[_-])(password|passwd|pwd|secret|token|access[_-]?token|refresh[_-]?token|client[_-]?secret|api[_-]?key|authorization|cookie|private[_-]?key|connection[_-]?string)($|[_-])/i;

function applicationError(status, code, message) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value
    : {};
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function jsonRoundTrip(value) {
  const serialized = JSON.stringify(value);
  return serialized === undefined ? null : JSON.parse(serialized);
}

function sanitizeSensitive(value, key = '', seen = new WeakSet()) {
  if (SENSITIVE_KEY_PATTERN.test(String(key))) {
    return '••••••••';
  }

  if (
    value === null ||
    value === undefined ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value ?? null;
  }

  if (typeof value !== 'object') {
    return String(value);
  }

  if (seen.has(value)) {
    return '[Circular]';
  }
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) =>
      sanitizeSensitive(item, '', seen)
    );
  }

  const sanitized = {};
  for (const [childKey, childValue] of Object.entries(value)) {
    sanitized[childKey] = sanitizeSensitive(
      childValue,
      childKey,
      seen
    );
  }
  return sanitized;
}

function sanitizeSnapshot(snapshot) {
  return jsonRoundTrip(sanitizeSensitive(snapshot));
}

function normalizeStatus(value, fallback = 'running') {
  const normalized = String(value || fallback).toLowerCase();
  return ALLOWED_STATUSES.has(normalized)
    ? normalized
    : fallback;
}

function normalizeBucket(value) {
  return ALLOWED_BUCKETS.has(value) ? value : 'generic';
}

function normalizeLogLevel(value) {
  const normalized = String(value || 'info').toLowerCase();
  if (normalized === 'warn') return 'warning';
  return ALLOWED_LOG_LEVELS.has(normalized)
    ? normalized
    : 'info';
}

function parseDate(value, fallback = null) {
  if (!value) return fallback;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? fallback
    : parsed.toISOString();
}

function durationBetween(startedAt, finishedAt) {
  if (!startedAt || !finishedAt) return null;
  const start = new Date(startedAt).getTime();
  const finish = new Date(finishedAt).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(finish)) {
    return null;
  }
  return Math.max(0, finish - start);
}

function flattenBounded(
  value,
  options = {},
  prefix = '',
  depth = 0,
  output = {}
) {
  const {
    maxDepth = 6,
    maxLeaves = 250,
    maxArrayItems = 20,
  } = options;

  if (Object.keys(output).length >= maxLeaves) {
    return output;
  }

  if (
    value === null ||
    value === undefined ||
    typeof value !== 'object' ||
    depth >= maxDepth
  ) {
    if (prefix) output[prefix] = value ?? null;
    return output;
  }

  if (Array.isArray(value)) {
    if (prefix) {
      output[`${prefix}.length`] = value.length;
    }

    value.slice(0, maxArrayItems).forEach((item, index) => {
      const next = prefix ? `${prefix}.${index}` : String(index);
      flattenBounded(
        item,
        options,
        next,
        depth + 1,
        output
      );
    });

    return output;
  }

  for (const [key, child] of Object.entries(value)) {
    if (Object.keys(output).length >= maxLeaves) break;
    const next = prefix ? `${prefix}.${key}` : key;
    flattenBounded(
      child,
      options,
      next,
      depth + 1,
      output
    );
  }

  return output;
}

function jsonForDatabase(value, fallback = null) {
  const normalized = jsonRoundTrip(value);
  return JSON.stringify(
    normalized === undefined ? fallback : normalized
  );
}

function objectError(value) {
  if (!value) return null;
  if (typeof value === 'string') {
    return { message: value };
  }
  if (typeof value === 'object' && !Array.isArray(value)) {
    return value;
  }
  return { message: String(value) };
}

async function resolveWorkflowContext(
  client,
  workspaceKey,
  workflowKey,
  executionKey
) {
  const existing = await client.query(
    `
      SELECT
        execution.id AS execution_id,
        execution.workspace_id,
        execution.workflow_id,
        execution.workflow_version_id,
        workflow.workflow_key,
        workflow.name AS workflow_name
      FROM autoflow.workflow_execution execution
      JOIN autoflow.workflow workflow
        ON workflow.workspace_id = execution.workspace_id
       AND workflow.id = execution.workflow_id
      JOIN autoflow.workspace workspace
        ON workspace.id = execution.workspace_id
      WHERE workspace.workspace_key = $1
        AND workflow.workflow_key = $2
        AND execution.execution_key = $3
        AND execution.deleted_at IS NULL
      LIMIT 1
    `,
    [workspaceKey, workflowKey, executionKey]
  );

  if (existing.rowCount === 1) {
    return existing.rows[0];
  }

  const current = await client.query(
    `
      SELECT
        workspace.id AS workspace_id,
        workflow.id AS workflow_id,
        workflow.workflow_key,
        workflow.name AS workflow_name,
        version.id AS workflow_version_id
      FROM autoflow.workspace workspace
      JOIN autoflow.workflow workflow
        ON workflow.workspace_id = workspace.id
       AND workflow.deleted_at IS NULL
      JOIN autoflow.workflow_version version
        ON version.workspace_id = workflow.workspace_id
       AND version.workflow_id = workflow.id
       AND version.version_number =
           workflow.current_version_number
      WHERE workspace.workspace_key = $1
        AND workspace.deleted_at IS NULL
        AND workflow.workflow_key = $2
      LIMIT 1
    `,
    [workspaceKey, workflowKey]
  );

  if (current.rowCount !== 1) {
    throw applicationError(
      404,
      'WORKFLOW_NOT_FOUND',
      `Workflow '${workflowKey}' or its current version was not found.`
    );
  }

  return {
    execution_id: null,
    ...current.rows[0],
  };
}

async function upsertWorkflowExecution(
  client,
  context,
  snapshot,
  retentionDays
) {
  const startedAt =
    parseDate(snapshot.startedAt) ||
    new Date().toISOString();
  const updatedAt =
    parseDate(snapshot.updatedAt) ||
    new Date().toISOString();
  const finishedAt = parseDate(snapshot.finishedAt);
  const durationMs =
    Number.isFinite(Number(snapshot.metrics?.durationMs))
      ? Math.max(0, Number(snapshot.metrics.durationMs))
      : durationBetween(startedAt, finishedAt);
  const status = normalizeStatus(snapshot.status);
  const safeSnapshot = sanitizeSnapshot(snapshot);

  const result = await client.query(
    `
      INSERT INTO autoflow.workflow_execution (
        workspace_id,
        workflow_id,
        workflow_version_id,
        execution_key,
        workflow_name_snapshot,
        snapshot_version,
        status,
        started_at,
        updated_at,
        finished_at,
        duration_ms,
        variables_json,
        runtime_json,
        files_json,
        environment_json,
        metrics_json,
        previous_node_key,
        full_snapshot_json,
        retention_expires_at
      )
      VALUES (
        $1,$2,$3,$4,$5,$6,$7,
        $8::timestamptz,
        $9::timestamptz,
        $10::timestamptz,
        $11,
        $12::jsonb,
        $13::jsonb,
        $14::jsonb,
        $15::jsonb,
        $16::jsonb,
        $17,
        $18::jsonb,
        CASE
          WHEN $19::integer > 0
          THEN $9::timestamptz +
               make_interval(days => $19::integer)
          ELSE NULL
        END
      )
      ON CONFLICT (
        workspace_id,
        workflow_id,
        execution_key
      )
      DO UPDATE SET
        workflow_name_snapshot =
          EXCLUDED.workflow_name_snapshot,
        snapshot_version =
          EXCLUDED.snapshot_version,
        status =
          EXCLUDED.status,
        updated_at =
          EXCLUDED.updated_at,
        finished_at =
          EXCLUDED.finished_at,
        duration_ms =
          EXCLUDED.duration_ms,
        variables_json =
          EXCLUDED.variables_json,
        runtime_json =
          EXCLUDED.runtime_json,
        files_json =
          EXCLUDED.files_json,
        environment_json =
          EXCLUDED.environment_json,
        metrics_json =
          EXCLUDED.metrics_json,
        previous_node_key =
          EXCLUDED.previous_node_key,
        full_snapshot_json =
          EXCLUDED.full_snapshot_json,
        retention_expires_at =
          EXCLUDED.retention_expires_at,
        deleted_at = NULL
      RETURNING
        id,
        workspace_id,
        workflow_id,
        workflow_version_id,
        execution_key,
        status
    `,
    [
      context.workspace_id,
      context.workflow_id,
      context.workflow_version_id,
      String(snapshot.runId),
      snapshot.workflowName ||
        context.workflow_name ||
        null,
      Number(snapshot.version || 1),
      status,
      startedAt,
      updatedAt,
      finishedAt,
      durationMs,
      jsonForDatabase(
        sanitizeSensitive(asObject(snapshot.variables)),
        {}
      ),
      jsonForDatabase(
        sanitizeSensitive(asObject(snapshot.runtime)),
        {}
      ),
      jsonForDatabase(
        sanitizeSensitive(asObject(snapshot.files)),
        {}
      ),
      jsonForDatabase(
        sanitizeSensitive(asObject(snapshot.env)),
        {}
      ),
      jsonForDatabase(asObject(snapshot.metrics), {}),
      snapshot.previousNodeId || null,
      jsonForDatabase(safeSnapshot, {}),
      retentionDays,
    ]
  );

  return result.rows[0];
}

async function definitionNode(
  client,
  workspaceId,
  workflowVersionId,
  nodeKey
) {
  const result = await client.query(
    `
      SELECT
        node_key,
        node_type,
        category,
        plugin_id,
        action_id,
        name
      FROM autoflow.workflow_node
      WHERE workspace_id = $1
        AND workflow_version_id = $2
        AND node_key = $3
      LIMIT 1
    `,
    [workspaceId, workflowVersionId, nodeKey]
  );

  if (result.rowCount !== 1) {
    throw applicationError(
      409,
      'EXECUTION_NODE_NOT_IN_VERSION',
      `Executed node '${nodeKey}' does not exist in the workflow version used by this run.`
    );
  }

  return result.rows[0];
}

async function upsertNodeExecution(
  client,
  execution,
  record
) {
  const nodeKey = String(record.nodeId || '');
  if (!nodeKey) {
    throw applicationError(
      400,
      'INVALID_NODE_EXECUTION',
      'Every node execution requires nodeId.'
    );
  }

  const definition = await definitionNode(
    client,
    execution.workspace_id,
    execution.workflow_version_id,
    nodeKey
  );

  const attempt = Math.max(
    1,
    Number.parseInt(String(record.attempt || 1), 10) || 1
  );

  await client.query(
    `
      UPDATE autoflow.node_execution
      SET is_final_attempt = false
      WHERE execution_id = $1
        AND node_key = $2
        AND attempt_number <> $3
        AND is_final_attempt = true
    `,
    [execution.id, nodeKey, attempt]
  );

  const startedAt =
    parseDate(record.startedAt) ||
    new Date().toISOString();
  const finishedAt = parseDate(record.finishedAt);
  const durationMs =
    Number.isFinite(Number(record.durationMs))
      ? Math.max(0, Number(record.durationMs))
      : durationBetween(startedAt, finishedAt);
  const sanitizedInput = sanitizeSensitive(record.input);
  const sanitizedOutput = sanitizeSensitive(record.output);
  const flattened = flattenBounded(sanitizedOutput);
  const error = objectError(
    sanitizeSensitive(record.error)
  );

  const result = await client.query(
    `
      INSERT INTO autoflow.node_execution (
        workspace_id,
        workflow_id,
        workflow_version_id,
        execution_id,
        node_key,
        node_name,
        step_key,
        node_type,
        category,
        plugin_id,
        action_id,
        sequence_number,
        attempt_number,
        is_final_attempt,
        status,
        output_bucket,
        started_at,
        finished_at,
        duration_ms,
        retry_count,
        resolved_input_json,
        business_output_json,
        technical_output_json,
        flattened_output_json,
        branches_json,
        error_json
      )
      VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,
        $12,$13,true,$14,$15,
        $16::timestamptz,
        $17::timestamptz,
        $18,$19,
        $20::jsonb,
        $21::jsonb,
        '{}'::jsonb,
        $22::jsonb,
        $23::jsonb,
        $24::jsonb
      )
      ON CONFLICT (
        execution_id,
        node_key,
        attempt_number
      )
      DO UPDATE SET
        node_name =
          EXCLUDED.node_name,
        step_key =
          EXCLUDED.step_key,
        node_type =
          EXCLUDED.node_type,
        category =
          EXCLUDED.category,
        plugin_id =
          EXCLUDED.plugin_id,
        action_id =
          EXCLUDED.action_id,
        sequence_number =
          EXCLUDED.sequence_number,
        is_final_attempt = true,
        status =
          EXCLUDED.status,
        output_bucket =
          EXCLUDED.output_bucket,
        started_at =
          EXCLUDED.started_at,
        finished_at =
          EXCLUDED.finished_at,
        duration_ms =
          EXCLUDED.duration_ms,
        retry_count =
          EXCLUDED.retry_count,
        resolved_input_json =
          EXCLUDED.resolved_input_json,
        business_output_json =
          EXCLUDED.business_output_json,
        technical_output_json =
          EXCLUDED.technical_output_json,
        flattened_output_json =
          EXCLUDED.flattened_output_json,
        branches_json =
          EXCLUDED.branches_json,
        error_json =
          EXCLUDED.error_json
      RETURNING id, node_key
    `,
    [
      execution.workspace_id,
      execution.workflow_id,
      execution.workflow_version_id,
      execution.id,
      nodeKey,
      String(
        record.nodeName ||
        definition.name ||
        nodeKey
      ),
      String(
        record.stepKey ||
        record.nodeName ||
        definition.name ||
        nodeKey
      ),
      record.type ||
        definition.node_type ||
        null,
      record.category ||
        definition.category ||
        null,
      definition.plugin_id || null,
      definition.action_id || null,
      Math.max(
        1,
        Number.parseInt(
          String(record.sequence || 1),
          10
        ) || 1
      ),
      attempt,
      normalizeStatus(record.status),
      normalizeBucket(record.bucket),
      startedAt,
      finishedAt,
      durationMs,
      Math.max(0, attempt - 1),
      jsonForDatabase(sanitizedInput, null),
      jsonForDatabase(sanitizedOutput, null),
      jsonForDatabase(flattened, {}),
      jsonForDatabase(asArray(record.branches), []),
      jsonForDatabase(error, null),
    ]
  );

  return result.rows[0];
}

async function upsertLogs(
  client,
  executionId,
  nodeExecutionByKey,
  logs
) {
  for (const [index, log] of asArray(logs).entries()) {
    const logKey = String(
      log?.id || `snapshot-log-${index + 1}`
    );
    const nodeExecutionId = log?.actionId
      ? nodeExecutionByKey.get(String(log.actionId)) || null
      : null;
    const error = objectError(
      sanitizeSensitive(log?.error)
    );

    await client.query(
      `
        INSERT INTO autoflow.execution_log (
          execution_id,
          node_execution_id,
          log_key,
          logged_at,
          level,
          message,
          status_snapshot,
          duration_ms,
          data_json,
          error_json,
          stack_trace,
          metadata
        )
        VALUES (
          $1,$2,$3,$4::timestamptz,$5,$6,$7,$8,
          $9::jsonb,$10::jsonb,$11,$12::jsonb
        )
        ON CONFLICT (execution_id, log_key)
        DO UPDATE SET
          node_execution_id =
            EXCLUDED.node_execution_id,
          logged_at =
            EXCLUDED.logged_at,
          level =
            EXCLUDED.level,
          message =
            EXCLUDED.message,
          status_snapshot =
            EXCLUDED.status_snapshot,
          duration_ms =
            EXCLUDED.duration_ms,
          data_json =
            EXCLUDED.data_json,
          error_json =
            EXCLUDED.error_json,
          stack_trace =
            EXCLUDED.stack_trace,
          metadata =
            EXCLUDED.metadata
      `,
      [
        executionId,
        nodeExecutionId,
        logKey,
        parseDate(log?.timestamp) ||
          new Date().toISOString(),
        normalizeLogLevel(log?.level),
        String(log?.message || 'Execution event'),
        log?.statusSnapshot
          ? normalizeStatus(log.statusSnapshot)
          : null,
        Number.isFinite(Number(log?.duration))
          ? Math.max(0, Number(log.duration))
          : null,
        jsonForDatabase(
          sanitizeSensitive(log?.data),
          null
        ),
        jsonForDatabase(error, null),
        log?.stackTrace ||
          (typeof log?.error?.stack === 'string'
            ? log.error.stack
            : null),
        jsonForDatabase(
          sanitizeSensitive(asObject(log?.metadata)),
          {}
        ),
      ]
    );
  }
}

function runWithClient(options, work) {
  if (options?.client) {
    return work(options.client);
  }
  return withTransaction(work);
}

async function upsertExecutionSnapshot(
  workflowKey,
  snapshot,
  options = {}
) {
  return runWithClient(options, async (client) => {
    if (!snapshot || typeof snapshot !== 'object') {
      throw applicationError(
        400,
        'INVALID_EXECUTION_SNAPSHOT',
        'Execution snapshot must be an object.'
      );
    }

    if (String(snapshot.workflowId) !== String(workflowKey)) {
      throw applicationError(
        400,
        'WORKFLOW_ID_MISMATCH',
        'Route workflow id and snapshot workflowId must match.'
      );
    }

    if (!snapshot.runId) {
      throw applicationError(
        400,
        'RUN_ID_REQUIRED',
        'Execution snapshot requires runId.'
      );
    }

    const workspaceKey =
      options.workspaceKey || 'default';
    const retentionDays = Number.isFinite(
      Number(options.retentionDays)
    )
      ? Math.max(0, Number(options.retentionDays))
      : 30;

    const context = await resolveWorkflowContext(
      client,
      workspaceKey,
      workflowKey,
      String(snapshot.runId)
    );

    const execution = await upsertWorkflowExecution(
      client,
      context,
      snapshot,
      retentionDays
    );

    const nodeExecutionByKey = new Map();

    for (const record of asArray(snapshot.outputs)) {
      const nodeExecution = await upsertNodeExecution(
        client,
        execution,
        record
      );
      nodeExecutionByKey.set(
        nodeExecution.node_key,
        nodeExecution.id
      );
    }

    await upsertLogs(
      client,
      execution.id,
      nodeExecutionByKey,
      snapshot.logs
    );

    return {
      runId: execution.execution_key,
      executionId: execution.id,
      status: execution.status,
      nodeCount: asArray(snapshot.outputs).length,
    };
  });
}

async function listExecutionSnapshots(
  workflowKey,
  options = {}
) {
  const workspaceKey =
    options.workspaceKey || 'default';
  const limit = Math.min(
    200,
    Math.max(1, Number(options.limit || 25))
  );

  const databaseQuery = options.client
    ? options.client.query.bind(options.client)
    : query;

  const result = await databaseQuery(
    `
      SELECT
        execution.execution_key AS "runId",
        execution.status,
        execution.started_at AS "startedAt",
        execution.updated_at AS "updatedAt",
        execution.finished_at AS "finishedAt",
        execution.metrics_json AS metrics,
        (
          SELECT count(*)::integer
          FROM autoflow.node_execution node
          WHERE node.execution_id = execution.id
            AND node.is_final_attempt = true
        ) AS "nodeCount"
      FROM autoflow.workflow_execution execution
      JOIN autoflow.workflow workflow
        ON workflow.workspace_id =
           execution.workspace_id
       AND workflow.id =
           execution.workflow_id
      JOIN autoflow.workspace workspace
        ON workspace.id =
           execution.workspace_id
      WHERE workspace.workspace_key = $1
        AND workflow.workflow_key = $2
        AND execution.deleted_at IS NULL
      ORDER BY execution.updated_at DESC
      LIMIT $3
    `,
    [workspaceKey, workflowKey, limit]
  );

  return result.rows;
}

async function getExecutionSnapshot(
  workflowKey,
  runId,
  options = {}
) {
  const workspaceKey =
    options.workspaceKey || 'default';

  const databaseQuery = options.client
    ? options.client.query.bind(options.client)
    : query;

  const result = await databaseQuery(
    `
      SELECT execution.full_snapshot_json AS snapshot
      FROM autoflow.workflow_execution execution
      JOIN autoflow.workflow workflow
        ON workflow.workspace_id =
           execution.workspace_id
       AND workflow.id =
           execution.workflow_id
      JOIN autoflow.workspace workspace
        ON workspace.id =
           execution.workspace_id
      WHERE workspace.workspace_key = $1
        AND workflow.workflow_key = $2
        AND execution.execution_key = $3
        AND execution.deleted_at IS NULL
      LIMIT 1
    `,
    [workspaceKey, workflowKey, runId]
  );

  return result.rows[0]?.snapshot || null;
}

async function deleteExecutionSnapshot(
  workflowKey,
  runId,
  options = {}
) {
  return runWithClient(options, async (client) => {
    const workspaceKey =
      options.workspaceKey || 'default';

    const result = await client.query(
      `
        DELETE FROM autoflow.workflow_execution execution
        USING autoflow.workflow workflow,
              autoflow.workspace workspace
        WHERE workflow.workspace_id =
              execution.workspace_id
          AND workflow.id =
              execution.workflow_id
          AND workspace.id =
              execution.workspace_id
          AND workspace.workspace_key = $1
          AND workflow.workflow_key = $2
          AND execution.execution_key = $3
        RETURNING execution.id
      `,
      [workspaceKey, workflowKey, runId]
    );

    return result.rowCount > 0;
  });
}

module.exports = {
  deleteExecutionSnapshot,
  getExecutionSnapshot,
  listExecutionSnapshots,
  sanitizeSnapshot,
  upsertExecutionSnapshot,
};
