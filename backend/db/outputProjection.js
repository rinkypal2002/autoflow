'use strict';

/**
 * Enterprise execution-output projection.
 *
 * This module creates a bounded, business-first index from a complete node
 * response. It does not replace or mutate the raw execution snapshot. The
 * resulting rows match autoflow.execution_output_index and can later power the
 * Outputs panel and Binding Picker without recursively flattening every leaf.
 *
 * Design rules:
 *   - redact before classifying or previewing;
 *   - use a declared outputSchema when available;
 *   - fall back to shallow runtime inference;
 *   - represent arrays as a container plus first-row/column fields;
 *   - preserve one RAW root entry rather than indexing every raw leaf;
 *   - never persist a secret preview or secret JSON value;
 *   - keep binding paths compatible with the current React runtime.
 */

const DEFAULT_OPTIONS = Object.freeze({
  maxRows: 200,
  maxBusinessRows: 120,
  maxTechnicalRows: 50,
  maxArrayFields: 12,
  maxDepth: 3,
  maxPreviewLength: 160,
  maxInlineJsonBytes: 2048,
  includeRawRoot: true,
});

const PRIORITY_FIELDS = [
  'employeeid', 'employeename', 'name', 'firstname', 'lastname', 'fullname',
  'department', 'designation', 'email', 'phone', 'mobile',
  'rowsaffected', 'affectedrows', 'rowcount', 'insertedid', 'generatedkey',
  'generatedid', 'recordid', 'primarykey', 'rows', 'records',
  'filepath', 'filename', 'fileurl', 'downloadurl', 'sheetname',
  'messageid', 'teamid', 'channelid', 'channelname', 'subject', 'recipient',
  'to', 'extractedtext', 'confidence', 'summary', 'language',
  'servicestatus', 'ticketid', 'incidentid', 'orderid', 'invoiceno',
  'invoicenumber', 'customerid', 'accountid', 'userid',
  'id', 'title', 'description', 'amount', 'quantity', 'total', 'count',
  'url', 'text', 'value', 'createdat', 'updatedat',
];

const PRIORITY_INDEX = new Map(
  PRIORITY_FIELDS.map((field, index) => [field, index])
);

const TECHNICAL_KEYS = new Set([
  'datasetid', 'schemaversion', 'estimatedbytes', 'success', 'statuscode',
  'httpstatus', 'httpstatuscode', 'responsecode', 'headers', 'header',
  'requestheaders', 'responseheaders', 'request', 'requestbody', 'requestid',
  'response', 'rawjson', 'raw', 'rawresponse', 'rawbody', 'rawtext', 'rawdata',
  'debug', 'debuginfo', 'stacktrace', 'stack', 'executiontime',
  'executiontimems', 'elapsed', 'elapsedms', 'duration', 'durationms',
  'latency', 'latencyms', 'timestamp', 'timestamps', 'metadata', 'meta',
  'internalcontext', 'internal', 'internals', 'trace', 'traceid',
  'correlationid', 'spanid', 'etag', 'cachecontrol', 'contentlength',
  'contenttype', 'cookies', 'redirected', 'ok', 'protocol', 'apiversion',
  'httpversion',
]);

const WRAPPER_COMPANION_KEYS = new Set([
  ...TECHNICAL_KEYS,
  'message', 'messages', 'status', 'statustext', 'state', 'code', 'error',
  'errors', 'errorcode', 'errormessage', 'warning', 'warnings', 'count',
  'total', 'totalcount', 'totalrecords', 'page', 'pagesize', 'pagenumber',
  'hasmore', 'nextpage', 'took', 'type', 'kind', 'version',
]);

const ENVELOPE_KEYS = new Set([
  'data', 'result', 'payload', 'body', 'content', 'record', 'response',
  'output', 'item', 'entity', 'attributes', 'fields', 'd',
]);

const SECRET_NORMALIZED_KEYS = new Set([
  'password', 'passwd', 'pwd', 'secret', 'token', 'accesstoken',
  'refreshtoken', 'clientsecret', 'apikey', 'authorization', 'cookie',
  'privatekey', 'connectionstring', 'credential', 'credentials',
]);

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value
    : null;
}

function normalizeKey(key) {
  return String(key ?? '')
    .replace(/[^A-Za-z0-9]/g, '')
    .toLowerCase();
}

function isSensitiveKey(key) {
  const normalized = normalizeKey(key);
  if (!normalized) return false;
  if (SECRET_NORMALIZED_KEYS.has(normalized)) return true;
  return /(?:password|passwd|secret|access(?:token)?|refresh(?:token)?|clientsecret|apikey|authorization|privatekey|connectionstring|credential)/i
    .test(normalized);
}

function sanitizeSensitive(value, key = '', seen = new WeakSet()) {
  if (isSensitiveKey(key)) return '••••••••';

  if (value === null || value === undefined) return null;
  if (['string', 'number', 'boolean'].includes(typeof value)) return value;
  if (typeof value !== 'object') return String(value);

  if (seen.has(value)) return '[Circular]';
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeSensitive(item, '', seen));
  }

  const result = {};
  for (const [childKey, childValue] of Object.entries(value)) {
    result[childKey] = sanitizeSensitive(childValue, childKey, seen);
  }
  return result;
}

function isTechnicalKey(key, value) {
  const raw = String(key ?? '');
  if (!raw) return true;
  const normalized = normalizeKey(raw);

  if (PRIORITY_INDEX.has(normalized)) return false;
  if (isSensitiveKey(raw)) return true;

  if (normalized === 'headers' || normalized === 'header') {
    return !Array.isArray(value);
  }
  if (TECHNICAL_KEYS.has(normalized)) return true;
  if (/^[_$]{1,2}[a-z]/i.test(raw) && normalized !== 'id') return true;
  if (/^x[-_]/i.test(raw)) return true;

  if (['status', 'code', 'state'].includes(normalized)) {
    if (typeof value === 'number') return true;
    if (typeof value === 'string' && /^\d{3}$/.test(value.trim())) return true;
  }

  return false;
}

function fieldPriority(key) {
  return PRIORITY_INDEX.get(normalizeKey(key)) ?? PRIORITY_FIELDS.length + 100;
}

function humanizeFieldLabel(key) {
  const raw = String(key ?? '').trim();
  if (!raw) return '';

  const spaced = raw
    .replace(/[_\-.]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim();

  const acronyms = new Set([
    'id', 'url', 'api', 'ip', 'sql', 'csv', 'pdf', 'json', 'xml', 'ocr',
    'db', 'ui', 'http', 'https',
  ]);

  return spaced
    .split(' ')
    .map((word) => {
      const lower = word.toLowerCase();
      if (acronyms.has(lower)) return lower.toUpperCase();
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(' ');
}

function inferValueType(value, declaredKind = null) {
  if (declaredKind) {
    const normalized = String(declaredKind).toLowerCase();
    if (['string', 'number', 'boolean', 'object', 'array', 'dataset', 'file', 'binary'].includes(normalized)) {
      return normalized.toUpperCase();
    }
  }
  if (value === null || value === undefined) return 'NULL';
  if (Array.isArray(value)) return 'ARRAY';
  if (typeof value === 'object') return 'OBJECT';
  if (typeof value === 'string') return 'STRING';
  if (typeof value === 'number') return Number.isInteger(value) ? 'INTEGER' : 'NUMBER';
  if (typeof value === 'boolean') return 'BOOLEAN';
  return 'STRING';
}

function summarizeValue(value, maxLength = DEFAULT_OPTIONS.maxPreviewLength) {
  let text;
  if (value === null || value === undefined) text = 'null';
  else if (Array.isArray(value)) text = `Array(${value.length})`;
  else if (typeof value === 'object') text = `{${Object.keys(value).slice(0, 6).join(', ')}}`;
  else text = String(value);

  return text.length > maxLength
    ? `${text.slice(0, Math.max(0, maxLength - 1))}…`
    : text;
}

function jsonBytes(value) {
  try {
    return Buffer.byteLength(JSON.stringify(value), 'utf8');
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

function inlineValue(value, options) {
  if (value === undefined) return null;
  if (jsonBytes(value) > options.maxInlineJsonBytes) return null;
  return value;
}

function isBlank(value) {
  return value === undefined || value === null ||
    (typeof value === 'string' && value.trim() === '') ||
    (Array.isArray(value) && value.length === 0) ||
    (asObject(value) && Object.keys(value).length === 0);
}

function appendSegment(base, key) {
  const segment = String(key ?? '');
  const bare = /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(segment);
  if (!base) return bare ? segment : `['${segment.replace(/'/g, "\\'")}']`;
  return bare
    ? `${base}.${segment}`
    : `${base}['${segment.replace(/'/g, "\\'")}']`;
}

function getPath(value, path) {
  if (!path) return value;
  const parts = String(path).split('.').filter(Boolean);
  let current = value;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    current = current[part];
  }
  return current;
}

function stepHead(stepName) {
  const name = String(stepName ?? '').trim();
  const safe = /^[A-Za-z0-9 _-]+$/.test(name) && name.length > 0;
  return safe
    ? `steps.${name}`
    : `steps['${name.replace(/'/g, "\\'")}']`;
}

function bindingPath(stepName, relativePath = '') {
  const head = stepHead(stepName);
  return relativePath ? `${head}.${relativePath}` : head;
}

function unwrapEnvelope(output, declaredEnvelope = '') {
  if (declaredEnvelope) {
    const declaredPayload = getPath(output, declaredEnvelope);
    if (declaredPayload !== undefined) {
      return { payload: declaredPayload, path: declaredEnvelope, source: 'DECLARED' };
    }
  }

  let current = output;
  const path = [];

  for (let depth = 0; depth < 3; depth += 1) {
    const object = asObject(current);
    if (!object) break;

    const keys = Object.keys(object);
    const candidate = keys.find((key) => ENVELOPE_KEYS.has(normalizeKey(key)));
    if (!candidate) break;

    const siblings = keys.filter((key) => key !== candidate);
    const looksLikeEnvelope = siblings.every((key) =>
      WRAPPER_COMPANION_KEYS.has(normalizeKey(key)) || isTechnicalKey(key, object[key])
    );
    if (!looksLikeEnvelope) break;

    current = object[candidate];
    path.push(candidate);
  }

  return { payload: current, path: path.join('.'), source: path.length ? 'INFERRED' : 'NONE' };
}

function extractOutputSchema(nodeJson) {
  const object = asObject(nodeJson);
  if (!object) return null;
  const candidates = [
    object.outputSchema,
    object.action && object.action.outputSchema,
    object.definition && object.definition.outputSchema,
    object.metadata && object.metadata.outputSchema,
  ];
  return candidates.find((candidate) => asObject(candidate) && Array.isArray(candidate.fields)) || null;
}

function createRow({
  stepName,
  key,
  relativePath,
  value,
  fieldKind,
  ordinal,
  label,
  declaredKind,
  visibility,
  source,
  options,
  metadata = {},
}) {
  const secret = isSensitiveKey(key) || metadata.isSecret === true;
  const parentPath = relativePath.includes('.')
    ? relativePath.slice(0, relativePath.lastIndexOf('.'))
    : null;

  return {
    fieldKey: String(key || 'output'),
    displayName: label || humanizeFieldLabel(key || 'output') || 'Output',
    parentPath,
    fieldPath: relativePath || '$',
    bindingPath: bindingPath(stepName, relativePath),
    valueType: inferValueType(value, declaredKind),
    fieldKind,
    ordinalPosition: ordinal,
    isSecret: secret,
    isSearchable: !secret,
    valuePreview: secret ? null : summarizeValue(value, options.maxPreviewLength),
    valueJson: secret ? null : inlineValue(value, options),
    metadata: {
      projectionSource: source,
      visibility: visibility || (fieldKind === 'TECHNICAL' ? 'technical' : 'secondary'),
      container: Boolean(value && typeof value === 'object'),
      ...metadata,
    },
  };
}

function projectDeclaredFields({ payload, schema, stepName, options, rows, seen }) {
  const fields = Array.isArray(schema.fields) ? schema.fields : [];
  let ordinal = rows.length;

  const add = (field, relativePath, value, extra = {}) => {
    if (rows.length >= options.maxRows || seen.has(relativePath)) return;
    const visibility = field.visibility || 'secondary';
    const kind = visibility === 'technical' || isTechnicalKey(field.path, value)
      ? 'TECHNICAL'
      : 'BUSINESS';

    if (kind === 'BUSINESS' && rows.filter((row) => row.fieldKind === 'BUSINESS').length >= options.maxBusinessRows) return;
    if (kind === 'TECHNICAL' && rows.filter((row) => row.fieldKind === 'TECHNICAL').length >= options.maxTechnicalRows) return;

    seen.add(relativePath);
    rows.push(createRow({
      stepName,
      key: field.path.split('.').pop() || field.path,
      relativePath,
      value,
      fieldKind: kind,
      ordinal: ordinal++,
      label: field.label,
      declaredKind: field.kind,
      visibility,
      source: 'DECLARED_SCHEMA',
      options,
      metadata: {
        optional: Boolean(field.optional),
        description: field.description || null,
        providesColumns: Boolean(field.providesColumns),
        observed: value !== undefined,
        ...extra,
      },
    }));
  };

  for (const field of fields) {
    if (!field || !field.path || rows.length >= options.maxRows) continue;
    const value = getPath(payload, field.path);
    add(field, field.path, value);

    if (Array.isArray(value) && asObject(value[0]) && Array.isArray(field.itemFields)) {
      for (const item of field.itemFields.slice(0, options.maxArrayFields)) {
        const itemValue = getPath(value[0], item.path);
        const firstPath = appendSegment(`${field.path}[0]`, item.path);
        add(item, firstPath, itemValue, { arrayProjection: 'FIRST_ROW' });

        const columnValues = value
          .map((row) => asObject(row) ? getPath(row, item.path) : undefined)
          .filter((cell) => cell !== undefined);
        const columnPath = appendSegment(field.path, item.path);
        add(
          { ...item, label: `${item.label || humanizeFieldLabel(item.path)} (all rows)`, kind: 'array' },
          columnPath,
          columnValues,
          { arrayProjection: 'COLUMN' }
        );
      }
    }
  }
}

function projectObservedFields({ payload, stepName, options, rows, seen }) {
  let ordinal = rows.length;
  let businessCount = rows.filter((row) => row.fieldKind === 'BUSINESS').length;
  let technicalCount = rows.filter((row) => row.fieldKind === 'TECHNICAL').length;

  const add = (key, relativePath, value, fieldKind, depth, extra = {}) => {
    if (rows.length >= options.maxRows || seen.has(relativePath) || isBlank(value)) return;
    if (fieldKind === 'BUSINESS' && businessCount >= options.maxBusinessRows) return;
    if (fieldKind === 'TECHNICAL' && technicalCount >= options.maxTechnicalRows) return;

    seen.add(relativePath);
    rows.push(createRow({
      stepName,
      key,
      relativePath,
      value,
      fieldKind,
      ordinal: ordinal++,
      source: 'OBSERVED_HEURISTIC',
      options,
      metadata: { depth, priority: fieldPriority(key), ...extra },
    }));
    if (fieldKind === 'BUSINESS') businessCount += 1;
    else technicalCount += 1;
  };

  const walkArray = (array, prefix, key, depth, kind) => {
    add(key, prefix, array, kind, depth, { arrayLength: array.length, arrayProjection: 'CONTAINER' });
    if (!array.length || depth >= options.maxDepth || !asObject(array[0])) return;

    Object.entries(array[0])
      .filter(([rowKey, rowValue]) => !isBlank(rowValue))
      .slice(0, options.maxArrayFields)
      .forEach(([rowKey, rowValue]) => {
        const rowKind = isTechnicalKey(rowKey, rowValue) ? 'TECHNICAL' : kind;
        if (rowValue && typeof rowValue === 'object') return;
        add(rowKey, appendSegment(`${prefix}[0]`, rowKey), rowValue, rowKind, depth + 1, { arrayProjection: 'FIRST_ROW' });

        const columnValues = array
          .map((row) => asObject(row) ? row[rowKey] : undefined)
          .filter((cell) => cell !== undefined);
        add(rowKey, appendSegment(prefix, rowKey), columnValues, rowKind, depth + 1, { arrayProjection: 'COLUMN' });
      });
  };

  const walk = (value, prefix, depth, inheritedKind = 'BUSINESS') => {
    if (rows.length >= options.maxRows || depth > options.maxDepth) return;
    const object = asObject(value);
    if (!object) return;

    for (const [key, child] of Object.entries(object)) {
      if (rows.length >= options.maxRows || isBlank(child)) continue;
      const path = appendSegment(prefix, key);
      const kind = isTechnicalKey(key, child) ? 'TECHNICAL' : inheritedKind;

      if (Array.isArray(child)) {
        walkArray(child, path, key, depth, kind);
      } else if (asObject(child)) {
        if (kind === 'TECHNICAL' || depth + 1 > options.maxDepth) {
          add(key, path, child, kind, depth, { container: true });
        } else {
          walk(child, path, depth + 1, kind);
        }
      } else {
        add(key, path, child, kind, depth);
      }
    }
  };

  if (asObject(payload)) {
    walk(payload, '', 0);
  } else if (Array.isArray(payload)) {
    walkArray(payload, 'output', 'output', 0, 'BUSINESS');
  } else if (!isBlank(payload)) {
    add('value', 'value', payload, 'BUSINESS', 0);
  }
}

function projectWrapperTechnical({ output, envelopePath, stepName, options, rows, seen }) {
  const object = asObject(output);
  if (!object || !envelopePath) return;
  let ordinal = rows.length;
  let technicalCount = rows.filter((row) => row.fieldKind === 'TECHNICAL').length;
  const envelopeHead = envelopePath.split('.')[0];

  for (const [key, value] of Object.entries(object)) {
    if (key === envelopeHead || rows.length >= options.maxRows || technicalCount >= options.maxTechnicalRows) continue;
    if (seen.has(key) || isBlank(value)) continue;
    seen.add(key);
    rows.push(createRow({
      stepName,
      key,
      relativePath: key,
      value,
      fieldKind: 'TECHNICAL',
      ordinal: ordinal++,
      source: 'WRAPPER',
      options,
      metadata: { envelopePath },
    }));
    technicalCount += 1;
  }
}

function deduplicateAndSort(rows, options) {
  const byPath = new Map();
  for (const row of rows) {
    if (!byPath.has(row.bindingPath)) byPath.set(row.bindingPath, row);
  }

  const kindRank = { BUSINESS: 0, TECHNICAL: 1, RAW: 2 };
  return [...byPath.values()]
    .sort((a, b) =>
      (kindRank[a.fieldKind] ?? 9) - (kindRank[b.fieldKind] ?? 9) ||
      (a.metadata.priority ?? 999) - (b.metadata.priority ?? 999) ||
      a.ordinalPosition - b.ordinalPosition ||
      a.fieldPath.localeCompare(b.fieldPath)
    )
    .slice(0, options.maxRows)
    .map((row, index) => ({ ...row, ordinalPosition: index }));
}

function projectExecutionOutput(input, suppliedOptions = {}) {
  const options = { ...DEFAULT_OPTIONS, ...suppliedOptions };
  const stepName = String(input.stepName || input.nodeName || input.nodeKey || 'Step');
  const sanitizedOutput = sanitizeSensitive(input.output);
  const schema = input.outputSchema || extractOutputSchema(input.nodeJson);
  const unwrapped = unwrapEnvelope(sanitizedOutput, schema && schema.envelope);
  const rows = [];
  const seen = new Set();

  if (schema && Array.isArray(schema.fields) && schema.fields.length) {
    projectDeclaredFields({ payload: unwrapped.payload, schema, stepName, options, rows, seen });
  }

  projectObservedFields({ payload: unwrapped.payload, stepName, options, rows, seen });
  projectWrapperTechnical({ output: sanitizedOutput, envelopePath: unwrapped.path, stepName, options, rows, seen });

  if (options.includeRawRoot && rows.length < options.maxRows) {
    rows.push(createRow({
      stepName,
      key: 'output',
      relativePath: 'output',
      value: sanitizedOutput,
      fieldKind: 'RAW',
      ordinal: rows.length,
      label: 'Complete Raw Output',
      source: 'RAW_ROOT',
      options,
      metadata: { envelopePath: unwrapped.path || null },
    }));
  }

  const finalRows = deduplicateAndSort(rows, options);
  const counts = finalRows.reduce((summary, row) => {
    summary[row.fieldKind] = (summary[row.fieldKind] || 0) + 1;
    if (row.isSecret) summary.SECRET += 1;
    return summary;
  }, { BUSINESS: 0, TECHNICAL: 0, RAW: 0, SECRET: 0 });

  return {
    rows: finalRows,
    sanitizedOutput,
    payload: unwrapped.payload,
    envelopePath: unwrapped.path,
    envelopeSource: unwrapped.source,
    schemaSource: schema ? 'DECLARED_SCHEMA' : 'OBSERVED_HEURISTIC',
    schemaVersion: schema && schema.version ? String(schema.version) : null,
    counts,
    truncated: rows.length > finalRows.length || finalRows.length >= options.maxRows,
    options,
  };
}

module.exports = {
  DEFAULT_OPTIONS,
  normalizeKey,
  isSensitiveKey,
  sanitizeSensitive,
  isTechnicalKey,
  humanizeFieldLabel,
  inferValueType,
  appendSegment,
  bindingPath,
  unwrapEnvelope,
  extractOutputSchema,
  projectExecutionOutput,
};
