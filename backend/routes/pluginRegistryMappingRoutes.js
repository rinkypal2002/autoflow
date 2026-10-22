'use strict';

const express = require('express');
const { z } = require('zod');

const {
  EngineActionRegistryError,
  createEngineActionRegistryClient,
} = require('../services/engineActionRegistryClient');
const {
  createPluginEndpointMappingRepository,
} = require('../db/pluginEndpointMappingRepository');
const {
  createPluginRegistryDryRunService,
} = require('../services/pluginRegistryDryRunService');

const dryRunSchema = z.object({
  includeRecords: z.boolean().optional().default(false),
  previewLimit: z.number().int().min(1).max(500).optional(),
}).strict();

function createPluginRegistryMappingRouter(options = {}) {
  const router = express.Router();
  const enabled = Boolean(options.enabled);
  const writeEnabled = Boolean(options.writeEnabled);
  const previewLimit = Math.min(500, Math.max(1, Number(options.previewLimit) || 50));

  const client = options.client || createEngineActionRegistryClient({
    engineUrl: options.engineUrl,
    engineContextPath: options.engineContextPath,
    registryPath: options.registryPath,
    registryUrl: options.registryUrl,
    timeoutMs: options.requestTimeoutMs,
  });
  const repository = options.repository || createPluginEndpointMappingRepository({
    schema: options.schema,
  });
  const service = options.service || createPluginRegistryDryRunService({
    client,
    repository,
    engineVersion: options.engineVersion,
    engineContextPath: options.engineContextPath,
  });

  router.get('/status', (req, res) => {
    res.json({
      status: 'success',
      enabled,
      source: 'products-engine-action-registry',
      target: `${options.schema || 'autoflow'}.plugin_endpoint_mapping`,
      registryUrl: client.registryUrl || options.registryUrl || null,
      engineVersion: options.engineVersion,
      engineContextPath: options.engineContextPath,
      readOnly: true,
      writeEnabled,
      applyEndpointAvailable: false,
      frontendCatalogueChanged: false,
      defaultPreviewLimit: previewLimit,
    });
  });

  router.post('/dry-run', async (req, res) => {
    if (!enabled) {
      return res.status(503).json({
        error:
          'Plugin endpoint mapping dry-run API is disabled. Set PLUGIN_ENDPOINT_MAPPING_API_ENABLED=true after automated tests pass.',
        code: 'PLUGIN_ENDPOINT_MAPPING_API_DISABLED',
        readOnly: true,
      });
    }

    const parsed = dryRunSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid plugin endpoint mapping dry-run request.',
        code: 'PLUGIN_ENDPOINT_MAPPING_INVALID_REQUEST',
        details: parsed.error.flatten(),
      });
    }

    try {
      const report = await service.runDryRun({
        includeRecords: parsed.data.includeRecords,
        previewLimit: parsed.data.previewLimit || previewLimit,
      });
      return res.status(report.status === 'success' ? 200 : 409).json(report);
    } catch (error) {
      const status = error instanceof EngineActionRegistryError
        ? error.status
        : Number(error.status) || 500;
      return res.status(status).json({
        error: error.message,
        code: error.code || 'PLUGIN_ENDPOINT_MAPPING_DRY_RUN_FAILED',
        details: error.details || null,
        readOnly: true,
        writesPerformed: 0,
      });
    }
  });

  return router;
}

module.exports = {
  createPluginRegistryMappingRouter,
};
