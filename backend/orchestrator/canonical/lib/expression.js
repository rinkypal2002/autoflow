"use strict";
/**
 * Placeholder / expression resolution engine.
 *
 * This is the single implementation used by the workflow executor, the request
 * builder, the connection-condition evaluator and the Properties Panel preview.
 * The previous inline `interpolate()` in the editor could only do a flat
 * `context[key]` lookup, so `{{previous.employeeId}}` or
 * `{{steps.ReadEmployeeExcel.employeeId}}` never resolved — that is the core
 * limitation this module removes.
 *
 * Supported syntax inside `{{ … }}`:
 *
 *   {{employeeId}}                         bare key (layered scope lookup)
 *   {{previous.employeeId}}                previous node output
 *   {{steps.ReadEmployeeExcel.employeeId}} any earlier node, by name
 *   {{steps['Read Employee Excel'].rows[0].name}}
 *   {{nodes.<nodeId>.output.total}}        any earlier node, by id
 *   {{vars.tenantId}} / {{variables.x}}    workflow variables
 *   {{runtime.cursor}} {{files.report}}    runtime buckets
 *   {{run.id}} {{workflow.name}}           run / workflow metadata
 *   {{env.API_HOST}}                       environment values
 *   {{a.b || 'fallback'}}                  fallback chain (|| and ??)
 *   {{count | number}} {{name | upper}}    filters
 *   {{status | default:'pending'}}
 *   {{previous.rows | pluck:'Amount' | sum}}      column aggregate
 *   {{previous.rows | where:'Status=Open' | count}}
 *   {{previous.statistics.Amount.sum}}            precomputed, no scan
 *
 * Deliberately NOT a general JavaScript evaluator: there is no `eval` and no
 * `new Function`, so a malicious or malformed binding can never execute code.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.FILTERS = void 0;
exports.evaluateToken = evaluateToken;
exports.containsToken = containsToken;
exports.isWholeToken = isWholeToken;
exports.extractTokens = extractTokens;
exports.resolveString = resolveString;
exports.resolveDeep = resolveDeep;
exports.describeResolution = describeResolution;
exports.stripUnresolvedPlaceholders = stripUnresolvedPlaceholders;
exports.evaluateCondition = evaluateCondition;
const objectUtils_1 = require("./objectUtils");
// Path functions come straight from `pathResolver`, NOT via `objectUtils`.
//
// Importing them through `objectUtils` made the fix depend on a manual
// re-export edit in a file this change does not otherwise touch. When that edit
// is missed the failure is silent and deeply confusing: `carryForward` imports
// `pathResolver` directly, so the binding picker updates and previews an
// `Array(10)` column, while the resolver keeps using the old implementation and
// sends a single value. The picker and the runtime disagree, and nothing in the
// UI says why. Importing directly removes the step, and with it the failure.
const pathResolver_1 = require("./pathResolver");
/* -------------------------------------------------------------------------- */
/*                                  CONSTANTS                                 */
/* -------------------------------------------------------------------------- */
/** Matches `{{ … }}`, allowing quoted strings that contain `}` characters. */
const TOKEN_PATTERN = /\{\{\s*([\s\S]*?)\s*\}\}/g;
/** Matches a string that is *entirely* one placeholder. */
const WHOLE_TOKEN_PATTERN = /^\s*\{\{\s*([\s\S]*?)\s*\}\}\s*$/;
const toNumber = (value) => {
    if (typeof value === 'number')
        return value;
    const parsed = Number(String(value ?? '').trim());
    return Number.isNaN(parsed) ? 0 : parsed;
};
/**
 * Value transforms available via the `|` pipe. Kept small, total (never throws)
 * and side-effect free so bindings stay predictable.
 */
exports.FILTERS = {
    upper: (v) => String(v ?? '').toUpperCase(),
    lower: (v) => String(v ?? '').toLowerCase(),
    trim: (v) => String(v ?? '').trim(),
    title: (v) => String(v ?? '')
        .toLowerCase()
        .replace(/\b\w/g, (c) => c.toUpperCase()),
    string: (v) => (v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v)),
    number: (v) => toNumber(v),
    int: (v) => Math.trunc(toNumber(v)),
    round: (v, digits) => {
        const factor = 10 ** Math.max(0, Math.trunc(toNumber(digits ?? 0)));
        return Math.round(toNumber(v) * factor) / factor;
    },
    bool: (v) => {
        if (typeof v === 'boolean')
            return v;
        const normalized = String(v ?? '').trim().toLowerCase();
        return ['true', '1', 'yes', 'y', 'on'].includes(normalized);
    },
    json: (v) => {
        try {
            return JSON.stringify(v ?? null);
        }
        catch {
            return '';
        }
    },
    pretty: (v) => {
        try {
            return JSON.stringify(v ?? null, null, 2);
        }
        catch {
            return '';
        }
    },
    parse: (v) => {
        if (typeof v !== 'string')
            return v;
        try {
            return JSON.parse(v);
        }
        catch {
            return v;
        }
    },
    length: (v) => {
        if (v === null || v === undefined)
            return 0;
        if (Array.isArray(v) || typeof v === 'string')
            return v.length;
        if ((0, objectUtils_1.isPlainObject)(v))
            return Object.keys(v).length;
        return 0;
    },
    first: (v) => (Array.isArray(v) ? v[0] : v),
    last: (v) => (Array.isArray(v) ? v[v.length - 1] : v),
    keys: (v) => ((0, objectUtils_1.isPlainObject)(v) ? Object.keys(v) : []),
    values: (v) => ((0, objectUtils_1.isPlainObject)(v) ? Object.values(v) : Array.isArray(v) ? v : []),
    join: (v, separator) => (Array.isArray(v) ? v.join(separator ?? ', ') : String(v ?? '')),
    split: (v, separator) => String(v ?? '').split(separator ?? ','),
    encodeUri: (v) => encodeURIComponent(String(v ?? '')),
    isoDate: (v) => {
        const date = v instanceof Date ? v : new Date(v ?? Date.now());
        return Number.isNaN(date.getTime()) ? String(v ?? '') : date.toISOString();
    },
    default: (v, fallback) => v === undefined || v === null || v === '' ? fallback ?? '' : v,
    /* ---------------------------- column aggregates -------------------------- */
    //
    // These exist because the token grammar has no function-call syntax, so
    // `Sum(Amount)` cannot be written. A pipeline can express the same thing:
    // `{{previous.rows | pluck:'Amount' | sum}}`.
    //
    // For a dataset the precomputed path `{{previous.statistics.Amount.sum}}` is
    // better and should be preferred — it is O(1) against a server-side cache
    // rather than a scan of whatever rows happen to have reached the browser.
    // These filters are for the cases that path does not cover: an inline array,
    // a filtered subset, or a REST response that is not a dataset at all.
    /** Extracts one field from every row: `rows | pluck:'Amount'`. */
    pluck: (v, field) => {
        if (!Array.isArray(v) || field === undefined || field === null)
            return [];
        const key = String(field);
        return v
            .map((row) => ((0, objectUtils_1.isPlainObject)(row) ? row[key] : undefined))
            .filter((value) => value !== undefined);
    },
    /** Keeps rows matching `Field=Value`: `rows | where:'Status=Open'`. */
    where: (v, condition) => {
        if (!Array.isArray(v) || typeof condition !== 'string')
            return v;
        const separator = condition.indexOf('=');
        if (separator === -1)
            return v;
        const field = condition.slice(0, separator).trim();
        const expected = condition.slice(separator + 1).trim();
        return v.filter((row) => (0, objectUtils_1.isPlainObject)(row) && String(row[field] ?? '') === expected);
    },
    sum: (v) => toNumbers(v).reduce((total, value) => total + value, 0),
    avg: (v) => {
        const numbers = toNumbers(v);
        return numbers.length === 0 ? 0 : numbers.reduce((t, n) => t + n, 0) / numbers.length;
    },
    min: (v) => {
        const numbers = toNumbers(v);
        return numbers.length === 0 ? 0 : Math.min(...numbers);
    },
    max: (v) => {
        const numbers = toNumbers(v);
        return numbers.length === 0 ? 0 : Math.max(...numbers);
    },
    count: (v) => {
        if (Array.isArray(v))
            return v.length;
        if ((0, objectUtils_1.isPlainObject)(v))
            return Object.keys(v).length;
        return v === undefined || v === null || v === '' ? 0 : 1;
    },
    /**
     * Drops null, undefined and empty-string entries.
     *
     * A spreadsheet column routinely has gaps — three of the first four rows of a
     * real sheet often do. Joining such a column without this produces
     * `Marketing_ssss, m, , Product Dev`, where the empty slot reads as a
     * formatting bug rather than as missing data.
     */
    compact: (v) => Array.isArray(v) ? v.filter((item) => item !== null && item !== undefined && item !== '') : v,
    distinct: (v) => (Array.isArray(v) ? Array.from(new Set(v.map((item) => JSON.stringify(item)))).map((s) => JSON.parse(s)) : v),
    /* ---------------------------- presentation ------------------------------ */
    //
    // A column or a row set interpolated into a message renders as raw JSON,
    // which is unreadable in a chat window and useless in an email body. These
    // turn tabular data into something a person can actually read. They are
    // formatting only — none of them changes which rows or values are selected.
    /** First n items: `rows | take:10`. Guards against dumping 50,000 rows into a chat. */
    take: (v, count) => {
        const limit = Math.max(0, Math.trunc(toNumber(count ?? 10)));
        if (Array.isArray(v))
            return v.slice(0, limit);
        if (typeof v === 'string')
            return v.slice(0, limit);
        return v;
    },
    /** Last n items: `rows | tail:5`. */
    tail: (v, count) => {
        const limit = Math.max(0, Math.trunc(toNumber(count ?? 10)));
        return Array.isArray(v) ? v.slice(-limit) : v;
    },
    /**
     * Keep only the named columns of each row: `rows | columns:'Task Name,Assigned to'`.
     *
     * Almost every readable message wants three columns out of a sheet's twenty.
     * Without this the only options are the whole row or a single cell.
     */
    columns: (v, names) => {
        if (!Array.isArray(v) || typeof names !== 'string')
            return v;
        const wanted = names.split(',').map((name) => name.trim()).filter(Boolean);
        if (wanted.length === 0)
            return v;
        return v.map((row) => {
            if (!(0, objectUtils_1.isPlainObject)(row))
                return row;
            const picked = {};
            wanted.forEach((name) => {
                if (Object.prototype.hasOwnProperty.call(row, name))
                    picked[name] = row[name];
            });
            return picked;
        });
    },
    /** Bullet list, one item per line: `column | bullets`. */
    bullets: (v) => toDisplayLines(v).map((line) => `• ${line}`).join('\n'),
    /** Numbered list: `column | numbered`. */
    numbered: (v) => toDisplayLines(v).map((line, index) => `${index + 1}. ${line}`).join('\n'),
    /** Plain lines, no marker: `column | lines`. */
    lines: (v) => toDisplayLines(v).join('\n'),
    /**
     * Markdown pipe table from an array of row objects: `rows | columns:'A,B' | table`.
     * Columns are taken from the first row, so pair it with `columns:` to control them.
     */
    table: (v) => {
        const rows = Array.isArray(v) ? v.filter(objectUtils_1.isPlainObject) : [];
        if (rows.length === 0)
            return '';
        const headers = Object.keys(rows[0]);
        if (headers.length === 0)
            return '';
        const cell = (value) => String(value ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
        return [
            `| ${headers.join(' | ')} |`,
            `| ${headers.map(() => '---').join(' | ')} |`,
            ...rows.map((row) => `| ${headers.map((header) => cell(row[header])).join(' | ')} |`),
        ].join('\n');
    },
    /**
     * HTML table. Teams, Outlook and most webhook targets render HTML but not
     * markdown, so this is usually the one that produces a real table rather than
     * a wall of pipe characters.
     */
    htmlTable: (v) => {
        const rows = Array.isArray(v) ? v.filter(objectUtils_1.isPlainObject) : [];
        if (rows.length === 0)
            return '';
        const headers = Object.keys(rows[0]);
        if (headers.length === 0)
            return '';
        const escape = (value) => String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
        const head = `<tr>${headers.map((header) => `<th>${escape(header)}</th>`).join('')}</tr>`;
        const body = rows
            .map((row) => `<tr>${headers.map((header) => `<td>${escape(row[header])}</td>`).join('')}</tr>`)
            .join('');
        return `<table border="1" cellpadding="4" cellspacing="0"><thead>${head}</thead><tbody>${body}</tbody></table>`;
    },
    /** CSV, for an email attachment or a downstream file write. */
    csv: (v) => {
        const rows = Array.isArray(v) ? v.filter(objectUtils_1.isPlainObject) : [];
        if (rows.length === 0) {
            return Array.isArray(v) ? toDisplayLines(v).join('\n') : '';
        }
        const headers = Object.keys(rows[0]);
        const escape = (value) => {
            const text = String(value ?? '');
            return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
        };
        return [
            headers.map(escape).join(','),
            ...rows.map((row) => headers.map((header) => escape(row[header])).join(',')),
        ].join('\n');
    },
    /** Distinct count, the pipeline form of `statistics.<column>.distinctCount`. */
    distinctCount: (v) => (Array.isArray(v) ? new Set(v.map((item) => JSON.stringify(item))).size : v === undefined ? 0 : 1),
};
/**
 * Renders a value as display lines, dropping blanks.
 *
 * Blanks are dropped because a spreadsheet column routinely has gaps, and a
 * bullet list with three empty bullets in it reads as a rendering fault rather
 * than as missing data.
 */
function toDisplayLines(value) {
    const items = Array.isArray(value) ? value : [value];
    return items
        .filter((item) => item !== null && item !== undefined && item !== '')
        .map((item) => {
        if ((0, objectUtils_1.isPlainObject)(item)) {
            return Object.entries(item)
                .map(([key, cell]) => `${key}: ${cell ?? ''}`)
                .join(' · ');
        }
        return String(item);
    });
}
/**
 * Coerces a value or array into finite numbers, dropping anything that is not
 * one. Blanks in a spreadsheet column are absences, not zeroes, so a sum must
 * skip them rather than fold them in.
 */
function toNumbers(value) {
    const items = Array.isArray(value) ? value : [value];
    const numbers = [];
    items.forEach((item) => {
        if (item === null || item === undefined || item === '')
            return;
        const parsed = typeof item === 'number' ? item : Number(String(item).replace(/,/g, '').trim());
        if (!Number.isNaN(parsed) && Number.isFinite(parsed))
            numbers.push(parsed);
    });
    return numbers;
}
/**
 * Interpret escape sequences inside a quoted literal.
 *
 * Without this, `{{rows | join:'\n'}}` joins on a backslash followed by an `n`,
 * which is never what anyone means. Joining a spreadsheet column onto separate
 * lines is the most common thing to do with one, so the escape has to work.
 *
 * Only the standard set is recognised; an unknown escape keeps its backslash, so
 * a Windows path written as `'C:\\temp'` still survives.
 */
function unescapeLiteral(text) {
    if (!text.includes('\\'))
        return text;
    return text.replace(/\\([nrtbf0'"`\\])/g, (_match, character) => {
        switch (character) {
            case 'n': return '\n';
            case 'r': return '\r';
            case 't': return '\t';
            case 'b': return '\b';
            case 'f': return '\f';
            case '0': return '\0';
            default: return character;
        }
    });
}
function parseLiteral(input) {
    const text = input.trim();
    if (!text)
        return { isLiteral: false };
    if ((text.startsWith("'") && text.endsWith("'") && text.length >= 2) ||
        (text.startsWith('"') && text.endsWith('"') && text.length >= 2) ||
        (text.startsWith('`') && text.endsWith('`') && text.length >= 2)) {
        return { isLiteral: true, value: unescapeLiteral(text.slice(1, -1)) };
    }
    if (text === 'true')
        return { isLiteral: true, value: true };
    if (text === 'false')
        return { isLiteral: true, value: false };
    if (text === 'null')
        return { isLiteral: true, value: null };
    if (text === 'undefined')
        return { isLiteral: true, value: undefined };
    if (/^-?\d+(\.\d+)?$/.test(text))
        return { isLiteral: true, value: Number(text) };
    return { isLiteral: false };
}
/**
 * Split on a top-level operator, ignoring occurrences inside quotes or
 * brackets. Used for `||`, `??` and `|`.
 */
function splitTopLevel(input, operators) {
    const parts = [];
    let buffer = '';
    let quote = null;
    let bracketDepth = 0;
    let index = 0;
    while (index < input.length) {
        const char = input[index];
        if (quote) {
            buffer += char;
            if (char === quote && input[index - 1] !== '\\')
                quote = null;
            index += 1;
            continue;
        }
        if (char === "'" || char === '"' || char === '`') {
            quote = char;
            buffer += char;
            index += 1;
            continue;
        }
        if (char === '[' || char === '(')
            bracketDepth += 1;
        if (char === ']' || char === ')')
            bracketDepth = Math.max(0, bracketDepth - 1);
        if (bracketDepth === 0) {
            const matched = operators.find((op) => input.startsWith(op, index));
            if (matched) {
                parts.push(buffer);
                buffer = '';
                index += matched.length;
                continue;
            }
        }
        buffer += char;
        index += 1;
    }
    parts.push(buffer);
    return parts;
}
/** Split a pipeline on `|` while protecting `||`. */
function splitPipeline(input) {
    const parts = [];
    let buffer = '';
    let quote = null;
    let bracketDepth = 0;
    let index = 0;
    while (index < input.length) {
        const char = input[index];
        if (quote) {
            buffer += char;
            if (char === quote && input[index - 1] !== '\\')
                quote = null;
            index += 1;
            continue;
        }
        if (char === "'" || char === '"' || char === '`') {
            quote = char;
            buffer += char;
            index += 1;
            continue;
        }
        if (char === '[' || char === '(')
            bracketDepth += 1;
        if (char === ']' || char === ')')
            bracketDepth = Math.max(0, bracketDepth - 1);
        if (char === '|' && bracketDepth === 0) {
            if (input[index + 1] === '|') {
                buffer += '||';
                index += 2;
                continue;
            }
            parts.push(buffer);
            buffer = '';
            index += 1;
            continue;
        }
        buffer += char;
        index += 1;
    }
    parts.push(buffer);
    return parts;
}
/* -------------------------------------------------------------------------- */
/*                             TOKEN EVALUATION                               */
/* -------------------------------------------------------------------------- */
function applyFilters(value, filterParts) {
    return filterParts.reduce((accumulator, part) => {
        const text = part.trim();
        if (!text)
            return accumulator;
        const separatorIndex = text.indexOf(':');
        const name = (separatorIndex === -1 ? text : text.slice(0, separatorIndex)).trim();
        const rawArg = separatorIndex === -1 ? undefined : text.slice(separatorIndex + 1).trim();
        const filter = exports.FILTERS[name];
        if (!filter)
            return accumulator;
        let arg = rawArg;
        if (rawArg !== undefined) {
            const literal = parseLiteral(rawArg);
            arg = literal.isLiteral ? literal.value : rawArg;
        }
        try {
            return filter(accumulator, arg);
        }
        catch {
            return accumulator;
        }
    }, value);
}
/**
 * Resolve a single `{{ … }}` token body against a scope.
 * Never throws — an unparseable token simply reports `found: false`.
 */
function evaluateToken(token, scope) {
    const text = String(token ?? '').trim();
    if (!text)
        return { found: false, value: undefined };
    // Fallback chain: first operand that resolves to a non-empty value wins.
    const alternatives = splitTopLevel(text, ['??', '||']);
    for (let i = 0; i < alternatives.length; i += 1) {
        const branch = alternatives[i].trim();
        if (!branch)
            continue;
        const pipelineParts = splitPipeline(branch);
        const head = pipelineParts[0].trim();
        const filterParts = pipelineParts.slice(1);
        const literal = parseLiteral(head);
        if (literal.isLiteral) {
            return { found: true, value: applyFilters(literal.value, filterParts) };
        }
        const segments = (0, pathResolver_1.parsePath)(head);
        if (segments.length === 0)
            continue;
        const exists = (0, pathResolver_1.hasPath)(scope, segments);
        const value = (0, pathResolver_1.getByPath)(scope, segments);
        const isLastAlternative = i === alternatives.length - 1;
        const isEmpty = value === undefined || value === null || value === '';
        if (exists && !isEmpty) {
            return { found: true, value: applyFilters(value, filterParts) };
        }
        if (isLastAlternative && exists) {
            return { found: true, value: applyFilters(value, filterParts) };
        }
        // A filter may legitimately manufacture a value for a path that does not
        // exist — `{{missing | default:'n/a'}}` must yield 'n/a', not the raw token.
        // Filters that simply stringify nothing (e.g. `| upper`) still report the
        // token as unresolved, so genuine gaps stay visible in the UI.
        if (isLastAlternative && filterParts.length > 0) {
            const filtered = applyFilters(undefined, filterParts);
            if (filtered !== undefined && filtered !== null && filtered !== '') {
                return { found: true, value: filtered };
            }
        }
    }
    return { found: false, value: undefined };
}
/* -------------------------------------------------------------------------- */
/*                            PUBLIC RESOLUTION API                           */
/* -------------------------------------------------------------------------- */
/** True when the value contains at least one `{{ … }}` placeholder. */
function containsToken(value) {
    if (typeof value !== 'string')
        return false;
    TOKEN_PATTERN.lastIndex = 0;
    return TOKEN_PATTERN.test(value);
}
/** True when the whole string is exactly one placeholder. */
function isWholeToken(value) {
    return typeof value === 'string' && WHOLE_TOKEN_PATTERN.test(value);
}
/** List every placeholder token found anywhere in a value tree. */
function extractTokens(value, accumulator = []) {
    if (typeof value === 'string') {
        TOKEN_PATTERN.lastIndex = 0;
        let match = TOKEN_PATTERN.exec(value);
        while (match !== null) {
            const token = match[1].trim();
            if (token && !accumulator.includes(token))
                accumulator.push(token);
            match = TOKEN_PATTERN.exec(value);
        }
        return accumulator;
    }
    if (Array.isArray(value)) {
        value.forEach((item) => extractTokens(item, accumulator));
        return accumulator;
    }
    if ((0, objectUtils_1.isPlainObject)(value)) {
        Object.values(value).forEach((item) => extractTokens(item, accumulator));
        return accumulator;
    }
    return accumulator;
}
function stringifyForEmbed(value) {
    if (value === null || value === undefined)
        return '';
    if (typeof value === 'object') {
        try {
            return JSON.stringify(value);
        }
        catch {
            return String(value);
        }
    }
    return String(value);
}
function applyMissing(raw, strategy) {
    switch (strategy) {
        case 'empty':
            return '';
        case 'null':
            return null;
        case 'undefined':
            return undefined;
        case 'keep':
        default:
            return raw;
    }
}
/**
 * Resolve a single string.
 *
 * When the string is exactly one placeholder the resolved value keeps its
 * native type (object, array, number, boolean) instead of being stringified —
 * this is what lets a node bind a whole array or object from an earlier step.
 * Mixed strings are interpolated into text.
 */
function resolveString(template, scope, options = {}) {
    const { onMissing = 'keep' } = options;
    const whole = template.match(WHOLE_TOKEN_PATTERN);
    if (whole) {
        const token = whole[1].trim();
        const { found, value } = evaluateToken(token, scope);
        if (found) {
            options.resolved?.push(token);
            return value;
        }
        options.missing?.push(token);
        return applyMissing(template, onMissing);
    }
    TOKEN_PATTERN.lastIndex = 0;
    return template.replace(TOKEN_PATTERN, (raw, tokenBody) => {
        const token = String(tokenBody).trim();
        const { found, value } = evaluateToken(token, scope);
        if (found) {
            options.resolved?.push(token);
            return stringifyForEmbed(value);
        }
        options.missing?.push(token);
        const replacement = applyMissing(raw, onMissing === 'keep' ? 'keep' : 'empty');
        return replacement === undefined || replacement === null ? '' : String(replacement);
    });
}
/**
 * Recursively resolve every placeholder in a value tree (objects, arrays,
 * strings). Non-cloneable leaves such as File objects are passed through.
 */
function resolveDeep(value, scope, options = {}, depth = 0) {
    const { maxDepth = 12 } = options;
    if (depth > maxDepth)
        return value;
    if (typeof value === 'string') {
        return resolveString(value, scope, options);
    }
    if (Array.isArray(value)) {
        return value.map((item) => resolveDeep(item, scope, options, depth + 1));
    }
    if (typeof File !== 'undefined' && value instanceof File)
        return value;
    if (typeof Blob !== 'undefined' && value instanceof Blob)
        return value;
    if ((0, objectUtils_1.isPlainObject)(value)) {
        const out = {};
        Object.entries(value).forEach(([key, val]) => {
            // Keys can be bound too: { "{{fieldName}}": "x" }
            const resolvedKey = containsToken(key) ? String(resolveString(key, scope, options)) : key;
            out[resolvedKey] = resolveDeep(val, scope, options, depth + 1);
        });
        return out;
    }
    return value;
}
/**
 * Describe how every token in a template resolves. Powers the live preview in
 * the Properties Panel binding editor.
 */
function describeResolution(template, scope) {
    if (typeof template !== 'string')
        return [];
    const results = [];
    TOKEN_PATTERN.lastIndex = 0;
    let match = TOKEN_PATTERN.exec(template);
    while (match !== null) {
        const token = match[1].trim();
        const { found, value } = evaluateToken(token, scope);
        results.push({ token, raw: match[0], found, value });
        match = TOKEN_PATTERN.exec(template);
    }
    return results;
}
/**
 * Replace values that are still an unresolved whole-string placeholder with ''
 * and drop unresolved array elements.
 *
 * Preserved from the original executor: without it, a field a saved node never
 * had is POSTed to the engine as the literal text "{{limit}}", which backends
 * reject. Kept here so the executor and any future caller share one copy.
 */
function stripUnresolvedPlaceholders(value) {
    if (typeof value === 'string') {
        return (WHOLE_TOKEN_PATTERN.test(value) ? '' : value);
    }
    if (Array.isArray(value)) {
        return value
            .filter((item) => !(typeof item === 'string' && WHOLE_TOKEN_PATTERN.test(item)))
            .map(stripUnresolvedPlaceholders);
    }
    if (typeof File !== 'undefined' && value instanceof File)
        return value;
    if ((0, objectUtils_1.isPlainObject)(value)) {
        return Object.fromEntries(Object.entries(value).map(([key, val]) => [key, stripUnresolvedPlaceholders(val)]));
    }
    return value;
}
/**
 * Evaluate a connection condition against the full execution scope.
 *
 * Supports the binding syntax (`{{steps.X.status}} == 'ok'`) plus the simple
 * comparison forms used by existing workflows. Falls back to truthiness of a
 * single bound value. Never uses `eval`/`new Function`, so a bad condition can
 * only ever evaluate to false — it cannot execute code.
 */
function evaluateCondition(condition, scope) {
    const text = String(condition ?? '').trim();
    if (!text)
        return true;
    const comparison = text.match(/^(.*?)\s*(===|!==|==|!=|>=|<=|>|<|\bcontains\b|\bstartsWith\b|\bendsWith\b)\s*(.*)$/);
    const resolveOperand = (operand) => {
        const trimmed = operand.trim();
        if (!trimmed)
            return undefined;
        if (containsToken(trimmed))
            return resolveString(trimmed, scope, { onMissing: 'undefined' });
        const literal = parseLiteral(trimmed);
        if (literal.isLiteral)
            return literal.value;
        const { found, value } = evaluateToken(trimmed, scope);
        return found ? value : undefined;
    };
    if (comparison) {
        const left = resolveOperand(comparison[1]);
        const operator = comparison[2];
        const right = resolveOperand(comparison[3]);
        switch (operator) {
            case '===':
                return left === right;
            case '!==':
                return left !== right;
            case '==':
                return left == right;
            case '!=':
                return left != right;
            case '>':
                return Number(left) > Number(right);
            case '<':
                return Number(left) < Number(right);
            case '>=':
                return Number(left) >= Number(right);
            case '<=':
                return Number(left) <= Number(right);
            case 'contains':
                if (Array.isArray(left))
                    return left.includes(right);
                return String(left ?? '').includes(String(right ?? ''));
            case 'startsWith':
                return String(left ?? '').startsWith(String(right ?? ''));
            case 'endsWith':
                return String(left ?? '').endsWith(String(right ?? ''));
            default:
                return false;
        }
    }
    const value = resolveOperand(text);
    if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        if (normalized === 'false' || normalized === '' || normalized === '0')
            return false;
        return true;
    }
    return Boolean(value);
}
