'use strict';

const express = require('express');
const path = require('path');

const {
  getWorkspaceStatus,
  getWorkspaceTree,
  listFolders,
  listWorkflows,
} = require('../db/workspaceReadRepository');

const {
  checkDuplicate,
  createFolder,
  createWorkflow,
  deleteFolder,
  deleteWorkflow,
  getBreadcrumb,
  getFolder,
  getWorkflow,
  listChildren,
  renameWorkflow,
  updateFolder,
  updateWorkflow,
} = require('../db/workspaceWriteRepository');

function normalizeWindowsPath(value) {
  return path
    .resolve(String(value || '').trim().replace(/^["']|["']$/g, ''))
    .replace(/[\\/]+$/, '')
    .toLowerCase();
}

function createPostgresWorkspaceCompatibilityRouter(options = {}) {
  const router = express.Router();
  const workspaceKey = options.workspaceKey || 'default';
  const writesEnabled = options.writesEnabled === true;
  const repositoryOptions = { workspaceKey };

  router.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  function requireWrites(req, res, next) {
    if (!writesEnabled) {
      return res.status(503).json({
        error:
          'PostgreSQL primary workspace writes are disabled. Set ' +
          'DATABASE_PRIMARY_WRITE_ENABLED=true after readiness checks pass.',
        code: 'DATABASE_PRIMARY_WRITE_DISABLED',
      });
    }
    next();
  }

  router.get('/status', async (req, res) => {
    try {
      const workspace = await getWorkspaceStatus(workspaceKey);
      const rootDir =
        workspace.storageRoot ||
        `postgresql://autoflow/${workspace.workspaceKey}`;

      res.json({
        status: 'success',
        persistenceMode: 'postgres',
        active: {
          rootDir,
          workflowsDir: workspace.storageRoot
            ? path.join(workspace.storageRoot, 'workflows')
            : null,
          metaFile: workspace.storageRoot
            ? path.join(workspace.storageRoot, 'workspace.json')
            : null,
        },
      });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/select', async (req, res) => {
    try {
      const workspacePath = req.body?.path;

      if (!workspacePath) {
        return res.status(400).json({ error: 'path is required' });
      }

      if (typeof workspacePath !== 'string') {
        return res.status(400).json({
          error: 'path must be a string.',
          code: 'INVALID_WORKSPACE_PATH',
        });
      }

      const workspace = await getWorkspaceStatus(workspaceKey);
      const configuredRoot = workspace.storageRoot;

      if (
        configuredRoot &&
        normalizeWindowsPath(configuredRoot) !==
          normalizeWindowsPath(workspacePath)
      ) {
        return res.status(409).json({
          error:
            `PostgreSQL workspace '${workspaceKey}' is mapped to ` +
            `'${configuredRoot}', not '${workspacePath}'.`,
          code: 'WORKSPACE_PATH_MISMATCH',
        });
      }

      const rootDir =
        configuredRoot ||
        `postgresql://autoflow/${workspace.workspaceKey}`;

      res.json({
        status: 'success',
        message: 'PostgreSQL workspace selected and ready.',
        persistenceMode: 'postgres',
        workspace: {
          rootDir,
          workflowsDir: configuredRoot
            ? path.join(configuredRoot, 'workflows')
            : null,
          metaFile: configuredRoot
            ? path.join(configuredRoot, 'workspace.json')
            : null,
        },
      });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/tree', async (req, res) => {
    try {
      const tree = await getWorkspaceTree(workspaceKey);
      res.json({
        status: 'success',
        folders: tree.folders,
        workflows: tree.workflows,
      });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/children/:parentId', async (req, res) => {
    try {
      const children = await listChildren(
        req.params.parentId,
        repositoryOptions
      );
      res.json({
        status: 'success',
        ...children,
      });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/breadcrumb/:id', async (req, res) => {
    try {
      const breadcrumb = await getBreadcrumb(
        req.params.id,
        repositoryOptions
      );
      res.json({
        status: 'success',
        breadcrumb,
      });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/folders', async (req, res) => {
    try {
      res.json({
        status: 'success',
        folders: await listFolders(workspaceKey),
      });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/folders/:id', async (req, res) => {
    try {
      res.json({
        status: 'success',
        folder: await getFolder(req.params.id, repositoryOptions),
      });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/folders', requireWrites, async (req, res) => {
    try {
      const folder = await createFolder(req.body, repositoryOptions);
      res.status(201).json({ status: 'success', folder });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.put('/folders/:id', requireWrites, async (req, res) => {
    try {
      const folder = await updateFolder(
        req.params.id,
        req.body,
        repositoryOptions
      );
      res.json({ status: 'success', folder });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.delete('/folders/:id', requireWrites, async (req, res) => {
    try {
      const result = await deleteFolder(
        req.params.id,
        repositoryOptions
      );
      res.json({ status: 'success', ...result });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/workflows', async (req, res) => {
    try {
      res.json({
        status: 'success',
        workflows: await listWorkflows(workspaceKey),
      });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/workflows/:id', async (req, res) => {
    try {
      const workflow = await getWorkflow(
        req.params.id,
        repositoryOptions
      );
      res.json({
        status: 'success',
        workflow,
        recovered: false,
      });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/workflows', requireWrites, async (req, res) => {
    try {
      const workflow = await createWorkflow(
        req.body,
        repositoryOptions
      );
      res.status(201).json({ status: 'success', workflow });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.put(
    '/workflows/:id/rename',
    requireWrites,
    async (req, res) => {
      try {
        const workflow = await renameWorkflow(
          req.params.id,
          req.body,
          repositoryOptions
        );
        res.json({ status: 'success', workflow });
      } catch (error) {
        handleError(error, res);
      }
    }
  );

  router.put('/workflows/:id', requireWrites, async (req, res) => {
    try {
      const workflow = await updateWorkflow(
        req.params.id,
        req.body,
        repositoryOptions
      );
      res.json({ status: 'success', workflow });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.delete('/workflows/:id', requireWrites, async (req, res) => {
    try {
      const result = await deleteWorkflow(
        req.params.id,
        repositoryOptions
      );
      res.json({ status: 'success', ...result });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/check-duplicate', async (req, res) => {
    try {
      const isDuplicate = await checkDuplicate(
        req.body,
        repositoryOptions
      );
      res.json({ status: 'success', isDuplicate });
    } catch (error) {
      handleError(error, res);
    }
  });

  // Unmatched routes, including /workflows/:id/runs, intentionally continue
  // to the existing filesystem implementation during Step 5.
  return router;
}

function handleError(error, res) {
  console.error('[postgres workspace compatibility]', error);

  const status = Number(error.status) || 500;

  return res.status(status).json({
    error:
      status >= 500
        ? 'Unable to process the PostgreSQL workspace request.'
        : error.message,
    code: error.code || 'POSTGRES_WORKSPACE_ERROR',
    details:
      process.env.NODE_ENV === 'production' || status < 500
        ? undefined
        : error.message,
  });
}

module.exports = {
  createPostgresWorkspaceCompatibilityRouter,
};
