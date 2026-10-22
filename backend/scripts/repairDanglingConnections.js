'use strict';

require('dotenv').config();

const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const crypto = require('crypto');

const {
  inspectFilesystemWorkspace,
  resolveWorkspaceRoot,
} = require('../db/filesystemWorkspaceMigration');

function parseArguments(argv) {
  const args = {
    apply: false,
    workspaceRoot: null,
    workflowId: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];

    if (current === '--apply') {
      args.apply = true;
    } else if (current === '--dry-run') {
      args.apply = false;
    } else if (current === '--workspace-root') {
      args.workspaceRoot = argv[++index];
    } else if (current === '--workflow-id') {
      args.workflowId = argv[++index];
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
AutoFlow dangling-connection repair

Dry run:
  node scripts\\repairDanglingConnections.js --dry-run

Apply all detected repairs:
  node scripts\\repairDanglingConnections.js --apply

Limit to one workflow:
  node scripts\\repairDanglingConnections.js --dry-run --workflow-id <id>
  node scripts\\repairDanglingConnections.js --apply --workflow-id <id>

Optional explicit workspace:
  --workspace-root "D:\\path\\to\\workspace"
`);
}

function findDanglingConnections(inspection, workflowIdFilter = null) {
  const findings = [];

  for (const item of inspection.workflows) {
    if (workflowIdFilter && item.workflowId !== workflowIdFilter) {
      continue;
    }

    const nodeIds = new Set(
      item.definition.actions
        .map((action) => String(action?.id || '').trim())
        .filter(Boolean)
    );

    for (const [index, connection] of item.definition.connections.entries()) {
      const connectionId = String(
        connection?.id || `connection-${index + 1}`
      );
      const sourceId = String(connection?.sourceId || '');
      const targetId = String(connection?.targetId || '');

      const missingSource = !nodeIds.has(sourceId);
      const missingTarget = !nodeIds.has(targetId);

      if (missingSource || missingTarget) {
        findings.push({
          workflowId: item.workflowId,
          workflowName: item.definition.name,
          sourcePath: item.sourcePath,
          connectionIndex: index,
          connectionId,
          sourceId,
          targetId,
          missingSource,
          missingTarget,
        });
      }
    }
  }

  return findings;
}

function safeTimestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

async function createBackup({
  workspaceRoot,
  backendDir,
  affectedFiles,
}) {
  const backupRoot = path.join(
    backendDir,
    'migration_backups',
    `dangling-connections-${safeTimestamp()}`
  );

  await fsp.mkdir(backupRoot, { recursive: true });

  const manifest = {
    formatVersion: 1,
    createdAt: new Date().toISOString(),
    workspaceRoot,
    reason: 'Backup before removing dangling workflow connections',
    files: [],
  };

  for (const sourcePath of affectedFiles) {
    const relative = path.relative(workspaceRoot, sourcePath);
    const safeRelative =
      !relative.startsWith('..') && !path.isAbsolute(relative)
        ? relative
        : path.join('_external', path.basename(sourcePath));

    const destination = path.join(backupRoot, safeRelative);
    await fsp.mkdir(path.dirname(destination), { recursive: true });

    const content = await fsp.readFile(sourcePath);
    await fsp.writeFile(destination, content);

    manifest.files.push({
      source: sourcePath,
      backup: destination,
      relativePath: safeRelative,
      sizeBytes: content.length,
      sha256: sha256(content),
    });
  }

  const manifestPath = path.join(backupRoot, 'repair-manifest.json');
  await fsp.writeFile(
    manifestPath,
    JSON.stringify(manifest, null, 2),
    'utf8'
  );

  return {
    backupRoot,
    manifestPath,
  };
}

function isSameConnection(connection, finding, index) {
  const connectionId = String(
    connection?.id || `connection-${index + 1}`
  );

  return (
    connectionId === finding.connectionId &&
    String(connection?.sourceId || '') === finding.sourceId &&
    String(connection?.targetId || '') === finding.targetId
  );
}

async function applyRepairs(findings) {
  const findingsByFile = new Map();

  for (const finding of findings) {
    if (!finding.sourcePath) {
      throw new Error(
        `Workflow '${finding.workflowId}' has no source file, so its ` +
          `dangling connection cannot be repaired automatically.`
      );
    }

    const list = findingsByFile.get(finding.sourcePath) || [];
    list.push(finding);
    findingsByFile.set(finding.sourcePath, list);
  }

  const repairSummary = [];

  for (const [sourcePath, fileFindings] of findingsByFile.entries()) {
    const raw = await fsp.readFile(sourcePath, 'utf8');
    const definition = JSON.parse(raw);

    if (!Array.isArray(definition.connections)) {
      throw new Error(
        `Workflow file '${sourcePath}' does not contain a connections array.`
      );
    }

    const removed = [];
    const retained = [];

    definition.connections.forEach((connection, index) => {
      const matchingFinding = fileFindings.find((finding) =>
        isSameConnection(connection, finding, index)
      );

      if (matchingFinding) {
        removed.push({
          id: matchingFinding.connectionId,
          sourceId: matchingFinding.sourceId,
          targetId: matchingFinding.targetId,
        });
      } else {
        retained.push(connection);
      }
    });

    if (removed.length !== fileFindings.length) {
      throw new Error(
        `Repair safety check failed for '${sourcePath}'. ` +
          `Expected to remove ${fileFindings.length} connection(s), ` +
          `but matched ${removed.length}. No file was written.`
      );
    }

    definition.connections = retained;

    // Write through a temporary file so an interrupted write cannot corrupt
    // the workflow JSON.
    const tempPath = `${sourcePath}.repair.tmp`;
    await fsp.writeFile(
      tempPath,
      `${JSON.stringify(definition, null, 2)}\n`,
      'utf8'
    );
    await fsp.rename(tempPath, sourcePath);

    repairSummary.push({
      sourcePath,
      removed,
      remainingConnectionCount: retained.length,
    });
  }

  return repairSummary;
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
  console.log(' AutoFlow Dangling Connection Repair - Step 3 Fix');
  console.log('============================================================');
  console.log(`Mode                  : ${args.apply ? 'APPLY' : 'DRY RUN'}`);
  console.log(`Workspace root        : ${workspaceRoot}`);
  console.log(
    `Workflow filter       : ${args.workflowId || 'all workflows'}`
  );

  const inspection = await inspectFilesystemWorkspace({ workspaceRoot });
  const findings = findDanglingConnections(
    inspection,
    args.workflowId
  );

  console.log('');
  console.log(`Workflows inspected   : ${inspection.workflows.length}`);
  console.log(`Dangling connections  : ${findings.length}`);

  if (findings.length === 0) {
    console.log('');
    console.log('Filesystem changes    : NONE');
    console.log('RESULT                : NO DANGLING CONNECTIONS FOUND');
    return;
  }

  console.log('');
  console.log('Detected repairs:');

  findings.forEach((finding, index) => {
    console.log('');
    console.log(`  #${index + 1}`);
    console.log(`  Workflow ID         : ${finding.workflowId}`);
    console.log(`  Workflow name       : ${finding.workflowName}`);
    console.log(`  Workflow file       : ${finding.sourcePath}`);
    console.log(`  Connection ID       : ${finding.connectionId}`);
    console.log(`  Source node         : ${finding.sourceId}`);
    console.log(`  Target node         : ${finding.targetId}`);
    console.log(
      `  Missing             : ${
        [
          finding.missingSource ? 'source' : null,
          finding.missingTarget ? 'target' : null,
        ]
          .filter(Boolean)
          .join(' and ')
      }`
    );
  });

  if (!args.apply) {
    console.log('');
    console.log('Backup created        : NO');
    console.log('Filesystem changes    : NONE');
    console.log('');
    console.log('RESULT                : REPAIR DRY RUN PASSED');
    console.log('');
    console.log('Run with --apply to back up and remove only these edges.');
    return;
  }

  const affectedFiles = [...new Set(
    findings.map((finding) => finding.sourcePath)
  )];

  const backup = await createBackup({
    workspaceRoot,
    backendDir,
    affectedFiles,
  });

  console.log('');
  console.log(`Backup created        : ${backup.backupRoot}`);

  const summary = await applyRepairs(findings);

  let removedCount = 0;
  for (const item of summary) {
    removedCount += item.removed.length;
  }

  // Re-inspect after the write. This proves the selected stale edges are gone.
  const afterInspection = await inspectFilesystemWorkspace({ workspaceRoot });
  const afterFindings = findDanglingConnections(
    afterInspection,
    args.workflowId
  );

  if (afterFindings.length > 0) {
    throw new Error(
      `Repair completed but ${afterFindings.length} dangling connection(s) ` +
        `remain in the selected scope.`
    );
  }

  console.log(`Files repaired        : ${summary.length}`);
  console.log(`Connections removed   : ${removedCount}`);
  console.log('Remaining dangling    : 0');
  console.log('Database writes       : NONE');
  console.log('');
  console.log('RESULT                : DANGLING CONNECTIONS REPAIRED');
}

main().catch((error) => {
  console.error('');
  console.error('RESULT                : REPAIR FAILED');
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
