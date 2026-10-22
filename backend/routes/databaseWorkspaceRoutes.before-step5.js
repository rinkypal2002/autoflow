'use strict';

const express = require('express');

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
  renameFolder,
  renameWorkflow,
  updateWorkflow,
} = require('../db/workspaceWriteRepository');

function asBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }
  return String(value).trim().toLowerCase() === 'true';
}

function createDatabaseWorkspaceRouter(options = {}) {
  const router = express.Router();
  const workspaceKey = options.workspaceKey || 'default';
  const writesEnabled = asBoolean(
    process.env.DATABASE_SHADOW_WRITE_ENABLED,
    false
  );

  const repositoryOptions = { workspaceKey };

  router.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  function requireWrites(req, res, next) {
    if (!writesEnabled) {
      return res.status(403).json({
        status: 'error',
        source: 'postgresql',
        code: 'DATABASE_SHADOW_WRITE_DISABLED',
        error:
          'PostgreSQL shadow writes are disabled. Set ' +
          'DATABASE_SHADOW_WRITE_ENABLED=true for controlled testing.',
      });
    }
    next();
  }

  router.get('/status', async (req, res) => {
    try {
      const workspace = await getWorkspaceStatus(workspaceKey);
      res.json({
        status: 'success',
        source: 'postgresql',
        writeEnabled: writesEnabled,
        workspace,
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
        source: 'postgresql',
        folders: tree.folders,
        workflows: tree.workflows,
        workspace: tree.workspace,
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
        source: 'postgresql',
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
        source: 'postgresql',
        breadcrumb,
      });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/folders', async (req, res) => {
    try {
      const folders = await listFolders(workspaceKey);
      res.json({
        status: 'success',
        source: 'postgresql',
        folders,
      });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/folders/:id', async (req, res) => {
    try {
      const folder = await getFolder(
        req.params.id,
        repositoryOptions
      );
      res.json({
        status: 'success',
        source: 'postgresql',
        folder,
      });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/folders', requireWrites, async (req, res) => {
    try {
      const folder = await createFolder(
        req.body,
        repositoryOptions
      );
      res.status(201).json({
        status: 'success',
        source: 'postgresql',
        folder,
      });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.put('/folders/:id', requireWrites, async (req, res) => {
    try {
      const folder = await renameFolder(
        req.params.id,
        req.body,
        repositoryOptions
      );
      res.json({
        status: 'success',
        source: 'postgresql',
        folder,
      });
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
      res.json({
        status: 'success',
        source: 'postgresql',
        ...result,
      });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/workflows', async (req, res) => {
    try {
      const workflows = await listWorkflows(workspaceKey);
      res.json({
        status: 'success',
        source: 'postgresql',
        workflows,
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
        source: 'postgresql',
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
      res.status(201).json({
        status: 'success',
        source: 'postgresql',
        workflow,
      });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.put('/workflows/:id/rename', requireWrites, async (req, res) => {
    try {
      const workflow = await renameWorkflow(
        req.params.id,
        req.body,
        repositoryOptions
      );
      res.json({
        status: 'success',
        source: 'postgresql',
        workflow,
      });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.put('/workflows/:id', requireWrites, async (req, res) => {
    try {
      const workflow = await updateWorkflow(
        req.params.id,
        req.body,
        repositoryOptions
      );
      res.json({
        status: 'success',
        source: 'postgresql',
        workflow,
      });
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
      res.json({
        status: 'success',
        source: 'postgresql',
        ...result,
      });
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
      res.json({
        status: 'success',
        source: 'postgresql',
        isDuplicate,
      });
    } catch (error) {
      handleError(error, res);
    }
  });

  return router;
}

function handleError(error, res) {
  console.error('[database workspace]', error);

  const status = Number(error.status) || 500;
  const payload = {
    status: 'error',
    source: 'postgresql',
    code: error.code || 'DATABASE_WORKSPACE_ERROR',
    error:
      status >= 500
        ? 'Unable to process the PostgreSQL workspace request.'
        : error.message,
  };

  if (process.env.NODE_ENV !== 'production' && status >= 500) {
    payload.details = error.message;
  }

  return res.status(status).json(payload);
}

module.exports = {
  createDatabaseWorkspaceRouter,
};
