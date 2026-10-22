'use strict';

require('dotenv').config();

const path = require('path');

const {
  createMigrationBackup,
  importFilesystemWorkspace,
  inspectFilesystemWorkspace,
  resolveWorkspaceRoot,
} = require('../db/filesystemWorkspaceMigration');
const { closePool } = require('../db/pool');

function parseArguments(argv) {
  const args = {
    apply: false,
    workspaceRoot: null,
    workspaceKey: process.env.DB_WORKSPACE_KEY || 'default',
    backupRoot: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];

    if (current === '--apply') {
      args.apply = true;
    } else if (current === '--dry-run') {
      args.apply = false;
    } else if (current === '--workspace-root') {
      args.workspaceRoot = argv[++index];
    } else if (current === '--workspace-key') {
      args.workspaceKey = argv[++index];
    } else if (current === '--backup-root') {
      args.backupRoot = argv[++index];
    } else if (current === '--help' || current === '-h') {
      args.help = true;
    } else {
      throw new Error(`Unknown argument '${current}'.`);
    }
  }

  return args;
}

function printHelp() {
  console.log(`
AutoFlow filesystem-to-PostgreSQL migration

Dry run (default):
  node scripts\\migrateFilesystemWorkspaceToPostgres.js --dry-run

Apply:
  node scripts\\migrateFilesystemWorkspaceToPostgres.js --apply

Optional:
  --workspace-root "D:\\path\\to\\workspace"
  --workspace-key default
  --backup-root "D:\\path\\to\\migration-backups"
`);
}

async function main() {
  const args = parseArguments(process.argv.slice(2));

  if (args.help) {
    printHelp();
    return;
  }

  const backendDir = path.resolve(__dirname, '..');
  const workspaceRoot = resolveWorkspaceRoot({
    explicitWorkspaceRoot: args.workspaceRoot,
    backendDir,
  });

  console.log('============================================================');
  console.log(' AutoFlow Filesystem → PostgreSQL Migration - Step 3');
  console.log('============================================================');
  console.log(`Mode                  : ${args.apply ? 'APPLY' : 'DRY RUN'}`);
  console.log(`Workspace root        : ${workspaceRoot}`);
  console.log(`Database workspace    : ${args.workspaceKey}`);

  const inspection = await inspectFilesystemWorkspace({ workspaceRoot });

  console.log('');
  console.log(`Folders detected      : ${Object.keys(inspection.meta.folders).length}`);
  console.log(`Workflows detected    : ${inspection.workflows.length}`);
  console.log(
    `Workflow files found  : ${
      inspection.workflows.filter((workflow) => workflow.sourcePath).length
    }`
  );
  console.log(
    `Workflow shells       : ${
      inspection.workflows.filter((workflow) => !workflow.sourcePath).length
    }`
  );

  if (inspection.warnings.length > 0) {
    console.log('');
    console.log('Warnings:');
    inspection.warnings.forEach((warning) => console.log(`  - ${warning}`));
  }

  if (inspection.errors.length > 0) {
    console.log('');
    console.log('Validation errors:');
    inspection.errors.forEach((error) => console.log(`  - ${error}`));
    throw new Error(
      `Migration validation failed with ${inspection.errors.length} error(s).`
    );
  }

  console.log('');
  console.log('Validation            : PASS');

  if (!args.apply) {
    console.log('Database writes       : NONE');
    console.log('Filesystem changes    : NONE');
    console.log('');
    console.log('RESULT                : DRY RUN PASSED');
    console.log('');
    console.log('Run with --apply only after reviewing this output.');
    return;
  }

  const backup = await createMigrationBackup({
    inspection,
    backendDir,
    backupRoot: args.backupRoot,
  });

  console.log(`Backup created        : ${backup.destinationRoot}`);

  const summary = await importFilesystemWorkspace({
    inspection,
    workspaceKey: args.workspaceKey,
    backup,
  });

  console.log('');
  console.log('Import summary');
  console.log('--------------');
  for (const [key, value] of Object.entries(summary)) {
    console.log(`${key.padEnd(23)}: ${value}`);
  }

  console.log('');
  console.log('Source files modified : NO');
  console.log('Source files deleted  : NO');
  console.log('Database transaction  : COMMITTED');
  console.log('');
  console.log('RESULT                : FILESYSTEM WORKSPACE IMPORTED');
}

main()
  .catch((error) => {
    console.error('');
    console.error('RESULT                : MIGRATION FAILED');
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
