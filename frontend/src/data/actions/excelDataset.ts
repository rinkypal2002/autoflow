/**
 * Excel dataset action, plus output contracts for the Excel actions that
 * already exist.
 *
 * Kept in its own module rather than edited into `automationCategories.ts`.
 * That file is 26,000 lines and 349 actions; splicing into it by hand is how
 * merge conflicts and accidental deletions happen. This module exports a small
 * fragment and a patch map, and `automationCategories.ts` applies them in three
 * lines at the bottom — see INTEGRATION.md.
 *
 * ── Why a new action rather than changing `read-sheet` ────────────────────
 *
 * `read-sheet` is wired into live workflows. Its response shape —
 * `{ sheetName, headers, data, totalRows, totalColumns }` — is what those
 * workflows bind against. Changing it would break them. `read-dataset` is a new
 * endpoint returning a superset of that shape, so the old action keeps working
 * untouched and authors migrate when they choose to.
 *
 * The practical difference is types. `read-sheet` returns what Excel *displays*:
 * an amount comes back as "$1,234.57" and a date as "25-Dec-24". Neither can be
 * summed, compared or inserted into a typed column without guessing. The
 * dataset endpoint returns 1234.5678 and 2024-12-25 alongside those display
 * strings, which is what makes Filter → Aggregate → Insert work without a
 * parsing step in the middle.
 */

import {
  datasetOutputSchema,
  LEGACY_TABLE_OUTPUT_FIELDS,
  type OutputField,
  type OutputSchema,
} from '../../types/pluginContract';

/** Base URL, so 349 hardcoded `http://localhost:8080` strings stop being a release blocker. */
const ENGINE_BASE =
  (typeof import.meta !== 'undefined' && (import.meta as any)?.env?.VITE_ENGINE_URL) ||
  'http://localhost:8080/engine';

/* -------------------------------------------------------------------------- */
/*                          EXCEL-SPECIFIC EXTRA FIELDS                       */
/* -------------------------------------------------------------------------- */

const EXCEL_DATASET_EXTRAS: OutputField[] = [
  {
    path: 'sheetName',
    label: 'Sheet Name',
    kind: 'string',
    valueType: 'STRING',
    visibility: 'primary',
    example: 'Sheet1',
  },
  {
    path: 'metadata.warnings',
    label: 'Warnings',
    kind: 'array',
    visibility: 'secondary',
    description:
      'Non-fatal observations: renamed duplicate headers, columns with mixed types, views declined for size. Worth reading before a load — a mixed-type column is a load failure waiting to happen.',
  },
  {
    path: 'metadata.truncated',
    label: 'Truncated',
    kind: 'boolean',
    visibility: 'secondary',
    example: false,
    description:
      'True when more rows exist than were returned. A truncated read looks exactly like a complete one unless something checks this.',
  },
];

/* -------------------------------------------------------------------------- */
/*                              READ DATASET ACTION                           */
/* -------------------------------------------------------------------------- */

export const EXCEL_READ_DATASET_ACTION = {
  type: 'read-dataset',
  category: 'excel-automation-011',
  name: 'Read Dataset',
  description:
    'Read a sheet as a typed dataset: rows with real values, column schema, and optional statistics.',
  icon: 'Table',
  color: 'bg-emerald-500',
  tags: ['read', 'sheet', 'dataset', 'typed'],
  complexity: 'basic',
  estimatedTime: 1500,
  supportsStreaming: false,
  requiresAuth: false,
  retryable: true,
  idempotent: true,
  cost: 'moderate',
  timeout: 120000,

  api: {
    url: `${ENGINE_BASE}/excel/read-dataset`,
    method: 'POST',
    bodyType: 'form-data',
    body: {
      file: '{{file}}',
      sheetName: '{{sheetName}}',
      includeLegacyData: '{{includeLegacyData}}',
      includeRows: '{{includeRows}}',
      includeSchema: '{{includeSchema}}',
      includeStatistics: '{{includeStatistics}}',
      indexColumns: '{{indexColumns}}',
      skipBlankRows: '{{skipBlankRows}}',
      trim: '{{trim}}',
      offset: '{{offset}}',
      limit: '{{limit}}',
    },
  },

  properties: {
    file: null,
    sheetName: '',
    includeLegacyData: true,
    includeRows: true,
    includeSchema: true,
    includeStatistics: false,
    indexColumns: '',
    skipBlankRows: true,
    trim: true,
    offset: 0,
    limit: -1,
  },

  propertyConfig: {
    file: {
      type: 'file',
      label: 'File',
      required: true,
      uiType: 'file',
      group: 'Source',
    },
    sheetName: {
      type: 'string',
      label: 'Sheet Name',
      required: true,
      uiType: 'input',
      group: 'Source',
      description: 'Sheet to read. Use Get Sheet Names first if unsure.',
    },
    includeStatistics: {
      type: 'boolean',
      label: 'Include Statistics',
      required: false,
      uiType: 'input',
      group: 'Views',
      description:
        'Per-column min, max, sum, mean, distinct count, computed over the whole sheet. Off by default because it costs a full pass.',
    },
    includeSchema: {
      type: 'boolean',
      label: 'Include Schema',
      required: false,
      uiType: 'input',
      group: 'Views',
      description: 'Column types and suggested SQL types. Cheap, and the Insert step needs it.',
    },
    includeRows: {
      type: 'boolean',
      label: 'Include Typed Rows',
      required: false,
      uiType: 'input',
      group: 'Views',
    },
    includeLegacyData: {
      type: 'boolean',
      label: 'Include Display Strings',
      required: false,
      uiType: 'input',
      group: 'Views',
      description:
        'Keeps the `data` field that Read Sheet returns, so a workflow migrating from Read Sheet can switch endpoints without changing any binding.',
    },
    indexColumns: {
      type: 'string',
      label: 'Index Columns',
      required: false,
      uiType: 'input',
      group: 'Views',
      placeholder: 'InvoiceNo, CustomerId',
      description:
        'Comma-separated. Builds a value to row-number map so a Lookup resolves in one hash hit instead of scanning every row. Index low-cardinality keys only.',
    },
    skipBlankRows: {
      type: 'boolean',
      label: 'Skip Blank Rows',
      required: false,
      uiType: 'input',
      group: 'Options',
    },
    trim: {
      type: 'boolean',
      label: 'Trim Text',
      required: false,
      uiType: 'input',
      group: 'Options',
    },
    offset: {
      type: 'number',
      label: 'Offset',
      required: false,
      uiType: 'input',
      group: 'Paging',
      min: 0,
    },
    limit: {
      type: 'number',
      label: 'Limit',
      required: false,
      uiType: 'input',
      group: 'Paging',
      description: '-1 reads every row. Set a limit for sheets above ~50,000 rows.',
    },
  },

  outputSchema: datasetOutputSchema(
    'data',
    EXCEL_DATASET_EXTRAS,
    'Rows are the primary model. Columns, statistics and indexes are derived views built in the same read pass, so they can never disagree with the rows.'
  ),
};

/* -------------------------------------------------------------------------- */
/*                    OUTPUT CONTRACTS FOR EXISTING ACTIONS                   */
/* -------------------------------------------------------------------------- */

/**
 * Output schemas keyed by `action.type`, applied to actions that already exist.
 *
 * Retrofitting these matters as much as adding the new action. If only
 * `read-dataset` is design-time bindable, every author is pushed onto the new
 * endpoint immediately whether or not their workflow needs typed values — which
 * is precisely the forced migration this upgrade is meant to avoid.
 */
export const EXCEL_OUTPUT_SCHEMAS: Record<string, OutputSchema> = {
  'read-sheet': {
    version: '1.0',
    envelope: 'data',
    producesDataSet: false,
    fields: [
      {
        path: 'sheetName',
        label: 'Sheet Name',
        kind: 'string',
        valueType: 'STRING',
        visibility: 'primary',
        example: 'Sheet1',
      },
      ...LEGACY_TABLE_OUTPUT_FIELDS,
    ],
    notes:
      'Values are Excel display strings. For arithmetic, date comparison or a typed database insert, use Read Dataset instead.',
  },

  'read-workbook': {
    version: '1.0',
    envelope: 'data',
    fields: [
      {
        path: 'sheets',
        label: 'Sheets',
        kind: 'object',
        visibility: 'primary',
        description: 'Rows keyed by sheet name. Values are display strings.',
      },
      {
        path: 'workbookName',
        label: 'Workbook Name',
        kind: 'string',
        valueType: 'STRING',
        visibility: 'primary',
      },
      {
        path: 'totalSheets',
        label: 'Total Sheets',
        kind: 'number',
        valueType: 'INTEGER',
        visibility: 'primary',
        example: 3,
      },
      {
        path: 'totalRows',
        label: 'Total Rows',
        kind: 'number',
        valueType: 'INTEGER',
        visibility: 'primary',
        example: 1248,
      },
    ],
  },

  'get-sheet-names': {
    version: '1.0',
    envelope: 'data',
    fields: [
      {
        path: 'sheets',
        label: 'Sheet Names',
        kind: 'array',
        visibility: 'primary',
        example: ['Sheet1', 'Q3', 'Archive'],
      },
      {
        path: 'totalSheets',
        label: 'Total Sheets',
        kind: 'number',
        valueType: 'INTEGER',
        visibility: 'primary',
        example: 3,
      },
    ],
  },

  'get-column-names': {
    version: '1.0',
    envelope: 'data',
    fields: [
      {
        path: 'sheetName',
        label: 'Sheet Name',
        kind: 'string',
        valueType: 'STRING',
        visibility: 'primary',
      },
      {
        path: 'columns',
        label: 'Column Names',
        kind: 'array',
        visibility: 'primary',
        providesColumns: true,
        example: ['InvoiceNo', 'Customer', 'Amount'],
      },
    ],
  },

  'read-cell': {
    version: '1.0',
    envelope: 'data',
    fields: [
      {
        path: 'value',
        label: 'Value',
        kind: 'string',
        valueType: 'STRING',
        visibility: 'primary',
        example: 'E101',
      },
      { path: 'cell', label: 'Cell Address', kind: 'string', valueType: 'STRING', visibility: 'secondary', example: 'B5' },
      { path: 'sheetName', label: 'Sheet Name', kind: 'string', valueType: 'STRING', visibility: 'secondary' },
      { path: 'cellType', label: 'Cell Type', kind: 'string', valueType: 'STRING', visibility: 'technical' },
    ],
  },

  'find-cell': {
    version: '1.0',
    envelope: 'data',
    fields: [
      { path: 'found', label: 'Found', kind: 'boolean', visibility: 'primary', example: true },
      { path: 'cellAddress', label: 'Cell Address', kind: 'string', valueType: 'STRING', visibility: 'primary', example: 'C12' },
      { path: 'row', label: 'Row', kind: 'number', valueType: 'INTEGER', visibility: 'primary', example: 11 },
      { path: 'column', label: 'Column', kind: 'number', valueType: 'INTEGER', visibility: 'secondary', example: 2 },
      { path: 'value', label: 'Value', kind: 'string', valueType: 'STRING', visibility: 'secondary' },
    ],
  },

  'go-to-cell': {
    version: '1.0',
    envelope: 'data',
    fields: [
      { path: 'value', label: 'Value', kind: 'string', valueType: 'STRING', visibility: 'primary' },
      { path: 'cellAddress', label: 'Cell Address', kind: 'string', valueType: 'STRING', visibility: 'secondary' },
      { path: 'success', label: 'Success', kind: 'boolean', visibility: 'secondary', example: true },
    ],
  },

  'append-row': {
    version: '1.0',
    envelope: '',
    fields: [
      { path: 'fileName', label: 'File Name', kind: 'string', valueType: 'STRING', visibility: 'primary' },
      { path: 'savedToDisk', label: 'Saved To Disk', kind: 'boolean', visibility: 'primary', example: true },
      { path: 'size', label: 'Size (bytes)', kind: 'number', valueType: 'INTEGER', visibility: 'secondary' },
    ],
    notes: 'Returns the updated workbook as a file, not JSON. The editor writes it back to disk or downloads it.',
  },
};

/* -------------------------------------------------------------------------- */
/*                                 PATCH HELPER                               */
/* -------------------------------------------------------------------------- */

/**
 * Attach declared output schemas to a category's actions, in place of hand
 * editing 349 catalogue entries.
 *
 * Never overwrites a schema an action already declares, so a hand-authored
 * contract always wins over this bulk retrofit.
 */
export function applyOutputSchemas<T extends { type?: string; outputSchema?: OutputSchema }>(
  actions: T[],
  schemas: Record<string, OutputSchema>
): T[] {
  return actions.map((action) => {
    if (action.outputSchema) return action;
    const schema = action.type ? schemas[action.type] : undefined;
    return schema ? { ...action, outputSchema: schema } : action;
  });
}