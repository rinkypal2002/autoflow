'use strict';

require('dotenv').config();

const { pool, closePool } = require('../db/pool');
const {
  deleteExecutionSnapshot,
  getExecutionSnapshot,
  upsertExecutionSnapshot,
} = require('../db/executionRepository');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function counts(client) {
  const result = await client.query(`
    SELECT
      (
        SELECT count(*)::integer
        FROM autoflow.workflow_execution
      ) AS executions,
      (
        SELECT count(*)::integer
        FROM autoflow.node_execution
      ) AS nodes,
      (
        SELECT count(*)::integer
        FROM autoflow.execution_log
      ) AS logs
  `);
  return result.rows[0];
}

async function chooseWorkflow(client, workspaceKey) {
  const result = await client.query(
    `
      SELECT
        workflow.workflow_key,
        workflow.name,
        version.id AS version_id
      FROM autoflow.workspace workspace
      JOIN autoflow.workflow workflow
        ON workflow.workspace_id = workspace.id
       AND workflow.deleted_at IS NULL
      JOIN autoflow.workflow_version version
        ON version.workspace_id = workflow.workspace_id
       AND version.workflow_id = workflow.id
       AND version.version_number =
           workflow.current_version_number
      WHERE workspace.workspace_key = $1
        AND (
          SELECT count(*)
          FROM autoflow.workflow_node node
          WHERE node.workspace_id = workflow.workspace_id
            AND node.workflow_id = workflow.id
            AND node.workflow_version_id = version.id
        ) >= 2
      ORDER BY workflow.updated_at DESC
      LIMIT 1
    `,
    [workspaceKey]
  );

  if (result.rowCount !== 1) {
    throw new Error(
      'No migrated workflow with at least two nodes was found.'
    );
  }

  const workflow = result.rows[0];

  const nodes = await client.query(
    `
      SELECT
        node_key,
        name,
        node_type,
        category
      FROM autoflow.workflow_node
      WHERE workflow_version_id = $1
      ORDER BY sequence_hint, created_at
      LIMIT 2
    `,
    [workflow.version_id]
  );

  return {
    ...workflow,
    nodes: nodes.rows,
  };
}

async function main() {
  const client = await pool.connect();
  const workspaceKey =
    process.env.DB_WORKSPACE_KEY || 'default';
  const runId = `step6a-${Date.now()}`;

  console.log('============================================================');
  console.log(' AutoFlow PostgreSQL Execution Repository - Step 6A');
  console.log('============================================================');

  const before = await counts(client);

  try {
    await client.query('BEGIN');

    const workflow = await chooseWorkflow(
      client,
      workspaceKey
    );
    const first = workflow.nodes[0];
    const second = workflow.nodes[1];
    const startedAt = new Date().toISOString();

    const firstSnapshot = {
      version: 1,
      runId,
      workflowId: workflow.workflow_key,
      workflowName: workflow.name,
      status: 'running',
      startedAt,
      updatedAt: new Date().toISOString(),
      variables: {
        BUSINESS_ID: 'A-100',
        PASSWORD: 'must-not-survive',
      },
      runtime: {
        browserSession: 'step6-test',
      },
      files: {},
      env: {
        ACCESS_TOKEN: 'must-not-survive',
      },
      outputs: [
        {
          nodeId: first.node_key,
          nodeName: first.name,
          stepKey: 'FirstStep',
          type: first.node_type,
          category: first.category,
          sequence: 1,
          status: 'success',
          bucket: 'generic',
          attempt: 1,
          startedAt,
          finishedAt: new Date().toISOString(),
          durationMs: 12,
          input: {
            requestId: 'request-1',
          },
          output: {
            customerId: 42,
            customerName: 'Ada',
            accessToken: 'must-not-survive',
          },
          branches: [],
        },
      ],
      previousNodeId: first.node_key,
      logs: [
        {
          id: 'log-first',
          timestamp: new Date().toISOString(),
          level: 'success',
          message: 'First node completed',
          actionId: first.node_key,
          data: {
            password: 'must-not-survive',
          },
          statusSnapshot: 'success',
        },
      ],
      metrics: {
        totalNodes: 1,
        completed: 1,
        failed: 0,
        skipped: 0,
        durationMs: 12,
      },
    };

    const firstResult = await upsertExecutionSnapshot(
      workflow.workflow_key,
      firstSnapshot,
      {
        client,
        workspaceKey,
        retentionDays: 30,
      }
    );

    assert(
      firstResult.nodeCount === 1,
      'First snapshot should contain one node.'
    );

    const finalSnapshot = {
      ...firstSnapshot,
      status: 'success',
      updatedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      outputs: [
        ...firstSnapshot.outputs,
        {
          nodeId: second.node_key,
          nodeName: second.name,
          stepKey: 'SecondStep',
          type: second.node_type,
          category: second.category,
          sequence: 2,
          status: 'success',
          bucket: 'computed',
          attempt: 1,
          startedAt: new Date().toISOString(),
          finishedAt: new Date().toISOString(),
          durationMs: 8,
          input: {
            customerId: 42,
          },
          output: {
            approved: true,
            reference: 'APR-42',
          },
          branches: [],
        },
      ],
      previousNodeId: second.node_key,
      logs: [
        ...firstSnapshot.logs,
        {
          id: 'log-second',
          timestamp: new Date().toISOString(),
          level: 'success',
          message: 'Second node completed',
          actionId: second.node_key,
          statusSnapshot: 'success',
        },
      ],
      metrics: {
        totalNodes: 2,
        completed: 2,
        failed: 0,
        skipped: 0,
        durationMs: 20,
      },
    };

    const finalResult = await upsertExecutionSnapshot(
      workflow.workflow_key,
      finalSnapshot,
      {
        client,
        workspaceKey,
        retentionDays: 30,
      }
    );

    assert(
      firstResult.executionId === finalResult.executionId,
      'Snapshot upsert created a duplicate execution.'
    );

    const executionRows = await client.query(
      `
        SELECT
          status,
          full_snapshot_json,
          variables_json,
          environment_json
        FROM autoflow.workflow_execution
        WHERE id = $1
      `,
      [finalResult.executionId]
    );

    assert(
      executionRows.rowCount === 1,
      'Workflow execution row was not persisted.'
    );
    assert(
      executionRows.rows[0].status === 'success',
      'Final execution status was not updated.'
    );
    assert(
      executionRows.rows[0].variables_json.PASSWORD ===
        '••••••••',
      'Secret workflow variable was not redacted.'
    );
    assert(
      executionRows.rows[0].environment_json.ACCESS_TOKEN ===
        '••••••••',
      'Secret environment value was not redacted.'
    );

    const nodeRows = await client.query(
      `
        SELECT
          node_key,
          sequence_number,
          status,
          business_output_json,
          flattened_output_json
        FROM autoflow.node_execution
        WHERE execution_id = $1
          AND is_final_attempt = true
        ORDER BY sequence_number
      `,
      [finalResult.executionId]
    );

    assert(
      nodeRows.rowCount === 2,
      `Expected two node executions, found ${nodeRows.rowCount}.`
    );
    assert(
      nodeRows.rows[0].business_output_json.accessToken ===
        '••••••••',
      'Secret node output was not redacted.'
    );
    assert(
      nodeRows.rows[1].flattened_output_json.reference ===
        'APR-42',
      'Flattened output was not persisted.'
    );

    const logRows = await client.query(
      `
        SELECT count(*)::integer AS count
        FROM autoflow.execution_log
        WHERE execution_id = $1
      `,
      [finalResult.executionId]
    );

    assert(
      logRows.rows[0].count === 2,
      'Execution logs were not upserted.'
    );

    const loaded = await getExecutionSnapshot(
      workflow.workflow_key,
      runId,
      {
        client,
        workspaceKey,
      }
    );

    assert(
      loaded?.runId === runId,
      'Repository snapshot read failed.'
    );

    const storedSnapshot = executionRows.rows[0].full_snapshot_json;

    assert(
      storedSnapshot.runId === runId,
      'Stored snapshot runId mismatch.'
    );
    assert(
      storedSnapshot.outputs.length === 2,
      'Stored snapshot lost node outputs.'
    );
    assert(
      storedSnapshot.variables.PASSWORD === '••••••••',
      'Full snapshot retained a secret variable.'
    );

    const deleted = await deleteExecutionSnapshot(
      workflow.workflow_key,
      runId,
      {
        client,
        workspaceKey,
      }
    );

    assert(deleted === true, 'Temporary execution was not deleted.');

    const cascadeCheck = await client.query(
      `
        SELECT
          (
            SELECT count(*)::integer
            FROM autoflow.node_execution
            WHERE execution_id = $1
          ) AS nodes,
          (
            SELECT count(*)::integer
            FROM autoflow.execution_log
            WHERE execution_id = $1
          ) AS logs
      `,
      [finalResult.executionId]
    );

    assert(
      cascadeCheck.rows[0].nodes === 0 &&
        cascadeCheck.rows[0].logs === 0,
      'Execution cascade delete failed.'
    );

    await client.query('ROLLBACK');

    const after = await counts(client);

    assert(
      before.executions === after.executions &&
        before.nodes === after.nodes &&
        before.logs === after.logs,
      'Test rollback did not restore the original counts.'
    );

    console.log('');
    console.log(`Workflow selected          : ${workflow.name}`);
    console.log('Execution create           : PASS');
    console.log('Execution snapshot upsert  : PASS');
    console.log('Execution snapshot read    : PASS');
    console.log('Workflow version mapping   : PASS');
    console.log('Node execution mapping     : PASS');
    console.log('Final-attempt handling     : PASS');
    console.log('Execution log mapping      : PASS');
    console.log('Flattened output storage   : PASS');
    console.log('Secret variable redaction  : PASS');
    console.log('Secret environment redaction: PASS');
    console.log('Secret output redaction    : PASS');
    console.log('Cascade delete             : PASS');
    console.log('Test transaction rollback  : PASS');
    console.log('');
    console.log('RESULT                     : EXECUTION FOUNDATION VERIFIED');
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // Preserve the original error.
    }
    throw error;
  } finally {
    client.release();
  }
}

main()
  .catch((error) => {
    console.error('');
    console.error('RESULT                     : EXECUTION FOUNDATION FAILED');
    console.error(error.stack || error.message);
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
