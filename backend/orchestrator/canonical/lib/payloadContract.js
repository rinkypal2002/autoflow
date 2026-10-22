"use strict";
/**
 * Payload contract layer — the missing transformation stage between *resolved
 * binding values* and *plugin request bodies*.
 *
 * ── Why this exists ───────────────────────────────────────────────────────
 *
 * `expression.resolveString` deliberately preserves native types: a field whose
 * whole value is one token (`{{previous.rows}}`) resolves to the real array, not
 * to text. That is correct and necessary — it is what lets a node bind a whole
 * array or object from an earlier step.
 *
 * But nothing downstream ever reconciled that value with the type the *plugin*
 * declares. `propertyConfig` says `message` is a `string`; the resolver hands
 * back an array; `JSON.stringify` puts the array on the wire; and the Java DTO
 * field is `private String message`, so Jackson answers:
 *
 *     400  Cannot deserialize value of type `java.lang.String` from Array value
 *
 * That is the single most common cause of "the workflow runs fine until the last
 * node". The last node is the one that consumes upstream data; every node before
 * it was configured with literals.
 *
 * A second, quieter failure comes from `objectUtils.deepParse`, which turns any
 * string starting with `{` or `[` into a real object. A Teams message that
 * legitimately *quotes* JSON, or an email body containing a JSON report, is
 * silently converted from text to structure — and hits the same 400.
 *
 * ── What this module does ────────────────────────────────────────────────
 *
 *   • `coerceToContract`     reconciles a resolved payload with the declared
 *                            field types, and reports every adjustment it made.
 *   • `deepParseWithContract` a contract-aware replacement for `deepParse`:
 *                            it never re-parses a field the plugin declares as
 *                            text.
 *   • `validateAgainstContract` pre-flight checks (missing required fields,
 *                            values that cannot be coerced) so the user gets a
 *                            readable error *before* a request is sent.
 *
 * Conversions are deliberately conservative and total:
 *   - a field with no declared type is never touched
 *   - `File` / `Blob` values are never touched
 *   - nothing is ever dropped silently; every change is reported
 *
 * Pure and framework-free: no React, no DOM, no side effects.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.canonicalType = canonicalType;
exports.actualTypeOf = actualTypeOf;
exports.renderAsText = renderAsText;
exports.coerceToContract = coerceToContract;
exports.deepParseWithContract = deepParseWithContract;
exports.validateAgainstContract = validateAgainstContract;
exports.describeCoercion = describeCoercion;
const objectUtils_1 = require("./objectUtils");
/* -------------------------------------------------------------------------- */
/*                              TYPE NORMALISATION                            */
/* -------------------------------------------------------------------------- */
/** Field types that ultimately travel as a JSON string. */
const TEXT_TYPES = new Set([
    'string', 'text', 'textarea', 'password', 'secret', 'select', 'radio',
    'date', 'time', 'datetime', 'date-time', 'email', 'url', 'uri', 'code',
    'sql', 'query', 'template', 'enum',
]);
const NUMBER_TYPES = new Set(['number', 'integer', 'int', 'long', 'float', 'double', 'decimal']);
const BOOLEAN_TYPES = new Set(['boolean', 'bool', 'checkbox', 'switch', 'toggle']);
const ARRAY_TYPES = new Set(['array', 'list', 'multiselect', 'multi-select', 'user-list', 'tags', 'collection']);
const OBJECT_TYPES = new Set(['object', 'map', 'record', 'json', 'keyvalue', 'key-value', 'dictionary']);
const BINARY_TYPES = new Set(['file', 'binary', 'blob', 'upload', 'attachment']);
/**
 * Reduce a declared `type` / `uiType` to the handful of shapes that matter on
 * the wire. `uiType` is consulted only when `type` is absent or unrecognised,
 * so a `{ type: 'string', uiType: 'select' }` field stays text.
 */
function canonicalType(spec) {
    if (!spec)
        return 'unknown';
    const declared = typeof spec === 'string' ? spec : spec.type;
    const ui = typeof spec === 'string' ? undefined : spec.uiType;
    for (const candidate of [declared, ui]) {
        if (!candidate)
            continue;
        const key = String(candidate).trim().toLowerCase();
        if (TEXT_TYPES.has(key))
            return 'text';
        if (NUMBER_TYPES.has(key))
            return 'number';
        if (BOOLEAN_TYPES.has(key))
            return 'boolean';
        if (ARRAY_TYPES.has(key))
            return 'array';
        if (OBJECT_TYPES.has(key))
            return 'object';
        if (BINARY_TYPES.has(key))
            return 'binary';
    }
    return 'unknown';
}
/** Runtime shape of a value, for diagnostics. */
function actualTypeOf(value) {
    if (value === null)
        return 'null';
    if (value === undefined)
        return 'undefined';
    if (Array.isArray(value))
        return 'array';
    if (typeof File !== 'undefined' && value instanceof File)
        return 'file';
    if (typeof Blob !== 'undefined' && value instanceof Blob)
        return 'blob';
    if ((0, objectUtils_1.isPlainObject)(value))
        return 'object';
    return typeof value;
}
const isBinaryValue = (value) => (typeof File !== 'undefined' && value instanceof File) ||
    (typeof Blob !== 'undefined' && value instanceof Blob);
const UNRESOLVED_TOKEN = /\{\{[\s\S]*?\}\}/;
/* -------------------------------------------------------------------------- */
/*                              TEXT RENDERING                                */
/* -------------------------------------------------------------------------- */
const safeStringify = (value, indent = 0) => {
    try {
        const json = JSON.stringify(value, null, indent);
        return json === undefined ? String(value) : json;
    }
    catch {
        return String(value);
    }
};
const isScalar = (value) => value === null ||
    value === undefined ||
    ['string', 'number', 'boolean'].includes(typeof value);
/**
 * Render any value as the text a plugin's string field expects.
 *
 * `smart` mode is what makes bound data readable rather than merely valid:
 * an array of scalars becomes `a, b, c`, and only genuinely structured data
 * falls back to JSON.
 */
function renderAsText(value, style = 'smart') {
    if (value === null || value === undefined)
        return '';
    if (typeof value === 'string')
        return value;
    if (typeof value === 'number' || typeof value === 'boolean')
        return String(value);
    if (value instanceof Date)
        return value.toISOString();
    if (style === 'smart' && Array.isArray(value) && value.length > 0 && value.every(isScalar)) {
        return value.map((item) => (item === null || item === undefined ? '' : String(item))).join(', ');
    }
    return safeStringify(value, style === 'pretty' ? 2 : 0);
}
const ok = (value) => ({
    value,
    action: 'none',
    severity: 'info',
    message: '',
});
const TRUTHY = new Set(['true', '1', 'yes', 'y', 'on']);
const FALSY = new Set(['false', '0', 'no', 'n', 'off', '']);
function coerceOne(value, target, options, spec) {
    // Never touch binary payloads or values the contract does not describe.
    if (isBinaryValue(value))
        return ok(value);
    if (target === 'unknown' || target === 'binary')
        return ok(value);
    const actual = actualTypeOf(value);
    switch (target) {
        /* ------------------------------- text ------------------------------- */
        case 'text': {
            if (typeof value === 'string') {
                if (options.strictTokens && UNRESOLVED_TOKEN.test(value)) {
                    return {
                        value,
                        action: 'none',
                        severity: 'error',
                        message: 'Still contains an unresolved {{binding}}.',
                    };
                }
                return ok(value);
            }
            if (value === null || value === undefined)
                return ok(value);
            const style = options.textStyle ??
                (canonicalType(spec) === 'text' && String(spec?.type ?? '').toLowerCase() === 'textarea'
                    ? 'pretty'
                    : 'smart');
            const rendered = renderAsText(value, style);
            if (typeof value === 'number' || typeof value === 'boolean') {
                return {
                    value: rendered,
                    action: 'converted',
                    severity: 'info',
                    message: `Converted ${actual} to text.`,
                };
            }
            const joined = Array.isArray(value) && value.length > 0 && value.every(isScalar) && style === 'smart';
            return {
                value: rendered,
                action: joined ? 'joined' : 'serialized',
                severity: 'warning',
                message: joined
                    ? `Bound ${actual} was joined into a comma-separated list because this field expects text.`
                    : `Bound ${actual} was serialised to JSON text because this field expects text.`,
            };
        }
        /* ------------------------------ number ------------------------------ */
        case 'number': {
            if (typeof value === 'number' && Number.isFinite(value))
                return ok(value);
            if (value === null || value === undefined || value === '')
                return ok(value);
            if (typeof value === 'boolean') {
                return { value: value ? 1 : 0, action: 'converted', severity: 'info', message: 'Converted boolean to number.' };
            }
            if (typeof value === 'string') {
                const parsed = Number(value.trim());
                if (Number.isFinite(parsed)) {
                    return { value: parsed, action: 'converted', severity: 'info', message: 'Converted text to number.' };
                }
            }
            return {
                value,
                action: 'none',
                severity: 'error',
                message: `Expected a number but received ${actual}${typeof value === 'string' ? ` ("${value.slice(0, 40)}")` : ''}.`,
            };
        }
        /* ------------------------------ boolean ----------------------------- */
        case 'boolean': {
            if (typeof value === 'boolean')
                return ok(value);
            if (value === null || value === undefined)
                return ok(value);
            if (typeof value === 'number') {
                return { value: value !== 0, action: 'converted', severity: 'info', message: 'Converted number to boolean.' };
            }
            if (typeof value === 'string') {
                const normalized = value.trim().toLowerCase();
                if (TRUTHY.has(normalized))
                    return { value: true, action: 'converted', severity: 'info', message: 'Converted text to boolean.' };
                if (FALSY.has(normalized))
                    return { value: false, action: 'converted', severity: 'info', message: 'Converted text to boolean.' };
            }
            return {
                value,
                action: 'none',
                severity: 'error',
                message: `Expected true or false but received ${actual}.`,
            };
        }
        /* ------------------------------- array ------------------------------ */
        case 'array': {
            if (Array.isArray(value))
                return ok(value);
            if (value === null || value === undefined)
                return ok(value);
            if (typeof value === 'string') {
                const trimmed = value.trim();
                if (trimmed === '')
                    return ok([]);
                if (trimmed.startsWith('[')) {
                    try {
                        const parsed = JSON.parse(trimmed);
                        if (Array.isArray(parsed)) {
                            return { value: parsed, action: 'parsed', severity: 'info', message: 'Parsed JSON text into a list.' };
                        }
                    }
                    catch {
                        /* fall through to the split/wrap rules below */
                    }
                }
                // A comma- or newline-separated entry is the common way a person types
                // a list into a plain input. Honour it before wrapping.
                if (/[,\n]/.test(trimmed)) {
                    const parts = trimmed
                        .split(/[,\n]/)
                        .map((part) => part.trim())
                        .filter((part) => part !== '');
                    return { value: parts, action: 'converted', severity: 'info', message: 'Split text into a list.' };
                }
                return { value: [trimmed], action: 'wrapped', severity: 'info', message: 'Wrapped single value in a list.' };
            }
            return {
                value: [value],
                action: 'wrapped',
                severity: 'info',
                message: `Wrapped ${actual} in a list because this field expects a list.`,
            };
        }
        /* ------------------------------- object ----------------------------- */
        case 'object': {
            if ((0, objectUtils_1.isPlainObject)(value))
                return ok(value);
            if (value === null || value === undefined)
                return ok(value);
            if (typeof value === 'string') {
                const trimmed = value.trim();
                if (trimmed === '')
                    return ok(value);
                if (trimmed.startsWith('{')) {
                    try {
                        const parsed = JSON.parse(trimmed);
                        if ((0, objectUtils_1.isPlainObject)(parsed)) {
                            return { value: parsed, action: 'parsed', severity: 'info', message: 'Parsed JSON text into an object.' };
                        }
                    }
                    catch {
                        return {
                            value,
                            action: 'none',
                            severity: 'error',
                            message: 'Expected an object but the text is not valid JSON.',
                        };
                    }
                }
            }
            return {
                value,
                action: 'none',
                severity: 'error',
                message: `Expected an object but received ${actual}.`,
            };
        }
        default:
            return ok(value);
    }
}
/* -------------------------------------------------------------------------- */
/*                              PAYLOAD COERCION                              */
/* -------------------------------------------------------------------------- */
/**
 * Reconcile a resolved payload with the plugin's declared field types.
 *
 * Only keys the contract describes are touched; everything else passes through
 * untouched, so a plugin that sends extra fields keeps working. Nested `object`
 * and `array` specs are followed one level at a time via `properties` / `items`.
 */
function coerceToContract(payload, contract, options = {}) {
    const issues = [];
    if (!(0, objectUtils_1.isPlainObject)(payload) || !(0, objectUtils_1.isPlainObject)(contract)) {
        return { payload, issues, errors: [], changed: false };
    }
    let changed = false;
    const visit = (value, spec, path, label) => {
        if (!spec)
            return value;
        const target = canonicalType(spec);
        const before = value;
        const result = coerceOne(value, target, options, spec);
        if (result.action !== 'none' || result.severity === 'error') {
            issues.push({
                path,
                label: label || path,
                declaredType: String(spec.type ?? spec.uiType ?? 'unknown'),
                actualType: actualTypeOf(before),
                severity: result.severity,
                action: result.action,
                message: result.message,
            });
        }
        if (result.action !== 'none')
            changed = true;
        let next = result.value;
        // Descend into declared structure.
        if (target === 'object' && (0, objectUtils_1.isPlainObject)(next) && (0, objectUtils_1.isPlainObject)(spec.properties)) {
            const child = { ...next };
            Object.entries(spec.properties).forEach(([childKey, childSpec]) => {
                if (!(childKey in child))
                    return;
                child[childKey] = visit(child[childKey], childSpec, `${path}.${childKey}`, childSpec.label ?? childKey);
            });
            next = child;
        }
        if (target === 'array' && Array.isArray(next)) {
            const itemSpec = spec.items ?? (spec.itemType ? { type: spec.itemType } : undefined);
            if (itemSpec) {
                next = next.map((item, index) => visit(item, itemSpec, `${path}[${index}]`, label));
            }
        }
        return next;
    };
    const output = { ...payload };
    Object.entries(contract).forEach(([key, spec]) => {
        if (!(key in output))
            return;
        output[key] = visit(output[key], spec, key, spec?.label ?? key);
    });
    return {
        payload: output,
        issues,
        errors: issues.filter((issue) => issue.severity === 'error'),
        changed,
    };
}
/* -------------------------------------------------------------------------- */
/*                          CONTRACT-AWARE DEEP PARSE                         */
/* -------------------------------------------------------------------------- */
/**
 * Contract-aware replacement for `objectUtils.deepParse`.
 *
 * `deepParse` turns *any* string starting with `{` or `[` into a real object.
 * That is right for a field the plugin declares as `object` or `array`, and
 * wrong for one it declares as text — a Teams message quoting a JSON payload,
 * or an email body containing a JSON report, becomes structure and the request
 * fails with a 400.
 *
 * This version consults the contract first: text fields are left as text, and
 * only fields whose declared type genuinely wants structure are parsed.
 * Fields the contract does not mention keep the original permissive behaviour,
 * so nothing that works today changes.
 */
function deepParseWithContract(value, contract) {
    const parseLoose = (input) => {
        if (typeof input === 'string') {
            const trimmed = input.trim();
            if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
                try {
                    return JSON.parse(trimmed);
                }
                catch {
                    return input;
                }
            }
            return input;
        }
        if (Array.isArray(input))
            return input.map(parseLoose);
        if ((0, objectUtils_1.isPlainObject)(input)) {
            return Object.fromEntries(Object.entries(input).map(([k, v]) => [k, parseLoose(v)]));
        }
        return input;
    };
    if (!(0, objectUtils_1.isPlainObject)(value) || !(0, objectUtils_1.isPlainObject)(contract)) {
        return parseLoose(value);
    }
    const output = {};
    Object.entries(value).forEach(([key, child]) => {
        const spec = contract[key];
        if (!spec) {
            output[key] = parseLoose(child);
            return;
        }
        const target = canonicalType(spec);
        // Declared text: never re-interpret it as structure.
        if (target === 'text') {
            output[key] = child;
            return;
        }
        // Binary: never touch.
        if (target === 'binary') {
            output[key] = child;
            return;
        }
        // Declared structure: parse, and recurse using the nested contract if any.
        if (target === 'object' && (0, objectUtils_1.isPlainObject)(spec.properties)) {
            const parsed = parseLoose(child);
            output[key] = (0, objectUtils_1.isPlainObject)(parsed)
                ? deepParseWithContract(parsed, spec.properties)
                : parsed;
            return;
        }
        output[key] = parseLoose(child);
    });
    return output;
}
/* -------------------------------------------------------------------------- */
/*                            PRE-FLIGHT VALIDATION                           */
/* -------------------------------------------------------------------------- */
const isEmptyValue = (value) => value === undefined ||
    value === null ||
    (typeof value === 'string' && value.trim() === '') ||
    (Array.isArray(value) && value.length === 0);
/**
 * Check a payload against its contract *before* a request is sent.
 *
 * Returns readable problems the user can act on — a missing required field, a
 * value that cannot be coerced, a binding that never resolved — instead of an
 * opaque backend 400.
 */
function validateAgainstContract(payload, contract, options = {}) {
    if (!(0, objectUtils_1.isPlainObject)(contract))
        return [];
    const issues = [];
    const source = (0, objectUtils_1.isPlainObject)(payload) ? payload : {};
    Object.entries(contract).forEach(([key, spec]) => {
        if (!spec)
            return;
        const value = source[key];
        const label = spec.label ?? key;
        if (spec.required && isEmptyValue(value)) {
            issues.push({
                path: key,
                label,
                declaredType: String(spec.type ?? 'unknown'),
                actualType: actualTypeOf(value),
                severity: 'error',
                action: 'none',
                message: `"${label}" is required but has no value.`,
            });
            return;
        }
        if (typeof value === 'string' && UNRESOLVED_TOKEN.test(value)) {
            issues.push({
                path: key,
                label,
                declaredType: String(spec.type ?? 'unknown'),
                actualType: 'string',
                severity: options.strictTokens ? 'error' : 'warning',
                action: 'none',
                message: `"${label}" still contains an unresolved binding — the source step may not have run, or the path is wrong.`,
            });
        }
    });
    const { errors } = coerceToContract(source, contract, options);
    errors.forEach((error) => {
        if (!issues.some((issue) => issue.path === error.path && issue.severity === 'error')) {
            issues.push(error);
        }
    });
    return issues;
}
/**
 * One-line summary of a coercion report, suitable for the execution log.
 * Returns `''` when nothing needed adjusting.
 */
function describeCoercion(report) {
    if (report.issues.length === 0)
        return '';
    const parts = report.issues
        .filter((issue) => issue.action !== 'none')
        .map((issue) => `${issue.label} (${issue.actualType} → ${issue.declaredType})`);
    return parts.length > 0 ? `Adjusted to match the plugin contract: ${parts.join(', ')}` : '';
}
