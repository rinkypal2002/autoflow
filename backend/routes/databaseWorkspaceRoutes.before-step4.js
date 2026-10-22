'use strict';

const express = require('express');
const {
  getWorkspaceStatus,
  getWorkspaceTree,
  listFolders,
  listWorkflows,
} = require('../db/workspaceReadRepository');

function createDatabaseWorkspaceRouter(options = {}) {
  const router = express.Router();
  const workspaceKey = options.workspaceKey || 'default';

  router.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  router.get('/status', async (req, res) => {
    try {
      const workspace = await getWorkspaceStatus(workspaceKey);
      res.json({
        status: 'success',
        source: 'postgresql',
        workspace,
      });
    } catch (error) {
      handleReadError(error, res);
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
      handleReadError(error, res);
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
      handleReadError(error, res);
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
      handleReadError(error, res);
    }
  });

  return router;
}

function handleReadError(error, res) {
  console.error('[database workspace read]', error);

  if (error.code === 'WORKSPACE_NOT_FOUND') {
    return res.status(404).json({
      status: 'error',
      source: 'postgresql',
      error: error.message,
    });
  }

  return res.status(500).json({
    status: 'error',
    source: 'postgresql',
    error: 'Unable to read the AutoFlow workspace from PostgreSQL.',
    details:
      process.env.NODE_ENV === 'production' ? undefined : error.message,
  });
}

module.exports = {
  createDatabaseWorkspaceRouter,
};
