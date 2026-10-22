'use strict';

const axios = require('axios');
const {
  extractRegistryActions,
  normalizePath,
} = require('../lib/pluginRegistryNormalization');

class EngineActionRegistryError extends Error {
  constructor(message, code, status = 502, details = null) {
    super(message);
    this.name = 'EngineActionRegistryError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

function buildRegistryUrl({
  engineUrl,
  engineContextPath = '/engine',
  registryPath = '/api/v1/actions',
  registryUrl = null,
}) {
  if (registryUrl && String(registryUrl).trim()) {
    return String(registryUrl).trim().replace(/\/+$/, '');
  }

  const base = String(engineUrl || 'http://localhost:8080').trim().replace(/\/+$/, '');
  const context = normalizePath(engineContextPath, '/engine');
  const path = normalizePath(registryPath, '/api/v1/actions');
  const baseEndsWithContext = context !== '/' && base.toLowerCase().endsWith(context.toLowerCase());
  return `${base}${baseEndsWithContext ? '' : context}${path}`;
}

function createEngineActionRegistryClient(options = {}) {
  const httpClient = options.httpClient || axios;
  const registryUrl = buildRegistryUrl(options);
  const timeoutMs = Math.max(1000, Number(options.timeoutMs) || 15000);

  async function fetchActions() {
    let response;
    try {
      response = await httpClient.get(registryUrl, {
        timeout: timeoutMs,
        headers: {
          Accept: 'application/json',
          'User-Agent': 'AutoFlow-Plugin-Mapping-Foundation/4B.1',
        },
        validateStatus: () => true,
      });
    } catch (error) {
      throw new EngineActionRegistryError(
        `Products Engine registry is unavailable at '${registryUrl}': ${error.message}`,
        'ENGINE_ACTION_REGISTRY_UNAVAILABLE',
        502
      );
    }

    if (!response || response.status < 200 || response.status >= 300) {
      throw new EngineActionRegistryError(
        `Products Engine registry returned HTTP ${response ? response.status : 'unknown'}.`,
        'ENGINE_ACTION_REGISTRY_HTTP_ERROR',
        502,
        response && response.data ? response.data : null
      );
    }

    let actions;
    try {
      actions = extractRegistryActions(response.data);
    } catch (error) {
      throw new EngineActionRegistryError(
        `Products Engine registry response is invalid: ${error.message}`,
        'ENGINE_ACTION_REGISTRY_INVALID_RESPONSE',
        502
      );
    }

    return {
      registryUrl,
      fetchedAt: new Date().toISOString(),
      actions,
      responseStatus: response.status,
      responseMessage:
        response.data && typeof response.data === 'object'
          ? response.data.message || null
          : null,
    };
  }

  return {
    registryUrl,
    timeoutMs,
    fetchActions,
  };
}

module.exports = {
  EngineActionRegistryError,
  buildRegistryUrl,
  createEngineActionRegistryClient,
};
