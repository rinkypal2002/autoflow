'use strict';

const express = require('express');
const { z } = require('zod');
const {
  createPluginEndpointMappingRepository,
} = require('../db/pluginEndpointMappingRepository');

const querySchema = z.object({
  engineVersion: z.string().trim().min(1).max(64).optional(),
  pluginId: z.string().trim().max(160).optional(),
  search: z.string().trim().max(200).optional(),
  includeDeprecated: z.enum(['true', 'false']).optional(),
  limit: z.coerce.number().int().min(1).max(2000).optional(),
  offset: z.coerce.number().int().min(0).optional(),
}).strict();

function createPluginEndpointMappingReadRouter(options = {}) {
  const router = express.Router();
  const enabled = Boolean(options.enabled);
  const defaultLimit = Math.min(2000, Math.max(1, Number(options.defaultLimit) || 500));
  const maxLimit = Math.min(2000, Math.max(defaultLimit, Number(options.maxLimit) || 1000));
  const engineVersion = String(options.engineVersion || 'v11.3');
  const repository = options.repository || createPluginEndpointMappingRepository({
    schema: options.schema,
  });

  router.get('/status', (req, res) => {
    res.json({
      status: 'success',
      enabled,
      source: 'postgres',
      table: `${options.schema || 'autoflow'}.plugin_endpoint_mapping`,
      readOnly: true,
      writeEndpointAvailable: false,
      engineVersion,
      defaultLimit,
      maxLimit,
    });
  });

  router.get('/', async (req, res) => {
    if (!enabled) {
      return res.status(503).json({
        error:
          'Plugin mapping read API is disabled. Set PLUGIN_MAPPING_READ_API_ENABLED=true after automated tests pass.',
        code: 'PLUGIN_MAPPING_READ_API_DISABLED',
        readOnly: true,
      });
    }

    const parsed = querySchema.safeParse(req.query || {});
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid plugin mapping read request.',
        code: 'PLUGIN_MAPPING_READ_INVALID_REQUEST',
        details: parsed.error.flatten(),
      });
    }

    const limit = Math.min(maxLimit, parsed.data.limit || defaultLimit);
    const offset = parsed.data.offset || 0;
    const includeDeprecated = parsed.data.includeDeprecated === 'true';

    try {
      const result = await repository.readMappings({
        engineVersion: parsed.data.engineVersion || engineVersion,
        pluginId: parsed.data.pluginId || null,
        search: parsed.data.search || '',
        includeDeprecated,
        limit,
        offset,
      });

      return res.json({
        status: 'success',
        source: 'postgres',
        table: result.table,
        readOnly: true,
        writeEndpointAvailable: false,
        engineVersion: result.engineVersion,
        query: {
          pluginId: parsed.data.pluginId || '',
          search: parsed.data.search || '',
          includeDeprecated,
          limit,
          offset,
        },
        coverage: result.coverage,
        mappings: result.mappings,
      });
    } catch (error) {
      return res.status(Number(error.status) || 500).json({
        error: error.message || 'Plugin mapping read failed.',
        code: error.code || 'PLUGIN_MAPPING_READ_FAILED',
        readOnly: true,
      });
    }
  });

  return router;
}

module.exports = {
  createPluginEndpointMappingReadRouter,
};
