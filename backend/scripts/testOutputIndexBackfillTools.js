'use strict';

const assert = require('assert/strict');
const {
  stableStringify,
  calculateSourceFingerprint,
  deriveBatchId,
  annotateProjectionRows,
} = require('./outputIndexBackfillCommon');

function run() {
  assert.equal(stableStringify({ b: 2, a: 1 }), stableStringify({ a: 1, b: 2 }));

  const rowsA = [{
    node_execution_id: '11111111-1111-1111-1111-111111111111',
    execution_id: '22222222-2222-2222-2222-222222222222',
    row_version: 0,
    updated_at: '2026-08-03T00:00:00.000Z',
    output_json: { b: 2, a: 1 },
    node_json: { name: 'Read Sheet' },
  }];
  const rowsB = [{ ...rowsA[0], output_json: { a: 1, b: 2 } }];
  const fingerprintA = calculateSourceFingerprint(rowsA);
  const fingerprintB = calculateSourceFingerprint(rowsB);
  assert.equal(fingerprintA, fingerprintB);
  assert.match(fingerprintA, /^[a-f0-9]{64}$/);

  const batchId = deriveBatchId(fingerprintA);
  assert.match(batchId, /^step7b3-[a-f0-9]{20}$/);

  const tagged = annotateProjectionRows([{
    fieldKey: 'employeeId',
    metadata: { projectionSource: 'OBSERVED_HEURISTIC' },
  }], {
    batchId,
    sourceFingerprint: fingerprintA,
    schemaSource: 'OBSERVED_HEURISTIC',
  });
  assert.equal(tagged[0].metadata.projectionSource, 'OBSERVED_HEURISTIC');
  assert.equal(tagged[0].metadata.backfill.batchId, batchId);
  assert.equal(tagged[0].metadata.backfill.sourceFingerprint, fingerprintA);

  console.log('Step 7B.3 backfill tool tests: PASS');
  console.log(`Deterministic batch ID: ${batchId}`);
}

run();
