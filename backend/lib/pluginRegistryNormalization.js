'use strict';

const crypto = require('crypto');

const ALLOWED_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);
const ALLOWED_SCHEMA_STATUSES = new Set(['PLACEHOLDER', 'VERIFIED', 'DEPRECATED']);
const ALLOWED_ACTION_ROLES = new Set(['WORKFLOW', 'CONTROL', 'ALIAS']);
const ALLOWED_ACTION_EXPOSURES = new Set(['PUBLIC', 'INTERNAL', 'NOT_CERTIFIED']);
const MANAGED_MAPPING_FIELDS = Object.freeze([
  'engineContextPath',
  'pluginName',
  'category',
  'actionName',
  'httpMethod',
  'canonicalPath',
  'legacyPath',
  'requestContentTypes',
  'responseContentTypes',
  'bodyType',
  'schemaStatus',
  'inputSchemaJson',
  'outputSchemaJson',
  'responseContractVersion',
  'authenticationType',
  'artifactBehavior',
  'timeoutMs',
  'retryPolicyJson',
  'enabled',
  'deprecated',
  'metadata',
]);

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function cloneJson(value, fallback) {
  if (value === undefined || value === null) return fallback;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return fallback;
  }
}

function sortForStableJson(value) {
  if (Array.isArray(value)) return value.map(sortForStableJson);
  if (!isPlainObject(value)) return value;
  return Object.keys(value)
    .sort()
    .reduce((accumulator, key) => {
      accumulator[key] = sortForStableJson(value[key]);
      return accumulator;
    }, {});
}

function stableStringify(value) {
  return JSON.stringify(sortForStableJson(value));
}

function sha256(value) {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

function normalizePath(value, fallback = null) {
  if (typeof value !== 'string' || value.trim() === '') return fallback;
  let path = value.trim();
  if (!path.startsWith('/')) path = `/${path}`;
  path = path.replace(/\/{2,}/g, '/');
  if (path.length > 1) path = path.replace(/\/+$/, '');
  return path;
}

function normalizeString(value, fallback = null) {
  if (value === undefined || value === null) return fallback;
  const normalized = String(value).trim();
  return normalized === '' ? fallback : normalized;
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => normalizeString(item)).filter(Boolean))];
}

function normalizeMethod(value) {
  return String(value || '').trim().toUpperCase();
}

function normalizeContentType(value) {
  const normalized = String(value || 'application/json')
    .split(';', 1)[0]
    .trim()
    .toLowerCase();
  return normalized || 'application/json';
}

function bodyTypeFor(method, contentType) {
  if (method === 'GET') return 'none';
  if (contentType === 'multipart/form-data') return 'multipart';
  if (contentType === 'application/x-www-form-urlencoded') return 'form-urlencoded';
  if (contentType === 'application/octet-stream') return 'binary';
  if (contentType.startsWith('text/')) return 'text';
  return 'json';
}

function titleCasePlugin(pluginKey) {
  return String(pluginKey || '')
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function clampTimeout(value) {
  const timeout = Number(value);
  if (!Number.isFinite(timeout)) return 30000;
  return Math.min(3600000, Math.max(100, Math.trunc(timeout)));
}

function normalizeSchemaStatus(value) {
  const normalized = String(value || 'PLACEHOLDER').trim().toUpperCase();
  return ALLOWED_SCHEMA_STATUSES.has(normalized) ? normalized : 'PLACEHOLDER';
}

function normalizeActionRole(value) {
  const normalized = String(value || 'WORKFLOW').trim().toUpperCase();
  return ALLOWED_ACTION_ROLES.has(normalized) ? normalized : 'WORKFLOW';
}

function normalizeActionExposure(value) {
  const normalized = String(value || 'PUBLIC').trim().toUpperCase();
  return ALLOWED_ACTION_EXPOSURES.has(normalized) ? normalized : 'PUBLIC';
}

function workflowEligibleFor(role, exposure) {
  return role === 'WORKFLOW' && exposure === 'PUBLIC';
}

function inferArtifactBehavior(fileOutputs) {
  if (!Array.isArray(fileOutputs) || fileOutputs.length === 0) return 'NONE';
  return fileOutputs.length === 1 ? 'OPTIONAL' : 'MULTIPLE';
}

function inferAuthenticationType(descriptor) {
  const secrets = normalizeStringArray(descriptor.secretFields);
  const requirements = normalizeStringArray(descriptor.configurationRequirements);
  if (secrets.length > 0 && requirements.length > 0) return 'SECRET_AND_CONFIGURATION';
  if (secrets.length > 0) return 'SECRET_FIELDS';
  if (requirements.length > 0) return 'ENGINE_CONFIGURATION';
  return null;
}

function extractRegistryActions(payload) {
  if (Array.isArray(payload)) return payload;
  if (!isPlainObject(payload)) {
    throw new Error('Engine action registry response must be an array or response envelope.');
  }
  if (payload.success === false) {
    const message = payload.error && payload.error.message
      ? payload.error.message
      : payload.message || 'Engine action registry request failed.';
    throw new Error(message);
  }
  if (Array.isArray(payload.data)) return payload.data;
  if (Array.isArray(payload.actions)) return payload.actions;
  throw new Error('Engine action registry response does not contain an action array.');
}

function validateDescriptor(descriptor, index) {
  const errors = [];
  const warnings = [];
  const label = `action[${index}]`;
  if (!isPlainObject(descriptor)) {
    return { errors: [`${label} is not an object.`], warnings };
  }

  const actionKey = normalizeString(descriptor.actionKey);
  const pluginKey = normalizeString(descriptor.pluginKey);
  const displayName = normalizeString(descriptor.displayName);
  const method = normalizeMethod(descriptor.httpMethod);
  const canonicalPath = normalizePath(descriptor.canonicalEndpoint);

  if (!actionKey) errors.push(`${label}.actionKey is required.`);
  if (actionKey && !/^[A-Za-z0-9]+(?:[._-][A-Za-z0-9]+)*$/.test(actionKey)) {
    errors.push(`${label}.actionKey '${actionKey}' contains unsupported characters.`);
  }
  if (!pluginKey) errors.push(`${label}.pluginKey is required.`);
  if (!displayName) errors.push(`${label}.displayName is required.`);
  if (!ALLOWED_METHODS.has(method)) {
    errors.push(`${label}.httpMethod '${method || '<empty>'}' is unsupported.`);
  }
  if (!canonicalPath) errors.push(`${label}.canonicalEndpoint is required.`);

  const rawActionRole = descriptor.actionRole;
  const rawActionExposure = descriptor.actionExposure;
  const actionRole = normalizeActionRole(rawActionRole);
  const actionExposure = normalizeActionExposure(rawActionExposure);
  const replacementActionKey = normalizeString(descriptor.replacementActionKey);

  if (
    rawActionRole !== undefined &&
    !ALLOWED_ACTION_ROLES.has(String(rawActionRole).trim().toUpperCase())
  ) {
    errors.push(`${label}.actionRole '${rawActionRole}' is unsupported.`);
  }
  if (
    rawActionExposure !== undefined &&
    !ALLOWED_ACTION_EXPOSURES.has(String(rawActionExposure).trim().toUpperCase())
  ) {
    errors.push(`${label}.actionExposure '${rawActionExposure}' is unsupported.`);
  }
  if (actionRole === 'ALIAS' && !replacementActionKey) {
    errors.push(`${label} '${actionKey || '<unknown>'}' is an ALIAS without replacementActionKey.`);
  }
  if (actionRole !== 'ALIAS' && replacementActionKey) {
    errors.push(`${label} '${actionKey || '<unknown>'}' declares replacementActionKey but is not an ALIAS.`);
  }
  const derivedWorkflowEligible = workflowEligibleFor(actionRole, actionExposure);
  if (
    typeof descriptor.workflowEligible === 'boolean' &&
    descriptor.workflowEligible !== derivedWorkflowEligible
  ) {
    errors.push(
      `${label}.workflowEligible disagrees with actionRole/actionExposure for '${actionKey || '<unknown>'}'.`
    );
  }

  const legacyPaths = normalizeStringArray(descriptor.legacyEndpoints)
    .map((item) => normalizePath(item))
    .filter(Boolean);
  if (legacyPaths.length === 0) {
    warnings.push(`${label} '${actionKey || '<unknown>'}' has no legacy endpoint metadata.`);
  }

  return { errors, warnings };
}

function descriptorToMapping(descriptor, settings, registrySha256) {
  const method = normalizeMethod(descriptor.httpMethod);
  const contentType = normalizeContentType(descriptor.contentType);
  const legacyEndpoints = normalizeStringArray(descriptor.legacyEndpoints)
    .map((item) => normalizePath(item))
    .filter(Boolean);
  const deprecatedCanonicalEndpoints = normalizeStringArray(
    descriptor.deprecatedCanonicalEndpoints
  )
    .map((item) => normalizePath(item))
    .filter(Boolean);
  const fileOutputs = normalizeStringArray(descriptor.fileOutputs);
  const actionVersion = normalizeString(descriptor.version, '1.0.0');
  const responseContractStatus = String(
    descriptor.responseContractStatus || 'LEGACY'
  ).trim().toUpperCase();
  const actionRole = normalizeActionRole(descriptor.actionRole);
  const actionExposure = normalizeActionExposure(descriptor.actionExposure);
  const replacementActionKey = normalizeString(descriptor.replacementActionKey);
  const workflowEligible = workflowEligibleFor(actionRole, actionExposure);
  const policyMetadata = {};
  if (actionRole !== 'WORKFLOW') policyMetadata.actionRole = actionRole;
  if (actionExposure !== 'PUBLIC') policyMetadata.actionExposure = actionExposure;
  if (replacementActionKey) policyMetadata.replacementActionKey = replacementActionKey;
  if (!workflowEligible) policyMetadata.workflowEligible = false;

  return {
    engineVersion: settings.engineVersion,
    engineContextPath: normalizePath(settings.engineContextPath, '/engine'),
    pluginId: normalizeString(descriptor.pluginKey),
    pluginName: titleCasePlugin(descriptor.pluginKey),
    category: normalizeString(descriptor.category),
    actionId: normalizeString(descriptor.actionKey),
    actionName: normalizeString(descriptor.displayName),
    httpMethod: method,
    canonicalPath: normalizePath(descriptor.canonicalEndpoint),
    legacyPath: legacyEndpoints[0] || null,
    requestContentTypes: [contentType],
    responseContentTypes: ['application/json'],
    bodyType: bodyTypeFor(method, contentType),
    schemaStatus: normalizeSchemaStatus(descriptor.schemaStatus),
    inputSchemaJson: cloneJson(descriptor.inputSchema, {}),
    outputSchemaJson: cloneJson(descriptor.outputSchema, {}),
    responseContractVersion:
      responseContractStatus === 'VERIFIED' ? 'V1' : responseContractStatus,
    authenticationType: inferAuthenticationType(descriptor),
    artifactBehavior: inferArtifactBehavior(fileOutputs),
    timeoutMs: clampTimeout(descriptor.defaultTimeoutMs),
    retryPolicyJson: cloneJson(descriptor.retryPolicy, {}),
    enabled: true,
    deprecated: false,
    sourceRegistrySha256: registrySha256,
    metadata: {
      source: 'products-engine-action-registry',
      actionVersion,
      sourceFile: normalizeString(descriptor.sourceFile),
      handlerMethod: normalizeString(descriptor.handlerMethod),
      description: normalizeString(descriptor.description),
      responseContractStatus,
      ...policyMetadata,
      deprecatedCanonicalEndpoints,
      legacyEndpoints,
      requiredFields: normalizeStringArray(descriptor.requiredFields),
      optionalFields: normalizeStringArray(descriptor.optionalFields),
      secretFields: normalizeStringArray(descriptor.secretFields),
      fileInputs: normalizeStringArray(descriptor.fileInputs),
      fileOutputs,
      maximumTimeoutMs: clampTimeout(descriptor.maximumTimeoutMs || 300000),
      idempotent: Boolean(descriptor.idempotent),
      operatingSystems: normalizeStringArray(descriptor.operatingSystems),
      configurationRequirements: normalizeStringArray(
        descriptor.configurationRequirements
      ),
    },
  };
}

function mappingKey(record) {
  return [record.engineVersion, record.pluginId, record.actionId].join('::');
}

function normalizeRegistrySnapshot(actions, settings) {
  if (!Array.isArray(actions)) {
    throw new TypeError('normalizeRegistrySnapshot requires an action array.');
  }
  if (!settings || !normalizeString(settings.engineVersion)) {
    throw new TypeError('A target engineVersion is required.');
  }

  const errors = [];
  const warnings = [];
  actions.forEach((descriptor, index) => {
    const result = validateDescriptor(descriptor, index);
    errors.push(...result.errors);
    warnings.push(...result.warnings);
  });

  const rawRegistrySha256 = sha256(stableStringify(actions));
  const records = actions.map((descriptor) =>
    descriptorToMapping(descriptor, settings, rawRegistrySha256)
  );

  const keyCounts = new Map();
  for (const record of records) {
    const key = mappingKey(record);
    keyCounts.set(key, (keyCounts.get(key) || 0) + 1);
  }
  const duplicateKeys = [...keyCounts.entries()]
    .filter(([, count]) => count > 1)
    .map(([key, count]) => ({ key, count }));
  for (const duplicate of duplicateKeys) {
    errors.push(`Duplicate registry mapping key '${duplicate.key}' (${duplicate.count} rows).`);
  }

  const descriptorByActionKey = new Map(
    actions.map((descriptor) => [normalizeString(descriptor.actionKey), descriptor])
  );
  for (const descriptor of actions) {
    const actionKey = normalizeString(descriptor.actionKey);
    const actionRole = normalizeActionRole(descriptor.actionRole);
    const replacementActionKey = normalizeString(descriptor.replacementActionKey);
    if (actionRole !== 'ALIAS' || !replacementActionKey) continue;

    const replacement = descriptorByActionKey.get(replacementActionKey);
    if (!replacement) {
      errors.push(
        `Alias action '${actionKey}' references missing replacementActionKey '${replacementActionKey}'.`
      );
      continue;
    }
    if (normalizeString(replacement.pluginKey) !== normalizeString(descriptor.pluginKey)) {
      errors.push(
        `Alias action '${actionKey}' crosses plugin ownership to '${replacementActionKey}'.`
      );
    }
    const replacementRole = normalizeActionRole(replacement.actionRole);
    const replacementExposure = normalizeActionExposure(replacement.actionExposure);
    if (!workflowEligibleFor(replacementRole, replacementExposure)) {
      errors.push(
        `Alias action '${actionKey}' references non-workflow replacement '${replacementActionKey}'.`
      );
    }
  }

  const pluginIds = [...new Set(records.map((record) => record.pluginId))].sort();
  const categories = [...new Set(records.map((record) => record.category).filter(Boolean))].sort();
  const placeholderSchemas = records.filter(
    (record) => record.schemaStatus === 'PLACEHOLDER'
  ).length;
  const deprecatedSchemas = records.filter(
    (record) => record.schemaStatus === 'DEPRECATED'
  ).length;
  if (placeholderSchemas > 0) {
    warnings.push(
      `${placeholderSchemas} action(s) use placeholder schemas and must not be treated as verified contracts.`
    );
  }
  if (deprecatedSchemas > 0) {
    warnings.push(`${deprecatedSchemas} action(s) use deprecated schemas.`);
  }

  return {
    records,
    registrySha256: rawRegistrySha256,
    validation: {
      valid: errors.length === 0,
      errors,
      warnings,
      duplicateKeys,
    },
    stats: {
      actions: records.length,
      plugins: pluginIds.length,
      categories: categories.length,
      placeholderSchemas,
      verifiedSchemas: records.filter((record) => record.schemaStatus === 'VERIFIED').length,
      workflowEligibleActions: records.filter(
        (record) => record.metadata.workflowEligible !== false
      ).length,
      aliasActions: records.filter(
        (record) => record.metadata.actionRole === 'ALIAS'
      ).length,
      controlActions: records.filter(
        (record) => record.metadata.actionRole === 'CONTROL'
      ).length,
      notCertifiedActions: records.filter(
        (record) => record.metadata.actionExposure === 'NOT_CERTIFIED'
      ).length,
      legacyResponseContracts: records.filter(
        (record) => record.responseContractVersion === 'LEGACY'
      ).length,
      methods: records.reduce((counts, record) => {
        counts[record.httpMethod] = (counts[record.httpMethod] || 0) + 1;
        return counts;
      }, {}),
      bodyTypes: records.reduce((counts, record) => {
        counts[record.bodyType] = (counts[record.bodyType] || 0) + 1;
        return counts;
      }, {}),
      pluginIds,
      categoriesList: categories,
    },
  };
}

function normalizeJsonColumn(value, fallback) {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return fallback;
    }
  }
  return cloneJson(value, fallback);
}

function normalizeExistingMapping(row) {
  return {
    id: normalizeString(row.id),
    engineVersion: normalizeString(row.engineVersion || row.engine_version),
    engineContextPath: normalizePath(
      row.engineContextPath || row.engine_context_path,
      '/engine'
    ),
    pluginId: normalizeString(row.pluginId || row.plugin_id),
    pluginName: normalizeString(row.pluginName || row.plugin_name),
    category: normalizeString(row.category),
    actionId: normalizeString(row.actionId || row.action_id),
    actionName: normalizeString(row.actionName || row.action_name),
    httpMethod: normalizeMethod(row.httpMethod || row.http_method),
    canonicalPath: normalizePath(row.canonicalPath || row.canonical_path),
    legacyPath: normalizePath(row.legacyPath || row.legacy_path),
    requestContentTypes: normalizeJsonColumn(
      row.requestContentTypes || row.request_content_types,
      []
    ),
    responseContentTypes: normalizeJsonColumn(
      row.responseContentTypes || row.response_content_types,
      []
    ),
    bodyType: normalizeString(row.bodyType || row.body_type, 'json'),
    schemaStatus: normalizeSchemaStatus(row.schemaStatus || row.schema_status),
    inputSchemaJson: normalizeJsonColumn(
      row.inputSchemaJson || row.input_schema_json,
      {}
    ),
    outputSchemaJson: normalizeJsonColumn(
      row.outputSchemaJson || row.output_schema_json,
      {}
    ),
    responseContractVersion: normalizeString(
      row.responseContractVersion || row.response_contract_version,
      '1'
    ),
    authenticationType: normalizeString(
      row.authenticationType || row.authentication_type
    ),
    artifactBehavior: normalizeString(
      row.artifactBehavior || row.artifact_behavior,
      'NONE'
    ),
    timeoutMs: clampTimeout(row.timeoutMs || row.timeout_ms),
    retryPolicyJson: normalizeJsonColumn(
      row.retryPolicyJson || row.retry_policy_json,
      {}
    ),
    enabled: row.enabled !== false,
    deprecated: Boolean(row.deprecated),
    sourceRegistrySha256: normalizeString(
      row.sourceRegistrySha256 || row.source_registry_sha256
    ),
    metadata: normalizeJsonColumn(row.metadata, {}),
    rowVersion: Number(row.rowVersion || row.row_version || 0),
    createdAt: row.createdAt || row.created_at || null,
    updatedAt: row.updatedAt || row.updated_at || null,
  };
}

function changedManagedFields(desired, existing) {
  return MANAGED_MAPPING_FIELDS.filter(
    (field) => stableStringify(desired[field]) !== stableStringify(existing[field])
  );
}

function summarizeRecord(record) {
  return {
    key: mappingKey(record),
    engineVersion: record.engineVersion,
    pluginId: record.pluginId,
    actionId: record.actionId,
    actionName: record.actionName,
    httpMethod: record.httpMethod,
    canonicalPath: record.canonicalPath,
    schemaStatus: record.schemaStatus,
    bodyType: record.bodyType,
  };
}


function mappingSetFingerprint(rows) {
  const normalized = (Array.isArray(rows) ? rows : [])
    .map(normalizeExistingMapping)
    .sort((left, right) => mappingKey(left).localeCompare(mappingKey(right)))
    .map((record) => ({
      id: record.id || null,
      engineVersion: record.engineVersion,
      engineContextPath: record.engineContextPath,
      pluginId: record.pluginId,
      pluginName: record.pluginName,
      category: record.category,
      actionId: record.actionId,
      actionName: record.actionName,
      httpMethod: record.httpMethod,
      canonicalPath: record.canonicalPath,
      legacyPath: record.legacyPath,
      requestContentTypes: record.requestContentTypes,
      responseContentTypes: record.responseContentTypes,
      bodyType: record.bodyType,
      schemaStatus: record.schemaStatus,
      inputSchemaJson: record.inputSchemaJson,
      outputSchemaJson: record.outputSchemaJson,
      responseContractVersion: record.responseContractVersion,
      authenticationType: record.authenticationType,
      artifactBehavior: record.artifactBehavior,
      timeoutMs: record.timeoutMs,
      retryPolicyJson: record.retryPolicyJson,
      enabled: record.enabled,
      deprecated: record.deprecated,
      sourceRegistrySha256: record.sourceRegistrySha256,
      metadata: record.metadata,
      rowVersion: record.rowVersion,
      createdAt: record.createdAt ? new Date(record.createdAt).toISOString() : null,
      updatedAt: record.updatedAt ? new Date(record.updatedAt).toISOString() : null,
    }));
  return sha256(stableStringify(normalized));
}

function compareRegistryToMappings(desiredRecords, existingRows) {
  const desired = desiredRecords.map((record) => ({ ...record }));
  const existing = existingRows.map(normalizeExistingMapping);
  const desiredByKey = new Map(desired.map((record) => [mappingKey(record), record]));
  const existingByKey = new Map(existing.map((record) => [mappingKey(record), record]));

  const added = [];
  const changed = [];
  const unchanged = [];
  const provenanceOnly = [];
  const retired = [];

  for (const desiredRecord of desired) {
    const key = mappingKey(desiredRecord);
    const existingRecord = existingByKey.get(key);
    if (!existingRecord) {
      added.push({ ...summarizeRecord(desiredRecord), desired: desiredRecord });
      continue;
    }

    const fields = changedManagedFields(desiredRecord, existingRecord);
    const registryHashChanged =
      desiredRecord.sourceRegistrySha256 !== existingRecord.sourceRegistrySha256;
    if (fields.length > 0) {
      changed.push({
        ...summarizeRecord(desiredRecord),
        changedFields: fields,
        desired: desiredRecord,
        existing: existingRecord,
      });
    } else if (registryHashChanged) {
      provenanceOnly.push({
        ...summarizeRecord(desiredRecord),
        previousRegistrySha256: existingRecord.sourceRegistrySha256,
        desiredRegistrySha256: desiredRecord.sourceRegistrySha256,
      });
    } else {
      unchanged.push(summarizeRecord(desiredRecord));
    }
  }

  for (const existingRecord of existing) {
    const key = mappingKey(existingRecord);
    if (!desiredByKey.has(key) && existingRecord.enabled && !existingRecord.deprecated) {
      retired.push({ ...summarizeRecord(existingRecord), existing: existingRecord });
    }
  }

  return {
    added,
    changed,
    unchanged,
    provenanceOnly,
    retired,
    summary: {
      desired: desired.length,
      existing: existing.length,
      added: added.length,
      changed: changed.length,
      unchanged: unchanged.length,
      provenanceOnly: provenanceOnly.length,
      retired: retired.length,
    },
  };
}

module.exports = {
  ALLOWED_METHODS,
  ALLOWED_ACTION_ROLES,
  ALLOWED_ACTION_EXPOSURES,
  MANAGED_MAPPING_FIELDS,
  stableStringify,
  sha256,
  normalizePath,
  normalizeContentType,
  normalizeActionRole,
  normalizeActionExposure,
  workflowEligibleFor,
  bodyTypeFor,
  extractRegistryActions,
  normalizeRegistrySnapshot,
  normalizeExistingMapping,
  compareRegistryToMappings,
  mappingKey,
  summarizeRecord,
  mappingSetFingerprint,
};
