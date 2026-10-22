/**
 * Shared object / path utilities.
 *
 * Single implementation used by the expression resolver, the execution
 * context, the executor and the UI binding controls. Previously several of
 * these (flattenObject, deepParse, deepMerge) were duplicated inline inside
 * `WorkspaceEditorPage` and `PropertiesPanel`, which is how the two copies
 * drifted apart. Everything here is pure and framework-free so it can be unit
 * tested and reused by any future plugin.
 */

/* -------------------------------------------------------------------------- */
/*                                 PREDICATES                                 */
/* -------------------------------------------------------------------------- */

export const isPlainObject = (value: unknown): value is Record<string, any> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const isPrimitive = (value: unknown): boolean =>
  value === null || (typeof value !== 'object' && typeof value !== 'function');

/* -------------------------------------------------------------------------- */
/*                                   CLONING                                  */
/* -------------------------------------------------------------------------- */

/**
 * Structural clone that never throws on values JSON cannot represent
 * (File, Blob, functions, circular refs). Non-cloneable leaves are passed
 * through by reference, which is exactly what the executor needs for the
 * File objects held in multipart payloads.
 */
export function deepClone<T>(value: T, seen = new WeakMap<object, any>()): T {
  if (isPrimitive(value)) return value;
  if (value instanceof Date) return new Date(value.getTime()) as unknown as T;
  if (typeof File !== 'undefined' && value instanceof File) return value;
  if (typeof Blob !== 'undefined' && value instanceof Blob) return value;
  if (typeof value === 'function') return value;

  const asObject = value as unknown as object;
  if (seen.has(asObject)) return seen.get(asObject);

  if (Array.isArray(value)) {
    const out: any[] = [];
    seen.set(asObject, out);
    value.forEach((item, index) => {
      out[index] = deepClone(item, seen);
    });
    return out as unknown as T;
  }

  const out: Record<string, any> = {};
  seen.set(asObject, out);
  Object.entries(value as Record<string, any>).forEach(([key, val]) => {
    out[key] = deepClone(val, seen);
  });
  return out as unknown as T;
}

/* -------------------------------------------------------------------------- */
/*                                PATH ACCESS                                 */
/* -------------------------------------------------------------------------- */

/**
 * Split a binding path into segments.
 *
 *   "a.b.c"            -> ['a','b','c']
 *   "rows[0].name"     -> ['rows','0','name']
 *   "steps['My Node']" -> ['steps','My Node']
 */
export function parsePath(path: string): string[] {
  const segments: string[] = [];
  let buffer = '';
  let index = 0;

  const flush = () => {
    if (buffer.length > 0) {
      segments.push(buffer);
      buffer = '';
    }
  };

  while (index < path.length) {
    const char = path[index];

    if (char === '.') {
      flush();
      index += 1;
      continue;
    }

    if (char === '[') {
      flush();
      index += 1;
      const quote = path[index];
      if (quote === '"' || quote === "'") {
        index += 1;
        let quoted = '';
        while (index < path.length && path[index] !== quote) {
          if (path[index] === '\\' && index + 1 < path.length) {
            quoted += path[index + 1];
            index += 2;
            continue;
          }
          quoted += path[index];
          index += 1;
        }
        index += 1; // closing quote
        segments.push(quoted);
      } else {
        let raw = '';
        while (index < path.length && path[index] !== ']') {
          raw += path[index];
          index += 1;
        }
        segments.push(raw.trim());
      }
      while (index < path.length && path[index] !== ']') index += 1;
      index += 1; // closing bracket
      continue;
    }

    buffer += char;
    index += 1;
  }

  flush();
  return segments.filter((segment) => segment.length > 0);
}

/** Read a value at a dotted / bracketed path. Returns undefined when absent. */
export function getByPath(source: any, path: string | string[]): any {
  const segments = Array.isArray(path) ? path : parsePath(path);
  let cursor: any = source;

  for (const segment of segments) {
    if (cursor === null || cursor === undefined) return undefined;

    if (Array.isArray(cursor)) {
      // Numeric index, or "first"/"last" sugar for one-row results.
      if (/^-?\d+$/.test(segment)) {
        const index = Number(segment);
        cursor = index < 0 ? cursor[cursor.length + index] : cursor[index];
        continue;
      }
      if (segment === 'first') {
        cursor = cursor[0];
        continue;
      }
      if (segment === 'last') {
        cursor = cursor[cursor.length - 1];
        continue;
      }
      if (segment === 'length') {
        cursor = cursor.length;
        continue;
      }
      // Reading a named field off an array reads it from the first row, which
      // is what "the query returned one record" bindings expect.
      cursor = cursor.length > 0 ? (cursor[0] as any)?.[segment] : undefined;
      continue;
    }

    if (typeof cursor !== 'object') return undefined;
    cursor = cursor[segment];
  }

  return cursor;
}

/** Returns true when the path exists (even if its value is null/undefined). */
export function hasPath(source: any, path: string | string[]): boolean {
  const segments = Array.isArray(path) ? path : parsePath(path);
  let cursor: any = source;

  for (let i = 0; i < segments.length; i += 1) {
    if (cursor === null || cursor === undefined || typeof cursor !== 'object') {
      return false;
    }
    const segment = segments[i];
    if (Array.isArray(cursor)) {
      if (/^-?\d+$/.test(segment) || ['first', 'last', 'length'].includes(segment)) {
        cursor = getByPath(cursor, [segment]);
        continue;
      }
      if (cursor.length === 0) return false;
      cursor = (cursor[0] as any)?.[segment];
      continue;
    }
    if (!(segment in cursor)) return false;
    cursor = cursor[segment];
  }

  return true;
}

/** Immutably write a value at a dotted / bracketed path. */
export function setByPath<T extends Record<string, any>>(
  source: T,
  path: string | string[],
  value: any
): T {
  const segments = Array.isArray(path) ? path : parsePath(path);
  if (segments.length === 0) return source;

  const clone: Record<string, any> = { ...(source ?? {}) };
  let cursor: Record<string, any> = clone;

  for (let i = 0; i < segments.length - 1; i += 1) {
    const segment = segments[i];
    const next = cursor[segment];
    cursor[segment] = isPlainObject(next) ? { ...next } : Array.isArray(next) ? [...next] : {};
    cursor = cursor[segment];
  }

  cursor[segments[segments.length - 1]] = value;
  return clone as T;
}

/* -------------------------------------------------------------------------- */
/*                                 FLATTENING                                 */
/* -------------------------------------------------------------------------- */

export interface FlattenOptions {
  /** Prefix applied to every produced key. */
  prefix?: string;
  /** Also emit the bare leaf key (e.g. `employeeId` for `data.employeeId`). */
  includeLeafShorthand?: boolean;
  /** Maximum depth to descend. Guards against pathological payloads. */
  maxDepth?: number;
  /** Maximum number of array elements to expand per array. */
  maxArrayItems?: number;
}

/**
 * Flatten a nested payload into dot-path keys so `{{a.b.c}}` *and* the bare
 * `{{c}}` shorthand both resolve.
 *
 * Leaf shorthand is deliberately "first write wins" per call so a shallow key
 * is never clobbered by a deeper namesake; layering across nodes is handled by
 * the execution context, which controls precedence explicitly.
 */
export function flattenObject(
  value: any,
  options: FlattenOptions = {},
  accumulator: Record<string, any> = {},
  depth = 0
): Record<string, any> {
  const {
    prefix = '',
    includeLeafShorthand = true,
    maxDepth = 8,
    maxArrayItems = 50,
  } = options;

  if (depth > maxDepth) {
    if (prefix) accumulator[prefix] = value;
    return accumulator;
  }

  if (Array.isArray(value)) {
    if (prefix) accumulator[prefix] = value;
    value.slice(0, maxArrayItems).forEach((item, index) => {
      const nextPrefix = prefix ? `${prefix}.${index}` : String(index);
      if (item !== null && typeof item === 'object') {
        flattenObject(item, { ...options, prefix: nextPrefix }, accumulator, depth + 1);
      } else {
        accumulator[nextPrefix] = item;
      }
    });
    return accumulator;
  }

  if (isPlainObject(value)) {
    Object.entries(value).forEach(([key, nested]) => {
      const nextPrefix = prefix ? `${prefix}.${key}` : key;

      if (nested !== null && typeof nested === 'object') {
        accumulator[nextPrefix] = nested;
        if (includeLeafShorthand && !(key in accumulator)) {
          accumulator[key] = nested;
        }
        flattenObject(nested, { ...options, prefix: nextPrefix }, accumulator, depth + 1);
        return;
      }

      accumulator[nextPrefix] = nested;
      if (includeLeafShorthand && !(key in accumulator)) {
        accumulator[key] = nested;
      }
    });
    return accumulator;
  }

  if (prefix) accumulator[prefix] = value;
  return accumulator;
}

/* -------------------------------------------------------------------------- */
/*                                  MERGING                                   */
/* -------------------------------------------------------------------------- */

/**
 * Merge `override` on top of `base`, recursing into plain objects.
 * Arrays and primitives from `override` replace `base` wholesale.
 */
export function deepMerge(base: any, override: any): any {
  if (!isPlainObject(base)) {
    return override === undefined ? base : override;
  }

  const out: Record<string, any> = { ...base };
  if (isPlainObject(override)) {
    Object.entries(override).forEach(([key, val]) => {
      out[key] = isPlainObject(val) ? deepMerge(base[key] ?? {}, val) : val;
    });
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/*                              PARSING / DISPLAY                             */
/* -------------------------------------------------------------------------- */

/** Parse a JSON string, returning `fallback` instead of throwing. */
export function safeJsonParse<T = any>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/**
 * Recursively turn JSON-looking strings into real objects/arrays. Values that
 * are not valid JSON are returned untouched.
 */
export function deepParse(value: any): any {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        return JSON.parse(trimmed);
      } catch {
        return value;
      }
    }
    return value;
  }
  if (Array.isArray(value)) return value.map(deepParse);
  if (isPlainObject(value)) {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, deepParse(v)]));
  }
  return value;
}

/** Render any value as a short single-line string for tables and chips. */
export function summarizeValue(value: any, maxLength = 80): string {
  if (value === undefined) return '—';
  if (value === null) return 'null';
  if (typeof value === 'string') {
    return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return `Array(${value.length})`;
  if (typeof File !== 'undefined' && value instanceof File) return `File(${value.name})`;
  if (isPlainObject(value)) {
    const keys = Object.keys(value);
    return `{ ${keys.slice(0, 3).join(', ')}${keys.length > 3 ? ', …' : ''} }`;
  }
  return String(value);
}

/** Human-readable type label used by pickers and the context inspector. */
export function describeType(value: any): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (Array.isArray(value)) return 'array';
  if (typeof File !== 'undefined' && value instanceof File) return 'file';
  if (value instanceof Date) return 'date';
  return typeof value;
}

/* -------------------------------------------------------------------------- */
/*                                 REDACTION                                  */
/* -------------------------------------------------------------------------- */

const SENSITIVE_KEY_PATTERN =
  /(password|passwd|secret|token|apikey|api_key|accesskey|access_key|authorization|credential|privatekey|private_key|clientsecret|client_secret)/i;

/**
 * Replace values under sensitive-looking keys with a mask. Applied to every
 * payload before it is written to a log or a persisted run snapshot, so
 * credentials never leak into the execution panel or the workspace folder.
 */
export function redactSecrets<T>(value: T, extraKeys: string[] = [], depth = 0): T {
  if (depth > 8 || isPrimitive(value)) return value;

  const extra = extraKeys.map((key) => key.toLowerCase());

  if (Array.isArray(value)) {
    return value.map((item) => redactSecrets(item, extraKeys, depth + 1)) as unknown as T;
  }

  if (!isPlainObject(value)) return value;

  const out: Record<string, any> = {};
  Object.entries(value).forEach(([key, val]) => {
    if (SENSITIVE_KEY_PATTERN.test(key) || extra.includes(key.toLowerCase())) {
      out[key] = typeof val === 'string' && val.length === 0 ? '' : '••••••••';
      return;
    }
    out[key] = redactSecrets(val, extraKeys, depth + 1);
  });
  return out as T;
}

/**
 * Cap the size of a payload so a multi-megabyte response can be logged and
 * snapshotted without freezing the UI or bloating the workspace directory.
 */
export function truncateForStorage(value: any, maxChars = 200_000, depth = 0): any {
  if (typeof value === 'string') {
    return value.length > maxChars
      ? `${value.slice(0, maxChars)}…[truncated ${value.length - maxChars} chars]`
      : value;
  }
  if (isPrimitive(value)) return value;
  if (depth > 8) return '[max depth reached]';

  if (Array.isArray(value)) {
    const capped = value.slice(0, 200).map((item) => truncateForStorage(item, maxChars, depth + 1));
    if (value.length > 200) capped.push(`…[${value.length - 200} more items truncated]`);
    return capped;
  }

  if (typeof File !== 'undefined' && value instanceof File) {
    return { __type: 'File', name: value.name, size: value.size, type: value.type };
  }
  if (typeof Blob !== 'undefined' && value instanceof Blob) {
    return { __type: 'Blob', size: value.size, type: value.type };
  }
  if (!isPlainObject(value)) return String(value);

  const out: Record<string, any> = {};
  Object.entries(value).forEach(([key, val]) => {
    out[key] = truncateForStorage(val, maxChars, depth + 1);
  });
  return out;
}

/* -------------------------------------------------------------------------- */
/*                                 IDENTIFIERS                                */
/* -------------------------------------------------------------------------- */

/**
 * Turn a node name into a stable, dot-free key usable inside a binding token:
 *   "Read Employee Excel"  -> "ReadEmployeeExcel"
 *   "HTTP Request (v2)"    -> "HTTPRequestv2"
 */
export function toStepKey(name: string): string {
  const cleaned = String(name ?? '')
    .replace(/[^A-Za-z0-9 _-]/g, '')
    .trim();
  if (!cleaned) return '';
  return cleaned
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part, index) =>
      index === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1)
    )
    .join('')
    .replace(/^(.)/, (c) => c.toUpperCase());
}
