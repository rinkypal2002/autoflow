/**
 * Typed workflow variables — coercion, validation and safe display.
 *
 * `WorkflowVariable` declares `type`, `required`, `validationRules` and
 * `defaultValue`, but nothing enforced any of it: a variable typed `number`
 * happily held the string `"abc"`, and `validationRules` was inert. A workflow
 * would then fail deep inside a plugin with a confusing error instead of at the
 * point the bad value was entered.
 *
 * This module closes that loop:
 *   • `coerceVariableValue`  turn user input into the declared type
 *   • `validateVariable`     check the value against the declared rules
 *   • `validateVariables`    whole-set validation before a run starts
 *   • `maskVariableValue`    render secrets without leaking them
 *
 * Coercion is intentionally forgiving on *input* (a `number` variable accepts
 * `"42"`) and strict on *output* (it stores `42`), which is the behaviour that
 * makes typed variables useful rather than annoying.
 */

import type { WorkflowVariable } from '../types/workflow';
import { isPlainObject, safeJsonParse } from './objectUtils';

/* -------------------------------------------------------------------------- */
/*                                   TYPES                                    */
/* -------------------------------------------------------------------------- */

export type VariableType = WorkflowVariable['type'];

export interface CoercionResult {
  ok: boolean;
  value: any;
  /** Set when the input could not be represented as the declared type. */
  error?: string;
  /** True when the raw input was changed to fit the type. */
  coerced: boolean;
}

export interface ValidationIssue {
  variableId?: string;
  variableName: string;
  rule: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface ValidationOutcome {
  valid: boolean;
  issues: ValidationIssue[];
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

/* -------------------------------------------------------------------------- */
/*                                  COERCION                                  */
/* -------------------------------------------------------------------------- */

const TRUTHY = new Set(['true', 'yes', 'y', '1', 'on', 'enabled']);
const FALSY = new Set(['false', 'no', 'n', '0', 'off', 'disabled', '']);

/**
 * Convert a raw value into its declared type.
 *
 * Binding tokens are passed through untouched: `{{previous.count}}` in a
 * `number` variable is a *deferred* value, not a broken one, and rejecting it
 * at edit time would make variables unusable with carry-forward.
 */
export function coerceVariableValue(value: any, type: VariableType): CoercionResult {
  if (typeof value === 'string' && /\{\{[^}]+\}\}/.test(value)) {
    return { ok: true, value, coerced: false };
  }

  if (value === undefined || value === null) {
    return { ok: true, value, coerced: false };
  }

  switch (type) {
    case 'string': {
      if (typeof value === 'string') return { ok: true, value, coerced: false };
      if (isPlainObject(value) || Array.isArray(value)) {
        return { ok: true, value: JSON.stringify(value), coerced: true };
      }
      return { ok: true, value: String(value), coerced: true };
    }

    case 'number': {
      if (typeof value === 'number') {
        return Number.isFinite(value)
          ? { ok: true, value, coerced: false }
          : { ok: false, value, coerced: false, error: 'Value is not a finite number.' };
      }
      const text = String(value).trim().replace(/,/g, '');
      if (text === '') return { ok: true, value: undefined, coerced: true };
      const parsed = Number(text);
      if (!Number.isFinite(parsed)) {
        return { ok: false, value, coerced: false, error: `"${value}" is not a number.` };
      }
      return { ok: true, value: parsed, coerced: true };
    }

    case 'boolean': {
      if (typeof value === 'boolean') return { ok: true, value, coerced: false };
      const text = String(value).trim().toLowerCase();
      if (TRUTHY.has(text)) return { ok: true, value: true, coerced: true };
      if (FALSY.has(text)) return { ok: true, value: false, coerced: true };
      return { ok: false, value, coerced: false, error: `"${value}" is not true or false.` };
    }

    case 'array': {
      if (Array.isArray(value)) return { ok: true, value, coerced: false };
      if (typeof value === 'string') {
        const trimmed = value.trim();
        if (trimmed === '') return { ok: true, value: [], coerced: true };
        const parsed = safeJsonParse<any>(trimmed, undefined);
        if (Array.isArray(parsed)) return { ok: true, value: parsed, coerced: true };
        // A bare comma-separated list is the most common thing a person types.
        if (!trimmed.startsWith('[')) {
          return {
            ok: true,
            value: trimmed.split(',').map((item) => item.trim()).filter(Boolean),
            coerced: true,
          };
        }
        return { ok: false, value, coerced: false, error: 'Value is not a valid JSON array.' };
      }
      return { ok: true, value: [value], coerced: true };
    }

    case 'object':
    case 'dictionary': {
      if (isPlainObject(value)) return { ok: true, value, coerced: false };
      if (typeof value === 'string') {
        const trimmed = value.trim();
        if (trimmed === '') return { ok: true, value: {}, coerced: true };
        const parsed = safeJsonParse<any>(trimmed, undefined);
        if (isPlainObject(parsed)) return { ok: true, value: parsed, coerced: true };
        return { ok: false, value, coerced: false, error: 'Value is not a valid JSON object.' };
      }
      return { ok: false, value, coerced: false, error: 'Value is not an object.' };
    }

    default:
      return { ok: true, value, coerced: false };
  }
}

/** True when the value already matches its declared type exactly. */
export function matchesType(value: any, type: VariableType): boolean {
  switch (type) {
    case 'string':
      return typeof value === 'string';
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'boolean':
      return typeof value === 'boolean';
    case 'array':
      return Array.isArray(value);
    case 'object':
    case 'dictionary':
      return isPlainObject(value);
    default:
      return true;
  }
}

/* -------------------------------------------------------------------------- */
/*                                 VALIDATION                                 */
/* -------------------------------------------------------------------------- */

const isEmpty = (value: any): boolean =>
  value === undefined ||
  value === null ||
  (typeof value === 'string' && value.trim() === '') ||
  (Array.isArray(value) && value.length === 0);

/**
 * Validate one variable against its declared type and `validationRules`.
 *
 * Supported rules: `min`, `max`, `minLength`, `maxLength`, `pattern`, `enum`,
 * `integer`. An unrecognised rule is reported as a warning rather than an
 * error — a typo in a rule name should not block a run, but it should be
 * visible so it gets fixed.
 */
export function validateVariable(variable: WorkflowVariable): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const name = variable?.name ?? '(unnamed)';

  const push = (rule: string, message: string, severity: ValidationIssue['severity'] = 'error') => {
    issues.push({ variableId: variable?.id, variableName: name, rule, message, severity });
  };

  if (!variable?.name || !String(variable.name).trim()) {
    push('name', 'Variable has no name, so nothing can bind to it.');
    return issues;
  }

  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(variable.name)) {
    push(
      'name',
      `"${variable.name}" is not a valid identifier — use letters, numbers and underscores, starting with a letter.`,
      'warning'
    );
  }

  const effective = isEmpty(variable.value) ? variable.defaultValue : variable.value;

  if (variable.required && isEmpty(effective)) {
    push('required', `"${name}" is required but has no value.`);
    return issues;
  }

  if (isEmpty(effective)) return issues;

  // Deferred values cannot be checked until run time.
  if (typeof effective === 'string' && /\{\{[^}]+\}\}/.test(effective)) return issues;

  const coercion = coerceVariableValue(effective, variable.type);
  if (!coercion.ok) {
    push('type', `"${name}" is typed ${variable.type} but ${coercion.error}`);
    return issues;
  }

  const value = coercion.value;
  const rules = variable.validationRules ?? {};

  Object.entries(rules).forEach(([rule, constraint]) => {
    switch (rule) {
      case 'min':
        if (typeof value === 'number' && value < Number(constraint)) {
          push('min', `"${name}" must be at least ${constraint} (currently ${value}).`);
        }
        break;

      case 'max':
        if (typeof value === 'number' && value > Number(constraint)) {
          push('max', `"${name}" must be at most ${constraint} (currently ${value}).`);
        }
        break;

      case 'integer':
        if (constraint && typeof value === 'number' && !Number.isInteger(value)) {
          push('integer', `"${name}" must be a whole number.`);
        }
        break;

      case 'minLength': {
        const length = typeof value === 'string' || Array.isArray(value) ? value.length : undefined;
        if (length !== undefined && length < Number(constraint)) {
          push('minLength', `"${name}" must be at least ${constraint} characters (currently ${length}).`);
        }
        break;
      }

      case 'maxLength': {
        const length = typeof value === 'string' || Array.isArray(value) ? value.length : undefined;
        if (length !== undefined && length > Number(constraint)) {
          push('maxLength', `"${name}" must be at most ${constraint} characters (currently ${length}).`);
        }
        break;
      }

      case 'pattern':
        if (typeof value === 'string') {
          try {
            if (!new RegExp(String(constraint)).test(value)) {
              push('pattern', `"${name}" does not match the required format.`);
            }
          } catch {
            push('pattern', `The pattern configured on "${name}" is not a valid expression.`, 'warning');
          }
        }
        break;

      case 'enum':
        if (Array.isArray(constraint) && constraint.length > 0 && !constraint.includes(value)) {
          push('enum', `"${name}" must be one of: ${constraint.join(', ')}.`);
        }
        break;

      default:
        push('unknown', `"${name}" declares an unrecognised validation rule "${rule}".`, 'warning');
        break;
    }
  });

  return issues;
}

/** Validate every variable, plus cross-variable checks like duplicate names. */
export function validateVariables(variables: WorkflowVariable[] = []): ValidationOutcome {
  const issues: ValidationIssue[] = [];

  const seen = new Map<string, number>();
  variables.forEach((variable) => {
    const key = String(variable?.name ?? '').trim().toLowerCase();
    if (!key) return;
    seen.set(key, (seen.get(key) ?? 0) + 1);
  });

  seen.forEach((count, key) => {
    if (count > 1) {
      issues.push({
        variableName: key,
        rule: 'duplicate',
        message: `"${key}" is declared ${count} times — only the last definition will be used.`,
        severity: 'error',
      });
    }
  });

  variables.forEach((variable) => {
    issues.push(...validateVariable(variable));
  });

  const errors = issues.filter((issue) => issue.severity === 'error');
  const warnings = issues.filter((issue) => issue.severity === 'warning');

  return { valid: errors.length === 0, issues, errors, warnings };
}

/* -------------------------------------------------------------------------- */
/*                                  DISPLAY                                   */
/* -------------------------------------------------------------------------- */

export function isSecretVariable(variable: WorkflowVariable): boolean {
  return Boolean(variable?.isSecret || variable?.masked || variable?.scope === 'secret');
}

/** Render a value for the UI, never revealing a secret. */
export function maskVariableValue(variable: WorkflowVariable, maxLength = 60): string {
  if (isSecretVariable(variable)) return '••••••••';

  const value = variable?.value ?? variable?.defaultValue;
  if (value === undefined || value === null) return '';

  const text = typeof value === 'string' ? value : JSON.stringify(value);
  if (text === undefined) return '';
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

/** The runtime value of a variable: its value, or its default when unset. */
export function effectiveValue(variable: WorkflowVariable): any {
  const raw = isEmpty(variable?.value) ? variable?.defaultValue : variable?.value;
  return coerceVariableValue(raw, variable?.type ?? 'string').value;
}

/** Coerced name/value map ready to seed an execution context. */
export function toRuntimeValues(variables: WorkflowVariable[] = []): Record<string, any> {
  const values: Record<string, any> = {};
  variables.forEach((variable) => {
    if (!variable?.name) return;
    values[variable.name] = effectiveValue(variable);
  });
  return values;
}

/** Sensible starting value when a variable's type is changed in the UI. */
export function defaultValueForType(type: VariableType): any {
  switch (type) {
    case 'number':
      return 0;
    case 'boolean':
      return false;
    case 'array':
      return [];
    case 'object':
    case 'dictionary':
      return {};
    default:
      return '';
  }
}
