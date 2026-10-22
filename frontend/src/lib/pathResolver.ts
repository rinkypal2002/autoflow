/**
 * Path parsing and resolution for the binding engine.
 *
 * Extracted into its own module so the grammar has one definition. `parsePath`,
 * `getByPath` and `hasPath` currently live in `objectUtils.ts`; re-export these
 * from there (see the two-line change in FIX_NOTES.md) and every caller —
 * `expression.evaluateToken`, the Properties Panel preview, the executor —
 * picks up the same grammar at once.
 *
 * ── Supported grammar ─────────────────────────────────────────────────────
 *
 *   a.b.c                    dot segments
 *   a.0.b                    numeric dot segment (array index)
 *   a[0].b                   bracket index
 *   a[-1]                    negative index, counted from the end
 *   a['Task Name']           quoted key — spaces, dots, brackets all safe
 *   a["Task Name"]           double quotes
 *   a[`Task Name`]           backticks
 *   a['O\'Brien']            escaped quote inside a quoted key
 *   a.first / a.last         virtual accessors, arrays only
 *   a.Task Name              unquoted key containing spaces
 *   rows['Task Name']        whole column, across every row
 *   rows[0]['Task Name']     one cell
 *
 * ── Why `first` is a path segment here ────────────────────────────────────
 *
 * `carryForward.walkArray` generates binding tokens of the form
 * `<path>.first.<column>`, which is what the picker hands the user. But `first`
 * existed only as a pipe filter (`| first`), never as a path segment, so every
 * token the picker produced for a table column resolved to nothing. Rather than
 * silently changing what the picker advertises and orphaning every binding
 * already saved in a workflow, the resolver now honours the form the picker has
 * been emitting all along.
 *
 * It is applied only when the cursor is an actual Array. A plain object with a
 * real `first` property therefore keeps resolving to its own value — arrays have
 * no own `first` property, so there is no shape where this can shadow real data.
 *
 * ── Prototype safety ──────────────────────────────────────────────────────
 *
 * `__proto__`, `constructor` and `prototype` are rejected as segments. A binding
 * is user-supplied text; without this, `{{a.constructor.prototype.x}}` reaches
 * into the prototype chain, and on the write side that is a prototype-pollution
 * primitive.
 */

/* -------------------------------------------------------------------------- */
/*                                  CONSTANTS                                 */
/* -------------------------------------------------------------------------- */

/** Segments that must never traverse, whatever the input says. */
const BLOCKED_SEGMENTS = new Set(['__proto__', 'constructor', 'prototype']);

/** Virtual accessors resolved against arrays rather than looked up as keys. */
const VIRTUAL_ARRAY_ACCESSORS = new Set(['first', 'last']);

/** Cache parsed paths — the Properties Panel re-parses the same token per keystroke. */
const PARSE_CACHE = new Map<string, string[]>();
const PARSE_CACHE_LIMIT = 2000;

/* -------------------------------------------------------------------------- */
/*                                 PARSE PATH                                 */
/* -------------------------------------------------------------------------- */

/**
 * Split a path expression into segments.
 *
 * Returns plain strings so the existing `parsePath(path): string[]` signature is
 * unchanged and no caller needs to know this became richer. Quoting is resolved
 * during parsing, so `a['Task Name']` and `a.Task Name` both produce the segment
 * `Task Name` and address the same key.
 *
 * Malformed input never throws. An unterminated bracket or quote yields the
 * segments parsed so far, which is what a live preview needs while the user is
 * still typing.
 */
export function parsePath(path: string): string[] {
  const source = String(path ?? '').trim();
  if (!source) return [];

  const cached = PARSE_CACHE.get(source);
  if (cached) return cached.slice();

  const segments: string[] = [];
  let buffer = '';
  let index = 0;

  const flush = (): void => {
    const trimmed = buffer.trim();
    if (trimmed) segments.push(trimmed);
    buffer = '';
  };

  while (index < source.length) {
    const character = source[index];

    if (character === '.') {
      flush();
      index += 1;
      continue;
    }

    if (character === '[') {
      flush();
      index += 1;

      // Skip whitespace between the bracket and its contents.
      while (index < source.length && /\s/.test(source[index])) index += 1;

      const quote = source[index];
      if (quote === "'" || quote === '"' || quote === '`') {
        index += 1;
        let key = '';
        while (index < source.length) {
          if (source[index] === '\\' && index + 1 < source.length) {
            key += source[index + 1];
            index += 2;
            continue;
          }
          if (source[index] === quote) {
            index += 1;
            break;
          }
          key += source[index];
          index += 1;
        }
        // Quoted keys are taken verbatim — a column really can be named ' X '.
        segments.push(key);
        while (index < source.length && source[index] !== ']') index += 1;
        if (index < source.length) index += 1;
        continue;
      }

      // Unquoted bracket contents: an index, or a bare key.
      let raw = '';
      while (index < source.length && source[index] !== ']') {
        raw += source[index];
        index += 1;
      }
      if (index < source.length) index += 1;
      const trimmed = raw.trim();
      if (trimmed) segments.push(trimmed);
      continue;
    }

    buffer += character;
    index += 1;
  }

  flush();

  if (PARSE_CACHE.size >= PARSE_CACHE_LIMIT) PARSE_CACHE.clear();
  PARSE_CACHE.set(source, segments.slice());

  return segments;
}

/* -------------------------------------------------------------------------- */
/*                               SEGMENT ACCESS                               */
/* -------------------------------------------------------------------------- */

/** Marker distinguishing "no value here" from "the value is undefined". */
const NOT_FOUND = Symbol('notFound');

/**
 * Resolve one segment against one cursor.
 *
 * Array handling is deliberately generous, because a binding is written by a
 * person and `rows[0]`, `rows.0`, `rows.first` and `rows[-1]` all clearly mean
 * the same kind of thing. Object handling is deliberately strict: an exact key
 * lookup only, so a typo surfaces as an unresolved token in the preview rather
 * than quietly matching something adjacent.
 */
function readSegment(cursor: any, segment: string): any | typeof NOT_FOUND {
  if (cursor === null || cursor === undefined) return NOT_FOUND;
  if (BLOCKED_SEGMENTS.has(segment)) return NOT_FOUND;

  if (Array.isArray(cursor)) {
    if (VIRTUAL_ARRAY_ACCESSORS.has(segment)) {
      if (cursor.length === 0) return NOT_FOUND;
      return segment === 'first' ? cursor[0] : cursor[cursor.length - 1];
    }
    if (segment === 'length') return cursor.length;

    if (/^-?\d+$/.test(segment)) {
      const parsed = Number(segment);
      const resolved = parsed < 0 ? cursor.length + parsed : parsed;
      if (resolved < 0 || resolved >= cursor.length) return NOT_FOUND;
      return cursor[resolved];
    }

    // A named segment against an array of rows means THE WHOLE COLUMN.
    //
    // This previously fell through to the first element, so
    // `previous.data['Project Name']` quietly returned one value out of fifty-one
    // and gave no hint that the rest existed. Silently discarding data is worse
    // than not resolving at all: `{{previous.data[0]['Project Name']}}` already
    // says "first row" unambiguously, and anyone writing the column form is
    // asking for the column.
    //
    // Rows missing the key contribute nothing, so a ragged sheet does not
    // produce a column peppered with `undefined`.
    const column: any[] = [];
    let matched = false;
    for (const row of cursor) {
      if (row === null || typeof row !== 'object') continue;
      const cell = readSegment(row, segment);
      if (cell === NOT_FOUND) continue;
      matched = true;
      column.push(cell);
    }
    return matched ? column : NOT_FOUND;
  }

  if (typeof cursor === 'string') {
    if (segment === 'length') return cursor.length;
    if (/^-?\d+$/.test(segment)) {
      const parsed = Number(segment);
      const resolved = parsed < 0 ? cursor.length + parsed : parsed;
      return resolved >= 0 && resolved < cursor.length ? cursor[resolved] : NOT_FOUND;
    }
    return NOT_FOUND;
  }

  if (typeof cursor !== 'object') return NOT_FOUND;

  if (cursor instanceof Map) {
    return cursor.has(segment) ? cursor.get(segment) : NOT_FOUND;
  }

  if (Object.prototype.hasOwnProperty.call(cursor, segment)) {
    return (cursor as any)[segment];
  }

  // Own properties only, so nothing resolves through the prototype chain.
  return NOT_FOUND;
}

/* -------------------------------------------------------------------------- */
/*                              PUBLIC RESOLUTION                             */
/* -------------------------------------------------------------------------- */

/**
 * Walk a segment list. Returns `undefined` when any segment fails to resolve.
 *
 * Accepts a raw string as well as a segment array, so both call styles work:
 * `getByPath(scope, parsePath(head))` — how `expression.evaluateToken` calls
 * it today — and `getByPath(scope, "data[0]['Task Name']")`.
 */
export function getByPath(target: any, path: string | string[]): any {
  const segments = Array.isArray(path) ? path : parsePath(path);
  let cursor = target;

  for (const segment of segments) {
    const next = readSegment(cursor, segment);
    if (next === NOT_FOUND) return undefined;
    cursor = next;
  }

  return cursor;
}

/**
 * True when every segment resolves.
 *
 * Distinct from `getByPath(...) !== undefined`: a key that exists and holds
 * `undefined` reports `true` here. `expression.evaluateToken` relies on that to
 * tell "the step produced an empty value" apart from "this path is wrong" —
 * which is what decides whether a fallback chain moves on to the next branch.
 */
export function hasPath(target: any, path: string | string[]): boolean {
  const segments = Array.isArray(path) ? path : parsePath(path);
  if (segments.length === 0) return false;

  let cursor = target;
  for (const segment of segments) {
    const next = readSegment(cursor, segment);
    if (next === NOT_FOUND) return false;
    cursor = next;
  }
  return true;
}

/* -------------------------------------------------------------------------- */
/*                              TOKEN FORMATTING                              */
/* -------------------------------------------------------------------------- */

/** A segment safe to write after a dot without quoting. */
const isBareSegment = (segment: string): boolean => /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(segment);

/**
 * Render segments back into a path a user can read and the parser can re-read.
 *
 * Round-trip safety is the requirement: `parsePath(formatPath(segments))` must
 * equal `segments`. A column named `Task Name` therefore renders as
 * `['Task Name']` rather than `.Task Name` — both parse identically here, but
 * only the bracketed form survives being pasted into another tool.
 */
export function formatPath(segments: string[]): string {
  return segments.reduce((accumulator, segment, position) => {
    if (/^-?\d+$/.test(segment)) return `${accumulator}[${segment}]`;
    if (isBareSegment(segment)) {
      return position === 0 ? segment : `${accumulator}.${segment}`;
    }
    const escaped = segment.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    return `${accumulator}['${escaped}']`;
  }, '');
}

/**
 * Append a key to an existing path, quoting only when needed.
 *
 * This is what token producers should use instead of string concatenation.
 * `carryForward` building `${prefix}.${rowKey}` by hand is what produced
 * `data.first.Task Name` — a path that reads fine and, before this module,
 * resolved to nothing.
 */
export function appendSegment(path: string, segment: string): string {
  if (/^-?\d+$/.test(segment)) return `${path}[${segment}]`;
  if (isBareSegment(segment)) return path ? `${path}.${segment}` : segment;
  const escaped = segment.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  return `${path}['${escaped}']`;
}

/** Clears the parse cache. Exposed for tests. */
export function clearPathCache(): void {
  PARSE_CACHE.clear();
}