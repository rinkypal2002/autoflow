import type { AutomationCategory } from '../../types/workflow';
import type { OutputSchema } from '../../types/pluginContract';

const NO_BUSINESS_OUTPUT: OutputSchema = { version: '1.0', envelope: 'data', hasBusinessOutput: false, fields: [] };
const STRING_BUSINESS_OUTPUT: OutputSchema = { version: '1.0', envelope: 'data', rootKind: 'string', fields: [] };
const NUMBER_BUSINESS_OUTPUT: OutputSchema = { version: '1.0', envelope: 'data', rootKind: 'number', fields: [] };
const READ_SHEET_OUTPUT: OutputSchema = {
  version: '1.0',
  envelope: 'data',
  fields: [{ path: 'records', label: 'Records', kind: 'array', visibility: 'primary', description: 'Rows returned from the sheet as dynamic business records.' }],
};

const jsonApi = (action: string, body: Record<string, unknown>) => ({
  url: `http://localhost:8080/engine/api/v1/googlesheets/${action}`,
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  bodyType: 'json',
  body,
});
const stringField = (label: string, required = true, description?: string) => ({
  type: 'string', label, required, uiType: 'input', ...(description ? { description } : {}),
});

export const GOOGLE_SHEETS_CATEGORY: AutomationCategory = {
  id: 'google-sheets-042',
  name: 'Google Sheets',
  icon: 'FileSpreadsheet',
  color: 'bg-emerald-500',
  description: 'Create, read, copy, update and manage Google Sheets spreadsheets and tabs.',
  metadata: { tags: ['google-sheets','spreadsheet','automation'], featured: true, popularityScore: 90, order: 42, group: 'Google Sheets Plugin' },
  ui: { gradient: 'from-emerald-500/20 to-green-600/10', iconBg: 'bg-emerald-500/10', borderGlow: true, cardStyle: 'premium' },
  control: { enabled: true, version: '1.0.0' },
  actions: [
    {
      type: 'append-row', category: 'google-sheets-042', name: 'Append Row',
      description: 'Append one ordered row of values to a Google Sheets tab.',
      icon: 'ListPlus', color: 'bg-emerald-500', tags: ['append','row','sheet'],
      complexity: 'basic', estimatedTime: 1000, supportsStreaming: false, requiresAuth: false, retryable: false, timeout: 30000,
      api: jsonApi('append-row',{spreadsheetId:'{{spreadsheetId}}',sheetName:'{{sheetName}}',values:'{{values}}'}),
      properties: {spreadsheetId:'',sheetName:'',values:[]},
      propertyConfig: {
        spreadsheetId:stringField('Spreadsheet ID'), sheetName:stringField('Sheet Name'),
        values:{type:'array',label:'Values',required:true,uiType:'json-editor',description:'Ordered JSON array representing one row, for example ["Alice", 42, true].'}
      },
      outputSchema: NO_BUSINESS_OUTPUT
    },
    {
      type: 'copy-sheet', category: 'google-sheets-042', name: 'Copy Sheet',
      description: 'Copy a sheet tab from one spreadsheet into another spreadsheet.',
      icon: 'Copy', color: 'bg-blue-500', tags: ['copy','sheet'],
      complexity: 'basic', estimatedTime: 1000, supportsStreaming: false, requiresAuth: false, retryable: false, timeout: 30000,
      api: jsonApi('copy-sheet',{sourceSpreadsheetId:'{{sourceSpreadsheetId}}',sheetName:'{{sheetName}}',destinationSpreadsheetId:'{{destinationSpreadsheetId}}'}),
      properties: {sourceSpreadsheetId:'',sheetName:'',destinationSpreadsheetId:''},
      propertyConfig: {sourceSpreadsheetId:stringField('Source Spreadsheet ID'),sheetName:stringField('Sheet Name'),destinationSpreadsheetId:stringField('Destination Spreadsheet ID')},
      outputSchema: NO_BUSINESS_OUTPUT
    },
    {
      type: 'create-sheet', category: 'google-sheets-042', name: 'Create Sheet',
      description: 'Create a new sheet tab inside an existing spreadsheet.',
      icon: 'FilePlus2', color: 'bg-green-500', tags: ['create','sheet','tab'],
      complexity: 'basic', estimatedTime: 1000, supportsStreaming: false, requiresAuth: false, retryable: false, timeout: 30000,
      api: jsonApi('create-sheet',{spreadsheetId:'{{spreadsheetId}}',sheetName:'{{sheetName}}'}),
      properties: {spreadsheetId:'',sheetName:''},
      propertyConfig: {spreadsheetId:stringField('Spreadsheet ID'),sheetName:stringField('Sheet Name')},
      outputSchema: NUMBER_BUSINESS_OUTPUT
    },
    {
      type: 'create-spreadsheet', category: 'google-sheets-042', name: 'Create Spreadsheet',
      description: 'Create a Google Sheets spreadsheet inside a Google Drive folder.',
      icon: 'FileSpreadsheet', color: 'bg-emerald-500', tags: ['create','spreadsheet'],
      complexity: 'basic', estimatedTime: 1000, supportsStreaming: false, requiresAuth: false, retryable: false, timeout: 30000,
      api: jsonApi('create-spreadsheet',{title:'{{title}}',folderId:'{{folderId}}'}),
      properties: {title:'',folderId:''},
      propertyConfig: {title:stringField('Title'),folderId:stringField('Folder ID')},
      outputSchema: STRING_BUSINESS_OUTPUT
    },
    {
      type: 'delete-sheet', category: 'google-sheets-042', name: 'Delete Sheet',
      description: 'Permanently delete a sheet tab from a spreadsheet. This operation is destructive.',
      icon: 'Trash2', color: 'bg-red-500', tags: ['delete','sheet','destructive'],
      complexity: 'basic', estimatedTime: 1000, supportsStreaming: false, requiresAuth: false, retryable: false, timeout: 30000,
      api: jsonApi('delete-sheet',{spreadsheetId:'{{spreadsheetId}}',sheetName:'{{sheetName}}'}),
      properties: {spreadsheetId:'',sheetName:''},
      propertyConfig: {spreadsheetId:stringField('Spreadsheet ID'),sheetName:stringField('Sheet Name')},
      outputSchema: NO_BUSINESS_OUTPUT
    },
    {
      type: 'get-sheet-id', category: 'google-sheets-042', name: 'Get Sheet Id',
      description: 'Resolve the numeric Google Sheets tab ID from its sheet name.',
      icon: 'Search', color: 'bg-cyan-500', tags: ['get','sheet','id'],
      complexity: 'basic', estimatedTime: 1000, supportsStreaming: false, requiresAuth: false, retryable: false, timeout: 30000,
      api: jsonApi('get-sheet-id',{spreadsheetId:'{{spreadsheetId}}',sheetName:'{{sheetName}}'}),
      properties: {spreadsheetId:'',sheetName:''},
      propertyConfig: {spreadsheetId:stringField('Spreadsheet ID'),sheetName:stringField('Sheet Name')},
      outputSchema: NUMBER_BUSINESS_OUTPUT
    },
    {
      type: 'read-sheet', category: 'google-sheets-042', name: 'Read Sheet',
      description: 'Read rows from a Google Sheets tab, optionally restricted to an A1 range.',
      icon: 'Table2', color: 'bg-teal-500', tags: ['read','sheet','rows'],
      complexity: 'basic', estimatedTime: 1000, supportsStreaming: false, requiresAuth: false, retryable: false, timeout: 30000,
      api: jsonApi('read-sheet',{spreadsheetId:'{{spreadsheetId}}',sheetName:'{{sheetName}}',range:'{{range}}'}),
      properties: {spreadsheetId:'',sheetName:'',range:''},
      propertyConfig: {spreadsheetId:stringField('Spreadsheet ID'),sheetName:stringField('Sheet Name'),range:stringField('Range',false,'Optional A1 range such as A1:D10. Leave blank to read the sheet.')},
      outputSchema: READ_SHEET_OUTPUT
    }
  ]
};
