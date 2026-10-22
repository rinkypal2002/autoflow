'use strict';

const express = require('express');
const { z } = require('zod');
const {
  createWorkflowVersionReadRepository,
} = require('../db/workflowVersionReadRepository');

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;

function isSafeIdSegment(value) {
  return SAFE_ID.test(String(value || ''));
}

function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  throw new Error(`Expected true or false, received '${value}'.`);
}

const listQuerySchema = z.object({
  includeDefinition: z.any().optional(),
  search: z.string().max(200).optional(),
  sourceType: z.string().max(20).optional(),
  limit: z.coerce.number().int().min(1).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

function createPostgresWorkflowVersionRouter(options = {}) {
  const router = express.Router();
  const enabled = options.enabled === true;
  const workspaceKey = options.workspaceKey || 'default';
  const defaultLimit = Math.max(1, Number(options.defaultLimit) || 40);
  const maxLimit = Math.max(defaultLimit, Number(options.maxLimit) || 100);
  const repository = options.repository || createWorkflowVersionReadRepository();

  router.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  router.get('/version-history/status', (req, res) => {
    res.json({
      status: 'success',
      enabled,
      source: 'postgres',
      table: 'autoflow.workflow_version',
      readOnly: true,
      restoreEnabled: false,
      workspaceKey,
      defaultLimit,
      maxLimit,
    });
  });

  function requireEnabled(req, res, next) {
    if (!enabled) {
      return res.status(503).json({
        error:
          'PostgreSQL workflow version-history API is disabled. Set ' +
          'WORKFLOW_VERSION_HISTORY_API_ENABLED=true after backend tests pass.',
        code: 'WORKFLOW_VERSION_HISTORY_API_DISABLED',
      });
    }
    next();
  }

  router.get('/workflows/:workflowId/versions', requireEnabled, async (req, res) => {
    try {
      const workflowId = req.params.workflowId;
      if (!isSafeIdSegment(workflowId)) {
        return res.status(400).json({
          error: 'Invalid workflow id',
          code: 'INVALID_WORKFLOW_ID',
        });
      }

      const parsed = listQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        return res.status(400).json({
          error: 'Invalid workflow version-history query',
          code: 'INVALID_WORKFLOW_VERSION_QUERY',
          details: parsed.error.issues.slice(0, 5),
        });
      }

      let includeDefinition;
      try {
        includeDefinition = parseBoolean(parsed.data.includeDefinition, false);
      } catch (error) {
        return res.status(400).json({
          error: error.message,
          code: 'INVALID_WORKFLOW_VERSION_BOOLEAN',
        });
      }

      const limit = Math.min(maxLimit, parsed.data.limit || defaultLimit);
      const offset = parsed.data.offset || 0;
      const result = await repository.listWorkflowVersions({
        workspaceKey,
        workflowId,
        includeDefinition,
        search: parsed.data.search || '',
        sourceType: parsed.data.sourceType || '',
        limit,
        offset,
      });

      return res.json({
        status: 'success',
        source: 'postgres',
        table: 'autoflow.workflow_version',
        readOnly: true,
        restoreEnabled: false,
        workflowId,
        workflowName: result.workflow.workflowName,
        currentVersionNumber: Number(result.workflow.currentVersionNumber),
        query: {
          includeDefinition,
          search: parsed.data.search || '',
          sourceType: parsed.data.sourceType || '',
          limit,
          offset,
        },
        coverage: {
          totalVersions: result.total,
          returnedVersions: result.versions.length,
          hasMore: offset + result.versions.length < result.total,
        },
        versions: result.versions,
      });
    } catch (error) {
      return handleError(error, res);
    }
  });

  router.get(
    '/workflows/:workflowId/versions/:versionIdentifier',
    requireEnabled,
    async (req, res) => {
      try {
        const workflowId = req.params.workflowId;
        const versionIdentifier = req.params.versionIdentifier;
        if (!isSafeIdSegment(workflowId)) {
          return res.status(400).json({
            error: 'Invalid workflow id',
            code: 'INVALID_WORKFLOW_ID',
          });
        }
        if (!isSafeIdSegment(versionIdentifier)) {
          return res.status(400).json({
            error: 'Invalid workflow version identifier',
            code: 'INVALID_WORKFLOW_VERSION_ID',
          });
        }

        const result = await repository.getWorkflowVersion({
          workspaceKey,
          workflowId,
          versionIdentifier,
        });
        return res.json({
          status: 'success',
          source: 'postgres',
          table: 'autoflow.workflow_version',
          readOnly: true,
          restoreEnabled: false,
          workflowId,
          workflowName: result.workflow.workflowName,
          currentVersionNumber: Number(result.workflow.currentVersionNumber),
          version: result.version,
        });
      } catch (error) {
        return handleError(error, res);
      }
    }
  );

  return router;
}

function handleError(error, res) {
  const status = Number(error.status) || 500;
  if (status >= 500) console.error('[postgres workflow versions]', error);
  else console.warn('[postgres workflow versions]', error.code || error.message);
  return res.status(status).json({
    error:
      status >= 500
        ? 'Unable to read PostgreSQL workflow version history.'
        : error.message,
    code: error.code || 'POSTGRES_WORKFLOW_VERSION_ERROR',
    details:
      process.env.NODE_ENV === 'production' || status < 500
        ? undefined
        : error.stack,
  });
}

module.exports = {
  createPostgresWorkflowVersionRouter,
  parseBoolean,
};
