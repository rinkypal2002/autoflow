'use strict';

const { query } = require('./pool');

const SENSITIVE_KEY_PATTERN =
  /(?:^|[_\-.\s])(password|passwd|pwd|secret|token|api[_-]?key|access[_-]?key|private[_-]?key|client[_-]?secret|authorization|cookie)(?:$|[_\-.\s])/i;

const RUNTIME_ACTION_FIELDS = new Set([
  'status',
  'executionTime',
  'startedAt',
  'finishedAt',
  'lastRunId',
  'selected',
]);
const RUNTIME_CONNECTION_FIELDS = new Set(['isActive', 'isAnimated']);

class WorkflowVersionReadError extends Error {
  constructor(message, code, status = 400) {
    super(message);
    this.name = 'WorkflowVersionReadError';
    this.code = code;
    this.status = status;
  }
}

function clone(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function isSensitiveKey(key) {
  const normalized = String(key || '')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase();
  if (['is_secret', 'secret_value_redacted', 'scope'].includes(normalized)) return false;
  return SENSITIVE_KEY_PATTERN.test(normalized);
}

function sanitizeDefinition(value, key = '', seen = new WeakSet()) {
  if (isSensitiveKey(key)) return '[REDACTED]';
  if (value === null || value === undefined) return value;
  if (typeof value !== 'object') return value;
  if (seen.has(value)) return '[CIRCULAR]';
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeDefinition(item, '', seen));
  }

  const result = {};
  for (const [childKey, childValue] of Object.entries(value)) {
    result[childKey] = sanitizeDefinition(childValue, childKey, seen);
  }

  if (Array.isArray(result.variables)) {
    result.variables = result.variables.map((variable) => {
      if (!variable || typeof variable !== 'object') return variable;
      const isSecret = variable.isSecret === true || variable.scope === 'secret';
      if (!isSecret) return variable;
      return {
        ...variable,
        value: undefined,
        defaultValue: undefined,
        secretValueRedacted: true,
      };
    });
  }

  return result;
}

function stableObject(value, parentKind = '') {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) {
    const normalized = value.map((item) => stableObject(item, parentKind));
    if (
      normalized.every(
        (item) => item && typeof item === 'object' && 'id' in item
      )
    ) {
      return normalized.sort((a, b) =>
        String(a.id || '').localeCompare(String(b.id || ''))
      );
    }
    return normalized;
  }
  if (typeof value !== 'object') return value;

  const isSecretVariable =
    parentKind === 'variable' &&
    (value.isSecret === true || value.scope === 'secret');
  const result = {};
  for (const key of Object.keys(value).sort()) {
    if (parentKind === 'action' && RUNTIME_ACTION_FIELDS.has(key)) continue;
    if (parentKind === 'connection' && RUNTIME_CONNECTION_FIELDS.has(key)) continue;
    if (
      isSecretVariable &&
      ['value', 'defaultValue', 'secretValueRedacted', 'credentialReferenceRequired'].includes(key)
    ) {
      continue;
    }
    if (isSensitiveKey(key)) {
      result[key] = '[REDACTED]';
      continue;
    }
    const childKind =
      key === 'actions'
        ? 'actions'
        : key === 'connections'
          ? 'connections'
          : key === 'variables'
            ? 'variables'
            : parentKind;
    result[key] = stableObject(value[key], childKind);
  }
  return result;
}

function normalizeComparisonState(definition) {
  const state = definition || {};
  const actions = (Array.isArray(state.actions) ? state.actions : []).map(
    (item) => stableObject(item, 'action')
  );
  const connections = (
    Array.isArray(state.connections) ? state.connections : []
  ).map((item) => stableObject(item, 'connection'));
  const variables = (Array.isArray(state.variables) ? state.variables : []).map(
    (item) => stableObject(item, 'variable')
  );
  return {
    name: state.name || '',
    description: state.description || '',
    actions: stableObject(actions),
    connections: stableObject(connections),
    variables: stableObject(variables),
  };
}

function hashString(value) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

function comparisonFingerprint(definition) {
  return hashString(JSON.stringify(normalizeComparisonState(definition)));
}

function asDefinition(row) {
  const raw = row.definition_json || row.definitionJson || {};
  const definition = sanitizeDefinition(clone(raw) || {});
  return {
    name: definition.name || row.workflow_name || row.workflowName || 'Workflow',
    description: definition.description || '',
    actions: Array.isArray(definition.actions) ? definition.actions : [],
    connections: Array.isArray(definition.connections) ? definition.connections : [],
    variables: Array.isArray(definition.variables) ? definition.variables : [],
    triggers: Array.isArray(definition.triggers) ? definition.triggers : [],
    schedule: definition.schedule ?? null,
  };
}

function mapVersionRow(row, options = {}) {
  const sourceType = String(row.source_type || row.sourceType || 'MANUAL').toUpperCase();
  const versionNumber = Number(row.version_number ?? row.versionNumber);
  const dto = {
    id: String(row.id),
    workflowId: String(row.workflow_key || row.workflowId),
    version: String(versionNumber),
    versionNumber,
    versionLabel: row.version_label || row.versionLabel || `v${versionNumber}`,
    label: row.label || row.version_label || `Version ${versionNumber}`,
    description: row.description || undefined,
    savedAt: row.created_at || row.savedAt,
    savedBy: row.created_by || row.savedBy || 'AutoFlow',
    auto: ['AUTOSAVE', 'SYSTEM'].includes(sourceType),
    source: 'postgres',
    sourceType,
    definitionSchemaVersion: Number(
      row.definition_schema_version ?? row.definitionSchemaVersion ?? 1
    ),
    definitionSha256: row.definition_sha256 || row.definitionSha256,
    comparisonFingerprint:
      row.comparison_fingerprint ||
      row.comparisonFingerprint ||
      (row.definition_json || row.definitionJson
        ? comparisonFingerprint(asDefinition(row))
        : undefined),
    isPublished: Boolean(row.is_published ?? row.isPublished),
    isCurrent: Boolean(row.is_current ?? row.isCurrent),
    restorable: true,
    stats: {
      actions: Number(row.action_count ?? row.actionCount) || 0,
      connections: Number(row.connection_count ?? row.connectionCount) || 0,
      variables: Number(row.variable_count ?? row.variableCount) || 0,
    },
  };

  if (options.includeDefinition) dto.state = asDefinition(row);
  return dto;
}

function createWorkflowVersionReadRepository(options = {}) {
  const queryFn = options.queryFn || query;

  async function resolveWorkflow(workspaceKey, workflowKey) {
    const result = await queryFn(
      `
        SELECT
          workspace.id::text AS "workspaceInternalId",
          workspace.workspace_key AS "workspaceKey",
          workflow.id::text AS "workflowInternalId",
          workflow.workflow_key AS "workflowId",
          workflow.name AS "workflowName",
          workflow.current_version_number AS "currentVersionNumber"
        FROM autoflow.workspace workspace
        JOIN autoflow.workflow workflow
          ON workflow.workspace_id = workspace.id
         AND workflow.deleted_at IS NULL
        WHERE workspace.workspace_key = $1
          AND workspace.deleted_at IS NULL
          AND workflow.workflow_key = $2
        LIMIT 1
      `,
      [workspaceKey, workflowKey]
    );

    if (result.rowCount !== 1) {
      throw new WorkflowVersionReadError(
        `Workflow '${workflowKey}' was not found in workspace '${workspaceKey}'.`,
        'WORKFLOW_NOT_FOUND',
        404
      );
    }
    return result.rows[0];
  }

  async function listWorkflowVersions(input) {
    const workflow = await resolveWorkflow(input.workspaceKey, input.workflowId);
    const limit = Math.max(1, Number(input.limit) || 40);
    const offset = Math.max(0, Number(input.offset) || 0);
    const includeDefinition = input.includeDefinition === true;
    const search = String(input.search || '').trim();
    const sourceType = String(input.sourceType || '').trim().toUpperCase();

    const params = [workflow.workspaceInternalId, workflow.workflowInternalId];
    const where = [
      'version.workspace_id = $1::uuid',
      'version.workflow_id = $2::uuid',
    ];

    if (search) {
      params.push(`%${search}%`);
      where.push(`(
        version.label ILIKE $${params.length}
        OR version.version_label ILIKE $${params.length}
        OR coalesce(version.description, '') ILIKE $${params.length}
        OR version.version_number::text ILIKE $${params.length}
      )`);
    }
    if (sourceType) {
      params.push(sourceType);
      where.push(`version.source_type = $${params.length}`);
    }

    const countResult = await queryFn(
      `SELECT count(*)::integer AS total
         FROM autoflow.workflow_version version
        WHERE ${where.join(' AND ')}`,
      params
    );

    const listParams = [...params, limit, offset];
    const rowsResult = await queryFn(
      `
        SELECT
          version.id::text,
          workflow.workflow_key,
          workflow.name AS workflow_name,
          version.version_number,
          version.version_label,
          version.label,
          version.description,
          version.source_type,
          version.definition_schema_version,
          version.definition_sha256,
          version.action_count,
          version.connection_count,
          version.variable_count,
          version.is_published,
          version.created_by,
          version.created_at,
          (version.version_number = workflow.current_version_number) AS is_current,
          version.definition_json
        FROM autoflow.workflow_version version
        JOIN autoflow.workflow workflow
          ON workflow.workspace_id = version.workspace_id
         AND workflow.id = version.workflow_id
         AND workflow.deleted_at IS NULL
        WHERE ${where.join(' AND ')}
        ORDER BY version.version_number DESC
        LIMIT $${listParams.length - 1}
        OFFSET $${listParams.length}
      `,
      listParams
    );

    return {
      workflow,
      total: Number(countResult.rows[0]?.total) || 0,
      limit,
      offset,
      versions: rowsResult.rows.map((row) =>
        mapVersionRow(row, { includeDefinition })
      ),
    };
  }

  async function getWorkflowVersion(input) {
    const workflow = await resolveWorkflow(input.workspaceKey, input.workflowId);
    const identifier = String(input.versionIdentifier || '').trim();
    if (!identifier) {
      throw new WorkflowVersionReadError(
        'A workflow version identifier is required.',
        'VERSION_IDENTIFIER_REQUIRED',
        400
      );
    }

    const isCurrent = identifier.toLowerCase() === 'current';
    const isNumber = /^\d+$/.test(identifier);
    const predicate = isCurrent
      ? 'version.version_number = workflow.current_version_number'
      : isNumber
        ? 'version.version_number = $3::integer'
        : 'version.id::text = $3';
    const params = [workflow.workspaceInternalId, workflow.workflowInternalId];
    if (!isCurrent) params.push(identifier);

    const result = await queryFn(
      `
        SELECT
          version.id::text,
          workflow.workflow_key,
          workflow.name AS workflow_name,
          version.version_number,
          version.version_label,
          version.label,
          version.description,
          version.source_type,
          version.definition_schema_version,
          version.definition_sha256,
          version.definition_json,
          version.action_count,
          version.connection_count,
          version.variable_count,
          version.is_published,
          version.created_by,
          version.created_at,
          (version.version_number = workflow.current_version_number) AS is_current
        FROM autoflow.workflow_version version
        JOIN autoflow.workflow workflow
          ON workflow.workspace_id = version.workspace_id
         AND workflow.id = version.workflow_id
         AND workflow.deleted_at IS NULL
        WHERE version.workspace_id = $1::uuid
          AND version.workflow_id = $2::uuid
          AND ${predicate}
        LIMIT 1
      `,
      params
    );

    if (result.rowCount !== 1) {
      throw new WorkflowVersionReadError(
        `Workflow version '${identifier}' was not found.`,
        'WORKFLOW_VERSION_NOT_FOUND',
        404
      );
    }

    return {
      workflow,
      version: mapVersionRow(result.rows[0], { includeDefinition: true }),
    };
  }

  return {
    resolveWorkflow,
    listWorkflowVersions,
    getWorkflowVersion,
  };
}

module.exports = {
  WorkflowVersionReadError,
  createWorkflowVersionReadRepository,
  mapVersionRow,
  sanitizeDefinition,
  comparisonFingerprint,
  normalizeComparisonState,
};
