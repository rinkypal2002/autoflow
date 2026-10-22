'use strict';

const { query, closePool } = require('../db/pool');

function assertCondition(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function main() {
  console.log('======================================================');
  console.log(' AutoFlow PostgreSQL Connection Verification - Step 1');
  console.log('======================================================');

  const server = await query(`
    SELECT
      current_database() AS database_name,
      current_user AS database_user,
      current_schema() AS current_schema,
      inet_server_addr()::text AS server_address,
      inet_server_port() AS server_port
  `);

  const tableCount = await query(`
    SELECT count(*)::integer AS table_count
    FROM information_schema.tables
    WHERE table_schema = 'autoflow'
      AND table_type = 'BASE TABLE'
  `);

  const workspace = await query(`
    SELECT
      id,
      workspace_key,
      name,
      status,
      storage_mode,
      is_default
    FROM autoflow.workspace
    WHERE workspace_key = 'default'
      AND deleted_at IS NULL
  `);

  const rootFolder = await query(`
    SELECT
      folder.id,
      folder.folder_key,
      folder.name,
      folder.parent_id,
      folder.is_root
    FROM autoflow.workspace_folder folder
    JOIN autoflow.workspace workspace
      ON workspace.id = folder.workspace_id
    WHERE workspace.workspace_key = 'default'
      AND folder.folder_key = 'root'
      AND folder.deleted_at IS NULL
  `);

  const viewCount = await query(`
    SELECT count(*)::integer AS view_count
    FROM information_schema.views
    WHERE table_schema = 'autoflow'
  `);

  const tableCountValue = tableCount.rows[0]?.table_count ?? 0;
  const viewCountValue = viewCount.rows[0]?.view_count ?? 0;

  assertCondition(
    tableCountValue === 18,
    `Expected 18 AutoFlow tables but found ${tableCountValue}.`
  );

  assertCondition(
    workspace.rowCount === 1,
    `Expected one active default workspace but found ${workspace.rowCount}.`
  );

  assertCondition(
    rootFolder.rowCount === 1,
    `Expected one active root folder but found ${rootFolder.rowCount}.`
  );

  assertCondition(
    rootFolder.rows[0].is_root === true &&
      rootFolder.rows[0].parent_id === null,
    'The root folder exists but its root constraints are invalid.'
  );

  console.log('');
  console.log('PostgreSQL connection : PASS');
  console.log(`Database              : ${server.rows[0].database_name}`);
  console.log(`Database user         : ${server.rows[0].database_user}`);
  console.log(`AutoFlow tables       : ${tableCountValue}`);
  console.log(`AutoFlow views        : ${viewCountValue}`);
  console.log(`Workspace key         : ${workspace.rows[0].workspace_key}`);
  console.log(`Workspace name        : ${workspace.rows[0].name}`);
  console.log(`Storage mode          : ${workspace.rows[0].storage_mode}`);
  console.log(`Root frontend ID      : ${rootFolder.rows[0].folder_key}`);
  console.log(`Root folder name      : ${rootFolder.rows[0].name}`);
  console.log('');
  console.log('RESULT                : DATABASE FOUNDATION VERIFIED');
}

main()
  .catch((error) => {
    console.error('');
    console.error('RESULT                : DATABASE VERIFICATION FAILED');
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await closePool();
    } catch (error) {
      console.error('[database] Failed to close PostgreSQL pool:', error.message);
      process.exitCode = 1;
    }
  });
