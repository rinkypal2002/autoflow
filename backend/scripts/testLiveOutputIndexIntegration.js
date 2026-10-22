'use strict';

const assert = require('assert');

process.env.EXECUTION_OUTPUT_INDEX_WRITE_ENABLED = 'false';

const {
  buildLiveOutputProjection,
  indexLiveNodeExecution,
} = require('../db/liveOutputIndex');

function fakeClient() {
  const calls = [];
  return {
    calls,
    async query(text, params = []) {
      calls.push({ text: String(text), params });
      return { rowCount: 0, rows: [] };
    },
  };
}

async function run() {
  const disabledClient = fakeClient();
  const disabled = await indexLiveNodeExecution(disabledClient, {
    enabled: false,
    executionId: '11111111-1111-1111-1111-111111111111',
    nodeExecutionId: '22222222-2222-2222-2222-222222222222',
    nodeKey: 'read-sheet',
    nodeName: 'Read Sheet',
    output: { rows: [{ accountId: 10 }] },
  });
  assert.strictEqual(disabled.indexed, false);
  assert.strictEqual(disabledClient.calls.length, 0);

  const projection = buildLiveOutputProjection({
    nodeKey: 'rest-call',
    nodeName: 'REST Call',
    output: {
      data: { customerId: 42, accessToken: 'do-not-store' },
      statusCode: 200,
      headers: { server: 'test' },
    },
  });
  assert.strictEqual(projection.truncated, false);
  assert(projection.rows.some((row) => row.fieldKind === 'BUSINESS'));
  assert(projection.rows.some((row) => row.fieldKind === 'TECHNICAL'));
  assert(projection.rows.some((row) => row.fieldKind === 'RAW'));
  const secret = projection.rows.find((row) => row.isSecret);
  assert(secret, 'Expected a secret output-index row.');
  assert.strictEqual(secret.valuePreview, null);
  assert.strictEqual(secret.valueJson, null);
  assert.strictEqual(secret.metadata.liveIndex.phase, 'Database Phase 3 Step 7B.4');

  const enabledClient = fakeClient();
  const enabled = await indexLiveNodeExecution(enabledClient, {
    enabled: true,
    executionId: '11111111-1111-1111-1111-111111111111',
    nodeExecutionId: '22222222-2222-2222-2222-222222222222',
    nodeKey: 'rest-call',
    nodeName: 'REST Call',
    output: {
      data: { customerId: 42, accessToken: 'do-not-store' },
      statusCode: 200,
    },
  });
  assert.strictEqual(enabled.indexed, true);
  assert.strictEqual(enabled.rows, enabled.business + enabled.technical + enabled.raw);
  assert(enabledClient.calls.some((call) => call.text.includes('USING autoflow.node_execution')));
  assert(enabledClient.calls.some((call) => call.text.includes('DELETE FROM autoflow.execution_output_index WHERE node_execution_id')));
  assert.strictEqual(
    enabledClient.calls.filter((call) => call.text.includes('INSERT INTO autoflow.execution_output_index')).length,
    enabled.rows
  );

  let truncatedError = null;
  try {
    buildLiveOutputProjection({
      nodeKey: 'too-large',
      nodeName: 'Too Large',
      output: {
        first: 1,
        second: 2,
        third: 3,
        fourth: 4,
        fifth: 5,
        sixth: 6,
      },
      projectionOptions: {
        maxRows: 5,
        maxBusinessRows: 5,
      },
    });
  } catch (error) {
    truncatedError = error;
  }
  assert(truncatedError, 'Expected truncation to block live indexing.');
  assert.strictEqual(truncatedError.code, 'OUTPUT_INDEX_PROJECTION_TRUNCATED');

  console.log('Step 7B.4 live output-index integration tests: PASS');
  console.log(`Projected rows: ${projection.rows.length}`);
  console.log(`Transactional insert rows: ${enabled.rows}`);
  console.log('Disabled-path database calls: 0');
}

run().catch((error) => {
  console.error('Step 7B.4 live output-index integration tests: FAIL');
  console.error(error);
  process.exitCode = 1;
});
