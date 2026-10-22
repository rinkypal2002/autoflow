'use strict';

require('dotenv').config();

const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');

const { pool, closePool } = require('../db/pool');

const ALLOWED_STATUSES = new Set([
  'idle',
  'queued',
  'running',
  'completed',
  'success',
  'error',
  'failed',
  'skipped',
  'paused',
  'waiting',
  'cancelled',
  'timed_out',
  'partial',
]);

const ALLOWED_BUCKETS = new Set([
  'apiResponse',
  'databaseResult',
  'fileReference',
  'extractedText',
  'computed',
  'generic',
]);

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

function safeTimestamp() {
  return new Date()
    .toISOString()
    .replace(/[:.]/g, '-');
}

function isObject(value) {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value)
  );
}

function isValidDate(value) {
  if (typeof value !== 'string' || !value.trim()) {
    return false;
  }

  return Number.isFinite(new Date(value).getTime());
}

function validateSnapshotShape(
  snapshot,
  workflowDirectory,
  expectedRunId
) {
  const blockers = [];
  const warnings = [];

  if (!isObject(snapshot)) {
    blockers.push('Snapshot root is not an object.');
    return { blockers, warnings };
  }

  if (snapshot.version !== 1) {
    blockers.push(
      `Unsupported snapshot version ${JSON.stringify(snapshot.version)}.`
    );
  }

  if (
    typeof snapshot.runId !== 'string' ||
    !snapshot.runId.trim()
  ) {
    blockers.push('runId is missing or blank.');
  } else if (snapshot.runId !== expectedRunId) {
    blockers.push(
      `runId '${snapshot.runId}' does not match filename '${expectedRunId}'.`
    );
  }

  if (
    typeof snapshot.workflowId !== 'string' ||
    !snapshot.workflowId.trim()
  ) {
    blockers.push('workflowId is missing or blank.');
  } else if (snapshot.workflowId !== workflowDirectory) {
    blockers.push(
      `workflowId '${snapshot.workflowId}' does not match directory '${workflowDirectory}'.`
    );
  }

  if (!ALLOWED_STATUSES.has(String(snapshot.status || '').toLowerCase())) {
    blockers.push(
      `Unsupported workflow status '${snapshot.status}'.`
    );
  }

  if (!isValidDate(snapshot.startedAt)) {
    blockers.push('startedAt is missing or invalid.');
  }

  if (!isValidDate(snapshot.updatedAt)) {
    blockers.push('updatedAt is missing or invalid.');
  }

  if (
    snapshot.finishedAt !== undefined &&
    snapshot.finishedAt !== null &&
    !isValidDate(snapshot.finishedAt)
  ) {
    blockers.push('finishedAt is invalid.');
  }

  if (!Array.isArray(snapshot.outputs)) {
    blockers.push('outputs is not an array.');
  }

  if (
    snapshot.logs !== undefined &&
    !Array.isArray(snapshot.logs)
  ) {
    blockers.push('logs is not an array.');
  }

  if (
    snapshot.variables !== undefined &&
    !isObject(snapshot.variables)
  ) {
    blockers.push('variables is not an object.');
  }

  if (
    snapshot.runtime !== undefined &&
    !isObject(snapshot.runtime)
  ) {
    blockers.push('runtime is not an object.');
  }

  if (
    snapshot.files !== undefined &&
    !isObject(snapshot.files)
  ) {
    blockers.push('files is not an object.');
  }

  if (
    snapshot.env !== undefined &&
    !isObject(snapshot.env)
  ) {
    blockers.push('env is not an object.');
  }

  if (
    snapshot.metrics !== undefined &&
    !isObject(snapshot.metrics)
  ) {
    blockers.push('metrics is not an object.');
  }

  return { blockers, warnings };
}

function validateNodeRecords(outputs) {
  const blockers = [];
  const warnings = [];
  const nodeIds = [];
  const duplicateNodeIds = [];
  const seen = new Set();

  for (const [index, record] of (outputs || []).entries()) {
    const location = `outputs[${index}]`;

    if (!isObject(record)) {
      blockers.push(`${location} is not an object.`);
      continue;
    }

    if (
      typeof record.nodeId !== 'string' ||
      !record.nodeId.trim()
    ) {
      blockers.push(`${location}.nodeId is missing or blank.`);
      continue;
    }

    const nodeId = record.nodeId.trim();
    nodeIds.push(nodeId);

    if (seen.has(nodeId)) {
      duplicateNodeIds.push(nodeId);
    }
    seen.add(nodeId);

    if (
      typeof record.nodeName !== 'string' ||
      !record.nodeName.trim()
    ) {
      blockers.push(`${location}.nodeName is missing or blank.`);
    }

    if (
      typeof record.stepKey !== 'string' ||
      !record.stepKey.trim()
    ) {
      blockers.push(`${location}.stepKey is missing or blank.`);
    }

    if (
      !Number.isInteger(Number(record.sequence)) ||
      Number(record.sequence) < 1
    ) {
      blockers.push(`${location}.sequence must be at least 1.`);
    }

    if (
      !ALLOWED_STATUSES.has(
        String(record.status || '').toLowerCase()
      )
    ) {
      blockers.push(
        `${location} has unsupported status '${record.status}'.`
      );
    }

    if (!ALLOWED_BUCKETS.has(record.bucket)) {
      warnings.push(
        `${location} has unknown bucket '${record.bucket}'; migration would use 'generic'.`
      );
    }

    if (!isValidDate(record.startedAt)) {
      blockers.push(`${location}.startedAt is missing or invalid.`);
    }

    if (
      record.finishedAt !== undefined &&
      record.finishedAt !== null &&
      !isValidDate(record.finishedAt)
    ) {
      blockers.push(`${location}.finishedAt is invalid.`);
    }

    if (
      record.durationMs !== undefined &&
      (
        !Number.isFinite(Number(record.durationMs)) ||
        Number(record.durationMs) < 0
      )
    ) {
      blockers.push(`${location}.durationMs is invalid.`);
    }

    if (
      record.attempt !== undefined &&
      (
        !Number.isInteger(Number(record.attempt)) ||
        Number(record.attempt) < 1
      )
    ) {
      blockers.push(`${location}.attempt must be at least 1.`);
    }
  }

  if (duplicateNodeIds.length > 0) {
    blockers.push(
      `Duplicate final node records found for: ${[
        ...new Set(duplicateNodeIds),
      ].join(', ')}.`
    );
  }

  return {
    blockers,
    warnings,
    nodeIds: [...new Set(nodeIds)],
  };
}

function selectVersion(workflow, nodeIds) {
  if (!workflow) {
    return {
      selected: null,
      exactCandidates: [],
      bestPartial: null,
    };
  }

  const versions = workflow.versions || [];

  if (versions.length === 0) {
    return {
      selected: null,
      exactCandidates: [],
      bestPartial: null,
    };
  }

  if (nodeIds.length === 0) {
    const current =
      versions.find(
        (version) =>
          version.versionNumber ===
          workflow.currentVersionNumber
      ) ||
      [...versions].sort(
        (left, right) =>
          right.versionNumber - left.versionNumber
      )[0];

    return {
      selected: current,
      exactCandidates: [current],
      bestPartial: current,
    };
  }

  const scored = versions.map((version) => {
    const nodeSet = new Set(version.nodeKeys);
    const matched = nodeIds.filter((nodeId) =>
      nodeSet.has(nodeId)
    );
    const missing = nodeIds.filter(
      (nodeId) => !nodeSet.has(nodeId)
    );

    return {
      ...version,
      matchedNodeCount: matched.length,
      missingNodeKeys: missing,
      exact: missing.length === 0,
    };
  });

  const exactCandidates = scored
    .filter((version) => version.exact)
    .sort((left, right) => {
      const leftCurrent =
        left.versionNumber === workflow.currentVersionNumber
          ? 1
          : 0;
      const rightCurrent =
        right.versionNumber === workflow.currentVersionNumber
          ? 1
          : 0;

      return (
        rightCurrent - leftCurrent ||
        right.versionNumber - left.versionNumber
      );
    });

  const bestPartial = [...scored].sort(
    (left, right) =>
      right.matchedNodeCount - left.matchedNodeCount ||
      right.versionNumber - left.versionNumber
  )[0];

  return {
    selected: exactCandidates[0] || null,
    exactCandidates,
    bestPartial,
  };
}

async function loadDatabaseModel(
  client,
  workspaceKey
) {
  const workspaceResult = await client.query(
    `
      SELECT id, workspace_key
      FROM autoflow.workspace
      WHERE workspace_key = $1
        AND deleted_at IS NULL
      LIMIT 1
    `,
    [workspaceKey]
  );

  if (workspaceResult.rowCount !== 1) {
    throw new Error(
      `PostgreSQL workspace '${workspaceKey}' was not found.`
    );
  }

  const workflowResult = await client.query(
    `
      SELECT
        workflow.id AS workflow_id,
        workflow.workflow_key,
        workflow.name,
        workflow.current_version_number,
        version.id AS version_id,
        version.version_number,
        version.created_at AS version_created_at,
        COALESCE(
          array_agg(node.node_key ORDER BY node.node_key)
            FILTER (WHERE node.node_key IS NOT NULL),
          ARRAY[]::varchar[]
        ) AS node_keys
      FROM autoflow.workflow workflow
      JOIN autoflow.workflow_version version
        ON version.workspace_id = workflow.workspace_id
       AND version.workflow_id = workflow.id
      LEFT JOIN autoflow.workflow_node node
        ON node.workspace_id = version.workspace_id
       AND node.workflow_id = version.workflow_id
       AND node.workflow_version_id = version.id
      WHERE workflow.workspace_id = $1
        AND workflow.deleted_at IS NULL
      GROUP BY
        workflow.id,
        workflow.workflow_key,
        workflow.name,
        workflow.current_version_number,
        version.id,
        version.version_number,
        version.created_at
      ORDER BY
        workflow.workflow_key,
        version.version_number
    `,
    [workspaceResult.rows[0].id]
  );

  const workflows = new Map();

  for (const row of workflowResult.rows) {
    if (!workflows.has(row.workflow_key)) {
      workflows.set(row.workflow_key, {
        workflowId: row.workflow_id,
        workflowKey: row.workflow_key,
        name: row.name,
        currentVersionNumber:
          Number(row.current_version_number),
        versions: [],
      });
    }

    workflows.get(row.workflow_key).versions.push({
      versionId: row.version_id,
      versionNumber: Number(row.version_number),
      createdAt: row.version_created_at,
      nodeKeys: row.node_keys || [],
    });
  }

  const existingResult = await client.query(
    `
      SELECT
        workflow.workflow_key,
        execution.execution_key
      FROM autoflow.workflow_execution execution
      JOIN autoflow.workflow workflow
        ON workflow.workspace_id =
           execution.workspace_id
       AND workflow.id =
           execution.workflow_id
      WHERE execution.workspace_id = $1
        AND execution.deleted_at IS NULL
    `,
    [workspaceResult.rows[0].id]
  );

  const existingExecutions = new Set(
    existingResult.rows.map(
      (row) =>
        `${row.workflow_key}::${row.execution_key}`
    )
  );

  return {
    workspaceId: workspaceResult.rows[0].id,
    workflows,
    existingExecutions,
  };
}

async function readSnapshots(runsRoot) {
  const snapshots = [];

  if (!fs.existsSync(runsRoot)) {
    return snapshots;
  }

  const workflowDirectories = (
    await fsp.readdir(runsRoot, {
      withFileTypes: true,
    })
  ).filter((entry) => entry.isDirectory());

  for (const directory of workflowDirectories) {
    const directoryPath = path.join(
      runsRoot,
      directory.name
    );

    const files = (
      await fsp.readdir(directoryPath, {
        withFileTypes: true,
      })
    )
      .filter(
        (entry) =>
          entry.isFile() &&
          entry.name.toLowerCase().endsWith('.json')
      )
      .sort((left, right) =>
        left.name.localeCompare(right.name)
      );

    for (const file of files) {
      const filePath = path.join(
        directoryPath,
        file.name
      );
      const raw = await fsp.readFile(filePath, 'utf8');

      snapshots.push({
        filePath,
        relativePath: path.relative(runsRoot, filePath),
        workflowDirectory: directory.name,
        expectedRunId: path.basename(file.name, '.json'),
        sizeBytes: Buffer.byteLength(raw, 'utf8'),
        snapshot: JSON.parse(raw),
      });
    }
  }

  return snapshots;
}

function compactIssue(item) {
  return {
    relativePath: item.relativePath,
    workflowId: item.workflowId,
    runId: item.runId,
    blockers: item.blockers,
    warnings: item.warnings,
    selectedVersionNumber:
      item.selectedVersionNumber,
    matchedNodes: item.matchedNodes,
    totalNodes: item.totalNodes,
    missingNodeKeys: item.missingNodeKeys,
  };
}

async function main() {
  const backendDir = path.resolve(__dirname, '..');
  const workspaceRoot = resolveWorkspaceRoot(backendDir);
  const runsRoot = path.join(workspaceRoot, '.runs');
  const workspaceKey =
    process.env.DB_WORKSPACE_KEY || 'default';

  console.log('============================================================');
  console.log(' AutoFlow Run Migration Readiness - Step 6B.1');
  console.log('============================================================');
  console.log(`Workspace key              : ${workspaceKey}`);
  console.log(`Workspace root             : ${workspaceRoot}`);
  console.log(`Runs directory             : ${runsRoot}`);
  console.log('Mode                       : READ ONLY');

  const client = await pool.connect();

  try {
    const database = await loadDatabaseModel(
      client,
      workspaceKey
    );
    const files = await readSnapshots(runsRoot);

    const results = [];
    const seenRunIdentity = new Set();

    for (const file of files) {
      const snapshot = file.snapshot;
      const identity =
        `${file.workflowDirectory}::${file.expectedRunId}`;

      const shape = validateSnapshotShape(
        snapshot,
        file.workflowDirectory,
        file.expectedRunId
      );
      const nodes = validateNodeRecords(
        Array.isArray(snapshot.outputs)
          ? snapshot.outputs
          : []
      );

      const blockers = [
        ...shape.blockers,
        ...nodes.blockers,
      ];
      const warnings = [
        ...shape.warnings,
        ...nodes.warnings,
      ];

      if (seenRunIdentity.has(identity)) {
        blockers.push(
          'Duplicate workflowId/runId identity exists in the filesystem scan.'
        );
      }
      seenRunIdentity.add(identity);

      const workflow = database.workflows.get(
        file.workflowDirectory
      );

      if (!workflow) {
        blockers.push(
          `Workflow '${file.workflowDirectory}' does not exist in PostgreSQL.`
        );
      }

      const versionMatch = selectVersion(
        workflow,
        nodes.nodeIds
      );

      if (
        workflow &&
        workflow.versions.length === 0
      ) {
        blockers.push(
          'Workflow has no PostgreSQL versions.'
        );
      } else if (
        workflow &&
        !versionMatch.selected
      ) {
        const missing =
          versionMatch.bestPartial?.missingNodeKeys || [];

        blockers.push(
          'No workflow version contains every executed node ID.'
        );

        if (missing.length > 0) {
          blockers.push(
            `Best candidate is missing node IDs: ${missing.join(', ')}.`
          );
        }
      } else if (
        versionMatch.exactCandidates.length > 1
      ) {
        warnings.push(
          `Multiple versions contain the same executed node IDs; version ${versionMatch.selected.versionNumber} would be selected.`
        );
      }

      const existing =
        database.existingExecutions.has(identity);

      if (existing) {
        warnings.push(
          'This execution already exists in PostgreSQL and would be idempotently updated.'
        );
      }

      const bestPartial = versionMatch.bestPartial;

      results.push({
        relativePath: file.relativePath,
        workflowId:
          snapshot.workflowId ||
          file.workflowDirectory,
        runId:
          snapshot.runId ||
          file.expectedRunId,
        status: snapshot.status || null,
        sizeBytes: file.sizeBytes,
        totalNodes: nodes.nodeIds.length,
        matchedNodes:
          versionMatch.selected
            ? nodes.nodeIds.length
            : bestPartial?.matchedNodeCount || 0,
        selectedVersionId:
          versionMatch.selected?.versionId || null,
        selectedVersionNumber:
          versionMatch.selected?.versionNumber || null,
        exactCandidateVersions:
          versionMatch.exactCandidates.map(
            (candidate) => candidate.versionNumber
          ),
        missingNodeKeys:
          versionMatch.selected
            ? []
            : bestPartial?.missingNodeKeys || nodes.nodeIds,
        alreadyInPostgres: existing,
        blockers,
        warnings,
        ready: blockers.length === 0,
      });
    }

    const ready = results.filter(
      (result) => result.ready
    );
    const blocked = results.filter(
      (result) => !result.ready
    );
    const warnings = results.filter(
      (result) => result.warnings.length > 0
    );
    const existing = results.filter(
      (result) => result.alreadyInPostgres
    );

    const summary = {
      workflowDirectories:
        new Set(
          files.map(
            (file) => file.workflowDirectory
          )
        ).size,
      snapshotFiles: results.length,
      readySnapshots: ready.length,
      blockedSnapshots: blocked.length,
      snapshotsWithWarnings: warnings.length,
      alreadyInPostgres: existing.length,
      nodeRecords: results.reduce(
        (sum, result) =>
          sum + result.totalNodes,
        0
      ),
      matchedNodeRecords: results.reduce(
        (sum, result) =>
          sum + result.matchedNodes,
        0
      ),
      totalBytes: results.reduce(
        (sum, result) =>
          sum + result.sizeBytes,
        0
      ),
    };

    const reportDirectory = path.join(
      backendDir,
      'run_migration_reports'
    );

    await fsp.mkdir(reportDirectory, {
      recursive: true,
    });

    const reportPath = path.join(
      reportDirectory,
      `run-migration-readiness-${safeTimestamp()}.json`
    );

    await fsp.writeFile(
      reportPath,
      JSON.stringify(
        {
          formatVersion: 1,
          createdAt: new Date().toISOString(),
          workspaceKey,
          workspaceRoot,
          runsRoot,
          summary,
          ready: ready.map(compactIssue),
          blocked: blocked.map(compactIssue),
          warnings: warnings.map(compactIssue),
        },
        null,
        2
      ),
      'utf8'
    );

    console.log('');
    console.log(
      `Workflow run directories   : ${summary.workflowDirectories}`
    );
    console.log(
      `Snapshot files             : ${summary.snapshotFiles}`
    );
    console.log(
      `Ready for migration        : ${summary.readySnapshots}`
    );
    console.log(
      `Blocked snapshots          : ${summary.blockedSnapshots}`
    );
    console.log(
      `Snapshots with warnings    : ${summary.snapshotsWithWarnings}`
    );
    console.log(
      `Already in PostgreSQL      : ${summary.alreadyInPostgres}`
    );
    console.log(
      `Node execution records     : ${summary.nodeRecords}`
    );
    console.log(
      `Version-matched node records: ${summary.matchedNodeRecords}`
    );
    console.log(
      `Total snapshot size        : ${(summary.totalBytes / 1024 / 1024).toFixed(2)} MB`
    );
    console.log(
      `Readiness report           : ${reportPath}`
    );

    if (blocked.length > 0) {
      console.log('');
      console.log('Blocked snapshot details');
      console.log('------------------------');

      blocked.forEach((item, index) => {
        console.log('');
        console.log(`  #${index + 1}`);
        console.log(
          `  File                 : ${item.relativePath}`
        );
        console.log(
          `  Workflow / Run       : ${item.workflowId} / ${item.runId}`
        );
        console.log(
          `  Node match           : ${item.matchedNodes}/${item.totalNodes}`
        );

        item.blockers.forEach((blocker) => {
          console.log(
            `  Blocker              : ${blocker}`
          );
        });
      });
    }

    if (warnings.length > 0) {
      console.log('');
      console.log('Warnings');
      console.log('--------');

      warnings.slice(0, 20).forEach((item) => {
        console.log('');
        console.log(
          `  ${item.relativePath}`
        );

        item.warnings.forEach((warning) => {
          console.log(
            `  Warning              : ${warning}`
          );
        });
      });

      if (warnings.length > 20) {
        console.log('');
        console.log(
          `  Additional warnings are available in the report: ${warnings.length - 20}`
        );
      }
    }

    console.log('');

    if (blocked.length > 0) {
      console.log(
        'Filesystem changes         : NONE'
      );
      console.log(
        'PostgreSQL changes         : NONE'
      );
      console.log(
        'RESULT                     : RUN MIGRATION READINESS BLOCKED'
      );
      process.exitCode = 1;
      return;
    }

    console.log(
      'Filesystem changes         : NONE'
    );
    console.log(
      'PostgreSQL changes         : NONE'
    );
    console.log(
      'RESULT                     : RUN MIGRATION READY'
    );
  } finally {
    client.release();
  }
}

main()
  .catch((error) => {
    console.error('');
    console.error(
      'RESULT                     : RUN MIGRATION READINESS FAILED'
    );
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
