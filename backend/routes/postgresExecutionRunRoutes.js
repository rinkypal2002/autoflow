'use strict';

const express = require('express');
const { z } = require('zod');

const {
  deleteExecutionSnapshot,
  getExecutionSnapshot,
  listExecutionSnapshots,
  upsertExecutionSnapshot,
} = require('../db/executionRepository');

const runSnapshotSchema = z.object({
  version: z.literal(1),
  runId: z.string().min(1).max(200),
  workflowId: z.string().min(1).max(200),
  workflowName: z.string().max(500).optional(),
  status: z.string().min(1).max(50),
  startedAt: z.string().min(1).max(64),
  updatedAt: z.string().min(1).max(64),
  finishedAt: z.string().max(64).optional(),
  variables: z.record(z.any()).optional(),
  runtime: z.record(z.any()).optional(),
  files: z.record(z.any()).optional(),
  env: z.record(z.any()).optional(),
  outputs: z.array(z.any()).optional(),
  previousNodeId: z.string().nullable().optional(),
  logs: z.array(z.any()).optional(),
  metrics: z.record(z.any()).optional(),
});

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

function publicSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') {
    return snapshot;
  }

  const clone = JSON.parse(JSON.stringify(snapshot));

  // Migration provenance is required internally for parity and rollback but
  // was never part of the frontend filesystem contract.
  delete clone.migration;

  return clone;
}

function createPostgresExecutionRunRouter(options = {}) {
  const router = express.Router();

  const workspaceKey = options.workspaceKey || 'default';
  const writesEnabled = options.writesEnabled === true;
  const retentionDays = Number.isFinite(Number(options.retentionDays))
    ? Math.max(0, Number(options.retentionDays))
    : 30;
  const maxBytes = Number.isFinite(Number(options.maxBytes))
    ? Math.max(1024, Number(options.maxBytes))
    : 8 * 1024 * 1024;
  const outputIndexWriteEnabled =
    options.outputIndexWriteEnabled === true;
  const listLimit = Number.isFinite(Number(options.listLimit))
    ? Math.min(200, Math.max(1, Number(options.listLimit)))
    : 25;

  router.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  function requireWrites(req, res, next) {
    if (!writesEnabled) {
      return res.status(503).json({
        error:
          'PostgreSQL execution writes are disabled. Set ' +
          'DATABASE_EXECUTION_WRITE_ENABLED=true after parity checks pass.',
        code: 'DATABASE_EXECUTION_WRITE_DISABLED',
      });
    }

    next();
  }

  router.get('/execution-persistence/status', (req, res) => {
    res.json({
      status: 'success',
      persistenceMode: 'postgres',
      writesEnabled,
      workspaceKey,
      retentionDays,
      listLimit,
      outputIndexWriteEnabled,
    });
  });

  router.post(
    '/workflows/:id/runs',
    requireWrites,
    async (req, res) => {
      try {
        const workflowId = req.params.id;

        if (!isSafeIdSegment(workflowId)) {
          return res.status(400).json({
            error: 'Invalid workflow id',
            code: 'INVALID_WORKFLOW_ID',
          });
        }

        const parsed = runSnapshotSchema.safeParse(req.body);

        if (!parsed.success) {
          return res.status(400).json({
            error: 'Invalid run snapshot',
            code: 'INVALID_RUN_SNAPSHOT',
            details: parsed.error.issues.slice(0, 5),
          });
        }

        const snapshot = parsed.data;

        if (!isSafeIdSegment(snapshot.runId)) {
          return res.status(400).json({
            error: 'Invalid run id',
            code: 'INVALID_RUN_ID',
          });
        }

        if (snapshot.workflowId !== workflowId) {
          return res.status(400).json({
            error:
              'Route workflow id and snapshot workflowId must match.',
            code: 'WORKFLOW_ID_MISMATCH',
          });
        }

        const serialized = JSON.stringify(snapshot);

        if (Buffer.byteLength(serialized, 'utf8') > maxBytes) {
          return res.status(413).json({
            error: 'Run snapshot exceeds the size limit',
            code: 'RUN_SNAPSHOT_TOO_LARGE',
          });
        }

        const result = await upsertExecutionSnapshot(
          workflowId,
          snapshot,
          {
            workspaceKey,
            retentionDays,
            outputIndexWriteEnabled,
          }
        );

        return res.json({
          status: 'success',
          runId: result.runId,
        });
      } catch (error) {
        return handleError(error, res);
      }
    }
  );

  router.get('/workflows/:id/runs', async (req, res) => {
    try {
      const workflowId = req.params.id;

      if (!isSafeIdSegment(workflowId)) {
        return res.status(400).json({
          error: 'Invalid workflow id',
          code: 'INVALID_WORKFLOW_ID',
        });
      }

      const runs = await listExecutionSnapshots(
        workflowId,
        {
          workspaceKey,
          limit: listLimit,
        }
      );

      return res.json({
        status: 'success',
        runs,
      });
    } catch (error) {
      return handleError(error, res);
    }
  });

  router.get(
    '/workflows/:id/runs/:runId',
    async (req, res) => {
      try {
        const { id: workflowId, runId } = req.params;

        if (
          !isSafeIdSegment(workflowId) ||
          !isSafeIdSegment(runId)
        ) {
          return res.status(400).json({
            error: 'Invalid identifier',
            code: 'INVALID_RUN_IDENTIFIER',
          });
        }

        const snapshot = await getExecutionSnapshot(
          workflowId,
          runId,
          {
            workspaceKey,
          }
        );

        if (!snapshot) {
          return res.status(404).json({
            error: `Run '${runId}' not found`,
            code: 'EXECUTION_NOT_FOUND',
          });
        }

        return res.json({
          status: 'success',
          run: publicSnapshot(snapshot),
        });
      } catch (error) {
        return handleError(error, res);
      }
    }
  );

  router.delete(
    '/workflows/:id/runs/:runId',
    requireWrites,
    async (req, res) => {
      try {
        const { id: workflowId, runId } = req.params;

        if (
          !isSafeIdSegment(workflowId) ||
          !isSafeIdSegment(runId)
        ) {
          return res.status(400).json({
            error: 'Invalid identifier',
            code: 'INVALID_RUN_IDENTIFIER',
          });
        }

        // Preserve the legacy endpoint contract: deleting an absent run is
        // still a successful idempotent operation.
        await deleteExecutionSnapshot(
          workflowId,
          runId,
          {
            workspaceKey,
          }
        );

        return res.json({
          status: 'success',
        });
      } catch (error) {
        return handleError(error, res);
      }
    }
  );

  return router;
}

function handleError(error, res) {
  console.error('[postgres execution runs]', error);

  const status = Number(error.status) || 500;

  return res.status(status).json({
    error:
      status >= 500
        ? 'Unable to process the PostgreSQL execution request.'
        : error.message,
    code: error.code || 'POSTGRES_EXECUTION_ERROR',
    details:
      process.env.NODE_ENV === 'production' || status < 500
        ? undefined
        : error.message,
  });
}

module.exports = {
  createPostgresExecutionRunRouter,
};
