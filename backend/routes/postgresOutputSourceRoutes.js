'use strict';

const express = require('express');
const { z } = require('zod');

const {
  createOutputSourceReadRepository,
} = require('../db/outputSourceReadRepository');

function isSafeIdSegment(value) {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 200 &&
    /^[A-Za-z0-9._-]+$/.test(value) &&
    value !== '.' &&
    value !== '..'
  );
}

function parseBoolean(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  throw new Error(`Expected true or false but received '${value}'.`);
}

function normalizeValueType(value) {
  const normalized = String(value || 'UNKNOWN').trim().toUpperCase();
  if (['INTEGER', 'NUMBER', 'DECIMAL', 'DOUBLE', 'FLOAT', 'LONG'].includes(normalized)) {
    return 'number';
  }
  if (normalized === 'BOOLEAN') return 'boolean';
  if (normalized === 'ARRAY') return 'array';
  if (['OBJECT', 'DATASET', 'MAP'].includes(normalized)) return 'object';
  if (['FILE', 'BINARY'].includes(normalized)) return 'file';
  if (normalized === 'STRING') return 'string';
  if (normalized === 'NULL') return 'unknown';
  return normalized.toLowerCase();
}

function mapSource(row) {
  return {
    token: row.token,
    path: row.path,
    label: row.label,
    valueType: normalizeValueType(row.valueType),
    databaseValueType: row.valueType,
    preview: row.preview === null ? undefined : row.preview,
    description: `${row.nodeName} → ${row.path}`,
    isSecret: Boolean(row.isSecret),
    nodeId: row.nodeId,
    nodeName: row.nodeName,
    fieldKind: row.fieldKind,
  };
}

function groupRows(rows) {
  const groups = new Map();

  for (const row of rows) {
    if (!groups.has(row.nodeId)) {
      groups.set(row.nodeId, {
        nodeId: row.nodeId,
        nodeName: row.nodeName,
        stepKey: row.stepKey,
        sequence: Number(row.sequence) || 0,
        business: [],
        technical: [],
        raw: [],
      });
    }

    const group = groups.get(row.nodeId);
    const source = mapSource(row);
    if (row.fieldKind === 'TECHNICAL') group.technical.push(source);
    else if (row.fieldKind === 'RAW') group.raw.push(source);
    else group.business.push(source);
  }

  return [...groups.values()]
    .sort((a, b) => a.sequence - b.sequence || a.nodeName.localeCompare(b.nodeName))
    .map((group) => ({
      ...group,
      counts: {
        business: group.business.length,
        technical: group.technical.length,
        raw: group.raw.length,
        total: group.business.length + group.technical.length + group.raw.length,
      },
    }));
}

function buildBindingGroups(nodeGroups, includeTechnical) {
  const stepSources = [];
  const technicalSources = [];

  for (const group of nodeGroups) {
    for (const source of [...group.raw, ...group.business]) {
      stepSources.push({
        ...source,
        label: `${group.nodeName} → ${source.label}`,
      });
    }
    for (const source of group.technical) {
      technicalSources.push({
        ...source,
        label: `${group.nodeName} → ${source.label}`,
      });
    }
  }

  const result = [];
  if (stepSources.length > 0) {
    result.push({
      id: 'steps',
      label: 'Workflow Steps',
      icon: 'Workflow',
      description: 'PostgreSQL-indexed outputs from persisted workflow steps.',
      sources: stepSources,
    });
  }
  if (includeTechnical && technicalSources.length > 0) {
    result.push({
      id: 'technical',
      label: 'Technical Details',
      icon: 'Wrench',
      description: 'Transport, wrapper and execution details. Collapsed by default.',
      sources: technicalSources,
      isTechnical: true,
      defaultCollapsed: true,
    });
  }
  return result;
}

const querySchema = z.object({
  runId: z.string().max(200).optional(),
  targetNodeId: z.string().max(200).optional(),
  search: z.string().max(200).optional(),
  includeTechnical: z.any().optional(),
  includeRaw: z.any().optional(),
  limit: z.coerce.number().int().min(1).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

function createPostgresOutputSourceRouter(options = {}) {
  const router = express.Router();
  const enabled = options.enabled === true;
  const workspaceKey = options.workspaceKey || 'default';
  const defaultLimit = Math.max(1, Number(options.defaultLimit) || 500);
  const maxLimit = Math.max(defaultLimit, Number(options.maxLimit) || 2000);
  const repository = options.repository || createOutputSourceReadRepository();

  router.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  router.get('/output-source/status', (req, res) => {
    res.json({
      status: 'success',
      enabled,
      source: 'postgres',
      readModel: 'autoflow.output_binding_source_v1',
      readOnly: true,
      workspaceKey,
      defaultLimit,
      maxLimit,
    });
  });

  function requireEnabled(req, res, next) {
    if (!enabled) {
      return res.status(503).json({
        error:
          'PostgreSQL output-source API is disabled. Set ' +
          'EXECUTION_OUTPUT_SOURCE_API_ENABLED=true after backend tests pass.',
        code: 'OUTPUT_SOURCE_API_DISABLED',
      });
    }
    next();
  }

  async function handleList(req, res, exactRunId = null) {
    try {
      const workflowId = req.params.workflowId;
      if (!isSafeIdSegment(workflowId)) {
        return res.status(400).json({
          error: 'Invalid workflow id',
          code: 'INVALID_WORKFLOW_ID',
        });
      }

      if (exactRunId !== null && !isSafeIdSegment(exactRunId)) {
        return res.status(400).json({
          error: 'Invalid run id',
          code: 'INVALID_RUN_ID',
        });
      }

      const parsed = querySchema.safeParse(req.query);
      if (!parsed.success) {
        return res.status(400).json({
          error: 'Invalid output-source query',
          code: 'INVALID_OUTPUT_SOURCE_QUERY',
          details: parsed.error.issues.slice(0, 5),
        });
      }

      const queryValues = parsed.data;
      const runId = exactRunId || queryValues.runId || null;
      if (runId && !isSafeIdSegment(runId)) {
        return res.status(400).json({
          error: 'Invalid run id',
          code: 'INVALID_RUN_ID',
        });
      }
      if (queryValues.targetNodeId && !isSafeIdSegment(queryValues.targetNodeId)) {
        return res.status(400).json({
          error: 'Invalid target node id',
          code: 'INVALID_TARGET_NODE_ID',
        });
      }

      let includeTechnical;
      let includeRaw;
      try {
        includeTechnical = parseBoolean(
          queryValues.includeTechnical,
          exactRunId !== null
        );
        includeRaw = parseBoolean(queryValues.includeRaw, true);
      } catch (error) {
        return res.status(400).json({
          error: error.message,
          code: 'INVALID_OUTPUT_SOURCE_BOOLEAN',
        });
      }

      const limit = Math.min(maxLimit, queryValues.limit || defaultLimit);
      const offset = queryValues.offset || 0;
      const result = await repository.listOutputSources({
        workspaceKey,
        workflowId,
        runId,
        targetNodeId: queryValues.targetNodeId || null,
        search: queryValues.search || '',
        includeTechnical,
        includeRaw,
        limit,
        offset,
      });

      const nodeGroups = groupRows(result.rows);
      const returnedRows = result.rows.length;
      return res.json({
        status: 'success',
        source: 'postgres',
        readModel: 'autoflow.output_binding_source_v1',
        readOnly: true,
        workflowId,
        requestedRunId: runId,
        runId: result.execution.runId,
        execution: result.execution,
        query: {
          targetNodeId: queryValues.targetNodeId || null,
          targetFilter: queryValues.targetNodeId ? 'graph-ancestors' : 'all-final-nodes',
          search: queryValues.search || '',
          includeTechnical,
          includeRaw,
          limit,
          offset,
        },
        coverage: {
          ...result.coverage,
          eligibleNodes: result.eligibleNodeIds === null
            ? result.coverage.finalNodes
            : result.eligibleNodeIds.length,
          totalMatchingRows: result.totalMatchingRows,
          returnedRows,
          returnedNodes: nodeGroups.length,
          hasMore: offset + returnedRows < result.totalMatchingRows,
        },
        groups: nodeGroups,
        bindingGroups: buildBindingGroups(nodeGroups, includeTechnical),
      });
    } catch (error) {
      return handleError(error, res);
    }
  }

  router.get(
    '/workflows/:workflowId/output-sources',
    requireEnabled,
    (req, res) => handleList(req, res, null)
  );

  router.get(
    '/workflows/:workflowId/runs/:runId/outputs',
    requireEnabled,
    (req, res) => handleList(req, res, req.params.runId)
  );

  return router;
}

function handleError(error, res) {
  const status = Number(error.status) || 500;
  if (status >= 500) console.error('[postgres output sources]', error);
  else console.warn('[postgres output sources]', error.code || error.message);
  return res.status(status).json({
    error: status >= 500
      ? 'Unable to read PostgreSQL output sources.'
      : error.message,
    code: error.code || 'POSTGRES_OUTPUT_SOURCE_ERROR',
    details:
      process.env.NODE_ENV === 'production' || status < 500
        ? undefined
        : error.message,
  });
}

module.exports = {
  normalizeValueType,
  mapSource,
  groupRows,
  buildBindingGroups,
  createPostgresOutputSourceRouter,
};
