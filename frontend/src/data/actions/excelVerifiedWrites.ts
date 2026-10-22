/**
 * Six certified Excel JSON/verification actions that exist in Products Engine
 * v11.3 but were previously missing from the frontend catalogue.
 *
 * IMPORTANT:
 * - These do not replace the existing binary workbook-return actions.
 * - All six endpoints consume multipart/form-data.
 * - Successful JSON responses use the existing ApiResponse envelope:
 *     { success, message, data }
 *   so outputSchema.envelope is "data".
 */

import type { OutputField, OutputSchema } from '../../types/pluginContract';

const ENGINE_BASE =
  (typeof import.meta !== 'undefined' && (import.meta as any)?.env?.VITE_ENGINE_URL) ||
  'http://localhost:8080/engine';

const output = (fields: OutputField[], notes?: string): OutputSchema => ({
  version: '1.0',
  envelope: 'data',
  producesDataSet: false,
  fields,
  ...(notes ? { notes } : {}),
});

const fileConfig = {
  type: 'file',
  label: 'File',
  required: true,
  uiType: 'file',
  group: 'Source',
};

const sheetConfig = {
  type: 'string',
  label: 'Sheet Name',
  required: true,
  uiType: 'input',
  group: 'Target',
};

const base = {
  category: 'excel-automation-011',
  complexity: 'basic',
  estimatedTime: 1000,
  supportsStreaming: false,
  requiresAuth: false,
  retryable: false,
  idempotent: false,
  timeout: 60000,
};

export const EXCEL_VERIFIED_WRITE_ACTIONS = [
  {
    ...base,
    type: 'write-cell-verify',
    name: 'Write Cell & Verify',
    description: 'Write a cell value and return the verified read-back result as JSON.',
    icon: 'Edit3',
    color: 'bg-violet-500',
    tags: ['write', 'cell', 'verify', 'json'],
    api: {
      url: `${ENGINE_BASE}/excel/write-cell-verify`,
      method: 'POST',
      bodyType: 'form-data',
      body: {
        file: '{{file}}',
        sheetName: '{{sheetName}}',
        row: '{{row}}',
        col: '{{col}}',
        value: '{{value}}',
      },
    },
    properties: { file: null, sheetName: '', row: 0, col: 0, value: '' },
    propertyConfig: {
      file: fileConfig,
      sheetName: sheetConfig,
      row: {
        type: 'number',
        label: 'Row (0-based)',
        required: true,
        uiType: 'input',
        group: 'Target',
        min: 0,
      },
      col: {
        type: 'number',
        label: 'Column (0-based)',
        required: true,
        uiType: 'input',
        group: 'Target',
        min: 0,
      },
      value: {
        type: 'string',
        label: 'Value',
        required: true,
        uiType: 'input',
        group: 'Value',
      },
    },
    outputSchema: output([
      { path: 'sheetName', label: 'Sheet Name', kind: 'string', valueType: 'STRING', visibility: 'primary' },
      { path: 'cell', label: 'Cell Address', kind: 'string', valueType: 'STRING', visibility: 'primary' },
      { path: 'value', label: 'Read-back Value', kind: 'string', valueType: 'STRING', visibility: 'primary' },
      { path: 'updated', label: 'Updated', kind: 'boolean', visibility: 'primary' },
      { path: 'oldValue', label: 'Old Value', kind: 'string', valueType: 'STRING', visibility: 'secondary' },
      { path: 'newValue', label: 'New Value', kind: 'string', valueType: 'STRING', visibility: 'secondary' },
      { path: 'row', label: 'Row', kind: 'number', valueType: 'INTEGER', visibility: 'secondary' },
      { path: 'col', label: 'Column', kind: 'number', valueType: 'INTEGER', visibility: 'secondary' },
    ]),
  },

  {
    ...base,
    type: 'append-row-verify',
    name: 'Append Row & Verify',
    description: 'Append values to the next row and return the written row as JSON.',
    icon: 'Plus',
    color: 'bg-emerald-500',
    tags: ['append', 'row', 'verify', 'json'],
    api: {
      url: `${ENGINE_BASE}/excel/append-row-verify`,
      method: 'POST',
      bodyType: 'form-data',
      body: {
        file: '{{file}}',
        sheetName: '{{sheetName}}',
        values: '{{values}}',
      },
    },
    properties: { file: null, sheetName: '', values: '' },
    propertyConfig: {
      file: fileConfig,
      sheetName: sheetConfig,
      values: {
        type: 'string',
        label: 'Values',
        required: true,
        uiType: 'input',
        group: 'Value',
        placeholder: 'Alice, Tester, 65000',
        description: 'Comma-separated values in worksheet column order.',
      },
    },
    outputSchema: output([
      { path: 'sheetName', label: 'Sheet Name', kind: 'string', valueType: 'STRING', visibility: 'primary' },
      { path: 'rowIndex', label: 'Appended Row Index', kind: 'number', valueType: 'INTEGER', visibility: 'primary' },
      { path: 'appended', label: 'Appended', kind: 'boolean', visibility: 'primary' },
      { path: 'values', label: 'Written Values', kind: 'object', visibility: 'primary' },
    ]),
  },

  {
    ...base,
    type: 'write-row-verify',
    name: 'Write Row & Verify',
    description: 'Write an entire row and return the resulting sheet data as JSON.',
    icon: 'Edit3',
    color: 'bg-violet-500',
    tags: ['write', 'row', 'verify', 'json'],
    api: {
      url: `${ENGINE_BASE}/excel/write-row-verify`,
      method: 'POST',
      bodyType: 'form-data',
      body: {
        file: '{{file}}',
        sheetName: '{{sheetName}}',
        rowNumber: '{{rowNumber}}',
        rowData: '{{rowData}}',
      },
    },
    properties: { file: null, sheetName: '', rowNumber: 1, rowData: '' },
    propertyConfig: {
      file: fileConfig,
      sheetName: sheetConfig,
      rowNumber: {
        type: 'number',
        label: 'Row Number (1-based)',
        required: true,
        uiType: 'input',
        group: 'Target',
        min: 1,
        placeholder: '2 = first data row when row 1 contains headers',
      },
      rowData: {
        type: 'string',
        label: 'Row Data',
        required: true,
        uiType: 'input',
        group: 'Value',
        placeholder: 'John, IT, 8000',
        description: 'Comma-separated row values.',
      },
    },
    outputSchema: output([
      { path: 'sheetName', label: 'Sheet Name', kind: 'string', valueType: 'STRING', visibility: 'primary' },
      { path: 'rowNumber', label: 'Row Number', kind: 'number', valueType: 'INTEGER', visibility: 'primary' },
      { path: 'success', label: 'Success', kind: 'boolean', visibility: 'primary' },
      { path: 'data', label: 'Sheet Data', kind: 'array', visibility: 'secondary' },
    ]),
  },

  {
    ...base,
    type: 'delete-row-verify',
    name: 'Delete Row & Verify',
    description: 'Delete a row and return deletion/remaining-row information as JSON.',
    icon: 'Trash2',
    color: 'bg-red-500',
    tags: ['delete', 'row', 'verify', 'json'],
    api: {
      url: `${ENGINE_BASE}/excel/delete-row-verify`,
      method: 'POST',
      bodyType: 'form-data',
      body: {
        file: '{{file}}',
        sheetName: '{{sheetName}}',
        rowIndex: '{{rowIndex}}',
      },
    },
    properties: { file: null, sheetName: '', rowIndex: 0 },
    propertyConfig: {
      file: fileConfig,
      sheetName: sheetConfig,
      rowIndex: {
        type: 'number',
        label: 'Row Index (0-based)',
        required: true,
        uiType: 'input',
        group: 'Target',
        min: 0,
      },
    },
    outputSchema: output([
      { path: 'sheetName', label: 'Sheet Name', kind: 'string', valueType: 'STRING', visibility: 'primary' },
      { path: 'rowIndex', label: 'Deleted Row Index', kind: 'number', valueType: 'INTEGER', visibility: 'primary' },
      { path: 'deleted', label: 'Deleted', kind: 'boolean', visibility: 'primary' },
      { path: 'remainingRows', label: 'Remaining Rows', kind: 'number', valueType: 'INTEGER', visibility: 'secondary' },
    ]),
  },

  {
    ...base,
    type: 'replace-cell-json',
    name: 'Replace Cells (JSON)',
    description: 'Replace matching cell values and return the updated sheet data as JSON.',
    icon: 'Circle',
    color: 'bg-cyan-500',
    tags: ['replace', 'cell', 'json'],
    api: {
      url: `${ENGINE_BASE}/excel/replace-cell`,
      method: 'POST',
      bodyType: 'form-data',
      body: {
        file: '{{file}}',
        sheetName: '{{sheetName}}',
        findValue: '{{findValue}}',
        replaceValue: '{{replaceValue}}',
      },
    },
    properties: { file: null, sheetName: '', findValue: '', replaceValue: '' },
    propertyConfig: {
      file: fileConfig,
      sheetName: sheetConfig,
      findValue: {
        type: 'string',
        label: 'Find Value',
        required: true,
        uiType: 'input',
        group: 'Value',
      },
      replaceValue: {
        type: 'string',
        label: 'Replace Value',
        required: true,
        uiType: 'input',
        group: 'Value',
      },
    },
    outputSchema: output([
      { path: 'sheetName', label: 'Sheet Name', kind: 'string', valueType: 'STRING', visibility: 'primary' },
      { path: 'replacedCount', label: 'Replaced Count', kind: 'number', valueType: 'INTEGER', visibility: 'primary' },
      { path: 'success', label: 'Success', kind: 'boolean', visibility: 'primary' },
      { path: 'data', label: 'Updated Sheet Data', kind: 'array', visibility: 'secondary' },
    ]),
  },

  {
    ...base,
    type: 'clear-cell-json',
    name: 'Clear Cell (JSON)',
    description: 'Clear one cell and return the updated sheet data as JSON.',
    icon: 'Circle',
    color: 'bg-slate-500',
    tags: ['clear', 'cell', 'json'],
    api: {
      url: `${ENGINE_BASE}/excel/clear-cell`,
      method: 'POST',
      bodyType: 'form-data',
      body: {
        file: '{{file}}',
        sheetName: '{{sheetName}}',
        row: '{{row}}',
        col: '{{col}}',
      },
    },
    properties: { file: null, sheetName: '', row: 0, col: 0 },
    propertyConfig: {
      file: fileConfig,
      sheetName: sheetConfig,
      row: {
        type: 'number',
        label: 'Row (0-based)',
        required: true,
        uiType: 'input',
        group: 'Target',
        min: 0,
      },
      col: {
        type: 'number',
        label: 'Column (0-based)',
        required: true,
        uiType: 'input',
        group: 'Target',
        min: 0,
      },
    },
    outputSchema: output([
      { path: 'sheetName', label: 'Sheet Name', kind: 'string', valueType: 'STRING', visibility: 'primary' },
      { path: 'clearedCell', label: 'Cleared Cell', kind: 'string', valueType: 'STRING', visibility: 'primary' },
      { path: 'success', label: 'Success', kind: 'boolean', visibility: 'primary' },
      { path: 'data', label: 'Updated Sheet Data', kind: 'array', visibility: 'secondary' },
    ]),
  },
] as const;
