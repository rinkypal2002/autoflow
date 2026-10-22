/**
 * Plugin output contracts — what a step promises to produce, declared before
 * it ever runs.
 *
 * ── Why this file exists ──────────────────────────────────────────────────
 *
 * Every action in `automationCategories.ts` declares an *input* contract
 * (`properties` + `propertyConfig`) and no *output* contract. The consequence
 * is visible in the Binding Picker's own empty state:
 *
 *     "Run the workflow once to capture live outputs from every step."
 *
 * That sentence is the architecture speaking. Bindings are discovered by
 * observing a completed run, so until a workflow has been executed there is
 * nothing to bind to. A user building Read Excel → Filter → Insert must run a
 * half-built workflow, against real files, to find out what column names exist.
 *
 * Every platform in the reference set solves this the same way — by declaring
 * the output shape up front:
 *
 *   • UiPath          activity output arguments, typed in the activity metadata
 *   • Power Automate  connector Swagger defines the response schema, which is
 *                     what makes Dynamic Content work before the first run
 *   • Blue Prism      Object Studio outputs declared on the business object
 *   • Camunda         job worker output variables declared on the task
 *   • Automation Anywhere  package action output variables in the bot schema
 *
 * This file adds the same idea, additively. `outputSchema` is optional on every
 * action: an action without one behaves exactly as it does today (run-observed
 * bindings only), and an action with one becomes bindable at design time.
 *
 * ── What this does NOT change ─────────────────────────────────────────────
 *
 * Nothing at runtime. The executor still records real outputs, and a real
 * recorded output always wins over the declared schema — the schema is a
 * design-time promise, the recording is the observed truth. When they disagree,
 * the disagreement is surfaced as a warning rather than being resolved
 * silently, because a plugin whose output drifted from its contract is a defect
 * worth seeing.
 */

import type { DataSetValueType } from './workflow';

/* -------------------------------------------------------------------------- */
/*                                 VALUE KINDS                                */
/* -------------------------------------------------------------------------- */

/**
 * The shape of one declared output value.
 *
 * `dataset` is deliberately its own kind rather than `array`. A dataset is not
 * just a list — it carries columns, statistics, an optional server-side handle
 * and a row count that may exceed what travelled. Treating it as a plain array
 * is what makes a picker offer `rows[0].name` and nothing else, when what the
 * user needs is the column list, the aggregates, and the whole set.
 */
export type OutputValueKind =
  | 'string'
  | 'number'
  | 'boolean'
  | 'object'
  | 'array'
  | 'dataset'
  | 'file'
  | 'binary'
  | 'any';

/**
 * How prominently a declared value should be offered.
 *
 *   • `primary`    what most workflows bind. Shown first, expanded.
 *   • `secondary`  real business data, shown but not promoted.
 *   • `technical`  transport and diagnostics. Folded into Technical Details,
 *                  matching the existing `BindingSourceGroup.isTechnical`
 *                  behaviour so nothing about the picker's UX changes.
 */
export type OutputVisibility = 'primary' | 'secondary' | 'technical';

/* -------------------------------------------------------------------------- */
/*                               OUTPUT FIELDS                                */
/* -------------------------------------------------------------------------- */

/** One bindable value a step promises to produce. */
export interface OutputField {
  /**
   * Path relative to the step namespace, so the token is
   * `{{steps.<Step Name>.<path>}}`. Use the same dotted form the resolver
   * already understands: `data.rows`, `statistics.Amount.sum`.
   */
  path: string;

  /** Human label. Falls back to a humanised `path` when omitted. */
  label?: string;

  kind: OutputValueKind;

  /** Logical type when `kind` is a scalar, so DB steps can validate targets. */
  valueType?: DataSetValueType;

  description?: string;

  visibility?: OutputVisibility;

  /**
   * Example value, shown as the picker preview before any run has happened.
   * This is what makes a design-time binding feel as concrete as a
   * post-run one.
   */
  example?: any;

  /** True when the field is only present under some conditions. */
  optional?: boolean;

  /**
   * For `kind: 'array'` and `kind: 'dataset'` — the shape of one element.
   * Lets the picker offer `rows.first.<column>` without a sample row.
   */
  itemFields?: OutputField[];

  /**
   * Marks the field as carrying the column names of a dataset. The Properties
   * Panel reads this to populate `field-select` dropdowns from the *upstream*
   * step rather than from a sample the user has to type by hand.
   */
  providesColumns?: boolean;
}

/* -------------------------------------------------------------------------- */
/*                              OUTPUT SCHEMA                                 */
/* -------------------------------------------------------------------------- */

/**
 * The complete output contract for one action.
 *
 * `envelope` records the transport wrapper the plugin returns, so declared
 * paths stay relative to the business payload. The Excel plugin wraps
 * everything in `{ success, message, data: { … } }`; declaring
 * `envelope: 'data'` means a field written as `rows` is understood as
 * `data.rows` on the wire and as `{{steps.X.rows}}` in a binding — which is
 * exactly how `carryForward.unwrapEnvelope` already behaves at runtime. The two
 * halves therefore agree by construction rather than by convention.
 */
export interface OutputSchema {
  /** Bump when a plugin's output shape changes incompatibly. */
  version?: string;

  /** Transport wrapper key, e.g. `data`. Empty when the payload is top level. */
  envelope?: string;

  /** Type of the entire business payload when it is an explicit root value. */
  rootKind?: OutputValueKind;

  /** Explicitly false when successful execution intentionally has no business payload. */
  hasBusinessOutput?: boolean;

  /**
   * True when the step's business payload is a DataSet. Drives dataset-aware
   * rendering in the Execution Panel and dataset-aware binding groups.
   */
  producesDataSet?: boolean;

  /** Declared bindable values. */
  fields: OutputField[];

  /**
   * Free-form notes shown in the picker's group description. Good place for
   * "rows may be paged — bind the dataset, not rows[0]".
   */
  notes?: string;
}

/* -------------------------------------------------------------------------- */
/*                                OUTPUT PORTS                                */
/* -------------------------------------------------------------------------- */

/**
 * A named branch a step can route from.
 *
 * `OutputField` and `OutputPort` answer different questions and both are needed.
 * A field is *bindable* — "this value exists, you may reference it from
 * anywhere". A port is *routable* — "execution leaves here, and whatever you
 * connect receives this value as its input". Filter Rows declares
 * `unmatchedData` as a field so any later step can inspect it, and as a port so
 * an exception branch can be driven by it without knowing the field's name.
 *
 * Declaring a port is what makes the canvas draw a second handle and what lets
 * `Connection.sourcePort` mean something. A step that declares none keeps
 * exactly one output, as every step has until now.
 */
export interface OutputPort {
  /** Stable identifier stored on `Connection.sourcePort`. Never localise. */
  id: string;

  /** Label on the canvas handle, e.g. `Matched Rows`. */
  label: string;

  /**
   * Path to this branch's value within the step's *business* payload — the
   * same frame `OutputField.path` uses, so the transport envelope is stripped
   * for both. Omit to route the whole output.
   */
  payloadPath?: string;

  kind?: OutputValueKind;

  description?: string;

  /**
   * The main path. Used when a user drags from the node body rather than from a
   * specific handle, and for ordering. Exactly one port should set it.
   */
  isDefault?: boolean;

  /**
   * Rendering and validation hint.
   *
   *   • `primary`    the happy path.
   *   • `exception`  rejects, errors, review queues. Drawn in the warning
   *                  colour, and left unconnected it is reported as rows being
   *                  dropped without review rather than as a dead branch.
   *   • `neutral`    everything else.
   */
  tone?: 'primary' | 'exception' | 'neutral';

  /**
   * Suppress the branch when its slice carries zero records, so a nightly
   * exception report does not fire on a clean run. Applies only to countable
   * slices, and a single connection can override it with
   * `metadata.routeWhenEmpty`.
   */
  skipWhenEmpty?: boolean;

  /** Leaving this port unconnected is normal; do not warn about it. */
  optional?: boolean;
}

/* -------------------------------------------------------------------------- */
/*                              EXECUTION MODE                                */
/* -------------------------------------------------------------------------- */

/**
 * How the executor should complete an action.
 *
 *   • `api`          the action calls a backend endpoint. Requires `api.url`.
 *                    This is the default and the behaviour of every action that
 *                    existed before this field, so an action that omits
 *                    `executionMode` is untouched.
 *   • `passthrough`  the action completes locally. Its resolved properties
 *                    become its output and are carried forward, with no request
 *                    ever sent.
 *
 * ── Why a declared mode rather than a per-action branch ───────────────────
 *
 * A step that only *collects* configuration — a scan's identifiers, the paths a
 * later step will read, the thresholds it will apply — has no endpoint of its
 * own. Before this field the executor had exactly one shape for a non-control
 * node ("resolve properties, POST them somewhere"), so such a step could only
 * be built by inventing a no-op endpoint for it, or by special-casing its
 * `type` inside the executor. The first is a lie on the wire; the second grows
 * one branch per plugin and is how an executor becomes unmaintainable.
 *
 * Declaring the mode as data keeps the executor at *two* shapes for any number
 * of plugins, and keeps the whole resolve → parse → coerce → validate pipeline
 * shared between them: a pass-through step still honours its `propertyConfig`,
 * still reports coercions, and still blocks on a missing required field. The
 * only thing it skips is the request.
 */
export type ActionExecutionMode = 'api' | 'passthrough';

/* -------------------------------------------------------------------------- */
/*                          ACTION CONTRACT EXTENSION                         */
/* -------------------------------------------------------------------------- */

/**
 * The additive slice bolted onto `WorkflowAction` and onto every catalogue
 * entry. Declared separately so `workflow.ts` needs a one-line change rather
 * than a restructure:
 *
 *     export interface WorkflowAction extends Partial<PluginContract> { … }
 *
 * Every member is optional, so all 349 existing actions type-check unchanged.
 */
export interface PluginContract {
  /**
   * How the executor completes this action. Absent means `'api'`, which is what
   * every pre-existing action does, so this field is additive by construction.
   */
  executionMode?: ActionExecutionMode;

  /** What this action produces. */
  outputSchema?: OutputSchema;

  /**
   * Named branches this action routes from. Absent or empty means one output
   * carrying the whole result — the shape every action had before ports
   * existed, and the shape every saved workflow still relies on.
   */
  outputPorts?: OutputPort[];

  /**
   * Declares that this action consumes a dataset produced upstream, and which
   * property carries it. The Properties Panel uses this to resolve column
   * dropdowns from the bound step instead of from a locally typed sample.
   */
  consumesDataSet?: {
    /** Property name holding the dataset binding, e.g. `input` or `records`. */
    property: string;
    /** True when the action requires a dataset rather than merely accepting one. */
    required?: boolean;
  };

  /**
   * Rough cost signal for the scheduler and for UI warnings. `heavy` marks
   * steps that should not be run casually against production data.
   */
  cost?: 'light' | 'moderate' | 'heavy';

  /**
   * True when re-running the action with identical input is safe. The retry
   * policy should refuse to auto-retry a non-idempotent write — re-running a
   * partially-succeeded batch insert is how duplicate rows are created.
   */
  idempotent?: boolean;
}

/* -------------------------------------------------------------------------- */
/*                            REUSABLE SCHEMA PARTS                           */
/* -------------------------------------------------------------------------- */

/**
 * The standard field set every DataSet-producing plugin declares — Excel, CSV,
 * Google Sheets, JDBC, SAP, Salesforce.
 *
 * Sharing one definition is the point. When a hundred plugins each hand-roll
 * their own idea of "a table of rows", the Filter node has to special-case a
 * hundred shapes. When they all declare these fields, Filter is written once
 * and works against every source that ever gets added.
 */
export const DATASET_OUTPUT_FIELDS: OutputField[] = [
  {
    path: 'rows',
    label: 'Rows',
    kind: 'dataset',
    visibility: 'primary',
    description:
      'Every row as an object keyed by column name. Bind this whole value into a Filter, Transform or Insert step.',
    providesColumns: true,
  },
  {
    path: 'columns',
    label: 'Columns',
    kind: 'array',
    visibility: 'primary',
    description: 'Column definitions: name, type, nullability, suggested SQL type.',
    providesColumns: true,
  },
  {
    path: 'rowCount',
    label: 'Row Count',
    kind: 'number',
    valueType: 'INTEGER',
    visibility: 'primary',
    example: 1248,
    description: 'Total rows in the source, which may exceed the rows returned.',
  },
  {
    path: 'statistics',
    label: 'Statistics',
    kind: 'object',
    visibility: 'secondary',
    description:
      'Per-column aggregates computed server side. Prefer {{…statistics.Column.sum}} over piping rows through a filter — it is O(1) and covers the whole sheet, not just the page that travelled.',
  },
  {
    path: 'indexes',
    label: 'Lookup Indexes',
    kind: 'object',
    visibility: 'secondary',
    description: 'Value to row-number maps for the columns that were indexed.',
  },
  {
    path: 'page',
    label: 'Page',
    kind: 'object',
    visibility: 'technical',
    description: 'offset, limit, returned, total, hasMore.',
  },
  {
    path: 'datasetId',
    label: 'Dataset Handle',
    kind: 'string',
    valueType: 'STRING',
    visibility: 'technical',
    description:
      'Server-side handle. Pass this between steps instead of the rows when the dataset is large.',
  },
  {
    path: 'schemaVersion',
    label: 'Schema Version',
    kind: 'string',
    valueType: 'STRING',
    visibility: 'technical',
  },
];

/**
 * Builds a DataSet output schema for a plugin, with optional extra fields.
 *
 * @param envelope  transport wrapper key. `'data'` for the Excel plugin's
 *                  `{ success, message, data }` response.
 * @param extra     source-specific additions, e.g. Excel's `sheetName`.
 */
export function datasetOutputSchema(
  envelope = 'data',
  extra: OutputField[] = [],
  notes?: string
): OutputSchema {
  return {
    version: '1.0',
    envelope,
    producesDataSet: true,
    fields: [...DATASET_OUTPUT_FIELDS, ...extra],
    notes,
  };
}

/**
 * The legacy field set the pre-DataSet Excel endpoints return. Declared so the
 * existing `read-sheet` and `read-workbook` actions become design-time bindable
 * too — the upgrade must not leave the old actions worse off than the new one,
 * or teams will feel pushed to migrate before they are ready.
 */
export const LEGACY_TABLE_OUTPUT_FIELDS: OutputField[] = [
  {
    path: 'headers',
    label: 'Headers',
    kind: 'array',
    visibility: 'primary',
    description: 'Column names, in sheet order.',
    providesColumns: true,
  },
  {
    path: 'data',
    label: 'Rows',
    kind: 'array',
    visibility: 'primary',
    description:
      'Rows keyed by header name. Values are Excel display strings — "$1,234.57", "25-Dec-24" — not typed values.',
    providesColumns: true,
  },
  {
    path: 'totalRows',
    label: 'Total Rows',
    kind: 'number',
    valueType: 'INTEGER',
    visibility: 'primary',
    example: 1248,
  },
  {
    path: 'totalColumns',
    label: 'Total Columns',
    kind: 'number',
    valueType: 'INTEGER',
    visibility: 'secondary',
    example: 7,
  },
];