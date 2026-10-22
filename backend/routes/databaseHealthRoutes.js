'use strict';

const express = require('express');
const { inspectDatabaseContract } = require('../db/databaseContract');

function createDatabaseHealthRouter(options = {}) {
  const router = express.Router();
  const enabled = options.enabled !== false;
  const strict = options.strict === true;
  const schema = options.schema || process.env.DB_SCHEMA || 'autoflow';

  router.get('/database', async (req, res) => {
    if (!enabled) {
      return res.json({
        status: 'disabled',
        source: 'postgres',
        readOnly: true,
        strict,
        schema,
      });
    }

    try {
      const report = await inspectDatabaseContract({ schema });
      return res.status(report.status === 'success' ? 200 : 503).json({
        ...report,
        source: 'postgres',
        strict,
      });
    } catch (error) {
      return res.status(503).json({
        status: 'error',
        verdict: 'DATABASE_CONTRACT_CHECK_FAILED',
        source: 'postgres',
        readOnly: true,
        strict,
        schema,
        error: error.message,
      });
    }
  });

  return router;
}

module.exports = { createDatabaseHealthRouter };
