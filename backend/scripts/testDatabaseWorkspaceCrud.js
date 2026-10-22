'use strict';

require('dotenv').config();

const { pool, closePool } = require('../db/pool');
const {
  checkDuplicate,
  createFolder,
  createWorkflow,
  deleteFolder,
  deleteWorkflow,
  getBreadcrumb,
  getWorkflow,
  listChildren,
  renameFolder,
  renameWorkflow,
  updateWorkflow,
} = require('../db/workspaceWriteRepository');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function activeCounts(client) {
  const result = await client.query(`
    SELECT
      (
        SELECT count(*)::integer
        FROM autoflow.workspace_folder
        WHERE deleted_at IS NULL
      ) AS folders,
      (
        SELECT count(*)::integer
        FROM autoflow.workflow
        WHERE deleted_at IS NULL
      ) AS workflows,
      (
        SELECT count(*)::integer
        FROM autoflow.workflow_version
      ) AS versions
  `);
  return result.rows[0];
}

async function main() {
  const client = await pool.connect();
  const suffix = Date.now().toString(36);
  const workspaceKey = process.env.DB_WORKSPACE_KEY || 'default';

  console.log('============================================================');
  console.log(' AutoFlow PostgreSQL Shadow CRUD Verification - Step 4');
  console.log('============================================================');

  const before = await activeCounts(client);

  try {
    await client.query('BEGIN');

    const options = { client, workspaceKey };

    const parent = await createFolder(
      {
        name: `DB CRUD Test ${suffix}`,
        parentId: 'root',
      },
      options
    );

    const child = await createFolder(
      {
        name: 'Child',
        parentId: parent.id,
      },
      options
    );

    const workflow = await createWorkflow(
      {
        name: `Temporary Workflow ${suffix}`,
        parentId: parent.id,
        description: 'Temporary PostgreSQL CRUD verification workflow.',
      },
      options
    );

    assert(workflow.version === 1, 'New workflow version must be 1.');

    const updated = await updateWorkflow(
      workflow.id,
      {
        parentId: child.id,
        status: 'active',
        actions: [
          {
            id: 'node-start',
            type: 'manual-trigger',
            name: 'Start',
            x: 0,
            y: 0,
            properties: {},
          },
          {
            id: 'node-transform',
            type: 'data-transform',
            name: 'Transform',
            x: 260,
            y: 0,
            properties: {
              expression: 'value',
            },
          },
        ],
        connections: [
          {
            id: 'edge-start-transform',
            sourceId: 'node-start',
            targetId: 'node-transform',
            type: 'success',
          },
        ],
        variables: [
          {
            id: 'normal-variable',
            name: 'NORMAL_VALUE',
            type: 'string',
            scope: 'global',
            value: 'visible',
          },
          {
            id: 'secret-variable',
            name: 'PASSWORD',
            type: 'string',
            scope: 'secret',
            isSecret: true,
            value: 'must-not-survive',
          },
        ],
      },
      options
    );

    assert(updated.version === 2, 'Updated workflow version must be 2.');
    assert(updated.parentId === child.id, 'Workflow move was not persisted.');
    assert(updated.actions.length === 2, 'Workflow nodes were not persisted.');
    assert(
      updated.connections.length === 1,
      'Workflow connection was not persisted.'
    );
    assert(
      updated.variables[1].value === null,
      'Secret variable value was not redacted.'
    );

    const renamed = await renameWorkflow(
      workflow.id,
      {
        name: `Renamed Workflow ${suffix}`,
      },
      options
    );

    assert(renamed.version === 3, 'Rename must create version 3.');

    const loaded = await getWorkflow(workflow.id, options);
    assert(loaded.name === renamed.name, 'Renamed workflow was not readable.');
    assert(loaded.actions.length === 2, 'Loaded definition lost nodes.');

    const duplicate = await checkDuplicate(
      {
        name: renamed.name,
        parentId: child.id,
        type: 'workflow',
      },
      options
    );
    assert(duplicate === true, 'Duplicate-name detection failed.');

    const children = await listChildren(child.id, options);
    assert(
      children.workflows.some((item) => item.id === workflow.id),
      'Child workflow listing failed.'
    );

    const breadcrumb = await getBreadcrumb(workflow.id, options);
    assert(
      breadcrumb[0]?.id === 'root',
      'Breadcrumb must begin with root.'
    );
    assert(
      breadcrumb.at(-1)?.id === workflow.id,
      'Breadcrumb must end with workflow.'
    );

    const renamedFolder = await renameFolder(
      child.id,
      { name: 'Renamed Child' },
      options
    );
    assert(
      renamedFolder.name === 'Renamed Child',
      'Folder rename failed.'
    );

    await deleteWorkflow(workflow.id, options);
    await deleteFolder(parent.id, options);

    const hiddenWorkflow = await client.query(
      `
        SELECT count(*)::integer AS count
        FROM autoflow.workflow
        WHERE workflow_key = $1
          AND deleted_at IS NULL
      `,
      [workflow.id]
    );
    assert(
      hiddenWorkflow.rows[0].count === 0,
      'Deleted workflow remains active.'
    );

    await client.query('ROLLBACK');

    const after = await activeCounts(client);

    assert(
      before.folders === after.folders &&
        before.workflows === after.workflows &&
        before.versions === after.versions,
      'Rollback did not restore original database counts.'
    );

    console.log('');
    console.log('Folder create         : PASS');
    console.log('Folder rename         : PASS');
    console.log('Folder recursive delete: PASS');
    console.log('Workflow create       : PASS');
    console.log('Workflow update       : PASS');
    console.log('Workflow move         : PASS');
    console.log('Immutable versioning  : PASS');
    console.log('Node persistence      : PASS');
    console.log('Connection persistence: PASS');
    console.log('Variable persistence  : PASS');
    console.log('Secret redaction      : PASS');
    console.log('Duplicate validation  : PASS');
    console.log('Breadcrumb read       : PASS');
    console.log('Test transaction rollback: PASS');
    console.log('');
    console.log('RESULT                : SHADOW CRUD VERIFIED');
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
    console.error('RESULT                : SHADOW CRUD FAILED');
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
