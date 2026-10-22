/**
 * Conditional field visibility for the Properties Panel.
 *
 * ── Why this exists ───────────────────────────────────────────────────────
 *
 * Several transformation operations have fields that only apply under one
 * setting. Add Column has three mutually exclusive value sources — a constant, a
 * column to copy, an expression — and showing all three at once means two of
 * them are always noise. Text Operation's argument is required for six of its
 * eighteen operations and meaningless for the other twelve. Lookup's default
 * value applies only when `onMissing` is `DEFAULT`.
 *
 * Without this, the panel shows every field always. The cost is not only visual:
 * `validationIssues` walks the same schema, so a `required` field that does not
 * currently apply still blocks the node from validating.
 *
 * ── The contract ──────────────────────────────────────────────────────────
 *
 * Add `visibleWhen` to any `propertyConfig` entry:
 *
 *     value:        { visibleWhen: { source: 'CONSTANT' } }
 *     argument:     { visibleWhen: { operation: ['SUBSTRING', 'REPLACE'] } }
 *     topValueCount:{ visibleWhen: { includeTopValues: true } }
 *
 * An array matches any of its members. Several keys must all match. A field
 * without `visibleWhen` is always visible, so every existing action is
 * unaffected — this is purely additive.
 *
 * ── Deliberately not a mini expression language ───────────────────────────
 *
 * No operators, no nesting, no negation. Equality against a sibling field covers
 * every case in the catalogue, and a richer form would be a second expression
 * dialect to learn, document and debug alongside `expression.ts` — for a panel
 * that only needs to decide whether to draw a text box.
 */

/** A field's visibility rule: sibling field name to accepted value(s). */
export type VisibleWhen = Record<string, unknown>;

/** Loose shape so this stays independent of PropertiesPanel's internal types. */
interface MaybeConfigured {
  visibleWhen?: VisibleWhen;
  [key: string]: any;
}

/**
 * Compares a draft value against an expected value.
 *
 * String comparison is case-insensitive because backend enums are uppercase
 * (`CONSTANT`) while a hand-edited workflow may hold lowercase. Getting that
 * wrong would hide a field the user had already filled in, which looks like data
 * loss even though the value is still there.
 */
function valueMatches(actual: unknown, expected: unknown): boolean {
  if (Array.isArray(expected)) {
    return expected.some((candidate) => valueMatches(actual, candidate));
  }
  if (typeof expected === 'boolean') {
    return Boolean(actual) === expected;
  }
  if (expected === null || expected === undefined) {
    return actual === null || actual === undefined || actual === '';
  }
  if (typeof expected === 'string' && typeof actual === 'string') {
    return actual.toLowerCase() === expected.toLowerCase();
  }
  return String(actual ?? '') === String(expected);
}

/** True when a field should be shown for the current draft values. */
export function isFieldVisible(config: unknown, values: Record<string, any> | undefined): boolean {
  const rule = (config as MaybeConfigured)?.visibleWhen;
  if (!rule || typeof rule !== 'object') {
    return true;
  }
  return Object.entries(rule).every(([field, expected]) =>
    valueMatches(values?.[field], expected)
  );
}

/**
 * Removes fields whose `visibleWhen` does not match.
 *
 * Applied to the resolved schema, so rendering, grouping, search and validation
 * all see the same field set. Filtering only at render time would leave a
 * hidden-but-required field failing validation with no visible control to fix
 * it — an unfixable error is worse than a cluttered form.
 */
export function applyFieldVisibility<T extends Record<string, any>>(
  schema: T,
  values: Record<string, any> | undefined
): T {
  const visible: Record<string, any> = {};
  Object.entries(schema).forEach(([key, config]) => {
    if (isFieldVisible(config, values)) {
      visible[key] = config;
    }
  });
  return visible as T;
}
