/**
 * Data Transformation operations — the frontend half of the
 * DataTransformerApplication contract.
 *
 * ── One rule governs this file ────────────────────────────────────────────
 *
 * Every `propertyConfig` key here is a real field on the corresponding backend
 * request DTO, every dropdown option is a value the backend's enum or checked
 * string set accepts, and every `api.body` key matches the DTO exactly. Where
 * the two could drift, the backend wins — it is the source of truth, and a
 * frontend that offers an option the service rejects is worse than one that
 * offers nothing, because the failure only appears at run time.
 *
 * ── Two corrections worth knowing before you bind anything ────────────────
 *
 * 1. Rows come back on `data`, not `rows`. `TransformationResponse` is flat —
 *    `{ status, message, processingTimeMs, data, rowCount, columns, … }` — with
 *    the rows in `data`. There is no `{ success, data: { … } }` wrapper, so
 *    `carryForward.unwrapEnvelope` correctly does not unwrap it. Verified:
 *    `{{previous.data}}` resolves to the row array; `{{previous.rows}}` resolves
 *    to nothing.
 *
 * 2. There is no `metadata` or `statistics` on a transformation response. Those
 *    belong to the Excel dataset endpoint. The transformation equivalent is
 *    `/profile`, which returns one row per column — so its statistics arrive as
 *    `data`, like everything else.
 *
 * ── No sample data ────────────────────────────────────────────────────────
 *
 * The previous six actions defaulted `data` to hardcoded rows (`Ada`, `Grace`).
 * That is a demo convenience that becomes a production hazard: a user who
 * forgets to rebind ships a workflow that silently transforms two fictional
 * people instead of their sheet. Every action here defaults to
 * `{{previous.data}}`, which is what the field is actually for.
 */

import type { OutputField, OutputPort, OutputSchema, PluginContract } from '../../types/pluginContract';

/* -------------------------------------------------------------------------- */
/*                              SHARED CONTRACT                               */
/* -------------------------------------------------------------------------- */

const ENGINE_BASE = 'http://localhost:8080/engine';
const TRANSFORM_BASE = `${ENGINE_BASE}/api/data-transform`;
const CATEGORY = 'data-transform-017';

/**
 * The response every transformation endpoint returns.
 *
 * `envelope: ''` because the payload is top level — declaring `'data'` here
 * would tell the binding layer that `data` is a wrapper to strip, and the rows
 * would disappear.
 */

const DATA_TRANSFORM_ACTION_LOGOS: Record<string, string> = {
  'select-columns': 'select_columns.png',
  'rename-columns': 'rename_columns.png',
  'add-column': 'add_column.png',
  'split-column': 'split_column.png',
  'merge-columns': 'merge_columns.png',
  'text-operation': 'text_operation.png',
  'replace-values': 'replace_values.png',
  'fill-empty': 'fill_empty_values.png',
  'convert-types': 'convert_types.png',
  'add-calculated-column': 'calculated_column.png',
  'filter-rows': 'filter_rows.png',
  'extract-fields': 'regex.png',
  'sort-rows': 'sort_rows.png',
  'deduplicate': 'remove_duplicates.png',
  'add-sequence': 'add_sequence.png',
  aggregate: 'group_aggregate.png',
  join: 'join_datasets.png',
  lookup: 'lookup.png',
  union: 'union_datasets.png',
  pivot: 'pivot.png',
  unpivot: 'unpivot.png',
  validate: 'validate_rows.png',
  profile: 'profile_dataset.png',
  'transform-pipeline': 'transformation_pipeline.png',
};

const TRANSFORM_OUTPUT_FIELDS: OutputField[] = [
  {
    path: 'data',
    label: 'Rows',
    kind: 'dataset',
    visibility: 'primary',
    providesColumns: true,
    description:
      'The transformed rows. Bind this into the next step, or into a database insert.',
  },
  {
    path: 'rowCount',
    label: 'Row Count',
    kind: 'number',
    valueType: 'INTEGER',
    visibility: 'primary',
    example: 1248,
    description: 'Rows returned. Derived from the rows themselves, so it cannot disagree with them.',
  },
  {
    path: 'columns',
    label: 'Columns',
    kind: 'array',
    visibility: 'primary',
    providesColumns: true,
    // A neutral placeholder. This is only what the binding picker shows before
    // a run; the real values come from whatever the upstream step produced —
    // sheet headers, SQL column names, JSON keys. Naming spreadsheet columns
    // here would imply the engine is Excel-shaped, which it is not.
    example: ['column_1', 'column_2', 'column_3'],
    description: 'Column names in order, as produced by the upstream step.',
  },
  {
    path: 'removedCount',
    label: 'Removed Count',
    kind: 'number',
    valueType: 'INTEGER',
    visibility: 'secondary',
    optional: true,
    example: 12,
    description: 'Rows the operation dropped — filtered out or deduplicated.',
  },
  {
    path: 'rejectedRows',
    label: 'Rejected Rows',
    kind: 'array',
    visibility: 'secondary',
    optional: true,
    description:
      'Rows that failed validation when onInvalid=SEPARATE. Send these to a report rather than discarding them.',
  },
  {
    path: 'violations',
    label: 'Violations',
    kind: 'array',
    visibility: 'secondary',
    optional: true,
    description: 'Row number, column, rule and message for every failure.',
  },
  {
    path: 'warnings',
    label: 'Warnings',
    kind: 'array',
    visibility: 'secondary',
    optional: true,
    description:
      'Non-fatal observations — a lookup that missed, a join key that is not unique, a mixed-type column. Never a reason to fail a run, always worth reading.',
  },
  {
    path: 'status',
    label: 'Status',
    kind: 'string',
    valueType: 'STRING',
    visibility: 'technical',
    example: 'SUCCESS',
  },
  {
    path: 'message',
    label: 'Message',
    kind: 'string',
    valueType: 'STRING',
    visibility: 'technical',
    example: 'Filter completed: 4 of 6 rows kept',
  },
  {
    path: 'processingTimeMs',
    label: 'Processing Time (ms)',
    kind: 'number',
    valueType: 'INTEGER',
    visibility: 'technical',
    example: 3,
  },
];

function transformOutput(notes?: string, extra: OutputField[] = []): OutputSchema {
  return {
    version: '1.0',
    envelope: '',
    producesDataSet: true,
    fields: [...TRANSFORM_OUTPUT_FIELDS, ...extra],
    notes,
  };
}

/**
 * Extract Fields is intentionally NOT dataset-shaped. The backend returns one
 * structured object at the top level: { status, message, processingTimeMs,
 * fields, matchedCount, unmatchedFields, warnings? }. Keeping `envelope: ''`
 * preserves paths such as `fields.invoiceNumber`; declaring `data` here would
 * invent a wrapper the backend does not return.
 */
const EXTRACT_FIELDS_OUTPUT: OutputSchema = {
  version: '1.0',
  envelope: '',
  rootKind: 'object',
  producesDataSet: false,
  fields: [
    {
      path: 'fields',
      label: 'Extracted Fields',
      kind: 'object',
      visibility: 'primary',
      description:
        'The structured values keyed by each rule name. Dynamic keys remain bindable as fields.<name>, for example fields.invoiceNumber.',
    },
    {
      path: 'matchedCount',
      label: 'Matched Count',
      kind: 'number',
      valueType: 'INTEGER',
      visibility: 'primary',
      example: 5,
    },
    {
      path: 'unmatchedFields',
      label: 'Unmatched Fields',
      kind: 'array',
      visibility: 'secondary',
      example: [],
      description: 'Rule names that found no value and had no default.',
    },
    {
      path: 'warnings',
      label: 'Warnings',
      kind: 'array',
      visibility: 'secondary',
      optional: true,
      description: 'Non-fatal observations such as a default being used or an all-matches result being truncated.',
    },
    {
      path: 'status',
      label: 'Status',
      kind: 'string',
      valueType: 'STRING',
      visibility: 'technical',
      example: 'SUCCESS',
    },
    {
      path: 'message',
      label: 'Message',
      kind: 'string',
      valueType: 'STRING',
      visibility: 'technical',
      example: 'Extracted 5 of 5 field(s)',
    },
    {
      path: 'processingTimeMs',
      label: 'Processing Time (ms)',
      kind: 'number',
      valueType: 'INTEGER',
      visibility: 'technical',
      example: 3,
    },
  ],
  notes:
    'This action produces one object, not rows. Bind a specific value with fields.<ruleName>, or bind the whole fields object into a downstream insert/mapping step.',
};

/**
 * The pass / reject port pair shared by every step that splits a dataset in two.
 *
 * Written once because the semantics must not drift between Filter and
 * Validate. A workflow author who learns that the lower, amber handle is "the
 * rows that did not make it, route them somewhere a person will look" should
 * find that true of every splitting step, not just the one they learned it on.
 *
 * `skipWhenEmpty` on the reject port is the deliberate part: a clean run should
 * not send an exception report containing nothing.
 */
function passRejectPorts(config: {
  passId: string;
  passLabel: string;
  passPath: string;
  rejectId: string;
  rejectLabel: string;
  rejectPath: string;
  passDescription: string;
  rejectDescription: string;
}): OutputPort[] {
  return [
    {
      id: config.passId,
      label: config.passLabel,
      payloadPath: config.passPath,
      kind: 'dataset',
      isDefault: true,
      tone: 'primary',
      description: config.passDescription,
    },
    {
      id: config.rejectId,
      label: config.rejectLabel,
      payloadPath: config.rejectPath,
      kind: 'dataset',
      tone: 'exception',
      skipWhenEmpty: true,
      description: config.rejectDescription,
    },
  ];
}

/** Shared contract slice: consumes a dataset on `data`, returns one. */
const datasetInOut = (notes?: string, extra: OutputField[] = []): PluginContract => ({
  consumesDataSet: { property: 'data', required: true },
  outputSchema: transformOutput(notes, extra),
  idempotent: true,
  cost: 'moderate',
});

/**
 * The dataset input every operation shares.
 *
 * `json-editor` rather than a plain string field because the value is normally a
 * binding token but may legitimately be an inline array during development.
 */
const DATA_INPUT = {
  type: 'array' as const,
  label: 'Input Rows',
  required: true,
  uiType: 'dataset-source',
  group: 'Input',
  description:
    'Which upstream step supplies the rows. Defaults to the previous step; pick another when the data you want is further back.',
};

const base = {
  category: CATEGORY,
  color: 'bg-violet-500',
  complexity: 'basic' as const,
  supportsStreaming: false,
  requiresAuth: false,
  retryable: true,
  timeout: 120000,
  estimatedTime: 800,
};

const jsonHeaders = { 'Content-Type': 'application/json' };

/* -------------------------------------------------------------------------- */
/*                              COLUMN SHAPE                                  */
/* -------------------------------------------------------------------------- */

export const SELECT_COLUMNS_ACTION = {
  ...base,
  ...datasetInOut(),
  type: 'select-columns',
  name: 'Select Columns',
  description: 'Choose, reorder or remove columns, and page rows.',
  icon: 'Columns',
  tags: ['columns', 'select', 'remove', 'reorder', 'limit'],
  api: {
    url: `${TRANSFORM_BASE}/select-columns`,
    method: 'POST',
    headers: jsonHeaders,
    body: {
      data: '{{data}}',
      columns: '{{columns}}',
      excludeColumns: '{{excludeColumns}}',
      offset: '{{offset}}',
      limit: '{{limit}}',
    },
  },
  properties: {
    data: '{{previous.data}}',
    columns: [],
    excludeColumns: [],
    offset: 0,
    limit: -1,
  },
  propertyConfig: {
    data: DATA_INPUT,
    columns: {
      type: 'array',
      label: 'Keep Columns',
      required: false,
      uiType: 'string-list',
      group: 'Columns',
      addLabel: 'Add Column',
      description:
        'In this order. Leave empty to keep every column. Ordering here is what lines a dataset up with a target table before inserting.',
    },
    excludeColumns: {
      type: 'array',
      label: 'Remove Columns',
      required: false,
      uiType: 'string-list',
      group: 'Columns',
      addLabel: 'Add Column',
      description: 'Applied after Keep Columns.',
    },
    offset: {
      type: 'number',
      label: 'Offset',
      required: false,
      uiType: 'number',
      min: 0,
      group: 'Paging',
    },
    limit: {
      type: 'number',
      label: 'Limit',
      required: false,
      uiType: 'number',
      group: 'Paging',
      description: '-1 returns every row.',
    },
  },
};

export const RENAME_COLUMNS_ACTION = {
  ...base,
  ...datasetInOut(),
  type: 'rename-columns',
  name: 'Rename Columns',
  description: 'Rename one or more columns, keeping each in place.',
  icon: 'Edit3',
  tags: ['rename', 'columns', 'mapping'],
  api: {
    url: `${TRANSFORM_BASE}/rename-columns`,
    method: 'POST',
    headers: jsonHeaders,
    body: {
      data: '{{data}}',
      mappings: '{{mappings}}',
      failOnMissingColumn: '{{failOnMissingColumn}}',
    },
  },
  properties: {
    data: '{{previous.data}}',
    mappings: {},
    failOnMissingColumn: false,
  },
  propertyConfig: {
    data: DATA_INPUT,
    mappings: {
      type: 'object',
      label: 'Rename Mappings',
      required: true,
      uiType: 'key-value',
      keyLabel: 'Current Name',
      valueLabel: 'New Name',
      group: 'Mapping',
      description: 'Each column keeps its position; only the name changes.',
    },
    failOnMissingColumn: {
      type: 'boolean',
      label: 'Fail On Missing Column',
      required: false,
      uiType: 'boolean',
      group: 'Behaviour',
      description:
        'Worth turning on. A rename that silently no-ops because of a typo leaves the column under its old name, and the failure lands much later at the insert.',
    },
  },
};

export const ADD_COLUMN_ACTION = {
  ...base,
  ...datasetInOut(),
  type: 'add-column',
  name: 'Add Column',
  description: 'Add a column from a constant, a copy of another column, or a formula.',
  icon: 'PlusCircle',
  tags: ['add', 'column', 'constant', 'copy', 'expression'],
  api: {
    url: `${TRANSFORM_BASE}/add-column`,
    method: 'POST',
    headers: jsonHeaders,
    body: {
      data: '{{data}}',
      columnName: '{{columnName}}',
      source: '{{source}}',
      value: '{{value}}',
      sourceColumn: '{{sourceColumn}}',
      expression: '{{expression}}',
      position: '{{position}}',
      overwrite: '{{overwrite}}',
    },
  },
  properties: {
    data: '{{previous.data}}',
    columnName: '',
    source: 'CONSTANT',
    value: '',
    sourceColumn: '',
    expression: '',
    position: -1,
    overwrite: false,
  },
  propertyConfig: {
    data: DATA_INPUT,
    columnName: {
      type: 'string',
      label: 'Column Name',
      required: true,
      uiType: 'string',
      group: 'Column',
    },
    source: {
      type: 'string',
      label: 'Value From',
      required: true,
      uiType: 'select',
      options: ['CONSTANT', 'COPY', 'EXPRESSION'],
      group: 'Column',
    },
    value: {
      type: 'string',
      label: 'Constant Value',
      required: false,
      uiType: 'string',
      group: 'Column',
      visibleWhen: { source: 'CONSTANT' },
    },
    sourceColumn: {
      type: 'string',
      label: 'Copy From Column',
      required: false,
      uiType: 'field-select',
      group: 'Column',
      visibleWhen: { source: 'COPY' },
    },
    expression: {
      type: 'string',
      label: 'Expression',
      required: false,
      uiType: 'string',
      placeholder: 'price * quantity',
      group: 'Column',
      visibleWhen: { source: 'EXPRESSION' },
      description:
        'Numeric columns only, and column names must contain no spaces — the expression engine cannot reference a name like "Total Amount". Rename the column first if needed.',
    },
    position: {
      type: 'number',
      label: 'Position',
      required: false,
      uiType: 'number',
      group: 'Placement',
      description:
        '-1 appends. Position matters for a positional INSERT, and a derived column reads better next to what it came from.',
    },
    overwrite: {
      type: 'boolean',
      label: 'Overwrite If Exists',
      required: false,
      uiType: 'boolean',
      group: 'Placement',
    },
  },
};

export const SPLIT_COLUMN_ACTION = {
  ...base,
  ...datasetInOut(),
  type: 'split-column',
  name: 'Split Column',
  description: 'Split one column into several by a delimiter.',
  icon: 'Split',
  tags: ['split', 'delimiter', 'column'],
  api: {
    url: `${TRANSFORM_BASE}/split-column`,
    method: 'POST',
    headers: jsonHeaders,
    body: {
      data: '{{data}}',
      field: '{{field}}',
      delimiter: '{{delimiter}}',
      newFields: '{{newFields}}',
    },
  },
  properties: {
    data: '{{previous.data}}',
    field: '',
    delimiter: ',',
    newFields: [],
  },
  propertyConfig: {
    data: DATA_INPUT,
    field: {
      type: 'string',
      label: 'Source Column',
      required: true,
      uiType: 'field-select',
      group: 'Split',
    },
    delimiter: {
      type: 'string',
      label: 'Delimiter',
      required: true,
      uiType: 'string',
      group: 'Split',
      description: 'A single space is valid here.',
    },
    newFields: {
      type: 'array',
      label: 'New Column Names',
      required: true,
      uiType: 'string-list',
      addLabel: 'Add Column',
      group: 'Split',
      description: 'In order. Parts beyond this list are discarded.',
    },
  },
};

export const MERGE_COLUMNS_ACTION = {
  ...base,
  ...datasetInOut(),
  type: 'merge-columns',
  name: 'Merge Columns',
  description: 'Join several columns into one.',
  icon: 'Combine',
  tags: ['merge', 'concat', 'columns'],
  api: {
    url: `${TRANSFORM_BASE}/merge-columns`,
    method: 'POST',
    headers: jsonHeaders,
    body: {
      data: '{{data}}',
      sourceColumns: '{{sourceColumns}}',
      targetColumn: '{{targetColumn}}',
      separator: '{{separator}}',
      enclosure: '{{enclosure}}',
      maxLength: '{{maxLength}}',
      skipBlanks: '{{skipBlanks}}',
    },
  },
  properties: {
    data: '{{previous.data}}',
    sourceColumns: [],
    targetColumn: '',
    separator: ' ',
    enclosure: '',
    maxLength: 0,
    skipBlanks: false,
  },
  propertyConfig: {
    data: DATA_INPUT,
    sourceColumns: {
      type: 'array',
      label: 'Source Columns',
      required: true,
      uiType: 'string-list',
      addLabel: 'Add Column',
      group: 'Merge',
    },
    targetColumn: {
      type: 'string',
      label: 'Target Column',
      required: true,
      uiType: 'string',
      group: 'Merge',
    },
    separator: {
      type: 'string',
      label: 'Separator',
      required: false,
      uiType: 'string',
      group: 'Merge',
    },
    enclosure: {
      type: 'string',
      label: 'Enclosure',
      required: false,
      uiType: 'string',
      group: 'Options',
      description: 'Wraps each value, e.g. a quote character.',
    },
    maxLength: {
      type: 'number',
      label: 'Max Length',
      required: false,
      uiType: 'number',
      min: 0,
      group: 'Options',
      description: '0 means no limit.',
    },
    skipBlanks: {
      type: 'boolean',
      label: 'Skip Blank Values',
      required: false,
      uiType: 'boolean',
      group: 'Options',
      description: 'Leaves out empty sources rather than producing gaps in the result.',
    },
  },
};

/* -------------------------------------------------------------------------- */
/*                               CELL VALUES                                  */
/* -------------------------------------------------------------------------- */

export const TEXT_OPERATION_ACTION = {
  ...base,
  ...datasetInOut(),
  type: 'text-operation',
  name: 'Text Operation',
  description: 'Trim, change case, pad, normalise or substring one or more text columns.',
  icon: 'Type',
  tags: ['text', 'trim', 'case', 'pad', 'normalize'],
  api: {
    url: `${TRANSFORM_BASE}/text-operation`,
    method: 'POST',
    headers: jsonHeaders,
    body: {
      data: '{{data}}',
      columns: '{{columns}}',
      operation: '{{operation}}',
      argument: '{{argument}}',
      targetColumn: '{{targetColumn}}',
    },
  },
  properties: {
    data: '{{previous.data}}',
    columns: [],
    operation: 'TRIM',
    argument: '',
    targetColumn: '',
  },
  propertyConfig: {
    data: DATA_INPUT,
    columns: {
      type: 'array',
      label: 'Columns',
      required: true,
      uiType: 'string-list',
      addLabel: 'Add Column',
      group: 'Text',
      description: 'Whitespace arrives in every text column at once — list them all here.',
    },
    operation: {
      type: 'string',
      label: 'Operation',
      required: true,
      uiType: 'select',
      group: 'Text',
      // Exactly the StringOperation enum.
      options: [
        'UPPERCASE',
        'LOWERCASE',
        'TRIM',
        'TRIM_START',
        'TRIM_END',
        'CAPITALIZE',
        'TITLE_CASE',
        'REVERSE',
        'LENGTH',
        'SUBSTRING',
        'REPLACE',
        'NORMALIZE_WHITESPACE',
        'REMOVE_NON_NUMERIC',
        'REMOVE_NON_ALPHANUMERIC',
        'PAD_LEFT',
        'PAD_RIGHT',
        'PREFIX',
        'SUFFIX',
      ],
    },
    argument: {
      type: 'string',
      label: 'Argument',
      required: false,
      uiType: 'string',
      group: 'Text',
      visibleWhen: {
        operation: ['SUBSTRING', 'REPLACE', 'PAD_LEFT', 'PAD_RIGHT', 'PREFIX', 'SUFFIX'],
      },
      description:
        "SUBSTRING: 'start' or 'start,end'. REPLACE: 'search,replacement'. PAD_LEFT/PAD_RIGHT: 'length' or 'length,padChar'. PREFIX/SUFFIX: the text to add.",
    },
    targetColumn: {
      type: 'string',
      label: 'Write To Column',
      required: false,
      uiType: 'string',
      group: 'Options',
      description:
        'Leave empty to overwrite the source. Only valid with a single source column.',
    },
  },
};

/**
 * Pull named, typed values out of arbitrary text with caller-supplied regular
 * expressions. This is deliberately separate from Text Operation: it consumes
 * one text block and produces one structured object, rather than transforming a
 * dataset column.
 */
export const EXTRACT_FIELDS_ACTION = {
  ...base,
  type: 'extract-fields',
  name: 'Regex',
  description: 'Extract named, typed fields from text using reusable regex rules.',
  icon: 'Braces',
  tags: ['extract', 'regex', 'parse', 'text', 'fields', 'structured'],
  complexity: 'intermediate' as const,
  cost: 'moderate' as const,
  idempotent: true,
  estimatedTime: 400,
  outputSchema: EXTRACT_FIELDS_OUTPUT,
  api: {
    url: `${TRANSFORM_BASE}/extract-fields`,
    method: 'POST',
    headers: jsonHeaders,
    body: {
      text: '{{text}}',
      fields: '{{fields}}',
      ignoreCase: '{{ignoreCase}}',
      multiline: '{{multiline}}',
      dotAll: '{{dotAll}}',
    },
  },
  properties: {
    // File Operations -> Extract Text is a transport-wrapped response, but the
    // carry-forward layer exposes its business payload directly, so `text` is
    // the correct previous-step binding rather than `data.text`.
    text: '{{previous.text}}',
    fields: [],
    ignoreCase: false,
    multiline: true,
    dotAll: false,
  },
  propertyConfig: {
    text: {
      type: 'textarea',
      label: 'Source Text',
      required: false,
      rows: 6,
      group: 'Input',
      placeholder: '{{previous.text}}',
      description:
        'Text to parse. Usually bind File Operations -> Extract Text, OCR text, an email body, a log, or an API response. Blank text is allowed; unmatched rules are reported.',
    },
    fields: {
      type: 'array',
      label: 'Extraction Rules',
      required: true,
      uiType: 'object-grid',
      stacked: true,
      addLabel: 'Add Field',
      group: 'Fields',
      itemSchema: {
        name: {
          type: 'string',
          label: 'Field Name',
          required: true,
          placeholder: 'invoiceNumber',
          description: 'Stable output key used by downstream bindings: fields.<name>.',
        },
        pattern: {
          type: 'string',
          label: 'Regex Pattern',
          required: true,
          placeholder: 'INVOICE_NUMBER:\\s*(\\S+)',
          description: 'Java regular-expression syntax. Patterns are limited to 500 characters by the backend.',
        },
        group: {
          type: 'number',
          label: 'Capture Group',
          min: 0,
          defaultValue: 1,
          emptyAsNull: true,
          description: '0 = whole match; 1 = first parenthesised capture (default).',
        },
        type: {
          type: 'string',
          label: 'Value Type',
          uiType: 'select',
          required: true,
          options: ['STRING', 'INTEGER', 'DECIMAL', 'BOOLEAN', 'DATE', 'TIMESTAMP'],
          defaultValue: 'STRING',
        },
        format: {
          type: 'string',
          label: 'Date/Time Format',
          placeholder: 'dd-MM-yyyy',
          description: 'Only for DATE or TIMESTAMP when the source is not unambiguous ISO-8601.',
        },
        required: {
          type: 'boolean',
          label: 'Required',
          defaultValue: false,
          description: 'Fail this extraction when the field cannot be found and no default is configured.',
        },
        defaultValue: {
          type: 'string',
          label: 'Default Value',
          defaultValue: null,
          emptyAsNull: true,
          description: 'Optional fallback. Leave blank for no default; conversion still follows Value Type.',
        },
        trim: {
          type: 'boolean',
          label: 'Trim Whitespace',
          defaultValue: true,
          description: 'Remove surrounding whitespace from the captured value. Matches the backend default.',
        },
        allMatches: {
          type: 'boolean',
          label: 'All Matches',
          defaultValue: false,
          description: 'Return every occurrence as an array instead of only the first match.',
        },
      },
      description:
        'Each rule becomes one key under the response `fields` object. The backend supports up to 200 rules per request.',
    },
    ignoreCase: {
      type: 'boolean',
      label: 'Ignore Case',
      required: false,
      group: 'Regex Options',
      description: 'Apply case-insensitive Unicode matching to every rule.',
    },
    multiline: {
      type: 'boolean',
      label: 'Multiline',
      required: false,
      group: 'Regex Options',
      description: 'Allows ^ and $ to match at line boundaries. On by default for document text.',
    },
    dotAll: {
      type: 'boolean',
      label: 'Dot Matches Newlines',
      required: false,
      group: 'Regex Options',
      description: 'Lets . span line breaks. Enable only when a value intentionally crosses lines.',
    },
  },
};

export const REPLACE_VALUES_ACTION = {
  ...base,
  ...datasetInOut(),
  type: 'replace-values',
  name: 'Replace Values',
  description: 'Replace cell values by exact match, mapping table, or pattern.',
  icon: 'Replace',
  tags: ['replace', 'mapping', 'lookup table'],
  api: {
    url: `${TRANSFORM_BASE}/replace-values`,
    method: 'POST',
    headers: jsonHeaders,
    body: {
      data: '{{data}}',
      columns: '{{columns}}',
      replacements: '{{replacements}}',
      useRegex: '{{useRegex}}',
      ignoreCase: '{{ignoreCase}}',
      matchSubstring: '{{matchSubstring}}',
    },
  },
  properties: {
    data: '{{previous.data}}',
    columns: [],
    replacements: {},
    useRegex: false,
    ignoreCase: false,
    matchSubstring: false,
  },
  propertyConfig: {
    data: DATA_INPUT,
    columns: {
      type: 'array',
      label: 'Columns',
      required: false,
      uiType: 'string-list',
      addLabel: 'Add Column',
      group: 'Replace',
      description: 'Leave empty to apply to every column.',
    },
    replacements: {
      type: 'object',
      label: 'Replacements',
      required: true,
      uiType: 'key-value',
      keyLabel: 'Find',
      valueLabel: 'Replace With',
      group: 'Replace',
      description: 'Whole-value match by default: mapping "Y" to "Yes" will not rewrite "YTD".',
    },
    matchSubstring: {
      type: 'boolean',
      label: 'Match Substring',
      required: false,
      uiType: 'boolean',
      group: 'Options',
      description: 'Replace inside a value rather than matching the whole value.',
    },
    useRegex: {
      type: 'boolean',
      label: 'Use Regex',
      required: false,
      uiType: 'boolean',
      group: 'Options',
      description: 'Treats each Find as a pattern. Patterns are capped at 500 characters.',
    },
    ignoreCase: {
      type: 'boolean',
      label: 'Ignore Case',
      required: false,
      uiType: 'boolean',
      group: 'Options',
    },
  },
};

export const FILL_EMPTY_ACTION = {
  ...base,
  ...datasetInOut(),
  type: 'fill-empty',
  name: 'Fill Empty Values',
  description: 'Fill blank cells from a constant, a neighbouring row, or a statistic.',
  icon: 'Droplet',
  tags: ['fill', 'blank', 'null', 'forward fill'],
  api: {
    url: `${TRANSFORM_BASE}/fill-empty`,
    method: 'POST',
    headers: jsonHeaders,
    body: {
      data: '{{data}}',
      columns: '{{columns}}',
      strategy: '{{strategy}}',
      value: '{{value}}',
      treatBlankAsEmpty: '{{treatBlankAsEmpty}}',
    },
  },
  properties: {
    data: '{{previous.data}}',
    columns: [],
    strategy: 'CONSTANT',
    value: '',
    treatBlankAsEmpty: true,
  },
  propertyConfig: {
    data: DATA_INPUT,
    columns: {
      type: 'array',
      label: 'Columns',
      required: false,
      uiType: 'string-list',
      addLabel: 'Add Column',
      group: 'Fill',
      description: 'Leave empty to apply to every column.',
    },
    strategy: {
      type: 'string',
      label: 'Strategy',
      required: true,
      uiType: 'select',
      options: ['CONSTANT', 'FORWARD', 'BACKWARD', 'MEAN', 'MEDIAN', 'MODE'],
      group: 'Fill',
      description:
        'FORWARD carries the value above downwards — this is the fix for a sheet where a value is written once and left blank on the rows beneath it.',
    },
    value: {
      type: 'string',
      label: 'Fill Value',
      required: false,
      uiType: 'string',
      group: 'Fill',
      visibleWhen: { strategy: 'CONSTANT' },
    },
    treatBlankAsEmpty: {
      type: 'boolean',
      label: 'Treat Whitespace As Empty',
      required: false,
      uiType: 'boolean',
      group: 'Options',
      description: 'A cell containing a single space came from a human and means the same thing.',
    },
  },
};

export const CONVERT_TYPES_ACTION = {
  ...base,
  ...datasetInOut(
    'Run this before a database insert. A spreadsheet read hands over display strings, and a typed column rejects "1,234" and "78%" alike.'
  ),
  type: 'convert-types',
  name: 'Convert Types',
  description: 'Convert columns to number, date, boolean or text.',
  icon: 'ArrowRightLeft',
  tags: ['convert', 'cast', 'date', 'number', 'type'],
  cost: 'moderate' as const,
  api: {
    url: `${TRANSFORM_BASE}/convert-types`,
    method: 'POST',
    headers: jsonHeaders,
    body: {
      data: '{{data}}',
      conversions: '{{conversions}}',
      onError: '{{onError}}',
    },
  },
  properties: {
    data: '{{previous.data}}',
    conversions: [],
    onError: 'NULL',
  },
  propertyConfig: {
    data: DATA_INPUT,
    conversions: {
      type: 'array',
      label: 'Conversions',
      required: true,
      uiType: 'object-grid',
      stacked: true,
      addLabel: 'Add Conversion',
      group: 'Conversion',
      itemSchema: {
        column: { type: 'string', label: 'Column', uiType: 'field-select', required: true },
        targetType: {
          type: 'string',
          label: 'Target Type',
          uiType: 'select',
          required: true,
          options: ['INTEGER', 'DECIMAL', 'BOOLEAN', 'DATE', 'TIMESTAMP', 'STRING'],
        },
        format: {
          type: 'string',
          label: 'Source Format',
          uiType: 'string',
          placeholder: 'dd/MM/yyyy',
        },
      },
    },
    onError: {
      type: 'string',
      label: 'On Conversion Error',
      required: false,
      uiType: 'select',
      options: ['NULL', 'KEEP_ORIGINAL', 'DROP_ROW', 'FAIL'],
      group: 'Behaviour',
      description:
        'Choose deliberately. NULL quietly produces gaps a NOT NULL column will reject later; FAIL surfaces the problem here, where the error names the row and the column.',
    },
  },
};

export const ADD_CALCULATED_COLUMN_ACTION = {
  ...base,
  ...datasetInOut(),
  type: 'add-calculated-column',
  name: 'Calculated Column',
  description: 'Add a column computed from a formula over numeric columns.',
  icon: 'Calculator',
  tags: ['calculate', 'formula', 'expression', 'math'],
  api: {
    url: `${TRANSFORM_BASE}/add-calculated-column`,
    method: 'POST',
    headers: jsonHeaders,
    body: {
      data: '{{data}}',
      fieldName: '{{fieldName}}',
      expression: '{{expression}}',
    },
  },
  properties: {
    data: '{{previous.data}}',
    fieldName: '',
    expression: '',
  },
  propertyConfig: {
    data: DATA_INPUT,
    fieldName: {
      type: 'string',
      label: 'New Column Name',
      required: true,
      uiType: 'string',
      group: 'Formula',
    },
    expression: {
      type: 'string',
      label: 'Expression',
      required: true,
      uiType: 'string',
      placeholder: 'price * quantity',
      group: 'Formula',
      description:
        'Numeric columns only, and column names must contain no spaces — the engine cannot reference a name like "Total Amount". Run Convert Types first when the source returns display strings; rows that cannot be evaluated become null and are reported in warnings.',
    },
  },
};

/* -------------------------------------------------------------------------- */
/*                                   ROWS                                     */
/* -------------------------------------------------------------------------- */

export const FILTER_ROWS_ACTION = {
  ...base,
  ...datasetInOut(
    'Returns BOTH halves. `data` is the matched rows; `unmatchedData` is the rows the filter rejected. Bind whichever each downstream branch needs — the node fans out to every connected step.',
    [
      {
        path: 'unmatchedData',
        label: 'Unmatched Rows',
        kind: 'dataset' as const,
        visibility: 'primary' as const,
        providesColumns: true,
        description:
          'Rows that failed the condition. Route these to a report or a review queue rather than discarding them — they are usually the ones a person has to look at.',
      },
      {
        path: 'matchedRowCount',
        label: 'Matched Row Count',
        kind: 'number' as const,
        valueType: 'INTEGER' as const,
        visibility: 'primary' as const,
        example: 120,
      },
      {
        path: 'unmatchedRowCount',
        label: 'Unmatched Row Count',
        kind: 'number' as const,
        valueType: 'INTEGER' as const,
        visibility: 'primary' as const,
        example: 30,
        description: 'Reported even when storeUnmatched is off.',
      },
    ]
  ),
  type: 'filter-rows',
  name: 'Filter Rows',
  description: 'Keep or drop rows using one or more column conditions.',
  icon: 'Filter',
  tags: ['filter', 'where', 'rows', 'condition'],
  outputPorts: passRejectPorts({
    passId: 'matched',
    passLabel: 'Matched',
    passPath: 'data',
    passDescription:
      'Rows that satisfied the condition. This is the main path — continue the business process here.',
    rejectId: 'unmatched',
    rejectLabel: 'Unmatched',
    rejectPath: 'unmatchedData',
    rejectDescription:
      'Rows that failed the condition. Optional: route to an exception report, a review queue, a notification, or a log. Leave it unconnected and the rows are still recorded in the run — they are simply not acted on.',
  }),
  api: {
    url: `${TRANSFORM_BASE}/filter-rows`,
    method: 'POST',
    headers: jsonHeaders,
    body: {
      data: '{{data}}',
      conditions: '{{conditions}}',
      matchAny: '{{matchAny}}',
      invert: '{{invert}}',
      storeUnmatched: '{{storeUnmatched}}',
    },
  },
  properties: {
    data: '{{previous.data}}',
    conditions: [],
    matchAny: false,
    invert: false,
    storeUnmatched: true,
  },
  propertyConfig: {
    data: DATA_INPUT,
    conditions: {
      type: 'array',
      label: 'Conditions',
      required: true,
      uiType: 'object-grid',
      stacked: true,
      addLabel: 'Add Condition',
      group: 'Filter',
      itemSchema: {
        column: { type: 'string', label: 'Column', uiType: 'field-select', required: true },
        operator: {
          type: 'string',
          label: 'Operator',
          uiType: 'select',
          required: true,
          // Exactly the FilterOperator enum.
          options: [
            'EQUALS',
            'NOT_EQUALS',
            'GREATER_THAN',
            'GREATER_OR_EQUAL',
            'LESS_THAN',
            'LESS_OR_EQUAL',
            'CONTAINS',
            'NOT_CONTAINS',
            'STARTS_WITH',
            'ENDS_WITH',
            'MATCHES_REGEX',
            'IN',
            'NOT_IN',
            'BETWEEN',
            'IS_EMPTY',
            'IS_NOT_EMPTY',
          ],
        },
        value: { type: 'string', label: 'Value', uiType: 'string' },
        secondValue: {
          type: 'string',
          label: 'Upper Bound',
          uiType: 'string',
          description: 'BETWEEN only.',
        },
        compareToColumn: {
          type: 'string',
          label: 'Compare To Column',
          uiType: 'string',
          description: 'Compare against another column instead of a constant.',
        },
      },
      description:
        'IS_EMPTY and IS_NOT_EMPTY ignore Value. BETWEEN needs Upper Bound. IN and NOT_IN take a comma-separated Value.',
    },
    matchAny: {
      type: 'boolean',
      label: 'Match Any (OR)',
      required: false,
      uiType: 'boolean',
      group: 'Behaviour',
      description: 'Off means every condition must match.',
    },
    storeUnmatched: {
      type: 'boolean',
      label: 'Keep Unmatched Rows',
      required: false,
      uiType: 'boolean',
      group: 'Behaviour',
      description:
        'On by default. Returns the rejected rows as `unmatchedData` so a second branch can report on them. Turn off only when the rejected set is genuinely of no interest.',
    },
    invert: {
      type: 'boolean',
      label: 'Invert (drop matches)',
      required: false,
      uiType: 'boolean',
      group: 'Behaviour',
      description:
        'Keeps the non-matching rows. An exclusion rule is easier to write as the thing you want to exclude than by inverting every operator by hand.',
    },
  },
};

export const SORT_ROWS_ACTION = {
  ...base,
  ...datasetInOut(),
  type: 'sort-rows',
  name: 'Sort Rows',
  description: 'Sort by one or more columns.',
  icon: 'ArrowUpDown',
  tags: ['sort', 'order', 'rows'],
  api: {
    url: `${TRANSFORM_BASE}/sort-rows`,
    method: 'POST',
    headers: jsonHeaders,
    body: {
      data: '{{data}}',
      sorts: '{{sorts}}',
    },
  },
  properties: {
    data: '{{previous.data}}',
    sorts: [],
  },
  propertyConfig: {
    data: DATA_INPUT,
    sorts: {
      type: 'array',
      label: 'Sort Keys',
      required: true,
      uiType: 'object-grid',
      stacked: true,
      addLabel: 'Add Sort Key',
      group: 'Sort',
      itemSchema: {
        column: { type: 'string', label: 'Column', uiType: 'field-select', required: true },
        direction: {
          type: 'string',
          label: 'Direction',
          uiType: 'select',
          options: ['ASC', 'DESC'],
        },
        nullsLast: { type: 'boolean', label: 'Blanks Last', uiType: 'boolean' },
      },
      description:
        'Applied in order. Two separate sort steps do not work — the second discards the first ordering.',
    },
  },
};

export const DEDUPLICATE_ACTION = {
  ...base,
  ...datasetInOut(),
  type: 'deduplicate',
  name: 'Remove Duplicates',
  description: 'Drop duplicate rows, by whole row or by chosen key columns.',
  icon: 'Copy',
  tags: ['dedupe', 'distinct', 'unique', 'duplicate'],
  api: {
    url: `${TRANSFORM_BASE}/deduplicate`,
    method: 'POST',
    headers: jsonHeaders,
    body: {
      data: '{{data}}',
      keyColumns: '{{keyColumns}}',
      keep: '{{keep}}',
      ignoreCase: '{{ignoreCase}}',
    },
  },
  properties: {
    data: '{{previous.data}}',
    keyColumns: [],
    keep: 'FIRST',
    ignoreCase: false,
  },
  propertyConfig: {
    data: DATA_INPUT,
    keyColumns: {
      type: 'array',
      label: 'Key Columns',
      required: false,
      uiType: 'string-list',
      addLabel: 'Add Column',
      group: 'Duplicates',
      description: 'Leave empty to compare whole rows.',
    },
    keep: {
      type: 'string',
      label: 'Keep',
      required: false,
      uiType: 'select',
      options: ['FIRST', 'LAST', 'NONE'],
      group: 'Duplicates',
      description: 'NONE drops every row that has a duplicate, including the first.',
    },
    ignoreCase: {
      type: 'boolean',
      label: 'Ignore Case',
      required: false,
      uiType: 'boolean',
      group: 'Options',
    },
  },
};

export const ADD_SEQUENCE_ACTION = {
  ...base,
  ...datasetInOut(),
  type: 'add-sequence',
  name: 'Add Sequence',
  description: 'Add a running row number.',
  icon: 'ListOrdered',
  tags: ['sequence', 'row number', 'index'],
  api: {
    url: `${TRANSFORM_BASE}/add-sequence`,
    method: 'POST',
    headers: jsonHeaders,
    body: {
      data: '{{data}}',
      fieldName: '{{fieldName}}',
      startValue: '{{startValue}}',
    },
  },
  properties: {
    data: '{{previous.data}}',
    fieldName: 'rowNumber',
    startValue: 1,
  },
  propertyConfig: {
    data: DATA_INPUT,
    fieldName: {
      type: 'string',
      label: 'Column Name',
      required: true,
      uiType: 'string',
      group: 'Sequence',
    },
    startValue: {
      type: 'number',
      label: 'Start Value',
      required: false,
      uiType: 'number',
      group: 'Sequence',
      description: 'Defaults to 1.',
    },
  },
};

/* -------------------------------------------------------------------------- */
/*                              DATASET SHAPE                                 */
/* -------------------------------------------------------------------------- */

export const AGGREGATE_ACTION = {
  ...base,
  ...datasetInOut('Returns one row per group. Numeric aggregates use exact decimal arithmetic.'),
  type: 'aggregate',
  name: 'Group & Aggregate',
  description: 'Group rows by columns and compute aggregates.',
  icon: 'Sigma',
  tags: ['group', 'aggregate', 'sum', 'count', 'average'],
  api: {
    url: `${TRANSFORM_BASE}/aggregate`,
    method: 'POST',
    headers: jsonHeaders,
    body: {
      data: '{{data}}',
      groupBy: '{{groupBy}}',
      aggregations: '{{aggregations}}',
    },
  },
  properties: {
    data: '{{previous.data}}',
    groupBy: [],
    aggregations: [],
  },
  propertyConfig: {
    data: DATA_INPUT,
    groupBy: {
      type: 'array',
      label: 'Group By',
      required: false,
      uiType: 'string-list',
      addLabel: 'Add Column',
      group: 'Grouping',
      description: 'Leave empty to total the whole dataset into a single row.',
    },
    aggregations: {
      type: 'array',
      label: 'Aggregations',
      required: true,
      uiType: 'object-grid',
      stacked: true,
      addLabel: 'Add Aggregation',
      group: 'Grouping',
      itemSchema: {
        column: { type: 'string', label: 'Column', uiType: 'field-select', required: true },
        function: {
          type: 'string',
          label: 'Function',
          uiType: 'select',
          required: true,
          options: [
            'SUM',
            'AVG',
            'MIN',
            'MAX',
            'COUNT',
            'COUNT_DISTINCT',
            'FIRST',
            'LAST',
            'MEDIAN',
            'CONCAT',
          ],
        },
        alias: { type: 'string', label: 'Output Name', uiType: 'string' },
        separator: {
          type: 'string',
          label: 'Separator',
          uiType: 'string',
          description: 'CONCAT only. Defaults to ", ".',
        },
      },
    },
  },
};

export const JOIN_ACTION = {
  ...base,
  ...datasetInOut(
    'A join can return more rows than it received when the key is not unique. Use Lookup when one match per row is intended.'
  ),
  type: 'join',
  name: 'Join Datasets',
  description: 'Inner, left, right or full join against a second dataset.',
  icon: 'GitMerge',
  tags: ['join', 'inner', 'left', 'right', 'full'],
  complexity: 'intermediate' as const,
  cost: 'heavy' as const,
  estimatedTime: 1500,
  api: {
    url: `${TRANSFORM_BASE}/join`,
    method: 'POST',
    headers: jsonHeaders,
    body: {
      data: '{{data}}',
      rightData: '{{rightData}}',
      joinType: '{{joinType}}',
      leftKeys: '{{leftKeys}}',
      rightKeys: '{{rightKeys}}',
      rightColumns: '{{rightColumns}}',
      rightPrefix: '{{rightPrefix}}',
      ignoreCase: '{{ignoreCase}}',
      maxResultRows: '{{maxResultRows}}',
    },
  },
  properties: {
    data: '{{previous.data}}',
    rightData: '',
    joinType: 'INNER',
    leftKeys: [],
    rightKeys: [],
    rightColumns: [],
    rightPrefix: '',
    ignoreCase: false,
    maxResultRows: 1000000,
  },
  propertyConfig: {
    data: DATA_INPUT,
    rightData: {
      type: 'array',
      label: 'Right Dataset',
      required: true,
      uiType: 'dataset-source',
      group: 'Input',
      description: 'Bind another step, e.g. {{steps.Read Customers.data}}.',
    },
    joinType: {
      type: 'string',
      label: 'Join Type',
      required: true,
      uiType: 'select',
      options: ['INNER', 'LEFT', 'RIGHT', 'FULL'],
      group: 'Join',
    },
    leftKeys: {
      type: 'array',
      label: 'Left Key Columns',
      required: true,
      uiType: 'string-list',
      addLabel: 'Add Key',
      group: 'Join',
      description: 'Composite keys are supported — an order line needs order id and line number.',
    },
    rightKeys: {
      type: 'array',
      label: 'Right Key Columns',
      required: true,
      uiType: 'string-list',
      addLabel: 'Add Key',
      group: 'Join',
      description: 'Matched positionally against the left keys.',
    },
    rightColumns: {
      type: 'array',
      label: 'Columns To Bring Across',
      required: false,
      uiType: 'string-list',
      addLabel: 'Add Column',
      group: 'Output',
      description: 'Empty brings every right column except its keys.',
    },
    rightPrefix: {
      type: 'string',
      label: 'Prefix For Clashing Columns',
      required: false,
      uiType: 'string',
      placeholder: 'cust_',
      group: 'Output',
      description:
        'Applied only to right columns that clash with a left one. Without it a clash silently overwrites the left value.',
    },
    ignoreCase: {
      type: 'boolean',
      label: 'Ignore Key Case',
      required: false,
      uiType: 'boolean',
      group: 'Options',
    },
    maxResultRows: {
      type: 'number',
      label: 'Max Result Rows',
      required: false,
      uiType: 'number',
      min: 1,
      group: 'Options',
      description:
        'Guard against a many-to-many explosion. Two 5,000-row sets sharing one key value produce 25 million rows.',
    },
  },
};

export const LOOKUP_ACTION = {
  ...base,
  ...datasetInOut('Never changes the row count. Use Join when a key may match several times.'),
  type: 'lookup',
  name: 'Lookup',
  description: 'Enrich rows from a second dataset by key.',
  icon: 'Search',
  tags: ['lookup', 'enrich', 'vlookup'],
  estimatedTime: 1200,
  api: {
    url: `${TRANSFORM_BASE}/lookup`,
    method: 'POST',
    headers: jsonHeaders,
    body: {
      data: '{{data}}',
      lookupData: '{{lookupData}}',
      sourceKey: '{{sourceKey}}',
      lookupKey: '{{lookupKey}}',
      returnColumns: '{{returnColumns}}',
      prefix: '{{prefix}}',
      onMissing: '{{onMissing}}',
      defaultValue: '{{defaultValue}}',
      fetchFirstMatch: '{{fetchFirstMatch}}',
      ignoreCase: '{{ignoreCase}}',
    },
  },
  properties: {
    data: '{{previous.data}}',
    lookupData: '',
    sourceKey: '',
    lookupKey: '',
    returnColumns: [],
    prefix: '',
    onMissing: 'NULL',
    defaultValue: '',
    fetchFirstMatch: true,
    ignoreCase: false,
  },
  propertyConfig: {
    data: DATA_INPUT,
    lookupData: {
      type: 'array',
      label: 'Lookup Dataset',
      required: true,
      uiType: 'dataset-source',
      group: 'Input',
      description: 'The reference table, e.g. {{steps.Read Customers.data}}.',
    },
    sourceKey: {
      type: 'string',
      label: 'Source Key Column',
      required: true,
      uiType: 'field-select',
      group: 'Lookup',
    },
    lookupKey: {
      type: 'string',
      label: 'Lookup Key Column',
      required: true,
      uiType: 'string',
      group: 'Lookup',
    },
    returnColumns: {
      type: 'array',
      label: 'Columns To Return',
      required: false,
      uiType: 'string-list',
      addLabel: 'Add Column',
      group: 'Output',
      description: 'Empty returns every column from the lookup dataset.',
    },
    prefix: {
      type: 'string',
      label: 'Column Prefix',
      required: false,
      uiType: 'string',
      placeholder: 'cust_',
      group: 'Output',
      description: 'Prevents a collision when both datasets share a column name.',
    },
    onMissing: {
      type: 'string',
      label: 'When No Match',
      required: false,
      uiType: 'select',
      options: ['NULL', 'DROP_ROW', 'FAIL', 'DEFAULT'],
      group: 'Behaviour',
      description:
        'NULL quietly produces gaps a later insert may reject; FAIL surfaces the problem here, where it is cheap to fix.',
    },
    defaultValue: {
      type: 'string',
      label: 'Default Value',
      required: false,
      uiType: 'string',
      group: 'Behaviour',
      visibleWhen: { onMissing: 'DEFAULT' },
    },
    fetchFirstMatch: {
      type: 'boolean',
      label: 'Keep First Match',
      required: false,
      uiType: 'boolean',
      group: 'Options',
      description: 'On duplicate lookup keys, take the first rather than the last.',
    },
    ignoreCase: {
      type: 'boolean',
      label: 'Ignore Key Case',
      required: false,
      uiType: 'boolean',
      group: 'Options',
    },
  },
};

export const UNION_ACTION = {
  ...base,
  ...datasetInOut(),
  type: 'union',
  name: 'Union Datasets',
  description: 'Append a second dataset to this one.',
  icon: 'Layers',
  tags: ['union', 'append', 'combine', 'stack'],
  api: {
    url: `${TRANSFORM_BASE}/union`,
    method: 'POST',
    headers: jsonHeaders,
    body: {
      data: '{{data}}',
      secondData: '{{secondData}}',
      requireSameColumns: '{{requireSameColumns}}',
      distinct: '{{distinct}}',
    },
  },
  properties: {
    data: '{{previous.data}}',
    secondData: '',
    requireSameColumns: false,
    distinct: false,
  },
  propertyConfig: {
    data: DATA_INPUT,
    secondData: {
      type: 'array',
      label: 'Second Dataset',
      required: true,
      uiType: 'dataset-source',
      group: 'Input',
      description: 'Bind another step, e.g. {{steps.Read Q4.data}}.',
    },
    requireSameColumns: {
      type: 'boolean',
      label: 'Require Identical Columns',
      required: false,
      uiType: 'boolean',
      group: 'Behaviour',
      description:
        'Off means the union of columns is used and missing cells are filled with null.',
    },
    distinct: {
      type: 'boolean',
      label: 'Remove Duplicates',
      required: false,
      uiType: 'boolean',
      group: 'Behaviour',
      description: 'UNION rather than UNION ALL.',
    },
  },
};

export const PIVOT_ACTION = {
  ...base,
  ...datasetInOut(
    'Column names come from the data, so read the returned `columns` list rather than assuming a fixed schema downstream.'
  ),
  type: 'pivot',
  name: 'Pivot',
  description: 'Turn row values into columns.',
  icon: 'RotateCw',
  tags: ['pivot', 'crosstab', 'wide'],
  complexity: 'intermediate' as const,
  cost: 'heavy' as const,
  estimatedTime: 1500,
  api: {
    url: `${TRANSFORM_BASE}/pivot`,
    method: 'POST',
    headers: jsonHeaders,
    body: {
      data: '{{data}}',
      rowKeys: '{{rowKeys}}',
      pivotColumn: '{{pivotColumn}}',
      valueColumn: '{{valueColumn}}',
      aggregation: '{{aggregation}}',
      fillValue: '{{fillValue}}',
      maxColumns: '{{maxColumns}}',
    },
  },
  properties: {
    data: '{{previous.data}}',
    rowKeys: [],
    pivotColumn: '',
    valueColumn: '',
    aggregation: 'FIRST',
    fillValue: '',
    maxColumns: 500,
  },
  propertyConfig: {
    data: DATA_INPUT,
    rowKeys: {
      type: 'array',
      label: 'Row Key Columns',
      required: false,
      uiType: 'string-list',
      addLabel: 'Add Column',
      group: 'Pivot',
      description: 'Columns that stay as rows and identify each output row.',
    },
    pivotColumn: {
      type: 'string',
      label: 'Pivot Column',
      required: true,
      uiType: 'field-select',
      group: 'Pivot',
      description: 'Its distinct values become new column names. Do not pivot an identifier.',
    },
    valueColumn: {
      type: 'string',
      label: 'Value Column',
      required: true,
      uiType: 'field-select',
      group: 'Pivot',
    },
    aggregation: {
      type: 'string',
      label: 'Aggregation',
      required: false,
      uiType: 'select',
      options: ['SUM', 'AVG', 'MIN', 'MAX', 'COUNT', 'FIRST', 'LAST'],
      group: 'Pivot',
      description: 'How to combine several values landing in one cell.',
    },
    fillValue: {
      type: 'string',
      label: 'Fill Value',
      required: false,
      uiType: 'string',
      group: 'Options',
      description: 'Used for cells with no matching source row.',
    },
    maxColumns: {
      type: 'number',
      label: 'Max Columns',
      required: false,
      uiType: 'number',
      min: 1,
      group: 'Options',
      description:
        'Guard against pivoting a high-cardinality column, which generates one column per distinct value.',
    },
  },
};

export const UNPIVOT_ACTION = {
  ...base,
  ...datasetInOut('The normalising step: turns a wide report into rows a table can hold.'),
  type: 'unpivot',
  name: 'Unpivot',
  description: 'Turn columns back into rows.',
  icon: 'Undo2',
  tags: ['unpivot', 'melt', 'normalize', 'long'],
  complexity: 'intermediate' as const,
  estimatedTime: 1000,
  api: {
    url: `${TRANSFORM_BASE}/unpivot`,
    method: 'POST',
    headers: jsonHeaders,
    body: {
      data: '{{data}}',
      keepColumns: '{{keepColumns}}',
      unpivotColumns: '{{unpivotColumns}}',
      nameColumn: '{{nameColumn}}',
      valueColumn: '{{valueColumn}}',
      skipEmpty: '{{skipEmpty}}',
    },
  },
  properties: {
    data: '{{previous.data}}',
    keepColumns: [],
    unpivotColumns: [],
    nameColumn: 'attribute',
    valueColumn: 'value',
    skipEmpty: true,
  },
  propertyConfig: {
    data: DATA_INPUT,
    keepColumns: {
      type: 'array',
      label: 'Keep Columns',
      required: false,
      uiType: 'string-list',
      addLabel: 'Add Column',
      group: 'Unpivot',
      description: 'Repeated on every output row.',
    },
    unpivotColumns: {
      type: 'array',
      label: 'Columns To Fold',
      required: false,
      uiType: 'string-list',
      addLabel: 'Add Column',
      group: 'Unpivot',
      description:
        'Empty folds every column not listed above — usually what a wide report needs.',
    },
    nameColumn: {
      type: 'string',
      label: 'Name Column',
      required: false,
      uiType: 'string',
      group: 'Output',
      description: 'Holds the original column name.',
    },
    valueColumn: {
      type: 'string',
      label: 'Value Column',
      required: false,
      uiType: 'string',
      group: 'Output',
      description: 'Holds the original cell value.',
    },
    skipEmpty: {
      type: 'boolean',
      label: 'Skip Blank Values',
      required: false,
      uiType: 'boolean',
      group: 'Options',
    },
  },
};

/* -------------------------------------------------------------------------- */
/*                                 QUALITY                                    */
/* -------------------------------------------------------------------------- */

export const VALIDATE_ACTION = {
  ...base,
  ...datasetInOut(
    'Valid rows arrive on `data`; invalid ones on `rejectedRows` with per-rule detail in `violations`. Route the rejects to a report rather than discarding them.'
  ),
  type: 'validate',
  name: 'Validate Rows',
  description: 'Check rows against rules and separate valid from invalid.',
  icon: 'ShieldCheck',
  tags: ['validate', 'quality', 'rules', 'check'],
  complexity: 'intermediate' as const,
  estimatedTime: 1000,
  outputPorts: passRejectPorts({
    passId: 'valid',
    passLabel: 'Valid',
    passPath: 'data',
    passDescription:
      'Rows that passed every rule. Safe to post to a system of record.',
    rejectId: 'invalid',
    rejectLabel: 'Invalid',
    rejectPath: 'rejectedRows',
    rejectDescription:
      'Rows that broke at least one rule. Per-rule detail is on `violations`. Only populated when On Invalid is SEPARATE.',
  }),
  api: {
    url: `${TRANSFORM_BASE}/validate`,
    method: 'POST',
    headers: jsonHeaders,
    body: {
      data: '{{data}}',
      rules: '{{rules}}',
      onInvalid: '{{onInvalid}}',
      annotationColumn: '{{annotationColumn}}',
    },
  },
  properties: {
    data: '{{previous.data}}',
    rules: [],
    onInvalid: 'SEPARATE',
    annotationColumn: '_validationErrors',
  },
  propertyConfig: {
    data: DATA_INPUT,
    rules: {
      type: 'array',
      label: 'Rules',
      required: true,
      uiType: 'object-grid',
      stacked: true,
      addLabel: 'Add Rule',
      group: 'Validation',
      itemSchema: {
        column: { type: 'string', label: 'Column', uiType: 'field-select', required: true },
        rule: {
          type: 'string',
          label: 'Rule',
          uiType: 'select',
          required: true,
          options: [
            'REQUIRED',
            'UNIQUE',
            'IS_NUMBER',
            'IS_DATE',
            'IS_EMAIL',
            'MATCHES_PATTERN',
            'IN_LIST',
            'MIN_LENGTH',
            'MAX_LENGTH',
            'MIN_VALUE',
            'MAX_VALUE',
          ],
        },
        parameter: {
          type: 'string',
          label: 'Parameter',
          uiType: 'string',
          description: 'A pattern, a bound, or a comma-separated list.',
        },
        severity: {
          type: 'string',
          label: 'Severity',
          uiType: 'select',
          options: ['ERROR', 'WARNING'],
        },
        message: { type: 'string', label: 'Custom Message', uiType: 'string' },
      },
      description: 'WARNING severity records a violation without failing the row.',
    },
    onInvalid: {
      type: 'string',
      label: 'On Invalid Rows',
      required: false,
      uiType: 'select',
      options: ['SEPARATE', 'DROP', 'FAIL', 'ANNOTATE'],
      group: 'Behaviour',
      description:
        'SEPARATE is what most pipelines want: valid rows continue to the insert, invalid rows go to a report. Failing a 50,000-row load over eight bad dates rarely is.',
    },
    annotationColumn: {
      type: 'string',
      label: 'Annotation Column',
      required: false,
      uiType: 'string',
      group: 'Behaviour',
      visibleWhen: { onInvalid: 'ANNOTATE' },
      description: 'Column added to hold the violation messages.',
    },
  },
};

export const PROFILE_ACTION = {
  ...base,
  ...datasetInOut(
    'Returns ONE ROW PER COLUMN, not per source row. Each row carries column, type, nullCount, distinctCount, unique, mixedTypes, suggestedSqlType and — when statistics are on — min, max, sum, mean, median.'
  ),
  type: 'profile',
  name: 'Profile Dataset',
  description: 'Describe the dataset: column types, blanks, distinct counts and statistics.',
  icon: 'BarChart3',
  tags: ['profile', 'schema', 'statistics', 'quality'],
  complexity: 'basic' as const,
  estimatedTime: 900,
  api: {
    url: `${TRANSFORM_BASE}/profile`,
    method: 'POST',
    headers: jsonHeaders,
    body: {
      data: '{{data}}',
      columns: '{{columns}}',
      includeStatistics: '{{includeStatistics}}',
      includeTopValues: '{{includeTopValues}}',
      topValueCount: '{{topValueCount}}',
      sampleSize: '{{sampleSize}}',
    },
  },
  properties: {
    data: '{{previous.data}}',
    columns: [],
    includeStatistics: true,
    includeTopValues: false,
    topValueCount: 5,
    sampleSize: -1,
  },
  propertyConfig: {
    data: DATA_INPUT,
    columns: {
      type: 'array',
      label: 'Columns',
      required: false,
      uiType: 'string-list',
      addLabel: 'Add Column',
      group: 'Profile',
      description: 'Leave empty to profile every column.',
    },
    includeStatistics: {
      type: 'boolean',
      label: 'Include Statistics',
      required: false,
      uiType: 'boolean',
      group: 'Profile',
      description: 'min, max, sum, mean, median for numeric columns.',
    },
    includeTopValues: {
      type: 'boolean',
      label: 'Include Top Values',
      required: false,
      uiType: 'boolean',
      group: 'Profile',
    },
    topValueCount: {
      type: 'number',
      label: 'Top Value Count',
      required: false,
      uiType: 'number',
      min: 1,
      group: 'Profile',
      visibleWhen: { includeTopValues: true },
    },
    sampleSize: {
      type: 'number',
      label: 'Sample Size',
      required: false,
      uiType: 'number',
      group: 'Options',
      description: '-1 profiles every row.',
    },
  },
};

/* -------------------------------------------------------------------------- */
/*                                 PIPELINE                                   */
/* -------------------------------------------------------------------------- */

export const PIPELINE_ACTION = {
  ...base,
  ...datasetInOut(
    'stepReport lists each step with rows in, rows out and duration — that is what says which step emptied a dataset.'
  ),
  type: 'transform-pipeline',
  name: 'Transformation Pipeline',
  description: 'Run several transformations in sequence, in one call.',
  icon: 'Workflow',
  tags: ['pipeline', 'chain', 'multi-step', 'batch'],
  complexity: 'advanced' as const,
  cost: 'heavy' as const,
  estimatedTime: 2500,
  timeout: 300000,
  api: {
    url: `${TRANSFORM_BASE}/pipeline`,
    method: 'POST',
    headers: jsonHeaders,
    body: {
      data: '{{data}}',
      operations: '{{operations}}',
      includeStepReport: '{{includeStepReport}}',
      failFast: '{{failFast}}',
    },
  },
  properties: {
    data: '{{previous.data}}',
    operations: [],
    includeStepReport: true,
    failFast: true,
  },
  propertyConfig: {
    data: DATA_INPUT,
    operations: {
      type: 'array',
      label: 'Operations',
      required: true,
      uiType: 'object-grid',
      stacked: true,
      addLabel: 'Add Step',
      group: 'Pipeline',
      itemSchema: {
        op: {
          type: 'string',
          label: 'Operation',
          uiType: 'select',
          required: true,
          // Exactly the DatasetOperation enum.
          options: [
            'SELECT_COLUMNS',
            'RENAME_COLUMNS',
            'ADD_COLUMN',
            'SPLIT_COLUMN',
            'MERGE_COLUMNS',
            'TEXT_OPERATION',
            'REPLACE_VALUES',
            'FILL_EMPTY',
            'CONVERT_TYPES',
            'CALCULATE',
            'FILTER_ROWS',
            'SORT_ROWS',
            'DEDUPLICATE',
            'ADD_SEQUENCE',
            'AGGREGATE',
            'JOIN',
            'LOOKUP',
            'UNION',
            'PIVOT',
            'UNPIVOT',
            'VALIDATE',
            'PROFILE',
          ],
        },
        name: {
          type: 'string',
          label: 'Step Name',
          uiType: 'string',
          description: 'Shown in the step report and in any failure message.',
        },
        params: {
          type: 'object',
          label: 'Parameters',
          uiType: 'json-editor',
          rows: 4,
          description: 'The same fields the standalone operation takes, minus `data`.',
        },
        disabled: { type: 'boolean', label: 'Disabled', uiType: 'boolean' },
        continueOnError: { type: 'boolean', label: 'Continue On Error', uiType: 'boolean' },
      },
      description:
        'Runs server-side. Seven separate steps means seven round trips carrying the whole dataset each way; as a pipeline it is one request.',
    },
    includeStepReport: {
      type: 'boolean',
      label: 'Include Step Report',
      required: false,
      uiType: 'boolean',
      group: 'Behaviour',
      description: 'Leave on. It is the only way to see which step changed what.',
    },
    failFast: {
      type: 'boolean',
      label: 'Fail Fast',
      required: false,
      uiType: 'boolean',
      group: 'Behaviour',
      description: 'Stop at the first failing step unless that step is marked Continue On Error.',
    },
  },
};

/* -------------------------------------------------------------------------- */
/*                                 EXPORTS                                    */
/* -------------------------------------------------------------------------- */

/**
 * All 24 operations, in the order they should appear in the palette:
 * column shape, then values, then rows, then dataset shape, then quality,
 * then the pipeline.
 */
export const DATA_TRANSFORM_ACTIONS = [
  SELECT_COLUMNS_ACTION,
  RENAME_COLUMNS_ACTION,
  ADD_COLUMN_ACTION,
  SPLIT_COLUMN_ACTION,
  MERGE_COLUMNS_ACTION,

  TEXT_OPERATION_ACTION,
  EXTRACT_FIELDS_ACTION,
  REPLACE_VALUES_ACTION,
  FILL_EMPTY_ACTION,
  CONVERT_TYPES_ACTION,
  ADD_CALCULATED_COLUMN_ACTION,

  FILTER_ROWS_ACTION,
  SORT_ROWS_ACTION,
  DEDUPLICATE_ACTION,
  ADD_SEQUENCE_ACTION,

  AGGREGATE_ACTION,
  JOIN_ACTION,
  LOOKUP_ACTION,
  UNION_ACTION,
  PIVOT_ACTION,
  UNPIVOT_ACTION,

  VALIDATE_ACTION,
  PROFILE_ACTION,
  PIPELINE_ACTION,
].map((action) => ({
  ...action,

  /**
   * The sidebar, workflow canvas and action cards resolve this filename from
   * `public/plugins/`. Keeping the mapping here avoids repeating `logo` in all
   * 24 action definitions and guarantees every current or future action has a
   * safe category-logo fallback.
   */
  logo:
    DATA_TRANSFORM_ACTION_LOGOS[action.type] ??
    'data_transform.png',
}));

/**
 * The six original action types, kept working through the backend's deprecated
 * paths.
 *
 * A saved workflow stores `action.type`, so removing these outright would break
 * every existing Data Transformation node on load. They are hidden from the
 * palette and mapped to their replacement, so an old node keeps running while
 * new ones get the current form.
 */
export const LEGACY_TYPE_ALIASES: Record<string, string> = {
  calculator: 'add-calculated-column',
  rename: 'rename-columns',
  sequence: 'add-sequence',
  sort: 'sort-rows',
  split: 'split-column',
  'string-operation': 'text-operation',
};