'use strict';

require('dotenv').config();

const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const crypto = require('crypto');

function resolveWorkspaceRoot(backendDir) {
  if (process.env.WORKSPACE_ROOT) {
    return path.resolve(process.env.WORKSPACE_ROOT);
  }

  const configPath = path.join(backendDir, 'server_config.json');

  if (fs.existsSync(configPath)) {
    const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8'));

    if (parsed.workspaceRoot) {
      return path.resolve(parsed.workspaceRoot);
    }
  }

  throw new Error(
    'Workspace root was not found in WORKSPACE_ROOT or server_config.json.'
  );
}

function parseArguments(argv) {
  return {
    apply: argv.includes('--apply'),
    dryRun: !argv.includes('--apply'),
  };
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function safeTimestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function skipWhitespace(text, index) {
  let cursor = index;

  while (cursor < text.length && /\s/.test(text[cursor])) {
    cursor += 1;
  }

  return cursor;
}

function findCompositeJsonEnd(text, startIndex) {
  const first = text[startIndex];

  if (first !== '{' && first !== '[') {
    return null;
  }

  const stack = [];
  let inString = false;
  let escaped = false;

  for (let index = startIndex; index < text.length; index += 1) {
    const character = text[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (character === '\\') {
        escaped = true;
      } else if (character === '"') {
        inString = false;
      }

      continue;
    }

    if (character === '"') {
      inString = true;
      continue;
    }

    if (character === '{' || character === '[') {
      stack.push(character);
      continue;
    }

    if (character === '}' || character === ']') {
      const expected = character === '}' ? '{' : '[';
      const actual = stack.pop();

      if (actual !== expected) {
        return null;
      }

      if (stack.length === 0) {
        return index + 1;
      }
    }
  }

  return null;
}

function extractJsonSegments(text) {
  const segments = [];
  const junk = [];
  let cursor = 0;

  while (cursor < text.length) {
    cursor = skipWhitespace(text, cursor);

    if (cursor >= text.length) {
      break;
    }

    const end = findCompositeJsonEnd(text, cursor);

    if (end === null) {
      junk.push({
        start: cursor,
        end: text.length,
        length: text.length - cursor,
        preview: text.slice(cursor, cursor + 160),
      });
      break;
    }

    const raw = text.slice(cursor, end);

    try {
      const value = JSON.parse(raw);
      segments.push({
        start: cursor,
        end,
        length: end - cursor,
        value,
      });
      cursor = end;
    } catch (error) {
      junk.push({
        start: cursor,
        end,
        length: end - cursor,
        preview: raw.slice(0, 160),
        reason: error.message,
      });
      cursor = end;
    }
  }

  return { segments, junk };
}

function isSnapshot(value) {
  return (
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    typeof value.runId === 'string' &&
    typeof value.workflowId === 'string' &&
    typeof value.status === 'string' &&
    Array.isArray(value.outputs)
  );
}

function snapshotTimestamp(snapshot) {
  const candidates = [
    snapshot.updatedAt,
    snapshot.finishedAt,
    snapshot.startedAt,
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;

    const parsed = new Date(candidate).getTime();

    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return 0;
}

function rankSnapshot(snapshot, segmentIndex) {
  return {
    timestamp: snapshotTimestamp(snapshot),
    outputCount: Array.isArray(snapshot.outputs)
      ? snapshot.outputs.length
      : 0,
    logCount: Array.isArray(snapshot.logs)
      ? snapshot.logs.length
      : 0,
    segmentIndex,
  };
}

function compareRank(left, right) {
  return (
    left.timestamp - right.timestamp ||
    left.outputCount - right.outputCount ||
    left.logCount - right.logCount ||
    left.segmentIndex - right.segmentIndex
  );
}

function analyzeFile(filePath, text, runsRoot) {
  const relativePath = path.relative(runsRoot, filePath);
  const workflowDirectory = path.basename(path.dirname(filePath));
  const expectedRunId = path.basename(filePath, '.json');

  const extracted = extractJsonSegments(text);

  const snapshotSegments = extracted.segments
    .map((segment, index) => ({
      ...segment,
      segmentIndex: index,
    }))
    .filter((segment) => isSnapshot(segment.value));

  const matchingSnapshots = snapshotSegments.filter(
    (segment) =>
      segment.value.workflowId === workflowDirectory &&
      segment.value.runId === expectedRunId
  );

  const mismatchedSnapshots = snapshotSegments.filter(
    (segment) =>
      segment.value.workflowId !== workflowDirectory ||
      segment.value.runId !== expectedRunId
  );

  let selected = null;
  let repairable = false;
  let reason = null;

  if (matchingSnapshots.length === 0) {
    reason =
      'No valid snapshot matches both the workflow directory and filename runId.';
  } else if (mismatchedSnapshots.length > 0) {
    reason =
      'The file contains one or more valid snapshots belonging to a different workflow or run.';
  } else {
    const ranked = matchingSnapshots
      .map((segment) => ({
        segment,
        rank: rankSnapshot(segment.value, segment.segmentIndex),
      }))
      .sort((left, right) => compareRank(left.rank, right.rank));

    selected = ranked[ranked.length - 1].segment;
    repairable = true;

    if (matchingSnapshots.length === 1 && extracted.junk.length > 0) {
      reason =
        'One valid matching snapshot followed by non-JSON trailing content.';
    } else if (matchingSnapshots.length > 1) {
      reason =
        `Found ${matchingSnapshots.length} valid matching snapshots; ` +
        'the newest/most complete snapshot was selected deterministically.';
    } else {
      reason =
        'One valid matching snapshot with redundant trailing content.';
    }
  }

  return {
    filePath,
    relativePath,
    workflowDirectory,
    expectedRunId,
    byteLength: Buffer.byteLength(text, 'utf8'),
    jsonSegmentCount: extracted.segments.length,
    snapshotSegmentCount: snapshotSegments.length,
    matchingSnapshotCount: matchingSnapshots.length,
    mismatchedSnapshotCount: mismatchedSnapshots.length,
    junkSegmentCount: extracted.junk.length,
    repairable,
    reason,
    selected,
    junk: extracted.junk.map((item) => ({
      start: item.start,
      length: item.length,
      reason: item.reason || null,
      preview: item.preview
        .replace(/\r/g, '\\r')
        .replace(/\n/g, '\\n'),
    })),
  };
}

async function findInvalidJsonFiles(runsRoot) {
  const results = [];

  if (!fs.existsSync(runsRoot)) {
    return results;
  }

  const workflowDirectories = (
    await fsp.readdir(runsRoot, { withFileTypes: true })
  ).filter((entry) => entry.isDirectory());

  for (const directory of workflowDirectories) {
    const absoluteDirectory = path.join(runsRoot, directory.name);

    const files = (
      await fsp.readdir(absoluteDirectory, {
        withFileTypes: true,
      })
    ).filter(
      (entry) =>
        entry.isFile() &&
        entry.name.toLowerCase().endsWith('.json')
    );

    for (const file of files) {
      const filePath = path.join(absoluteDirectory, file.name);
      const text = await fsp.readFile(filePath, 'utf8');

      try {
        JSON.parse(text);
      } catch {
        results.push({
          filePath,
          text,
        });
      }
    }
  }

  return results;
}

async function createBackup(
  backendDir,
  workspaceRoot,
  analyses
) {
  const backupRoot = path.join(
    backendDir,
    'migration_backups',
    `run-json-repair-${safeTimestamp()}`
  );

  await fsp.mkdir(backupRoot, { recursive: true });

  const manifest = {
    formatVersion: 1,
    createdAt: new Date().toISOString(),
    workspaceRoot,
    purpose:
      'Backup before repairing legacy .runs files containing appended JSON or trailing content.',
    files: [],
  };

  for (const analysis of analyses) {
    const relativeToWorkspace = path.relative(
      workspaceRoot,
      analysis.filePath
    );
    const destination = path.join(
      backupRoot,
      relativeToWorkspace
    );

    await fsp.mkdir(path.dirname(destination), {
      recursive: true,
    });

    const content = await fsp.readFile(analysis.filePath);

    await fsp.writeFile(destination, content);

    manifest.files.push({
      source: analysis.filePath,
      backup: destination,
      relativePath: relativeToWorkspace,
      sizeBytes: content.length,
      sha256: sha256(content),
      selectedSegmentIndex:
        analysis.selected?.segmentIndex ?? null,
      reason: analysis.reason,
    });
  }

  const manifestPath = path.join(
    backupRoot,
    'repair-manifest.json'
  );

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

async function writeAtomically(filePath, snapshot) {
  const temporaryPath = `${filePath}.repair.tmp`;

  const content = `${JSON.stringify(snapshot, null, 2)}\n`;

  await fsp.writeFile(temporaryPath, content, 'utf8');

  // Verify the newly written temporary file before replacing the original.
  const verification = JSON.parse(
    await fsp.readFile(temporaryPath, 'utf8')
  );

  if (
    verification.runId !== snapshot.runId ||
    verification.workflowId !== snapshot.workflowId
  ) {
    await fsp.rm(temporaryPath, { force: true });

    throw new Error(
      `Temporary repair verification failed for '${filePath}'.`
    );
  }

  await fsp.rename(temporaryPath, filePath);
}

async function main() {
  const args = parseArguments(process.argv.slice(2));
  const backendDir = path.resolve(__dirname, '..');
  const workspaceRoot = resolveWorkspaceRoot(backendDir);
  const runsRoot = path.join(workspaceRoot, '.runs');

  console.log('============================================================');
  console.log(' AutoFlow Appended Run JSON Repair - Step 6A Fix 3');
  console.log('============================================================');
  console.log(`Mode                       : ${args.apply ? 'APPLY' : 'DRY RUN'}`);
  console.log(`Workspace root             : ${workspaceRoot}`);
  console.log(`Runs directory             : ${runsRoot}`);

  const invalidFiles = await findInvalidJsonFiles(runsRoot);
  const analyses = invalidFiles.map(({ filePath, text }) =>
    analyzeFile(filePath, text, runsRoot)
  );

  const repairable = analyses.filter(
    (analysis) => analysis.repairable
  );
  const blocked = analyses.filter(
    (analysis) => !analysis.repairable
  );

  console.log('');
  console.log(`Invalid JSON files         : ${analyses.length}`);
  console.log(`Automatically repairable   : ${repairable.length}`);
  console.log(`Blocked as ambiguous       : ${blocked.length}`);

  analyses.forEach((analysis, index) => {
    console.log('');
    console.log(`  #${index + 1}`);
    console.log(`  File                    : ${analysis.filePath}`);
    console.log(`  JSON segments           : ${analysis.jsonSegmentCount}`);
    console.log(`  Matching snapshots      : ${analysis.matchingSnapshotCount}`);
    console.log(`  Mismatched snapshots    : ${analysis.mismatchedSnapshotCount}`);
    console.log(`  Trailing junk segments  : ${analysis.junkSegmentCount}`);
    console.log(`  Repairable              : ${analysis.repairable ? 'YES' : 'NO'}`);
    console.log(`  Decision                : ${analysis.reason}`);

    if (analysis.selected) {
      console.log(
        `  Selected segment        : ${analysis.selected.segmentIndex + 1}`
      );
      console.log(
        `  Selected status         : ${analysis.selected.value.status}`
      );
      console.log(
        `  Selected outputs        : ${analysis.selected.value.outputs.length}`
      );
    }

    for (const junk of analysis.junk) {
      console.log(
        `  Trailing content        : offset=${junk.start}, length=${junk.length}`
      );
      console.log(`  Preview                 : ${junk.preview}`);
    }
  });

  if (analyses.length === 0) {
    console.log('');
    console.log('RESULT                     : NO INVALID RUN JSON FOUND');
    return;
  }

  if (blocked.length > 0) {
    console.log('');
    console.log('Filesystem changes         : NONE');
    console.log(
      'RESULT                     : REPAIR BLOCKED BY AMBIGUOUS FILES'
    );
    process.exitCode = 1;
    return;
  }

  if (!args.apply) {
    console.log('');
    console.log('Backup created             : NO');
    console.log('Filesystem changes         : NONE');
    console.log('');
    console.log('RESULT                     : RUN JSON REPAIR DRY RUN PASSED');
    console.log('');
    console.log(
      'Run with --apply to back up and rewrite only the selected valid snapshots.'
    );
    return;
  }

  const backup = await createBackup(
    backendDir,
    workspaceRoot,
    repairable
  );

  console.log('');
  console.log(`Backup created             : ${backup.backupRoot}`);

  for (const analysis of repairable) {
    await writeAtomically(
      analysis.filePath,
      analysis.selected.value
    );
  }

  // Verify all repaired files now parse and retain path identity.
  for (const analysis of repairable) {
    const repaired = JSON.parse(
      await fsp.readFile(analysis.filePath, 'utf8')
    );

    if (
      repaired.workflowId !== analysis.workflowDirectory ||
      repaired.runId !== analysis.expectedRunId
    ) {
      throw new Error(
        `Post-repair identity validation failed for '${analysis.filePath}'.`
      );
    }
  }

  console.log(`Files repaired             : ${repairable.length}`);
  console.log('Ambiguous files modified   : 0');
  console.log('Post-repair validation     : PASS');
  console.log('');
  console.log('RESULT                     : RUN JSON FILES REPAIRED');
}

main().catch((error) => {
  console.error('');
  console.error('RESULT                     : RUN JSON REPAIR FAILED');
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
