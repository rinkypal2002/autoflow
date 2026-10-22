'use strict';

require('dotenv').config();

const path = require('path');

const {
  compareFilesystemAndDatabase,
  inspectFilesystemWorkspace,
  resolveWorkspaceRoot,
} = require('../db/filesystemWorkspaceMigration');
const { closePool } = require('../db/pool');

function readOption(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

async function main() {
  const backendDir = path.resolve(__dirname, '..');
  const workspaceRoot = resolveWorkspaceRoot({
    explicitWorkspaceRoot: readOption('--workspace-root'),
    backendDir,
  });
  const workspaceKey =
    readOption('--workspace-key') ||
    process.env.DB_WORKSPACE_KEY ||
    'default';

  console.log('============================================================');
  console.log(' AutoFlow Filesystem ↔ PostgreSQL Parity Check - Step 3');
  console.log('============================================================');
  console.log(`Workspace root        : ${workspaceRoot}`);
  console.log(`Database workspace    : ${workspaceKey}`);

  const inspection = await inspectFilesystemWorkspace({ workspaceRoot });

  if (inspection.errors.length > 0) {
    throw new Error(
      `Filesystem validation failed: ${inspection.errors.join(' | ')}`
    );
  }

  const comparison = await compareFilesystemAndDatabase({
    inspection,
    workspaceKey,
  });

  console.log('');
  console.log(`Filesystem folders    : ${comparison.filesystemFolderCount}`);
  console.log(`Database folders      : ${comparison.databaseFolderCount}`);
  console.log(`Filesystem workflows  : ${comparison.filesystemWorkflowCount}`);
  console.log(`Database workflows    : ${comparison.databaseWorkflowCount}`);

  if (!comparison.match) {
    console.log('');
    console.log('Mismatches:');
    comparison.mismatches.forEach((item) => console.log(`  - ${item}`));
    throw new Error(
      `Parity check failed with ${comparison.mismatches.length} mismatch(es).`
    );
  }

  console.log('');
  console.log('Folder parity         : PASS');
  console.log('Workflow parity       : PASS');
  console.log('Definition parity     : PASS');
  console.log('');
  console.log('RESULT                : FILESYSTEM AND DATABASE MATCH');
}

main()
  .catch((error) => {
    console.error('');
    console.error('RESULT                : PARITY CHECK FAILED');
    console.error(error.stack || error.message);
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
