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

function validateSnapshot(snapshot, workflowDirectoryName) {
  const reasons = [];

  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    reasons.push('Snapshot root must be a JSON object.');
    return reasons;
  }

  if (snapshot.version !== 1) {
    reasons.push(
      `Expected version=1, found ${JSON.stringify(snapshot.version)}.`
    );
  }

  if (
    typeof snapshot.runId !== 'string' ||
    !snapshot.runId.trim()
  ) {
    reasons.push('runId must be a non-empty string.');
  }

  if (
    typeof snapshot.workflowId !== 'string' ||
    !snapshot.workflowId.trim()
  ) {
    reasons.push('workflowId must be a non-empty string.');
  }

  if (
    typeof snapshot.workflowId === 'string' &&
    snapshot.workflowId.trim() &&
    workflowDirectoryName &&
    snapshot.workflowId !== workflowDirectoryName
  ) {
    reasons.push(
      `workflowId '${snapshot.workflowId}' does not match directory '${workflowDirectoryName}'.`
    );
  }

  if (
    typeof snapshot.status !== 'string' ||
    !snapshot.status.trim()
  ) {
    reasons.push('status must be a non-empty string.');
  }

  if (!Array.isArray(snapshot.outputs)) {
    reasons.push('outputs must be an array.');
  }

  if (
    snapshot.logs !== undefined &&
    !Array.isArray(snapshot.logs)
  ) {
    reasons.push('logs must be an array when present.');
  }

  if (
    snapshot.variables !== undefined &&
    (
      !snapshot.variables ||
      typeof snapshot.variables !== 'object' ||
      Array.isArray(snapshot.variables)
    )
  ) {
    reasons.push('variables must be an object when present.');
  }

  if (
    snapshot.metrics !== undefined &&
    (
      !snapshot.metrics ||
      typeof snapshot.metrics !== 'object' ||
      Array.isArray(snapshot.metrics)
    )
  ) {
    reasons.push('metrics must be an object when present.');
  }

  return reasons;
}

function safeTimestamp() {
  return new Date()
    .toISOString()
    .replace(/[:.]/g, '-');
}

async function main() {
  const backendDir = path.resolve(__dirname, '..');
  const workspaceRoot = resolveWorkspaceRoot(backendDir);
  const runsRoot = path.join(workspaceRoot, '.runs');

  console.log('============================================================');
  console.log(' AutoFlow Detailed Filesystem Run Inspection - Step 6A Fix');
  console.log('============================================================');
  console.log(`Workspace root             : ${workspaceRoot}`);
  console.log(`Runs directory             : ${runsRoot}`);

  if (!fs.existsSync(runsRoot)) {
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
  const invalidFiles = [];

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
        entry.name.toLowerCase().endsWith('.json')
    );

    for (const entry of entries) {
      files += 1;

      const filePath = path.join(directory, entry.name);
      const relativePath = path.relative(runsRoot, filePath);

      let raw;

      try {
        raw = await fsp.readFile(filePath, 'utf8');
        totalBytes += Buffer.byteLength(raw, 'utf8');
      } catch (error) {
        invalid += 1;
        invalidFiles.push({
          relativePath,
          absolutePath: filePath,
          workflowDirectory: workflowDir.name,
          fileName: entry.name,
          category: 'READ_ERROR',
          reasons: [error.message],
        });
        continue;
      }

      let snapshot;

      try {
        snapshot = JSON.parse(raw);
      } catch (error) {
        invalid += 1;
        invalidFiles.push({
          relativePath,
          absolutePath: filePath,
          workflowDirectory: workflowDir.name,
          fileName: entry.name,
          category: 'INVALID_JSON',
          reasons: [error.message],
        });
        continue;
      }

      const reasons = validateSnapshot(
        snapshot,
        workflowDir.name
      );

      if (reasons.length > 0) {
        invalid += 1;
        invalidFiles.push({
          relativePath,
          absolutePath: filePath,
          workflowDirectory: workflowDir.name,
          fileName: entry.name,
          category: 'INVALID_SNAPSHOT_CONTRACT',
          runId:
            typeof snapshot.runId === 'string'
              ? snapshot.runId
              : null,
          workflowId:
            typeof snapshot.workflowId === 'string'
              ? snapshot.workflowId
              : null,
          status:
            typeof snapshot.status === 'string'
              ? snapshot.status
              : null,
          reasons,
        });
        continue;
      }

      valid += 1;
      const status = String(snapshot.status);
      statuses[status] = (statuses[status] || 0) + 1;
    }
  }

  const report = {
    formatVersion: 1,
    createdAt: new Date().toISOString(),
    workspaceRoot,
    runsRoot,
    summary: {
      workflowRunDirectories: workflowDirs.length,
      snapshotFiles: files,
      validSnapshots: valid,
      invalidSnapshots: invalid,
      totalSnapshotBytes: totalBytes,
      statuses,
    },
    invalidFiles,
  };

  const reportDirectory = path.join(
    backendDir,
    'run_inspection_reports'
  );

  await fsp.mkdir(reportDirectory, {
    recursive: true,
  });

  const reportPath = path.join(
    reportDirectory,
    `filesystem-runs-${safeTimestamp()}.json`
  );

  await fsp.writeFile(
    reportPath,
    JSON.stringify(report, null, 2),
    'utf8'
  );

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
  console.log(`Inspection report          : ${reportPath}`);

  if (invalidFiles.length > 0) {
    console.log('');
    console.log('Invalid snapshot details');
    console.log('------------------------');

    invalidFiles.forEach((item, index) => {
      console.log('');
      console.log(`  #${index + 1}`);
      console.log(`  File                 : ${item.absolutePath}`);
      console.log(`  Category             : ${item.category}`);

      if (item.runId) {
        console.log(`  Run ID               : ${item.runId}`);
      }

      if (item.workflowId) {
        console.log(`  Workflow ID          : ${item.workflowId}`);
      }

      item.reasons.forEach((reason) => {
        console.log(`  Reason               : ${reason}`);
      });
    });
  }

  console.log('');

  if (invalid === 0) {
    console.log(
      'RESULT                     : DETAILED RUN INSPECTION PASSED'
    );
    return;
  }

  console.log(
    'RESULT                     : INVALID SNAPSHOTS IDENTIFIED'
  );

  // Identification is a successful diagnostic outcome. Do not return a
  // non-zero exit code, because no read or reporting operation failed.
}

main().catch((error) => {
  console.error('');
  console.error('RESULT                     : RUN INSPECTION FAILED');
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
