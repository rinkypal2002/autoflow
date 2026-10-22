'use strict';

const express = require('express');
const { createWorkflowOrchestrator } = require('../orchestrator/workflowOrchestrator');

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

function createWorkflowOrchestratorRouter(options = {}) {
  const router = express.Router();
  const enabled = options.enabled === true;
  const persistenceReady = options.persistenceReady === true;
  const orchestrator = options.orchestrator || createWorkflowOrchestrator(options);

  router.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  router.get('/status', (req, res) => {
    res.json({
      status: 'success',
      phase: 'ORCH-4D',
      enabled,
      persistenceReady,
      executionOwner: 'node-backend',
      supportedGraph: 'ORCH-3 branch DAGs + ORCH-4A For Each + ORCH-4B While + ORCH-4C Repeat Until + ORCH-4D Start -> For Each [Body] -> Break / [Done] -> End',
      browserExecutorUntouched: true,
    });
  });

  router.post('/workflows/:workflowId/execute', async (req, res) => {
    if (!enabled) {
      return res.status(503).json({
        error: 'Server orchestrator is disabled. Set ORCHESTRATOR_ENABLED=true for ORCH-4D certification.',
        code: 'ORCHESTRATOR_DISABLED',
      });
    }
    if (!persistenceReady) {
      return res.status(503).json({
        error: 'ORCH-4D requires PostgreSQL workspace + execution persistence with execution writes enabled.',
        code: 'ORCHESTRATOR_PERSISTENCE_NOT_READY',
      });
    }

    const workflowId = req.params.workflowId;
    if (!isSafeIdSegment(workflowId)) {
      return res.status(400).json({
        error: 'Invalid workflow id.',
        code: 'INVALID_WORKFLOW_ID',
      });
    }

    try {
      const result = await orchestrator.executeWorkflow(workflowId);
      return res.status(200).json({
        status: 'success',
        phase: 'ORCH-4D',
        execution: result,
      });
    } catch (error) {
      return res.status(Number(error.status) || 500).json({
        status: 'failed',
        phase: 'ORCH-4D',
        code: error.code || 'ORCH4D_EXECUTION_FAILED',
        error: error.message || 'ORCH-4D execution failed.',
        runId: error.runId || null,
        details: error.details,
      });
    }
  });

  return router;
}

module.exports = {
  createWorkflowOrchestratorRouter,
};
