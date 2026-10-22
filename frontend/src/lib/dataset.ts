/**
 * DataSet awareness for the workflow runtime.
 *
 * The backend now returns a *handle* for tabular sources rather than the rows
 * themselves. That one change fixes the runtime's worst scaling problem without
 * touching the executor's structure: `recordNodeOutput` deep-clones every node
 * output and `flattenObject` indexes every leaf path, so a 200,000-row payload
 * became a full clone plus roughly four million dot-path entries, re-spread by
 * `buildScope()` on every property resolution of every later step. A handle is
 * a few hundred bytes. Cloning and flattening it costs nothing, and the rows
 * stay on the server where they were parsed.
 *
 * This module is the bridge. It recognises handle payloads, exposes their
 * columns and statistics to the binding picker as if the rows were present, and
 * fetches pages only when something actually needs to display them.
 *
 * Pure except for `fetchDatasetPage`. No React, no DOM.
 */

/* -------------------------------------------------------------------------- */
/*                                   TYPES                                    */
/* -------------------------------------------------------------------------- */

export type DataSetValueType =
  | 'STRING'
  | 'INTEGER'
  | 'DECIMAL'
  | 'DOUBLE'
  | 'BOOLEAN'
  | 'DATE'
  | 'TIMESTAMP'
  | 'TIME'
  | 'BINARY'
  | 'NULL'
  | 'MIXED';

export interface ColumnDescriptor {
  name: string;
  sourceName?: string;
  index: number;
  /** Source-specific hint, e.g. an Excel column letter. */
  address?: string;
  type: DataSetValueType;
  mixedTypes?: boolean;
  nullable?: boolean;
  precision?: number;
  scale?: number;
  maxLength?: number;
  samples?: string[];
}

export interface ColumnStatistics {
  column: string;
  type: DataSetValueType;
  count: number;
  nullCount: number;
  nonNullCount: number;
  distinctCount: number;
  distinctApproximate?: boolean;
  min?: number | string;
  max?: number | string;
  sum?: number | string;
  mean?: number | string;
  median?: number | string;
  stdDev?: number | string;
  minDate?: string;
  maxDate?: string;
  minLength?: number;
  maxLength?: number;
  topValues?: Record<string, number>;
}

export interface DataSetSourceInfo {
  type: string;
  name?: string;
  container?: string;
  attributes?: Record<string, any>;
}

export interface PageInfo {
  offset: number;
  limit: number;
  returned: number;
  total: number;
  hasMore: boolean;
}

export interface DataSetView {
  schemaVersion: string;
  datasetId: string;
  source?: DataSetSourceInfo;
  columns?: ColumnDescriptor[];
  rowCount: number;

  rows?: Array<Record<string, any>>;
  rowNumbers?: number[];
  page?: PageInfo;

  statistics?: Record<string, ColumnStatistics>;
  columnValues?: Record<string, any[]>;
  cells?: Record<string, any>;
  rowsByNumber?: Record<string, Record<string, any>>;
  indexes?: Record<string, Record<string, number[]>>;

  // Backward-compatibility fields, populated only by the compatibility layer.
  sheetName?: string;
  headers?: string[];
  data?: Array<Record<string, string>>;
  totalRows?: number;
  totalColumns?: number;

  metadata?: Record<string, any>;
}

/* -------------------------------------------------------------------------- */
/*                                 DETECTION                                  */
/* -------------------------------------------------------------------------- */

const isObject = (value: any): value is Record<string, any> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * True when a payload is a DataSet view.
 *
 * Detection is by `datasetId` plus `schemaVersion` rather than by guessing from
 * the presence of `rows`, because a plain REST response can legitimately
 * contain a `rows` key and must not be mistaken for a dataset.
 */
export function isDataSetView(value: any): value is DataSetView {
  return isObject(value) && typeof value.datasetId === 'string' && typeof value.schemaVersion === 'string';
}

/** True when the view is a handle: it describes rows it does not carry. */
export function isHandleOnly(view: DataSetView): boolean {
  return !Array.isArray(view.rows) && !Array.isArray(view.data) && view.rowCount > 0;
}

/**
 * Finds a DataSet view anywhere in a node output, including inside the standard
 * `{ success, message, data }` envelope. Returns null when there is none, so
 * every caller can treat "not a dataset" as the ordinary case.
 */
export function extractDataSetView(output: any): DataSetView | null {
  if (isDataSetView(output)) return output;
  if (isObject(output)) {
    if (isDataSetView(output.data)) return output.data;
    if (isObject(output.data) && isDataSetView(output.data.data)) return output.data.data;
  }
  return null;
}

/* -------------------------------------------------------------------------- */
/*                              BINDING SUPPORT                               */
/* -------------------------------------------------------------------------- */

export interface DataSetBindingField {
  key: string;
  path: string;
  label: string;
  value: any;
  valueType: string;
  preview: string;
  depth: number;
  priority: number;
  isContainer: boolean;
}

const humanize = (key: string): string =>
  String(key ?? '')
    .replace(/[_\-.]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());

const previewOf = (value: any, max = 80): string => {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) return `Array(${value.length})`;
  if (typeof value === 'object') return `{${Object.keys(value).length} fields}`;
  const text = String(value);
  return text.length > max ? `${text.slice(0, max)}…` : text;
};

/**
 * Bindable fields for a dataset, for the binding picker.
 *
 * This is the piece that makes handles invisible to a user. Without it, a
 * handle-only payload projects as `datasetId` and `rowCount` and nothing else —
 * the picker would show no columns at all, because there are no rows to lift
 * field names from. Here the columns come from the schema instead, so a user
 * sees exactly the same list whether the rows travelled or not.
 *
 * The paths produced resolve without any change to the expression engine:
 * `rows.first.Amount` is an ordinary path, and so is
 * `statistics.Amount.sum` — which is how `Sum(Amount)` becomes available in a
 * language that has no function-call grammar.
 */
export function datasetBindingFields(view: DataSetView, limit = 40): DataSetBindingField[] {
  const fields: DataSetBindingField[] = [];

  const push = (
    key: string,
    path: string,
    value: any,
    depth: number,
    priority: number,
    isContainer = false
  ): void => {
    if (fields.length >= limit) return;
    fields.push({
      key,
      path,
      label: humanize(key),
      value,
      valueType: Array.isArray(value) ? 'array' : typeof value,
      preview: previewOf(value),
      depth,
      priority,
      isContainer,
    });
  };

  push('rows', 'rows', view.rows ?? `DataSet(${view.rowCount} rows)`, 0, 0, true);
  push('rowCount', 'rowCount', view.rowCount, 0, 1);

  const columns = view.columns ?? [];
  const sampleRow = view.rows?.[0];

  columns.forEach((column, position) => {
    const sample = sampleRow ? sampleRow[column.name] : column.samples?.[0];
    push(column.name, `rows.first.${column.name}`, sample, 1, 10 + position);
  });

  // Aggregates. Present whenever statistics were requested; the paths are what
  // give business users Sum, Average, Min, Max, Count and Distinct.
  if (view.statistics) {
    Object.entries(view.statistics).forEach(([name, stats]) => {
      if (stats.sum !== undefined) push(`${name} Sum`, `statistics.${name}.sum`, stats.sum, 2, 100);
      if (stats.mean !== undefined) push(`${name} Average`, `statistics.${name}.mean`, stats.mean, 2, 101);
      if (stats.min !== undefined) push(`${name} Min`, `statistics.${name}.min`, stats.min, 2, 102);
      if (stats.max !== undefined) push(`${name} Max`, `statistics.${name}.max`, stats.max, 2, 103);
      push(`${name} Count`, `statistics.${name}.nonNullCount`, stats.nonNullCount, 2, 104);
      push(`${name} Distinct`, `statistics.${name}.distinctCount`, stats.distinctCount, 2, 105);
    });
  }

  if (view.datasetId) {
    push('datasetId', 'datasetId', view.datasetId, 0, 900);
  }
  return fields;
}

/**
 * Values layered into a node's scope so `{{previous.<column>}}` style tokens
 * resolve. Deliberately shallow: the path resolver traverses nesting on its own,
 * and flattening a dataset here would reintroduce the memory problem handles
 * exist to remove.
 */
export function datasetScopeValues(view: DataSetView): Record<string, any> {
  const values: Record<string, any> = {
    datasetId: view.datasetId,
    rowCount: view.rowCount,
    columns: view.columns,
  };
  if (view.rows) values.rows = view.rows;
  if (view.rowNumbers) values.rowNumbers = view.rowNumbers;
  if (view.statistics) values.statistics = view.statistics;
  if (view.columnValues) values.columnValues = view.columnValues;
  if (view.cells) values.cells = view.cells;
  if (view.rowsByNumber) values.rowsByNumber = view.rowsByNumber;
  if (view.indexes) values.indexes = view.indexes;

  // Legacy names, so bindings saved against the old contract keep resolving.
  if (view.headers) values.headers = view.headers;
  if (view.data) values.data = view.data;
  if (view.sheetName) values.sheetName = view.sheetName;
  if (view.totalRows !== undefined) values.totalRows = view.totalRows;
  if (view.totalColumns !== undefined) values.totalColumns = view.totalColumns;

  return values;
}

/**
 * How much of a node output should be cloned into the run record.
 *
 * A handle is small and is cloned whole. A view that carries rows is capped:
 * the run record keeps a preview and the count, not the payload. Nothing is
 * lost that a user can reach — the rows are still on the server behind the
 * handle, and `fetchDatasetPage` retrieves them on demand — but the browser
 * stops holding every row of every step for the whole run.
 */
export function compactForCarryForward(view: DataSetView, previewRows = 50): DataSetView {
  if (!Array.isArray(view.rows) || view.rows.length <= previewRows) {
    return view;
  }
  return {
    ...view,
    rows: view.rows.slice(0, previewRows),
    rowNumbers: view.rowNumbers?.slice(0, previewRows),
    data: view.data?.slice(0, previewRows),
    metadata: {
      ...(view.metadata ?? {}),
      rowsTruncatedForCarryForward: true,
      rowsAvailable: view.rowCount,
      rowsRetained: previewRows,
    },
  };
}

/* -------------------------------------------------------------------------- */
/*                                  FETCHING                                  */
/* -------------------------------------------------------------------------- */

export interface DataSetPageRequest {
  datasetId: string;
  offset?: number;
  limit?: number;
  /** Column names to profile. Statistics are computed lazily and cached server-side. */
  statistics?: string[];
  /** Column names to build a lookup index for. */
  indexColumns?: string[];
  /** Include the legacy display-string `data` field. */
  legacy?: boolean;
  baseUrl?: string;
}

const DEFAULT_BASE_URL = '/engine';

/**
 * Fetches a page of rows for a handle.
 *
 * Used by the preview table and by any step that genuinely needs the rows in the
 * browser. A step that only passes the dataset onward never calls this — it
 * forwards the handle, which is the whole reason the handle exists.
 */
export async function fetchDatasetPage(request: DataSetPageRequest): Promise<DataSetView> {
  const {
    datasetId,
    offset = 0,
    limit = 100,
    statistics,
    indexColumns,
    legacy = false,
    baseUrl = DEFAULT_BASE_URL,
  } = request;

  const params = new URLSearchParams();
  params.set('offset', String(offset));
  params.set('limit', String(limit));
  params.set('legacy', String(legacy));
  if (statistics?.length) params.set('statistics', statistics.join(','));
  if (indexColumns?.length) params.set('indexColumns', indexColumns.join(','));

  const response = await fetch(
    `${baseUrl}/v1/datasets/${encodeURIComponent(datasetId)}/rows?${params.toString()}`,
    { method: 'GET', headers: { Accept: 'application/json' } }
  );

  const body = await response.json().catch(() => null);

  if (!response.ok || body?.success === false) {
    const message = body?.message ?? `Dataset request failed with status ${response.status}`;
    const code = body?.errorCode ? ` [${body.errorCode}]` : '';
    throw new Error(`${message}${code}`);
  }

  const view = extractDataSetView(body);
  if (!view) {
    throw new Error('Dataset response did not contain a DataSet view');
  }
  return view;
}

/** Releases a dataset early. Optional: the store expires handles on its own TTL. */
export async function releaseDataset(datasetId: string, baseUrl = DEFAULT_BASE_URL): Promise<void> {
  try {
    await fetch(`${baseUrl}/v1/datasets/${encodeURIComponent(datasetId)}`, { method: 'DELETE' });
  } catch {
    // A failed release is not worth failing a run for; the TTL will collect it.
  }
}

/* -------------------------------------------------------------------------- */
/*                                  SUMMARY                                   */
/* -------------------------------------------------------------------------- */

/** One-line description of a dataset, for the execution panel's step summary. */
export function summarizeDataSet(view: DataSetView): string {
  const columns = view.columns?.length ?? view.totalColumns ?? 0;
  const where = view.source?.container ?? view.source?.name ?? '';
  const rows = `${view.rowCount.toLocaleString()} row${view.rowCount === 1 ? '' : 's'}`;
  const cols = `${columns} column${columns === 1 ? '' : 's'}`;
  return where ? `${where}: ${rows} · ${cols}` : `${rows} · ${cols}`;
}
