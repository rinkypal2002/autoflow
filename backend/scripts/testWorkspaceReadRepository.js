'use strict';

const {
  getWorkspaceStatus,
  getWorkspaceTree,
  listFolders,
  listWorkflows,
} = require('../db/workspaceReadRepository');
const { closePool } = require('../db/pool');

function assertCondition(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function main() {
  const workspaceKey = process.env.DB_WORKSPACE_KEY || 'default';

  console.log('=======================================================');
  console.log(' AutoFlow PostgreSQL Read Repository Test - Step 2');
  console.log('=======================================================');

  const [status, folders, workflows, tree] = await Promise.all([
    getWorkspaceStatus(workspaceKey),
    listFolders(workspaceKey),
    listWorkflows(workspaceKey),
    getWorkspaceTree(workspaceKey),
  ]);

  const root = folders.find((folder) => folder.id === 'root');

  assertCondition(status.workspaceKey === workspaceKey, 'Workspace key mismatch.');
  assertCondition(status.rootCount === 1, 'Expected exactly one active root folder.');
  assertCondition(Boolean(root), "The frontend root folder 'root' is missing.");
  assertCondition(root.parentId === null, 'The root folder parentId must be null.');
  assertCondition(root.isRoot === true, 'The root folder isRoot must be true.');
  assertCondition(
    Object.prototype.hasOwnProperty.call(tree.folders, 'root'),
    "The tree response does not contain folders['root']."
  );

  console.log('');
  console.log('Repository read       : PASS');
  console.log(`Workspace key         : ${status.workspaceKey}`);
  console.log(`Workspace name        : ${status.name}`);
  console.log(`Folders               : ${folders.length}`);
  console.log(`Workflows             : ${workflows.length}`);
  console.log(`Root frontend ID      : ${root.id}`);
  console.log(`Tree folder keys      : ${Object.keys(tree.folders).length}`);
  console.log(`Tree workflow keys    : ${Object.keys(tree.workflows).length}`);
  console.log('');
  console.log('RESULT                : READ REPOSITORY VERIFIED');
}

main()
  .catch((error) => {
    console.error('');
    console.error('RESULT                : READ REPOSITORY FAILED');
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
