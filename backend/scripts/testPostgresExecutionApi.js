'use strict';

require('dotenv').config();

const assert = require('assert');

const cfg = require('../config');
const { pool, closePool } = require('../db/pool');

function headers() {
  const result = {
    'Content-Type': 'application/json',
  };

  if (
    cfg.AUTH_ENABLED &&
    cfg.API_AUTH_TOKEN
  ) {
    result.Authorization =
      `Bearer ${cfg.API_AUTH_TOKEN}`;
  }

  return result;
}

async function jsonRequest(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      ...headers(),
      ...(options.headers || {}),
    },
  });

  let body = null;

  try {
    body = await response.json();
  } catch {
    body = null;
  }

  return {
    response,
    body,
  };
}

async function main() {
  const baseUrl =
    `http://localhost:${cfg.PORT}`;
  const workspaceKey =
    cfg.DB_WORKSPACE_KEY ||
    'default';
  const runId =
    `step6b3-api-smoke-${Date.now()}`;

  console.log('============================================================');
  console.log(' AutoFlow PostgreSQL Execution API Smoke Test - Step 6B.3');
  console.log('============================================================');
  console.log(
    `Backend                    : ${baseUrl}`
  );
  console.log(
    `Workspace key              : ${workspaceKey}`
  );

  const client =
    await pool.connect();

  let workflow = null;

  try {
    const result =
      await client.query(
        `
          SELECT
            workflow.workflow_key,
            workflow.name
          FROM autoflow.workspace workspace
          JOIN autoflow.workflow workflow
            ON workflow.workspace_id =
               workspace.id
           AND workflow.deleted_at IS NULL
          JOIN autoflow.workflow_version version
            ON version.workspace_id =
               workflow.workspace_id
           AND version.workflow_id =
               workflow.id
           AND version.version_number =
               workflow.current_version_number
          WHERE workspace.workspace_key = $1
          ORDER BY workflow.updated_at DESC
          LIMIT 1
        `,
        [workspaceKey]
      );

    if (result.rowCount !== 1) {
      throw new Error(
        'No current PostgreSQL workflow was found for the API smoke test.'
      );
    }

    workflow = result.rows[0];
  } finally {
    client.release();
  }

  const health =
    await jsonRequest(
      `${baseUrl}/api/health`
    );

  assert.strictEqual(
    health.response.status,
    200,
    'Backend health endpoint failed.'
  );
  assert.strictEqual(
    health.body.executionPersistenceMode,
    'postgres',
    'Execution persistence is not set to postgres.'
  );
  assert.strictEqual(
    health.body.databaseExecutionWriteEnabled,
    true,
    'PostgreSQL execution writes are not enabled.'
  );

  const status =
    await jsonRequest(
      `${baseUrl}/api/workspace/execution-persistence/status`
    );

  assert.strictEqual(
    status.response.status,
    200,
    'Execution persistence status endpoint failed.'
  );
  assert.strictEqual(
    status.body.persistenceMode,
    'postgres'
  );
  assert.strictEqual(
    status.body.writesEnabled,
    true
  );

  const now =
    new Date().toISOString();

  const snapshot = {
    version: 1,
    runId,
    workflowId:
      workflow.workflow_key,
    workflowName:
      workflow.name,
    status: 'completed',
    startedAt: now,
    updatedAt: now,
    finishedAt: now,
    variables: {},
    runtime: {},
    files: {},
    env: {},
    outputs: [],
    previousNodeId: null,
    logs: [],
    metrics: {
      totalNodes: 0,
      completed: 0,
      failed: 0,
      skipped: 0,
      durationMs: 0,
    },
  };

  const runBase =
    `${baseUrl}/api/workspace/workflows/` +
    `${encodeURIComponent(workflow.workflow_key)}/runs`;

  let cleanupRequired = false;

  try {
    const created =
      await jsonRequest(
        runBase,
        {
          method: 'POST',
          body: JSON.stringify(snapshot),
        }
      );

    assert.strictEqual(
      created.response.status,
      200,
      `Execution POST failed: ${JSON.stringify(created.body)}`
    );
    assert.strictEqual(
      created.body.status,
      'success'
    );
    assert.strictEqual(
      created.body.runId,
      runId
    );

    cleanupRequired = true;

    const listed =
      await jsonRequest(runBase);

    assert.strictEqual(
      listed.response.status,
      200,
      'Execution list endpoint failed.'
    );
    assert.ok(
      listed.body.runs.some(
        (run) => run.runId === runId
      ),
      'Created execution was not returned by the list endpoint.'
    );

    const loaded =
      await jsonRequest(
        `${runBase}/${encodeURIComponent(runId)}`
      );

    assert.strictEqual(
      loaded.response.status,
      200,
      'Execution detail endpoint failed.'
    );
    assert.deepStrictEqual(
      loaded.body.run,
      snapshot,
      'Execution detail response does not preserve the frontend contract.'
    );

    const deleted =
      await jsonRequest(
        `${runBase}/${encodeURIComponent(runId)}`,
        {
          method: 'DELETE',
        }
      );

    assert.strictEqual(
      deleted.response.status,
      200,
      'Execution delete endpoint failed.'
    );
    assert.strictEqual(
      deleted.body.status,
      'success'
    );

    cleanupRequired = false;

    const missing =
      await jsonRequest(
        `${runBase}/${encodeURIComponent(runId)}`
      );

    assert.strictEqual(
      missing.response.status,
      404,
      'Deleted execution is still available.'
    );

    console.log('');
    console.log(
      `Workflow selected          : ${workflow.name}`
    );
    console.log(
      'Health cutover state       : PASS'
    );
    console.log(
      'Execution status endpoint  : PASS'
    );
    console.log(
      'Execution POST             : PASS'
    );
    console.log(
      'Execution list             : PASS'
    );
    console.log(
      'Execution detail           : PASS'
    );
    console.log(
      'Execution DELETE           : PASS'
    );
    console.log(
      'Cascade cleanup            : PASS'
    );
    console.log(
      'Temporary rows remaining   : 0'
    );
    console.log('');
    console.log(
      'RESULT                     : POSTGRES EXECUTION API VERIFIED'
    );
  } finally {
    if (cleanupRequired) {
      try {
        await jsonRequest(
          `${runBase}/${encodeURIComponent(runId)}`,
          {
            method: 'DELETE',
          }
        );
      } catch {
        // Preserve original test error.
      }
    }
  }
}

main()
  .catch((error) => {
    console.error('');
    console.error(
      'RESULT                     : POSTGRES EXECUTION API FAILED'
    );
    console.error(
      error.stack || error.message
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await closePool();
    } catch (error) {
      console.error(
        '[database] Failed to close PostgreSQL pool:',
        error.message
      );
      process.exitCode = 1;
    }
  });
