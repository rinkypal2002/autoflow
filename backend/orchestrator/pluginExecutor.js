'use strict';

const axios = require('axios');
const {
  createPluginEndpointMappingRepository,
} = require('../db/pluginEndpointMappingRepository');
const {
  extractTokens,
  resolveDeep,
  resolveString,
  stripUnresolvedPlaceholders,
} = require('./canonical/lib/expression');
const { flattenObject } = require('./canonical/lib/objectUtils');
const { coerceToContract } = require('./canonical/lib/payloadContract');

class OrchestratorPluginError extends Error {
  constructor(code, message, status = 502, details = undefined) {
    super(message);
    this.name = 'OrchestratorPluginError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

const TOKEN_PATTERN = /\{\{\s*([^{}]+?)\s*\}\}/g;
const CROSS_NODE_ROOTS = new Set([
  'previous', 'steps', 'nodes', 'vars', 'input', 'runtime', 'files', 'env',
  'currentItem', 'currentIndex', 'currentKey', 'iteration', 'loop', 'loops', 'loopStack',
]);

function pathValue(source, path) {
  const segments = String(path).split('.').map((segment) => segment.trim()).filter(Boolean);
  let value = source;
  for (const segment of segments) {
    if (value == null || typeof value !== 'object' || !(segment in value)) return undefined;
    value = value[segment];
  }
  return value;
}

function tokensIn(value, found = []) {
  if (typeof value === 'string') {
    for (const match of value.matchAll(TOKEN_PATTERN)) found.push(match[1].trim());
    return found;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => tokensIn(item, found));
    return found;
  }
  if (value && typeof value === 'object') {
    Object.values(value).forEach((item) => tokensIn(item, found));
  }
  return found;
}

/** Retained only for the ORCH-1 regression suite. ORCH-2 no longer calls it. */
function assertLiteralProperties(properties) {
  const tokens = tokensIn(properties || {});
  if (tokens.length > 0) {
    throw new OrchestratorPluginError(
      'ORCH1_CARRY_FORWARD_BINDING_UNSUPPORTED',
      `ORCH-1 requires literal plugin properties. Remove binding(s): ${tokens.map((token) => `{{${token}}}`).join(', ')}.`,
      409,
      { tokens }
    );
  }
}

/** Retained for ORCH-1 regression compatibility. ORCH-2 uses the canonical resolver below. */
function resolveSelfTemplate(value, properties) {
  if (typeof value === 'string') {
    const exact = value.match(/^\{\{\s*([^{}]+?)\s*\}\}$/);
    if (exact) {
      const token = exact[1].trim();
      const root = token.split('.')[0];
      if (CROSS_NODE_ROOTS.has(root)) {
        throw new OrchestratorPluginError(
          'ORCH1_CARRY_FORWARD_BINDING_UNSUPPORTED',
          `ORCH-1 does not resolve cross-node binding '{{${token}}}' yet.`,
          409
        );
      }
      const resolved = pathValue(properties, token);
      if (resolved === undefined) {
        throw new OrchestratorPluginError(
          'ORCH1_UNRESOLVED_PROPERTY',
          `ORCH-1 could not resolve plugin property '{{${token}}}'.`,
          400
        );
      }
      return resolved;
    }

    return value.replace(TOKEN_PATTERN, (_whole, rawToken) => {
      const token = String(rawToken).trim();
      const root = token.split('.')[0];
      if (CROSS_NODE_ROOTS.has(root)) {
        throw new OrchestratorPluginError(
          'ORCH1_CARRY_FORWARD_BINDING_UNSUPPORTED',
          `ORCH-1 does not resolve cross-node binding '{{${token}}}' yet.`,
          409
        );
      }
      const resolved = pathValue(properties, token);
      if (resolved === undefined) {
        throw new OrchestratorPluginError(
          'ORCH1_UNRESOLVED_PROPERTY',
          `ORCH-1 could not resolve plugin property '{{${token}}}'.`,
          400
        );
      }
      return typeof resolved === 'string' ? resolved : JSON.stringify(resolved);
    });
  }

  if (Array.isArray(value)) return value.map((item) => resolveSelfTemplate(item, properties));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, resolveSelfTemplate(child, properties)])
    );
  }
  return value;
}

function unique(values) {
  return [...new Set((values || []).filter(Boolean))];
}

function assertNoUnresolved(value, label) {
  const tokens = unique(extractTokens(value));
  if (tokens.length === 0) return;
  throw new OrchestratorPluginError(
    'ORCH2_UNRESOLVED_BINDING',
    `ORCH-2 could not resolve ${label}: ${tokens.map((token) => `{{${token}}}`).join(', ')}.`,
    409,
    { label, tokens }
  );
}

/**
 * Mirrors the browser executor's two-pass binding flow:
 *   1) properties resolve from carry-forward scope;
 *   2) resolved properties are flattened back on top so URL/headers/body can
 *      continue using legacy self tokens such as {{text}} and {{rules}}.
 */
function resolveActionTemplates(action, carryScope = {}) {
  const propertyMissing = [];
  const propertyResolved = [];
  const rawProperties = action?.properties && typeof action.properties === 'object'
    ? action.properties
    : {};
  const bindingResolvedProperties = resolveDeep(rawProperties, carryScope, {
    onMissing: 'keep',
    missing: propertyMissing,
    resolved: propertyResolved,
  });

  // Browser parity: resolved values are reconciled with the action's declared
  // property contract before the API body template is built. This is what
  // turns a dataset-source custom value like '[{"id":1}]' back into a
  // real array for fields declared as type=array, while leaving text fields
  // that merely happen to contain JSON-looking text untouched.
  const propertyCoercion = coerceToContract(
    bindingResolvedProperties,
    action?.propertyConfig || null,
    { strictTokens: true }
  );
  if (propertyCoercion.errors.length > 0) {
    throw new OrchestratorPluginError(
      'ORCH3_PROPERTY_CONTRACT_INVALID',
      `ORCH-3 could not reconcile properties for '${action?.name || action?.id}' with the declared contract.`,
      400,
      { errors: propertyCoercion.errors }
    );
  }
  const resolvedProperties = propertyCoercion.payload;

  // Browser parity: WorkspaceEditorPage passes flattenObject(resolvedProperties)
  // as selfValues to buildScope(), making self fields the highest-precedence
  // bare keys while preserving the explicit previous/steps namespaces.
  const selfValues = flattenObject(resolvedProperties);
  const propertyScope = {
    ...carryScope,
    ...selfValues,
    self: {
      ...(carryScope.self || {}),
      ...selfValues,
    },
  };

  const api = action?.api || {};
  const pathMissing = [];
  const headerMissing = [];
  const bodyMissing = [];
  const methodMissing = [];

  const rawPath = api.url || '';
  const resolvedPath = typeof rawPath === 'string'
    ? resolveString(rawPath, propertyScope, { onMissing: 'keep', missing: pathMissing })
    : rawPath;
  const resolvedMethod = resolveString(String(api.method || 'POST'), propertyScope, {
    onMissing: 'keep',
    missing: methodMissing,
  });
  const resolvedHeaders = resolveDeep(api.headers || {}, propertyScope, {
    onMissing: 'keep',
    missing: headerMissing,
  });
  const bodyTemplate = api.body !== undefined ? api.body : resolvedProperties;
  const resolvedBody = stripUnresolvedPlaceholders(resolveDeep(bodyTemplate, propertyScope, {
    onMissing: 'keep',
    missing: bodyMissing,
  }));

  // The browser's payload-contract preflight rejects unresolved bindings before
  // a well-declared action goes on the wire. ORCH-2 has not ported that full
  // contract layer yet, so make the same safety guarantee explicitly here.
  assertNoUnresolved(resolvedProperties, `properties for '${action?.name || action?.id}'`);
  assertNoUnresolved(resolvedPath, `URL for '${action?.name || action?.id}'`);
  assertNoUnresolved(resolvedMethod, `method for '${action?.name || action?.id}'`);
  assertNoUnresolved(resolvedHeaders, `headers for '${action?.name || action?.id}'`);
  assertNoUnresolved(resolvedBody, `request body for '${action?.name || action?.id}'`);

  return {
    properties: resolvedProperties,
    propertyScope,
    path: resolvedPath,
    method: String(resolvedMethod || 'POST').toUpperCase(),
    headers: resolvedHeaders,
    body: resolvedBody,
    diagnostics: {
      boundTokens: unique([
        ...extractTokens(rawProperties),
        ...extractTokens(rawPath),
        ...extractTokens(api.headers || {}),
        ...extractTokens(bodyTemplate),
      ]),
      resolvedTokens: unique(propertyResolved),
      missingTokens: unique([
        ...propertyMissing,
        ...pathMissing,
        ...methodMissing,
        ...headerMissing,
        ...bodyMissing,
      ]),
      propertyCoercions: propertyCoercion.issues,
    },
  };
}

function safeEngineTarget(engineUrl, engineContextPath, rawPath) {
  const base = new URL(engineUrl);
  let pathname = String(rawPath || '').trim();
  let search = '';

  if (/^https?:\/\//i.test(pathname)) {
    const parsed = new URL(pathname);
    pathname = parsed.pathname;
    search = parsed.search;
  }

  if (!pathname.startsWith('/')) pathname = `/${pathname}`;
  const context = `/${String(engineContextPath || '/engine').replace(/^\/+|\/+$/g, '')}`;

  if (pathname === context || pathname.startsWith(`${context}/`)) {
    // already context-qualified
  } else if (pathname === '/api' || pathname.startsWith('/api/')) {
    pathname = `${context}${pathname}`;
  } else {
    throw new OrchestratorPluginError(
      'ORCH2_ENGINE_PATH_REJECTED',
      `ORCH-2 rejected plugin path '${pathname}'. Only ${context}/** or /api/** engine paths are allowed.`,
      400
    );
  }

  base.pathname = pathname.replace(/\/+/g, '/');
  base.search = search;
  base.hash = '';
  return base.toString();
}

function cleanHeaders(headers) {
  const blocked = new Set(['host', 'content-length', 'connection', 'transfer-encoding']);
  const out = {};
  for (const [key, value] of Object.entries(headers || {})) {
    if (blocked.has(String(key).toLowerCase())) continue;
    out[key] = String(value);
  }
  out.Accept = out.Accept || 'application/json, text/plain';
  return out;
}

function createPluginExecutor(options = {}) {
  const engineUrl = String(options.engineUrl || 'http://localhost:8080').replace(/\/+$/, '');
  const engineVersion = String(options.engineVersion || 'v11.3');
  const engineContextPath = String(options.engineContextPath || '/engine');
  const repository = options.repository || createPluginEndpointMappingRepository({
    schema: options.schema,
  });
  const http = options.http || axios;

  async function mappingFor(action) {
    try {
      const rows = await repository.listMappings(engineVersion);
      const actionId = String(action.actionId || action.type || '');
      const pluginId = String(action.pluginId || action.plugin || action.category || '');
      const active = rows.filter(
        (row) => row.enabled !== false && row.deprecated !== true && String(row.actionId) === actionId
      );
      const exact = active.find((row) => pluginId && String(row.pluginId) === pluginId);
      return exact || (active.length === 1 ? active[0] : null);
    } catch {
      return null;
    }
  }

  async function execute(action, runtime = {}) {
    const carryScope = runtime.scope || {};
    const resolved = resolveActionTemplates(action, carryScope);
    const mapping = await mappingFor(action);
    const rawPath = mapping?.canonicalPath || resolved.path;
    if (!rawPath) {
      throw new OrchestratorPluginError(
        'ORCH2_PLUGIN_ROUTE_NOT_FOUND',
        `No canonical engine route or saved API URL is available for '${action?.name || action?.id}'.`,
        409
      );
    }

    const contextPath = mapping?.engineContextPath || engineContextPath;
    // Mapping paths are canonical server metadata and normally literal. If one
    // ever contains a supported placeholder, resolve it against the same scope.
    const mappedPath = mapping?.canonicalPath
      ? resolveString(String(mapping.canonicalPath), resolved.propertyScope, { onMissing: 'keep' })
      : rawPath;
    assertNoUnresolved(mappedPath, `canonical route for '${action?.name || action?.id}'`);
    const url = safeEngineTarget(engineUrl, contextPath, mappedPath);
    const method = String(mapping?.httpMethod || resolved.method || 'POST').toUpperCase();
    const bodyType = String(mapping?.bodyType || action?.api?.bodyType || 'json').toLowerCase();

    if (bodyType === 'form-data' || bodyType === 'multipart') {
      throw new OrchestratorPluginError(
        'ORCH2_MULTIPART_UNSUPPORTED',
        `ORCH-2 does not support multipart/file action '${action?.name || action?.id}' yet.`,
        409
      );
    }

    const headers = cleanHeaders(resolved.headers);
    const body = resolved.body;
    const timeout = Math.min(
      120000,
      Math.max(1000, Number(mapping?.timeoutMs || action?.api?.timeout || action?.timeout || 30000))
    );

    if (!['GET', 'HEAD'].includes(method) && !Object.keys(headers).some((key) => key.toLowerCase() === 'content-type')) {
      headers['Content-Type'] = 'application/json';
    }

    let response;
    try {
      response = await http.request({
        url,
        method,
        headers,
        data: ['GET', 'HEAD'].includes(method) ? undefined : body,
        timeout,
        maxRedirects: 0,
        validateStatus: () => true,
      });
    } catch (error) {
      throw new OrchestratorPluginError(
        'ORCH2_ENGINE_REQUEST_FAILED',
        `Engine request failed for '${action?.name || action?.id}': ${error.message || error}`,
        502
      );
    }

    const result = response.data;
    const applicationFailure =
      result && typeof result === 'object' &&
      (result.success === false || result.Error || result.error);

    if (response.status < 200 || response.status >= 300 || applicationFailure) {
      const message =
        (result && typeof result === 'object' &&
          (result.message || result.Error || result.error?.message || result.error)) ||
        `HTTP ${response.status}`;
      throw new OrchestratorPluginError(
        'ORCH2_ENGINE_ACTION_FAILED',
        `Engine action '${action?.name || action?.id}' failed: ${String(message)}`,
        502,
        { engineStatus: response.status, response: result }
      );
    }

    return {
      output: result,
      request: {
        routeSource: mapping ? 'postgres-plugin-mapping' : 'saved-workflow-api',
        url,
        method,
        body,
        timeout,
        bindingDiagnostics: resolved.diagnostics,
      },
      resolvedProperties: resolved.properties,
    };
  }

  return { execute };
}

module.exports = {
  OrchestratorPluginError,
  assertLiteralProperties,
  createPluginExecutor,
  resolveActionTemplates,
  resolveSelfTemplate,
  safeEngineTarget,
};
