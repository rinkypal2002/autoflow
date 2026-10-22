'use strict';

const assert = require('assert/strict');
const {
  appendSegment,
  bindingPath,
  extractOutputSchema,
  isSensitiveKey,
  projectExecutionOutput,
  unwrapEnvelope,
} = require('../db/outputProjection');
const {
  assertWriteEnabled,
  normalizeRow,
} = require('../db/executionOutputIndexRepository');

function rowByPath(projection, suffix) {
  return projection.rows.find((row) => row.bindingPath.endsWith(suffix));
}

function run() {
  assert.equal(isSensitiveKey('accessToken'), true);
  assert.equal(isSensitiveKey('client_secret'), true);
  assert.equal(isSensitiveKey('employeeId'), false);
  assert.equal(appendSegment('rows[0]', 'Task Name'), "rows[0]['Task Name']");
  assert.equal(bindingPath('Read Employee Excel', 'employeeId'), 'steps.Read Employee Excel.employeeId');
  assert.equal(bindingPath('Sync v1.2', 'rowsAffected'), "steps['Sync v1.2'].rowsAffected");

  const raw = {
    success: true,
    statusCode: 200,
    message: 'Loaded',
    data: {
      employeeId: 'E101',
      employeeName: 'Umesh',
      accessToken: 'do-not-store',
      rows: [
        { 'Task Name': 'Review', amount: 100 },
        { 'Task Name': 'Approve', amount: 200 },
      ],
      metadata: { page: 1 },
    },
  };

  const unwrapped = unwrapEnvelope(raw);
  assert.equal(unwrapped.path, 'data');
  assert.equal(unwrapped.payload.employeeId, 'E101');

  const observed = projectExecutionOutput({
    output: raw,
    stepName: 'Read Employee Excel',
  });

  assert.equal(observed.schemaSource, 'OBSERVED_HEURISTIC');
  assert.ok(rowByPath(observed, '.employeeId'));
  assert.ok(rowByPath(observed, ".rows[0]['Task Name']"));
  assert.ok(rowByPath(observed, ".rows['Task Name']"));
  assert.ok(observed.rows.some((row) => row.fieldKind === 'TECHNICAL' && row.fieldKey === 'statusCode'));
  assert.ok(observed.rows.some((row) => row.fieldKind === 'RAW'));
  assert.equal(new Set(observed.rows.map((row) => row.bindingPath)).size, observed.rows.length);

  const secret = observed.rows.find((row) => row.fieldKey === 'accessToken');
  assert.ok(secret);
  assert.equal(secret.isSecret, true);
  assert.equal(secret.isSearchable, false);
  assert.equal(secret.valuePreview, null);
  assert.equal(secret.valueJson, null);

  const nodeJson = {
    outputSchema: {
      version: '1.0',
      envelope: 'data',
      fields: [
        { path: 'employeeId', label: 'Employee ID', kind: 'string', visibility: 'primary' },
        {
          path: 'rows',
          label: 'Employees',
          kind: 'dataset',
          visibility: 'primary',
          itemFields: [
            { path: 'Task Name', label: 'Task Name', kind: 'string' },
            { path: 'amount', label: 'Amount', kind: 'number' },
          ],
        },
      ],
    },
  };

  assert.ok(extractOutputSchema(nodeJson));
  const declared = projectExecutionOutput({ output: raw, nodeJson, stepName: 'Read Employee Excel' });
  assert.equal(declared.schemaSource, 'DECLARED_SCHEMA');
  assert.equal(declared.schemaVersion, '1.0');
  assert.ok(declared.rows.some((row) => row.metadata.projectionSource === 'DECLARED_SCHEMA'));

  const scalar = projectExecutionOutput({ output: 'OCR text', stepName: 'OCR' });
  assert.ok(rowByPath(scalar, '.value'));

  const bounded = projectExecutionOutput(
    { output: { data: Object.fromEntries(Array.from({ length: 100 }, (_, index) => [`field${index}`, index])) }, stepName: 'Large' },
    { maxRows: 12, maxBusinessRows: 10, maxTechnicalRows: 1 }
  );
  assert.ok(bounded.rows.length <= 12);

  const valid = normalizeRow(observed.rows[0]);
  assert.ok(valid.bindingPath);
  assert.throws(() => normalizeRow({}), /missing fieldKey/);
  assert.throws(() => normalizeRow({
    fieldKey: 'token', displayName: 'Token', fieldPath: 'token',
    bindingPath: 'steps.X.token', valueType: 'STRING', fieldKind: 'BUSINESS',
    isSecret: true, valuePreview: 'bad', valueJson: 'bad', metadata: {},
  }), /must not carry/);

  const previous = process.env.EXECUTION_OUTPUT_INDEX_WRITE_ENABLED;
  process.env.EXECUTION_OUTPUT_INDEX_WRITE_ENABLED = 'false';
  assert.throws(() => assertWriteEnabled(), (error) => error.code === 'OUTPUT_INDEX_WRITES_DISABLED');
  if (previous === undefined) delete process.env.EXECUTION_OUTPUT_INDEX_WRITE_ENABLED;
  else process.env.EXECUTION_OUTPUT_INDEX_WRITE_ENABLED = previous;

  console.log('Step 7B.1 output projection tests: PASS');
  console.log(`Observed rows: ${observed.rows.length}`);
  console.log(`Declared rows: ${declared.rows.length}`);
  console.log(`Bounded rows: ${bounded.rows.length}`);
}

run();
