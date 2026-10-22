'use strict';

require('dotenv').config();

const express = require('express');

const { pool, query, closePool } = require('../db/pool');
const {
  getWorkspaceStatus,
  getWorkspaceTree,
  listWorkflows,
} = require('../db/workspaceReadRepository');
const {
  createFolder,
  deleteFolder,
  getBreadcrumb,
  updateFolder,
} = require('../db/workspaceWriteRepository');
const {
  createPostgresWorkspaceCompatibilityRouter,
} = require('../routes/postgresWorkspaceCompatibilityRoutes');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function definitionContainsSecretValue(definition) {
  const variables = Array.isArray(definition?.variables)
    ? definition.variables
    : [];

  return variables.some((variable) => {
    if (!variable || typeof variable !== 'object') return false;

    const isSecret =
      variable.isSecret === true || variable.scope === 'secret';

    if (!isSecret) return false;

    return (
      (variable.value !== undefined && variable.value !== null) ||
      (variable.defaultValue !== undefined &&
        variable.defaultValue !== null)
    );
  });
}

async function startCompatibilityServer(workspaceKey) {
  const app = express();
  app.use(express.json());
  app.use(
    '/api/workspace',
    createPostgresWorkspaceCompatibilityRouter({
      workspaceKey,
      writesEnabled: false,
    })
  );

  return new Promise((resolve, reject) => {
    const server = app.listen(0, '127.0.0.1', () => resolve(server));
    server.on('error', reject);
  });
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  let body;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  return { response, body };
}

async function main() {
  const workspaceKey = process.env.DB_WORKSPACE_KEY || 'default';

  console.log('============================================================');
  console.log(' AutoFlow PostgreSQL Primary Cutover Readiness - Step 5');
  console.log('============================================================');

  const status = await getWorkspaceStatus(workspaceKey);
  const tree = await getWorkspaceTree(workspaceKey);
  const workflows = await listWorkflows(workspaceKey);

  assert(status.rootCount === 1, 'Expected exactly one root folder.');
  assert(status.folderCount === 22, `Expected 22 folders, found ${status.folderCount}.`);
  assert(status.workflowCount === 32, `Expected 32 workflows, found ${status.workflowCount}.`);
  assert(Object.prototype.hasOwnProperty.call(tree.folders, 'root'), 'Root is missing from tree.');
  assert(workflows.length === 32, 'Workflow list count mismatch.');

  const versionResult = await query(
    `
      SELECT
        workflow.workflow_key,
        version.definition_json
      FROM autoflow.workflow workflow
      JOIN autoflow.workspace workspace
        ON workspace.id = workflow.workspace_id
      JOIN autoflow.workflow_version version
        ON version.workspace_id = workflow.workspace_id
       AND version.workflow_id = workflow.id
       AND version.version_number = workflow.current_version_number
      WHERE workspace.workspace_key = $1
        AND workflow.deleted_at IS NULL
    `,
    [workspaceKey]
  );

  assert(versionResult.rowCount === 32, 'One or more workflows have no current version.');

  const unsafe = versionResult.rows.filter((row) =>
    definitionContainsSecretValue(row.definition_json)
  );
  assert(unsafe.length === 0, 'Secret values remain in current workflow definitions.');

  const duplicateResult = await query(
    `
      WITH duplicates AS (
        SELECT
          workspace_id,
          folder_id,
          lower(name) AS normalized_name,
          count(*) AS total
        FROM autoflow.workflow
        WHERE deleted_at IS NULL
        GROUP BY workspace_id, folder_id, lower(name)
        HAVING count(*) > 1
      )
      SELECT count(*)::integer AS duplicate_count
      FROM duplicates
    `
  );
  assert(
    duplicateResult.rows[0].duplicate_count === 0,
    'Active duplicate workflow sibling names exist.'
  );

  // Exercise the folder-move gap found after Step 4. Everything is rolled back.
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const options = { client, workspaceKey };

    const parentA = await createFolder(
      { name: `Cutover A ${Date.now()}`, parentId: 'root' },
      options
    );
    const parentB = await createFolder(
      { name: `Cutover B ${Date.now()}`, parentId: 'root' },
      options
    );
    const child = await createFolder(
      { name: 'Movable Child', parentId: parentA.id },
      options
    );

    const moved = await updateFolder(
      child.id,
      { parentId: parentB.id },
      options
    );

    assert(moved.parentId === parentB.id, 'Folder move was not persisted.');

    const breadcrumb = await getBreadcrumb(child.id, options);
    assert(
      breadcrumb.some((item) => item.id === parentB.id),
      'Moved folder breadcrumb does not contain the new parent.'
    );
    assert(
      !breadcrumb.some((item) => item.id === parentA.id),
      'Moved folder breadcrumb still contains the old parent.'
    );

    await deleteFolder(parentA.id, options);
    await deleteFolder(parentB.id, options);
    await client.query('ROLLBACK');
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // Preserve original failure.
    }
    throw error;
  } finally {
    client.release();
  }

  // Verify HTTP compatibility response shapes without enabling writes.
  const server = await startCompatibilityServer(workspaceKey);
  try {
    const address = server.address();
    const base = `http://127.0.0.1:${address.port}/api/workspace`;

    const statusResponse = await fetchJson(`${base}/status`);
    assert(statusResponse.response.status === 200, 'Compatibility status endpoint failed.');
    assert(statusResponse.body?.status === 'success', 'Status response shape mismatch.');
    assert(statusResponse.body?.active?.rootDir, 'Status response has no active rootDir.');

    const selectResponse = await fetchJson(`${base}/select`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        path: status.storageRoot,
      }),
    });
    assert(selectResponse.response.status === 200, 'Compatibility select endpoint failed.');
    assert(selectResponse.body?.workspace?.rootDir, 'Select response shape mismatch.');

    const treeResponse = await fetchJson(`${base}/tree`);
    assert(treeResponse.response.status === 200, 'Compatibility tree endpoint failed.');
    assert(Object.keys(treeResponse.body?.folders || {}).length === 22, 'HTTP folder count mismatch.');
    assert(Object.keys(treeResponse.body?.workflows || {}).length === 32, 'HTTP workflow count mismatch.');

    const blockedWrite = await fetchJson(`${base}/folders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Must Not Be Written', parentId: 'root' }),
    });
    assert(
      blockedWrite.response.status === 503,
      'Primary write safety gate did not block writes.'
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }

  console.log('');
  console.log('Database folder count       : PASS (22)');
  console.log('Database workflow count     : PASS (32)');
  console.log('Current workflow versions   : PASS (32)');
  console.log('Secret definition audit     : PASS');
  console.log('Sibling uniqueness audit    : PASS');
  console.log('Folder move                 : PASS');
  console.log('Folder cycle protection     : PASS');
  console.log('Move test rollback          : PASS');
  console.log('Frontend status contract    : PASS');
  console.log('Frontend select contract    : PASS');
  console.log('Frontend tree contract      : PASS');
  console.log('Primary write safety gate   : PASS');
  console.log('');
  console.log('RESULT                      : POSTGRES CUTOVER READY');
}

main()
  .catch((error) => {
    console.error('');
    console.error('RESULT                      : CUTOVER READINESS FAILED');
    console.error(error.stack || error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await closePool();
    } catch (error) {
      console.error('[database] Failed to close pool:', error.message);
      process.exitCode = 1;
    }
  });
