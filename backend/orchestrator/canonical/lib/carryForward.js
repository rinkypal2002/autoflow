"use strict";
/**
 * Carry-forward projection — the single place that decides what counts as
 * *business data* and what counts as *technical detail*.
 *
 * Every node's raw output is still stored, logged and bindable exactly as
 * before; nothing is thrown away. What this module adds is a **view** of that
 * output that a business user can read:
 *
 *   • `unwrapEnvelope`      strips transport wrappers ({ success, statusCode,
 *                           message, data: { … } }) down to the payload that
 *                           actually carries the record.
 *   • `projectBusinessData` turns that payload into a short, ordered list of
 *                           meaningful fields — capped, de-duplicated and
 *                           never recursively exploded into hundreds of rows.
 *   • `technicalFields`     collects everything the business view hides, so
 *                           Technical Details / Developer Mode can still show
 *                           it on demand.
 *   • `buildStepPreviewRows` renders a whole run as one row per step for the
 *                           Execution Results → Preview Data table.
 *
 * The executor, the execution context, the binding picker and the execution
 * panel all read from here, so "what the picker offers", "what the preview
 * shows" and "what a token resolves to at run time" can never drift apart.
 *
 * Pure and framework-free: no React, no DOM, no side effects.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.isTechnicalKey = isTechnicalKey;
exports.fieldPriority = fieldPriority;
exports.humanizeFieldLabel = humanizeFieldLabel;
exports.unwrapEnvelope = unwrapEnvelope;
exports.projectBusinessData = projectBusinessData;
exports.technicalFields = technicalFields;
exports.businessValues = businessValues;
exports.technicalValues = technicalValues;
exports.keyBusinessFields = keyBusinessFields;
exports.splitBusinessFields = splitBusinessFields;
exports.summarizeBusinessFields = summarizeBusinessFields;
exports.stepToken = stepToken;
exports.previousToken = previousToken;
exports.formatDuration = formatDuration;
exports.formatStepTime = formatStepTime;
exports.humanizePluginName = humanizePluginName;
exports.buildStepPreviewRows = buildStepPreviewRows;
exports.filterStepPreviewRows = filterStepPreviewRows;
exports.summarizePreviewRows = summarizePreviewRows;
exports.stepPreviewRowsToCsv = stepPreviewRowsToCsv;
const objectUtils_1 = require("./objectUtils");
const executionStatus_1 = require("./executionStatus");
const dataset_1 = require("./dataset");
const pathResolver_1 = require("./pathResolver");
/* -------------------------------------------------------------------------- */
/*                              KEY CLASSIFICATION                            */
/* -------------------------------------------------------------------------- */
/** Normalise a key for comparison: `Employee_Id` / `employee-id` -> `employeeid`. */
const normalizeKey = (key) => String(key ?? '')
    .replace(/[\s_\-.]/g, '')
    .toLowerCase();
/**
 * Fields that are meaningful to a business user, in the order they should be
 * offered. Anything listed here is ALWAYS treated as business data, even if a
 * pattern below would otherwise hide it.
 */
const PRIORITY_FIELDS = [
    // people
    'employeeid',
    'employeename',
    'name',
    'firstname',
    'lastname',
    'fullname',
    'department',
    'designation',
    'email',
    'phone',
    'mobile',
    // database
    'rowsaffected',
    'affectedrows',
    'rowcount',
    'insertedid',
    'generatedkey',
    'generatedid',
    'recordid',
    'primarykey',
    'rows',
    'records',
    // files
    'filepath',
    'filename',
    'fileurl',
    'downloadurl',
    'sheetname',
    // messaging
    'messageid',
    'teamid',
    'channelid',
    'channelname',
    'subject',
    'recipient',
    'to',
    // documents / AI
    'extractedtext',
    'confidence',
    'summary',
    'language',
    // services
    'servicestatus',
    'ticketid',
    'incidentid',
    'orderid',
    'invoiceno',
    'invoicenumber',
    'customerid',
    'accountid',
    'userid',
    // generic business values
    'id',
    'title',
    'description',
    'amount',
    'quantity',
    'total',
    'count',
    'url',
    'text',
    'value',
    'createdat',
    'updatedat',
];
const PRIORITY_INDEX = new Map(PRIORITY_FIELDS.map((field, index) => [field, index]));
/**
 * Transport / diagnostic keys. Available for binding and visible in Technical
 * Details, but never part of the default carry-forward view.
 */
const TECHNICAL_KEYS = new Set([
    // DataSet plumbing. The columns and aggregates are the business data; the
    // handle and contract version are how the platform moves them around.
    'datasetid',
    'schemaversion',
    'estimatedbytes',
    'success',
    'statuscode',
    'httpstatus',
    'httpstatuscode',
    'responsecode',
    'headers',
    'header',
    'requestheaders',
    'responseheaders',
    'request',
    'requestbody',
    'requestid',
    'response',
    'rawjson',
    'raw',
    'rawresponse',
    'rawbody',
    'rawtext',
    'rawdata',
    'debug',
    'debuginfo',
    'stacktrace',
    'stack',
    'executiontime',
    'executiontimems',
    'elapsed',
    'elapsedms',
    'duration',
    'durationms',
    'latency',
    'latencyms',
    'timestamp',
    'timestamps',
    'metadata',
    'meta',
    'internalcontext',
    'internal',
    'internals',
    'trace',
    'traceid',
    'correlationid',
    'spanid',
    'etag',
    'cachecontrol',
    'contentlength',
    'contenttype',
    'cookies',
    'redirected',
    'ok',
    'protocol',
    'apiversion',
    'schemaversion',
    'httpversion',
]);
/**
 * Keys that may sit *around* a payload without making the wrapper meaningful.
 * Used only to decide "is this an envelope?" — a wider net than
 * `TECHNICAL_KEYS`, because `message`, `count` or `error: null` are perfectly
 * normal envelope companions even though they are not technical in isolation.
 */
const WRAPPER_COMPANION_KEYS = new Set([
    ...TECHNICAL_KEYS,
    'message',
    'messages',
    'status',
    'statustext',
    'state',
    'code',
    'error',
    'errors',
    'errorcode',
    'errormessage',
    'warning',
    'warnings',
    'count',
    'total',
    'totalcount',
    'totalrecords',
    'page',
    'pagesize',
    'pagenumber',
    'hasmore',
    'nextpage',
    'took',
    'type',
    'kind',
    'version',
]);
/** Keys whose value is the real payload when everything around them is wrapper. */
const ENVELOPE_KEYS = new Set([
    'data',
    'result',
    'payload',
    'body',
    'content',
    'record',
    'response',
    'output',
    'item',
    'entity',
    'attributes',
    'fields',
    'd',
]);
/**
 * True when a key carries transport or diagnostic detail rather than business
 * data. `status` and `code` are judged by their value: an HTTP `status: 200`
 * is technical, a ticket `status: "Open"` is not.
 */
function isTechnicalKey(key, value) {
    const raw = String(key ?? '');
    if (!raw)
        return true;
    const normalized = normalizeKey(raw);
    if (PRIORITY_INDEX.has(normalized))
        return false;
    // `headers` is judged by its value, the same way `status` and `code` are
    // below. An HTTP header bag is an object; a spreadsheet's column names are an
    // array of strings. Classifying every `headers` as transport noise is what
    // demoted an Excel sheet's column list into Technical Details, where nobody
    // thinks to look for it. Checked before the TECHNICAL_KEYS lookup, because
    // `headers` is a member of that set.
    if (normalized === 'headers' || normalized === 'header') {
        return !Array.isArray(value);
    }
    if (TECHNICAL_KEYS.has(normalized))
        return true;
    // Framework/internal conventions: __proto, $meta, x-request-id.
    if (/^[_$]{1,2}[a-z]/i.test(raw) && normalized !== 'id')
        return true;
    if (/^x[-_]/i.test(raw))
        return true;
    if (normalized === 'status' || normalized === 'code' || normalized === 'state') {
        if (typeof value === 'number')
            return true;
        if (typeof value === 'string' && /^\d{3}$/.test(value.trim()))
            return true;
        return false;
    }
    return false;
}
/** Sort weight for a business field. Lower comes first. */
function fieldPriority(key) {
    const index = PRIORITY_INDEX.get(normalizeKey(key));
    return index === undefined ? PRIORITY_FIELDS.length + 100 : index;
}
/**
 * Turn a field key into a readable label:
 *   employeeId  -> Employee ID
 *   file_path   -> File Path
 *   rowsAffected-> Rows Affected
 */
function humanizeFieldLabel(key) {
    const raw = String(key ?? '').trim();
    if (!raw)
        return '';
    const spaced = raw
        .replace(/[_\-.]+/g, ' ')
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
        .replace(/\s+/g, ' ')
        .trim();
    const ACRONYMS = new Set(['id', 'url', 'api', 'ip', 'sql', 'csv', 'pdf', 'json', 'xml', 'ocr', 'db', 'ui']);
    return spaced
        .split(' ')
        .map((word) => {
        const lower = word.toLowerCase();
        if (ACRONYMS.has(lower))
            return lower.toUpperCase();
        return word.charAt(0).toUpperCase() + word.slice(1);
    })
        .join(' ');
}
/**
 * Strip transport wrappers.
 *
 *   { success: true, statusCode: 200, message: 'Success',
 *     data: { employeeId: 'E101', name: 'Umesh' } }
 *      -> payload = { employeeId, name },  path = 'data'
 *
 * A wrapper is stripped only when an envelope key (`data`, `result`, etc.) is
 * surrounded by wrapper-compatible siblings and there is a strong wrapper
 * signal: an object payload, no siblings, or at least one technical sibling.
 * Payloads may therefore be objects, arrays, scalars or null. Business records
 * such as `{ id, data }` or `{ status: "Open", data }` remain intact.
 */
function unwrapEnvelope(output, maxDepth = 3) {
    let cursor = output;
    let path = '';
    let depth = 0;
    while ((0, objectUtils_1.isPlainObject)(cursor) && depth < maxDepth) {
        const keys = Object.keys(cursor);
        if (keys.length === 0)
            break;
        const envelopeKey = keys.find((key) => ENVELOPE_KEYS.has(normalizeKey(key)));
        if (!envelopeKey)
            break;
        const siblingKeys = keys.filter((key) => key !== envelopeKey);
        const siblingsAreNoise = siblingKeys
            .every((key) => WRAPPER_COMPANION_KEYS.has(normalizeKey(key)));
        if (!siblingsAreNoise)
            break;
        const envelopeValue = cursor[envelopeKey];
        const hasStrongWrapperSignal = (0, objectUtils_1.isPlainObject)(envelopeValue) ||
            siblingKeys.length === 0 ||
            siblingKeys.some((key) => isTechnicalKey(key, cursor[key]));
        if (!hasStrongWrapperSignal)
            break;
        cursor = envelopeValue;
        path = path ? `${path}.${envelopeKey}` : envelopeKey;
        depth += 1;
    }
    return { payload: cursor, path };
}
const EMPTY_PROJECTION = {
    payload: undefined,
    envelopePath: '',
    fields: [],
    technical: [],
    isEmpty: true,
};
/** A value that carries nothing a user would want to read. */
const isBlank = (value) => value === undefined ||
    value === null ||
    (typeof value === 'string' && value.trim() === '') ||
    (Array.isArray(value) && value.length === 0) ||
    ((0, objectUtils_1.isPlainObject)(value) && Object.keys(value).length === 0);
/**
 * Project one node output into its business view.
 *
 * Deliberately shallow and capped: the goal is the handful of values a person
 * would actually bind, not an exhaustive flattening of every leaf in the
 * payload. Blank values are dropped, technical keys are diverted to
 * `technical`, and arrays are summarised (`Array(42)`) with the first row's
 * fields offered through the `first` accessor rather than expanded row by row.
 */
function projectBusinessData(output, options = {}) {
    const { maxFields = 30, maxDepth = 3, maxArrayFields = 8, maxTechnical = 40, } = options;
    if (output === undefined || output === null)
        return EMPTY_PROJECTION;
    // A DataSet is described by its schema, which matters most when the rows did
    // not travel. Walking a handle payload would find `datasetId` and `rowCount`
    // and no columns at all, because there is no first row to lift field names
    // from — the user would see a step that clearly produced data and a picker
    // offering none of it. The schema always knows the columns.
    const datasetView = (0, dataset_1.extractDataSetView)(output);
    if (datasetView) {
        const datasetFields = (0, dataset_1.datasetBindingFields)(datasetView, maxFields).map((field) => ({
            key: field.key,
            path: field.path,
            label: field.label,
            value: field.value,
            valueType: field.valueType,
            preview: field.preview,
            depth: field.depth,
            priority: field.priority,
            isContainer: field.isContainer,
        }));
        return {
            payload: datasetView,
            envelopePath: unwrapEnvelope(output).path,
            fields: datasetFields,
            technical: technicalFields(output, unwrapEnvelope(output).path, maxTechnical),
            isEmpty: datasetFields.length === 0,
        };
    }
    const { payload, path: envelopePath } = unwrapEnvelope(output);
    const fields = [];
    const seenPaths = new Set();
    // ── Shadowed keys ────────────────────────────────────────────────────────
    //
    // `executionContext.buildScope` layers the unwrapped business payload into a
    // step's view and then spreads the RAW output on top, deliberately, so a
    // node's own response always wins a name collision and every token that
    // resolved before keeps resolving.
    //
    // That rule bites when the envelope key and a payload key share a name. The
    // Excel plugin returns `{ success, message, data: { …, data: [rows] } }`, so
    // `previous.data` resolves to the inner wrapper object, not to the rows —
    // even though this projection walked the rows and generated paths as if it
    // did. The picker then advertises `data[0]['Task Name']` against a payload
    // where `data` means something else entirely.
    //
    // Any payload key that also appears at the top level of the raw output is
    // therefore addressed through `$business.`, which `buildScope` populates with
    // the unwrapped record and no payload can shadow. Unaffected keys keep their
    // existing short paths, so no working binding changes.
    const shadowedRoots = new Set();
    if (envelopePath && (0, objectUtils_1.isPlainObject)(output) && (0, objectUtils_1.isPlainObject)(payload)) {
        Object.keys(payload).forEach((key) => {
            // A collision can still exist for a key that is NOT the envelope head —
            // e.g. a payload field literally named `success`. Those stay redirected.
            const isEnvelopeHead = key === envelopePath.split('.')[0];
            if (!isEnvelopeHead &&
                Object.prototype.hasOwnProperty.call(output, key) &&
                output[key] !== payload[key]) {
                shadowedRoots.add(key);
            }
        });
    }
    const push = (field) => {
        if (fields.length >= maxFields)
            return;
        if (seenPaths.has(field.path))
            return;
        seenPaths.add(field.path);
        fields.push(field);
    };
    const makeField = (key, path, value, depth, isContainer = false) => ({
        key,
        path,
        label: humanizeFieldLabel(key),
        value,
        valueType: (0, objectUtils_1.describeType)(value),
        preview: (0, objectUtils_1.summarizeValue)(value, 120),
        depth,
        priority: fieldPriority(key),
        isContainer,
    });
    /** Expand the shape of an array without expanding every row. */
    const walkArray = (value, prefix, key, depth) => {
        push(makeField(key, prefix, value, depth, true));
        if (value.length === 0 || depth >= maxDepth)
            return;
        const firstRow = value[0];
        if (!(0, objectUtils_1.isPlainObject)(firstRow))
            return;
        Object.entries(firstRow)
            .filter(([rowKey, rowValue]) => !isTechnicalKey(rowKey, rowValue) && !isBlank(rowValue))
            .slice(0, maxArrayFields)
            .forEach(([rowKey, rowValue]) => {
            if ((0, objectUtils_1.isPlainObject)(rowValue) || Array.isArray(rowValue))
                return;
            // `[0]` rather than `.first.`, and `appendSegment` rather than string
            // concatenation. The old form produced `data.first.Task Name`, which
            // reads fine and resolved to nothing: `first` was only ever a pipe
            // filter, and an unquoted `Task Name` is ambiguous once brackets exist.
            push(makeField(rowKey, (0, pathResolver_1.appendSegment)(`${prefix}[0]`, rowKey), rowValue, depth + 1));
            // Offer the whole column too. Without this the picker only ever shows a
            // first-row cell, and there is nothing to tell a user that the column
            // form exists — which is how someone ends up sending one value out of
            // fifty-one and assuming the binding engine is at fault.
            const columnValues = value
                .map((row) => ((0, objectUtils_1.isPlainObject)(row) ? row[rowKey] : undefined))
                .filter((cell) => cell !== undefined);
            const columnField = makeField(rowKey, (0, pathResolver_1.appendSegment)(prefix, rowKey), columnValues, depth + 1, true);
            columnField.label = `${columnField.label} (all rows)`;
            push(columnField);
        });
    };
    const walk = (value, prefix, depth) => {
        if (fields.length >= maxFields || depth > maxDepth)
            return;
        if (!(0, objectUtils_1.isPlainObject)(value))
            return;
        Object.entries(value).forEach(([key, child]) => {
            if (fields.length >= maxFields)
                return;
            if (isTechnicalKey(key, child))
                return;
            if (isBlank(child))
                return;
            // Quote through `appendSegment` rather than concatenating with a dot, so
            // a column named `Task Name` becomes `['Task Name']` and survives being
            // re-parsed. Shadowed roots are redirected to `$business.`.
            const base = !prefix && shadowedRoots.has(key) ? '$business' : prefix;
            const path = (0, pathResolver_1.appendSegment)(base, key);
            if (Array.isArray(child)) {
                walkArray(child, path, key, depth);
                return;
            }
            if ((0, objectUtils_1.isPlainObject)(child)) {
                if (depth + 1 > maxDepth) {
                    push(makeField(key, path, child, depth, true));
                    return;
                }
                walk(child, path, depth + 1);
                return;
            }
            push(makeField(key, path, child, depth));
        });
    };
    if ((0, objectUtils_1.isPlainObject)(payload)) {
        walk(payload, '', 0);
    }
    else if (Array.isArray(payload)) {
        // A bare list: bind the whole array, plus the first row's fields.
        walkArray(payload, 'output', 'output', 0);
    }
    else if (!isBlank(payload)) {
        // A bare string/number (OCR text, an id, a status word).
        push(makeField('value', 'value', payload, 0));
    }
    return {
        payload,
        envelopePath,
        fields,
        technical: technicalFields(output, envelopePath, maxTechnical),
        isEmpty: fields.length === 0,
    };
}
/**
 * Everything the business view hides: the wrapper around the payload plus any
 * technical key found inside it. Paths are real binding paths, so a developer
 * can still lift `{{previous.statusCode}}` straight out of Technical Details.
 */
function technicalFields(output, envelopePath = '', max = 40) {
    if (!(0, objectUtils_1.isPlainObject)(output))
        return [];
    const collected = [];
    const seen = new Set();
    const envelopeHead = envelopePath.split('.')[0] ?? '';
    const add = (key, path, value) => {
        if (collected.length >= max || seen.has(path))
            return;
        seen.add(path);
        collected.push({
            key,
            path,
            label: humanizeFieldLabel(key),
            value,
            valueType: (0, objectUtils_1.describeType)(value),
            preview: (0, objectUtils_1.summarizeValue)(value, 120),
        });
    };
    // The wrapper itself — every top-level key that is not the payload. Only a
    // real wrapper counts: when the output was never wrapped, its top-level keys
    // ARE the business record and only genuinely technical ones are diverted.
    Object.entries(output).forEach(([key, value]) => {
        if (key === envelopeHead)
            return;
        if (!envelopeHead && !isTechnicalKey(key, value))
            return;
        add(key, key, value);
    });
    // Technical keys sitting inside the payload.
    const { payload } = unwrapEnvelope(output);
    if ((0, objectUtils_1.isPlainObject)(payload) && payload !== output) {
        Object.entries(payload).forEach(([key, value]) => {
            if (!isTechnicalKey(key, value))
                return;
            add(key, envelopePath ? `${envelopePath}.${key}` : key, value);
        });
    }
    else if (payload === output) {
        Object.entries(payload).forEach(([key, value]) => {
            if (!isTechnicalKey(key, value))
                return;
            add(key, key, value);
        });
    }
    return collected;
}
/**
 * Top-level business values of an output, for layering into the execution
 * scope. Unlike `projectBusinessData` this keeps blanks (a token that resolves
 * to an empty string must still resolve) and does not descend — nesting is
 * traversed naturally by the path resolver.
 */
function businessValues(output) {
    // Layer a dataset's columns, statistics and indexes directly, so
    // `{{previous.statistics.Amount.sum}}` and `{{previous.rows}}` resolve
    // whether or not the rows themselves travelled.
    const datasetView = (0, dataset_1.extractDataSetView)(output);
    if (datasetView)
        return (0, dataset_1.datasetScopeValues)(datasetView);
    const { payload } = unwrapEnvelope(output);
    if (!(0, objectUtils_1.isPlainObject)(payload))
        return {};
    const values = {};
    Object.entries(payload).forEach(([key, value]) => {
        if (isTechnicalKey(key, value))
            return;
        values[key] = value;
    });
    return values;
}
/** Top-level technical values of an output, for the `$technical` accessor. */
function technicalValues(output) {
    if (!(0, objectUtils_1.isPlainObject)(output))
        return {};
    const { payload, path } = unwrapEnvelope(output);
    const head = path.split('.')[0] ?? '';
    const values = {};
    Object.entries(output).forEach(([key, value]) => {
        if (key === head)
            return;
        values[key] = value;
    });
    if ((0, objectUtils_1.isPlainObject)(payload)) {
        Object.entries(payload).forEach(([key, value]) => {
            if (isTechnicalKey(key, value))
                values[key] = value;
        });
    }
    return values;
}
/**
 * The `n` most important business fields, for summaries and table columns.
 *
 * Ordering is deliberate: a plain value a person can read beats a container,
 * a top-level field beats a nested one, and only then does the priority list
 * decide. That is why a database step summarises as "Rows Affected: 3" rather
 * than reaching into the first row for a `name`.
 */
function keyBusinessFields(fields, limit = 4) {
    const ranked = [...fields].sort((a, b) => Number(a.isContainer) - Number(b.isContainer) ||
        a.depth - b.depth ||
        a.priority - b.priority ||
        a.path.localeCompare(b.path));
    const topLevelScalars = ranked.filter((field) => !field.isContainer && field.depth === 0);
    const preferred = topLevelScalars.length > 0 ? topLevelScalars : ranked;
    return preferred.slice(0, limit);
}
/**
 * Split a step's business fields into what a reader needs at a glance and what
 * they only need when they go looking.
 *
 * A step can project up to 30 fields. Rendering all of them the moment a row is
 * expanded is what turns a results table into a debug dump: the fields a person
 * actually reads — `employeeId`, `status`, `rowsAffected` — get buried under
 * nested paths (`rows.first.name`) and whole containers offered for binding.
 *
 * `primary` is therefore the top-level scalars only, ranked the same way
 * `keyBusinessFields` ranks them, and capped. Everything else lands in
 * `secondary`, in payload order, so "show all" reads like the response does.
 *
 * When a payload has no top-level scalars at all — a bare array of rows, say —
 * primary falls back to the shallowest fields, so the default view is never
 * empty while the step demonstrably produced data.
 *
 * Nothing is discarded: `primary.length + secondary.length === fields.length`.
 */
function splitBusinessFields(fields, limit = 8) {
    if (!Array.isArray(fields) || fields.length === 0) {
        return { primary: [], secondary: [] };
    }
    const byImportance = (a, b) => Number(a.isContainer) - Number(b.isContainer) ||
        a.depth - b.depth ||
        a.priority - b.priority ||
        a.path.localeCompare(b.path);
    const topLevelScalars = fields.filter((field) => !field.isContainer && field.depth === 0);
    const source = topLevelScalars.length > 0 ? topLevelScalars : fields;
    const primary = [...source].sort(byImportance).slice(0, Math.max(0, limit));
    const chosen = new Set(primary.map((field) => field.path));
    const secondary = fields.filter((field) => !chosen.has(field.path));
    return { primary, secondary };
}
/** One-line summary of an output, e.g. `Employee ID: E101 · Name: Umesh`. */
function summarizeBusinessFields(fields, limit = 3) {
    const top = keyBusinessFields(fields, limit);
    if (top.length === 0)
        return '';
    return top.map((field) => `${field.label}: ${(0, objectUtils_1.summarizeValue)(field.value, 40)}`).join('  ·  ');
}
/* -------------------------------------------------------------------------- */
/*                                   TOKENS                                   */
/* -------------------------------------------------------------------------- */
/** A node name safe to write as a bare path segment inside a token. */
const isBareName = (name) => /^[A-Za-z0-9 _-]+$/.test(name) && name.trim() === name && name.length > 0;
/**
 * Build a friendly step token:
 *   stepToken('Read Employee Excel', 'employeeId')
 *     -> {{steps.Read Employee Excel.employeeId}}
 *   stepToken('Sync v1.2', 'rowsAffected')
 *     -> {{steps['Sync v1.2'].rowsAffected}}
 *
 * Both forms resolve: the execution context indexes each step by its raw name
 * and by its binding-safe key, and the path parser understands quoted segments.
 */
function stepToken(nameOrKey, path) {
    const name = String(nameOrKey ?? '');
    const head = isBareName(name) ? `steps.${name}` : `steps['${name.replace(/'/g, "\\'")}']`;
    return path ? `{{${head}.${path}}}` : `{{${head}}}`;
}
/** Build a `{{previous.…}}` token. */
function previousToken(path) {
    return path ? `{{previous.${path}}}` : '{{previous}}';
}
/* -------------------------------------------------------------------------- */
/*                                 FORMATTING                                 */
/* -------------------------------------------------------------------------- */
/** `840 ms`, `1.4 s`, `2m 05s`. Never returns an empty cell. */
function formatDuration(ms) {
    if (ms === undefined || ms === null || Number.isNaN(Number(ms)))
        return '—';
    const value = Math.max(0, Number(ms));
    if (value < 1000)
        return `${Math.round(value)} ms`;
    if (value < 60000)
        return `${(value / 1000).toFixed(1)} s`;
    const minutes = Math.floor(value / 60000);
    const seconds = Math.round((value % 60000) / 1000);
    return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
}
/** Local clock time for a step, or `—`. */
function formatStepTime(iso) {
    return (0, executionStatus_1.formatLogTime)(iso) || '—';
}
/** Human label for a plugin/action type: `rest-client` -> `Rest Client`. */
function humanizePluginName(type, category) {
    const source = String(type ?? '').trim();
    if (source)
        return humanizeFieldLabel(source);
    const fallback = String(category ?? '').replace(/-\d+$/, '');
    return fallback ? humanizeFieldLabel(fallback) : 'Step';
}
/**
 * Turn a run's node records into one row per executed step.
 *
 * This is what the Preview Data table renders: every step, in execution order,
 * with a readable summary of what it produced — not the single most recent
 * payload, and not a raw JSON dump.
 */
function buildStepPreviewRows(records = [], options = {}) {
    return [...records]
        .sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0))
        .map((record, index) => {
        const projection = projectBusinessData(record.output, options);
        const nameForToken = record.nodeName || record.stepKey || record.nodeId;
        const fields = projection.fields.map((field) => ({
            ...field,
            token: stepToken(nameForToken, field.path),
        }));
        const technical = projection.technical.map((field) => ({
            ...field,
            token: stepToken(nameForToken, field.path),
        }));
        const meta = (0, executionStatus_1.statusMeta)(record.status);
        const keyFields = keyBusinessFields(fields, 4);
        const datasetView = (0, dataset_1.extractDataSetView)(record.output);
        const outputSummary = record.error
            ? record.error.message
            : datasetView
                ? (0, dataset_1.summarizeDataSet)(datasetView)
                : summarizeBusinessFields(projection.fields, 3) || (0, objectUtils_1.summarizeValue)(projection.payload, 90);
        const searchText = [
            record.nodeName,
            record.stepKey,
            humanizePluginName(record.type, record.category),
            record.type,
            record.status,
            meta.label,
            record.error?.message,
            ...fields.map((field) => `${field.key} ${field.label} ${field.preview}`),
            ...technical.map((field) => `${field.key} ${field.label} ${field.preview}`),
        ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();
        return {
            nodeId: record.nodeId,
            branches: record.branches,
            sequence: record.sequence ?? index + 1,
            stepKey: record.stepKey,
            stepName: record.nodeName || record.stepKey || record.nodeId,
            pluginName: humanizePluginName(record.type, record.category),
            type: record.type,
            category: record.category,
            bucket: record.bucket,
            status: String(record.status ?? 'idle'),
            statusLabel: meta.label,
            tone: meta.tone,
            startedAt: record.startedAt,
            timeLabel: formatStepTime(record.startedAt),
            durationMs: record.durationMs,
            durationLabel: formatDuration(record.durationMs),
            outputSummary,
            keyFields,
            fields,
            technical,
            error: record.error ?? null,
            input: record.input,
            output: record.output,
            outputToken: stepToken(nameForToken, 'output'),
            searchText,
        };
    });
}
/** Apply the Preview Data toolbar filters. */
function filterStepPreviewRows(rows, filter = {}) {
    const term = (filter.term ?? '').trim().toLowerCase();
    const status = (filter.status ?? 'all').toLowerCase();
    return rows.filter((row) => {
        if (term && !row.searchText.includes(term))
            return false;
        if (status === 'all')
            return true;
        const rowStatus = row.status.toLowerCase();
        if (status === 'completed')
            return rowStatus === 'completed' || rowStatus === 'success';
        if (status === 'failed')
            return rowStatus === 'error' || rowStatus === 'failed';
        return rowStatus === status;
    });
}
/** Counts for the status filter chips. */
function summarizePreviewRows(rows) {
    const summary = { total: rows.length, completed: 0, failed: 0, running: 0, skipped: 0 };
    rows.forEach((row) => {
        const status = row.status.toLowerCase();
        if (status === 'completed' || status === 'success')
            summary.completed += 1;
        else if (status === 'error' || status === 'failed')
            summary.failed += 1;
        else if (status === 'running')
            summary.running += 1;
        else if (status === 'skipped')
            summary.skipped += 1;
    });
    return summary;
}
/** Flat, spreadsheet-friendly export of the step table. */
function stepPreviewRowsToCsv(rows) {
    const escape = (value) => {
        const text = value === undefined || value === null ? '' : String(value);
        return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    };
    const header = ['Step', 'Name', 'Plugin', 'Status', 'Started', 'Duration', 'Output summary'];
    const body = rows.map((row) => [
        row.sequence,
        row.stepName,
        row.pluginName,
        row.statusLabel,
        row.timeLabel,
        row.durationLabel,
        row.outputSummary,
    ]
        .map(escape)
        .join(','));
    return [header.join(','), ...body].join('\n');
}
