'use strict';

require('dotenv').config();

const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');

function resolveWorkspaceRoot(backendDir) {
  if (process.env.WORKSPACE_ROOT) {
    return path.resolve(process.env.WORKSPACE_ROOT);
  }

  const configPath = path.join(
    backendDir,
    'server_config.json'
  );

  if (fs.existsSync(configPath)) {
    const parsed = JSON.parse(
      fs.readFileSync(configPath, 'utf8')
    );
    if (parsed.workspaceRoot) {
      return path.resolve(parsed.workspaceRoot);
    }
  }

  throw new Error(
    'Workspace root was not found in WORKSPACE_ROOT or server_config.json.'
  );
}

function validSnapshot(snapshot) {
  return (
    snapshot &&
    snapshot.version === 1 &&
    typeof snapshot.runId === 'string' &&
    typeof snapshot.workflowId === 'string' &&
    typeof snapshot.status === 'string' &&
    Array.isArray(snapshot.outputs)
  );
}

async function main() {
  const backendDir = path.resolve(__dirname, '..');
  const workspaceRoot = resolveWorkspaceRoot(backendDir);
  const runsRoot = path.join(workspaceRoot, '.runs');

  console.log('============================================================');
  console.log(' AutoFlow Filesystem Run Snapshot Inspection - Step 6A');
  console.log('============================================================');
  console.log(`Workspace root             : ${workspaceRoot}`);
  console.log(`Runs directory             : ${runsRoot}`);

  if (!fs.existsSync(runsRoot)) {
    console.log('');
    console.log('Workflow run directories   : 0');
    console.log('Snapshot files             : 0');
    console.log('Valid snapshots            : 0');
    console.log('Invalid snapshots          : 0');
    console.log('');
    console.log('RESULT                     : NO FILESYSTEM RUNS FOUND');
    return;
  }

  const workflowDirs = (
    await fsp.readdir(runsRoot, {
      withFileTypes: true,
    })
  ).filter((entry) => entry.isDirectory());

  let files = 0;
  let valid = 0;
  let invalid = 0;
  let totalBytes = 0;
  const statuses = {};

  for (const workflowDir of workflowDirs) {
    const directory = path.join(
      runsRoot,
      workflowDir.name
    );

    const entries = (
      await fsp.readdir(directory, {
        withFileTypes: true,
      })
    ).filter(
      (entry) =>
        entry.isFile() &&
        entry.name.endsWith('.json')
    );

    for (const entry of entries) {
      files += 1;
      const filePath = path.join(directory, entry.name);

      try {
        const raw = await fsp.readFile(filePath, 'utf8');
        totalBytes += Buffer.byteLength(raw, 'utf8');
        const snapshot = JSON.parse(raw);

        if (!validSnapshot(snapshot)) {
          invalid += 1;
          continue;
        }

        valid += 1;
        const status = String(snapshot.status || 'unknown');
        statuses[status] = (statuses[status] || 0) + 1;
      } catch {
        invalid += 1;
      }
    }
  }

  console.log('');
  console.log(
    `Workflow run directories   : ${workflowDirs.length}`
  );
  console.log(`Snapshot files             : ${files}`);
  console.log(`Valid snapshots            : ${valid}`);
  console.log(`Invalid snapshots          : ${invalid}`);
  console.log(
    `Total snapshot size        : ${(totalBytes / 1024 / 1024).toFixed(2)} MB`
  );
  console.log(
    `Statuses                   : ${JSON.stringify(statuses)}`
  );
  console.log('');
  console.log(
    invalid === 0
      ? 'RESULT                     : FILESYSTEM RUN INSPECTION PASSED'
      : 'RESULT                     : FILESYSTEM RUN INSPECTION FOUND ERRORS'
  );

  if (invalid > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error('');
  console.error('RESULT                     : RUN INSPECTION FAILED');
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
