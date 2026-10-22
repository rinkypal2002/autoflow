/**
 * Design-time binding sources, derived from declared plugin contracts.
 *
 * ── The problem this solves ───────────────────────────────────────────────
 *
 * `bindingSources.buildBindingCatalogue()` builds the picker from
 * `NodeOutputRecord[]` — values captured during a run. Before a run there are
 * no records, so there are no bindings, so a workflow cannot be configured
 * until it has been executed at least once. On a platform heading for hundreds
 * of plugins that compounds badly: every new plugin arrives unbindable, and
 * every workflow author has to run a half-finished workflow against real data
 * to discover what a step produces.
 *
 * This module reads the `outputSchema` an action declares and produces the same
 * `BindingSourceGroup[]` shape the picker already consumes. A step that has run
 * keeps using its observed values; a step that has not yet run now offers its
 * promised ones.
 *
 * ── The precedence rule ───────────────────────────────────────────────────
 *
 * Observed beats declared, always. A recording is what the plugin actually did;
 * a schema is what it said it would do. When they disagree the recording is
 * authoritative — but the disagreement is reported through `detectContractDrift`
 * rather than swallowed, because a plugin that stopped honouring its contract is
 * a defect, and silently papering over it is how a platform accumulates a
 * hundred subtly-wrong connectors.
 *
 * Pure and framework-free: no React, no DOM, no side effects.
 */

import type {
  BindingSource,
  BindingSourceGroup,
  DataSetColumn,
  NodeOutputRecord,
  WorkflowAction,
} from '../types/workflow';
import type { OutputField, OutputSchema, OutputVisibility } from '../types/pluginContract';

/* -------------------------------------------------------------------------- */
/*                                  HELPERS                                   */
/* -------------------------------------------------------------------------- */

/** `employeeId` -> `Employee Id`. Mirrors `carryForward.humanizeFieldLabel`. */
function humanize(path: string): string {
  const leaf = String(path ?? '').split('.').pop() ?? '';
  return leaf
    .replace(/[_\-.]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

/** A step name safe to write as a bare token segment. */
function isBareName(name: string): boolean {
  return /^[A-Za-z0-9 _-]+$/.test(name) && name.trim() === name && name.length > 0;
}

/**
 * Build the step token for a path. Identical to `carryForward.stepToken`,
 * duplicated rather than imported so this module stays free of any dependency
 * that could pull React or run-time state into a design-time code path.
 */
function stepToken(stepName: string, path?: string): string {
  const name = String(stepName ?? '');
  const head = isBareName(name) ? `steps.${name}` : `steps['${name.replace(/'/g, "\\'")}']`;
  return path ? `{{${head}.${path}}}` : `{{${head}}}`;
}

/** Short, readable stand-in for a value the step has not produced yet. */
function examplePreview(field: OutputField): string {
  if (field.example !== undefined) {
    if (typeof field.example === 'object') {
      try {
        const text = JSON.stringify(field.example);
        return text.length > 40 ? `${text.slice(0, 39)}…` : text;
      } catch {
        return '…';
      }
    }
    return String(field.example);
  }
  switch (field.kind) {
    case 'dataset':
      return 'table';
    case 'array':
      return 'list';
    case 'object':
      return '{…}';
    case 'file':
      return 'file';
    case 'number':
      return '0';
    case 'boolean':
      return 'true';
    default:
      return '—';
  }
}

/** Maps a declared kind onto the `valueType` string the picker colours by. */
function toPickerType(field: OutputField): string {
  switch (field.kind) {
    case 'dataset':
      return 'array';
    case 'binary':
      return 'file';
    case 'any':
      return 'object';
    default:
      return field.kind;
  }
}

/* -------------------------------------------------------------------------- */
/*                          SCHEMA -> BINDING SOURCES                         */
/* -------------------------------------------------------------------------- */

export interface DeclaredSourceOptions {
  /** Include `technical` fields. The picker folds these away by default. */
  includeTechnical?: boolean;
  /** Expand `itemFields` as `<path>.first.<field>`. Default true. */
  expandItems?: boolean;
}

/**
 * Flatten one action's declared schema into binding sources for a step.
 *
 * Paths stay relative to the business payload, matching how
 * `executionContext.buildScope()` layers the unwrapped record into each step
 * view. A field declared as `rows` under `envelope: 'data'` is therefore
 * offered as `{{steps.Read Excel.rows}}` — the same token that will resolve at
 * run time — rather than as `{{steps.Read Excel.data.rows}}`.
 */
export function declaredSourcesForStep(
  stepName: string,
  schema: OutputSchema,
  options: DeclaredSourceOptions = {}
): BindingSource[] {
  const { includeTechnical = true, expandItems = true } = options;
  const sources: BindingSource[] = [];
  const seen = new Set<string>();
  const hasBusinessOutput = schema.hasBusinessOutput !== false;
  if (!hasBusinessOutput) return sources;

  const push = (field: OutputField, path: string, labelPrefix = ''): void => {
    if (seen.has(path)) return;
    const visibility: OutputVisibility = field.visibility ?? 'secondary';
    if (visibility === 'technical' && !includeTechnical) return;
    seen.add(path);

    sources.push({
      token: stepToken(stepName, path),
      path: `steps.${stepName}.${path}`,
      label: labelPrefix + (field.label ?? humanize(path)),
      valueType: toPickerType(field),
      preview: examplePreview(field),
      description: field.description,
    });
  };

  schema.fields.forEach((field) => {
    push(field, field.path);

    if (expandItems && field.itemFields?.length) {
      field.itemFields.forEach((item) => {
        push(item, `${field.path}.first.${item.path}`, 'First row · ');
      });
    }
  });

  // C7M4 root business-value semantics.
  // Explicit root values bind through $business because steps.X is the composite
  // execution view. Legacy field schemas keep their existing whole-step binding.
  if (schema.rootKind) {
    const rootValueType =
      schema.rootKind === 'dataset'
        ? 'array'
        : schema.rootKind === 'binary'
          ? 'file'
          : schema.rootKind === 'any'
            ? 'object'
            : schema.rootKind;
    const rootPreview =
      schema.rootKind === 'dataset'
        ? 'table'
        : schema.rootKind === 'array'
          ? '[...]'
          : schema.rootKind === 'object' || schema.rootKind === 'any'
            ? '{...}'
            : schema.rootKind === 'file' || schema.rootKind === 'binary'
              ? 'file'
              : schema.rootKind === 'number'
                ? '0'
                : schema.rootKind === 'boolean'
                  ? 'true'
                  : 'value';

    sources.unshift({
      token: stepToken(stepName, '$business'),
      path: `steps.${stepName}.$business`,
      label:
        schema.rootKind === 'dataset' || schema.producesDataSet
          ? 'Entire dataset'
          : 'Business output',
      valueType: rootValueType,
      preview: rootPreview,
      description: schema.notes,
    });
  } else if (!seen.has('')) {
    sources.unshift({
      token: stepToken(stepName),
      path: `steps.${stepName}`,
      label: schema.producesDataSet ? 'Entire dataset' : 'Entire output',
      valueType: schema.producesDataSet ? 'array' : 'object',
      preview: schema.producesDataSet ? 'table' : '{...}',
      description: schema.notes,
    });
  }

  return sources;
}

/**
 * Build the "expected output" groups for every step that has NOT yet run.
 *
 * Feed the result into the picker alongside the observed catalogue. Steps that
 * have run are skipped entirely, so a real value is never shadowed by a
 * promised one.
 */
export function buildDeclaredCatalogue(
  actions: WorkflowAction[],
  executedRecords: NodeOutputRecord[] = [],
  options: DeclaredSourceOptions = {}
): BindingSourceGroup[] {
  const executed = new Set(executedRecords.map((record) => record.nodeId));

  return actions
    .filter((action) => !executed.has(action.id))
    .filter((action) => !action.isControlNode)
    .map((action) => {
      const schema = (action as any).outputSchema as OutputSchema | undefined;
      if (!schema) return null;
      if (!schema.fields?.length && !schema.rootKind) return null;

      const stepName = action.name || action.id;
      const sources = declaredSourcesForStep(stepName, schema, options);
      if (sources.length === 0) return null;

      const group: BindingSourceGroup = {
        id: `declared:${action.id}`,
        label: stepName,
        icon: schema.producesDataSet ? 'Table' : 'Braces',
        description:
          schema.notes ??
          `Values ${stepName} will produce. Run the workflow to replace these with live results.`,
        defaultCollapsed: false,
        sources,
      };
      return group;
    })
    .filter((group): group is BindingSourceGroup => group !== null);
}

/**
 * Merge declared groups into an observed catalogue.
 *
 * Observed groups are emitted first and untouched. Declared groups are appended
 * only for steps with no observed group, so the picker's existing ordering and
 * behaviour are preserved exactly — this is purely additive.
 */
export function mergeCatalogues(
  observed: BindingSourceGroup[],
  declared: BindingSourceGroup[]
): BindingSourceGroup[] {
  const observedLabels = new Set(observed.map((group) => group.label));
  const additions = declared.filter((group) => !observedLabels.has(group.label));
  return [...observed, ...additions];
}

/* -------------------------------------------------------------------------- */
/*                            COLUMN RESOLUTION                               */
/* -------------------------------------------------------------------------- */

/**
 * Resolve the column names available to a node, from the step it is bound to.
 *
 * `PropertiesPanel.deriveFieldOptions` currently learns column names from a
 * *sample the user types into the node itself*. That is backwards for a
 * pipeline: the columns are already known — the upstream Read Excel step
 * declares them in its schema and reports them in its dataset — so making the
 * user retype them by hand is both wasted effort and a source of typos that
 * only surface at run time.
 *
 * Resolution order, most authoritative first:
 *   1. columns reported by the upstream step's actual dataset output
 *   2. headers reported by a legacy (pre-DataSet) tabular output
 *   3. columns declared in the upstream action's `outputSchema`
 *   4. nothing — caller falls back to its existing sample-based inference
 */
export function resolveUpstreamColumns(
  boundToken: string | undefined,
  actions: WorkflowAction[],
  records: NodeOutputRecord[] = []
): string[] {
  const stepName = stepNameFromToken(boundToken);
  if (!stepName) return [];

  const record = records.find(
    (candidate) => candidate.nodeName === stepName || candidate.stepKey === stepName
  );

  if (record?.output) {
    const observed = columnsFromOutput(record.output);
    if (observed.length > 0) return observed;
  }

  const action = actions.find((candidate) => (candidate.name || candidate.id) === stepName);
  const schema = (action as any)?.outputSchema as OutputSchema | undefined;
  if (schema?.fields) {
    const provider = schema.fields.find((field) => field.providesColumns && field.itemFields?.length);
    if (provider?.itemFields) return provider.itemFields.map((field) => field.path);
  }

  return [];
}

/** Extract `steps.X` / `steps['X']` from a token, if present. */
export function stepNameFromToken(token: string | undefined): string | null {
  if (typeof token !== 'string') return null;
  const quoted = token.match(/\{\{\s*steps\[['"]([^'"]+)['"]\]/);
  if (quoted) return quoted[1];
  const bare = token.match(/\{\{\s*steps\.([^.}\]]+)/);
  return bare ? bare[1].trim() : null;
}

/**
 * Column names carried by an arbitrary node output, whether it is a DataSet,
 * a legacy `{ headers, data }` table, or a bare array of row objects.
 *
 * Handles the transport envelope, because the same payload is reachable as
 * either `output.data.columns` or `output.columns` depending on which endpoint
 * produced it.
 */
export function columnsFromOutput(output: any): string[] {
  const candidates = [output, output?.data, output?.result, output?.payload].filter(
    (candidate) => candidate && typeof candidate === 'object'
  );

  for (const candidate of candidates) {
    // DataSet contract
    const columns = (candidate as any).columns as DataSetColumn[] | undefined;
    if (Array.isArray(columns) && columns.length > 0 && typeof columns[0]?.name === 'string') {
      return columns.map((column) => column.name);
    }

    // Legacy Excel contract
    const headers = (candidate as any).headers;
    if (Array.isArray(headers) && headers.every((header) => typeof header === 'string')) {
      return headers as string[];
    }

    // Bare rows
    for (const key of ['rows', 'data', 'records']) {
      const rows = (candidate as any)[key];
      if (Array.isArray(rows) && rows.length > 0 && rows[0] && typeof rows[0] === 'object') {
        const names: string[] = [];
        rows.slice(0, 25).forEach((row: any) => {
          Object.keys(row).forEach((name) => {
            if (!names.includes(name)) names.push(name);
          });
        });
        if (names.length > 0) return names;
      }
    }
  }

  if (Array.isArray(output) && output.length > 0 && typeof output[0] === 'object') {
    return Object.keys(output[0]);
  }

  return [];
}

/* -------------------------------------------------------------------------- */
/*                              CONTRACT DRIFT                                */
/* -------------------------------------------------------------------------- */

export interface ContractDrift {
  nodeId: string;
  stepName: string;
  /** Declared but absent from the observed output. */
  missing: string[];
  /** Present in the output but never declared. */
  undeclared: string[];
}

/**
 * Compare what a step promised against what it produced.
 *
 * Worth surfacing in the Execution Panel as a quiet warning rather than an
 * error. A missing declared field means every binding against it silently
 * resolves to nothing; an undeclared field means the picker will not offer
 * something the plugin genuinely returns. Both are cheap to fix once seen and
 * expensive to debug once shipped across a hundred connectors.
 *
 * Only top-level declared paths are checked. Descending further would turn a
 * cheap sanity check into a full structural diff, and the top level is where
 * contract breaks actually show up.
 */
export function detectContractDrift(
  action: WorkflowAction,
  record: NodeOutputRecord
): ContractDrift | null {
  const schema = (action as any).outputSchema as OutputSchema | undefined;
  if (!schema?.fields?.length || !record.output) return null;

  const payload =
    schema.envelope && (record.output as any)?.[schema.envelope] !== undefined
      ? (record.output as any)[schema.envelope]
      : record.output;

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;

  const present = new Set(Object.keys(payload));
  const declaredTop = new Set(schema.fields.map((field) => field.path.split('.')[0]));

  const missing = [...declaredTop].filter((path) => !present.has(path));
  const undeclared = [...present].filter(
    (key) => !declaredTop.has(key) && !key.startsWith('$') && !key.startsWith('_')
  );

  if (missing.length === 0 && undeclared.length === 0) return null;

  return {
    nodeId: record.nodeId,
    stepName: record.nodeName || record.stepKey || record.nodeId,
    missing,
    undeclared,
  };
}

/** Drift across a whole run. */
export function detectRunDrift(
  actions: WorkflowAction[],
  records: NodeOutputRecord[]
): ContractDrift[] {
  const byId = new Map(actions.map((action) => [action.id, action]));
  return records
    .map((record) => {
      const action = byId.get(record.nodeId);
      return action ? detectContractDrift(action, record) : null;
    })
    .filter((drift): drift is ContractDrift => drift !== null);
}