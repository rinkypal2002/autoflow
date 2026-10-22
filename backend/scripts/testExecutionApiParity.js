'use strict';

require('dotenv').config();

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');

const { pool, closePool } = require('../db/pool');
const {
  listExecutionSnapshots,
  sanitizeSnapshot,
} = require('../db/executionRepository');

const MIGRATION_SOURCE = 'filesystem-runs-v1';

function resolveWorkspaceRoot(backendDir) {
  if (process.env.WORKSPACE_ROOT) {
    return path.resolve(
      process.env.WORKSPACE_ROOT
    );
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
      return path.resolve(
        parsed.workspaceRoot
      );
    }
  }

  throw new Error(
    'Workspace root was not found in WORKSPACE_ROOT or server_config.json.'
  );
}

function sha256(value) {
  return crypto
    .createHash('sha256')
    .update(value)
    .digest('hex');
}

function buildBatchId(files) {
  const index = files
    .map(
      (file) =>
        `${file.relativePath}:${file.sourceSha256}`
    )
    .join('\n');

  return `${MIGRATION_SOURCE}-${sha256(index).slice(0, 16)}`;
}

function normalizeDate(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const date = value instanceof Date
    ? value
    : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return date.toISOString();
}

function normalizeJson(value) {
  if (Array.isArray(value)) {
    return value.map(normalizeJson);
  }

  if (
    value &&
    typeof value === 'object' &&
    !(value instanceof Date)
  ) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [
          key,
          normalizeJson(value[key]),
        ])
    );
  }

  return value;
}

function publicDatabaseSnapshot(snapshot) {
  const clone = JSON.parse(
    JSON.stringify(snapshot)
  );

  delete clone.migration;

  return clone;
}

async function readRunFiles(runsRoot) {
  const files = [];

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

    const entries = (
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

    for (const entry of entries) {
      const filePath = path.join(
        directoryPath,
        entry.name
      );
      const content = await fsp.readFile(filePath);
      const snapshot = JSON.parse(
        content.toString('utf8')
      );

      files.push({
        filePath,
        relativePath: path.relative(
          runsRoot,
          filePath
        ),
        workflowId: directory.name,
        runId: path.basename(
          entry.name,
          '.json'
        ),
        sourceSha256: sha256(content),
        snapshot,
      });
    }
  }

  return files.sort((left, right) =>
    left.relativePath.localeCompare(
      right.relativePath
    )
  );
}

function filesystemList(files, workflowId, limit) {
  return files
    .filter(
      (file) =>
        file.workflowId === workflowId
    )
    .map((file) => ({
      runId: file.snapshot.runId,
      status: file.snapshot.status,
      startedAt: file.snapshot.startedAt,
      updatedAt: file.snapshot.updatedAt,
      finishedAt:
        file.snapshot.finishedAt ?? null,
      metrics:
        file.snapshot.metrics ?? null,
      nodeCount:
        Array.isArray(
          file.snapshot.outputs
        )
          ? file.snapshot.outputs.length
          : 0,
    }))
    .sort((left, right) =>
      String(right.updatedAt).localeCompare(
        String(left.updatedAt)
      )
    )
    .slice(0, limit);
}

function normalizeListRow(row) {
  return {
    runId: row.runId,
    status: row.status,
    startedAt: normalizeDate(
      row.startedAt
    ),
    updatedAt: normalizeDate(
      row.updatedAt
    ),
    finishedAt: normalizeDate(
      row.finishedAt
    ),
    metrics: row.metrics ?? null,
    nodeCount: Number(row.nodeCount),
  };
}

async function main() {
  const backendDir = path.resolve(
    __dirname,
    '..'
  );
  const workspaceRoot =
    resolveWorkspaceRoot(backendDir);
  const runsRoot = path.join(
    workspaceRoot,
    '.runs'
  );
  const workspaceKey =
    process.env.DB_WORKSPACE_KEY ||
    'default';
  const listLimit = Math.min(
    200,
    Math.max(
      1,
      Number(
        process.env.EXECUTION_LIST_LIMIT ||
          25
      )
    )
  );

  console.log('============================================================');
  console.log(' AutoFlow Execution API Parity - Step 6B.3');
  console.log('============================================================');
  console.log(
    `Workspace key              : ${workspaceKey}`
  );
  console.log(
    `Runs directory             : ${runsRoot}`
  );
  console.log(
    `List contract limit        : ${listLimit}`
  );
  console.log(
    'Mode                       : READ ONLY'
  );

  const files =
    await readRunFiles(
      runsRoot
    );
  const batchId =
    buildBatchId(files);

  const client =
    await pool.connect();

  try {
    const rows =
      await client.query(
        `
          SELECT
            workflow.workflow_key,
            execution.execution_key,
            execution.status,
            execution.workflow_version_id,
            execution.full_snapshot_json,
            execution.full_snapshot_json
              #>> '{migration,sourceSha256}'
                AS source_sha256,
            execution.full_snapshot_json
              #>> '{migration,selectionReason}'
                AS selection_reason,
            (
              SELECT count(*)::integer
              FROM autoflow.node_execution node
              WHERE node.execution_id =
                    execution.id
                AND node.is_final_attempt =
                    true
            ) AS node_count
          FROM autoflow.workflow_execution execution
          JOIN autoflow.workflow workflow
            ON workflow.workspace_id =
               execution.workspace_id
           AND workflow.id =
               execution.workflow_id
          JOIN autoflow.workspace workspace
            ON workspace.id =
               execution.workspace_id
          WHERE workspace.workspace_key = $1
            AND execution.full_snapshot_json
                  #>> '{migration,batchId}'
                = $2
            AND execution.deleted_at IS NULL
          ORDER BY
            workflow.workflow_key,
            execution.execution_key
        `,
        [
          workspaceKey,
          batchId,
        ]
      );

    assert.strictEqual(
      rows.rowCount,
      files.length,
      `Expected ${files.length} migrated executions, found ${rows.rowCount}.`
    );

    const databaseByIdentity = new Map(
      rows.rows.map((row) => [
        `${row.workflow_key}::${row.execution_key}`,
        row,
      ])
    );

    let comparedSnapshots = 0;
    let comparedNodes = 0;

    for (const file of files) {
      const identity =
        `${file.workflowId}::${file.runId}`;
      const database =
        databaseByIdentity.get(identity);

      assert.ok(
        database,
        `Database execution missing for ${file.relativePath}.`
      );

      assert.strictEqual(
        database.source_sha256,
        file.sourceSha256,
        `Source SHA-256 mismatch for ${file.relativePath}.`
      );

      const expected =
        normalizeJson(
          sanitizeSnapshot(
            file.snapshot
          )
        );

      const actual =
        normalizeJson(
          publicDatabaseSnapshot(
            database.full_snapshot_json
          )
        );

      assert.deepStrictEqual(
        actual,
        expected,
        `Full snapshot contract mismatch for ${file.relativePath}.`
      );

      assert.strictEqual(
        Number(database.node_count),
        file.snapshot.outputs.length,
        `Node count mismatch for ${file.relativePath}.`
      );

      comparedSnapshots += 1;
      comparedNodes +=
        file.snapshot.outputs.length;
    }

    const workflowIds = [
      ...new Set(
        files.map(
          (file) => file.workflowId
        )
      ),
    ].sort();

    let comparedListRows = 0;

    for (const workflowId of workflowIds) {
      const filesystemRuns =
        filesystemList(
          files,
          workflowId,
          listLimit
        ).map(normalizeListRow);

      const databaseRuns =
        (
          await listExecutionSnapshots(
            workflowId,
            {
              workspaceKey,
              limit: listLimit,
            }
          )
        ).map(normalizeListRow);

      assert.deepStrictEqual(
        normalizeJson(databaseRuns),
        normalizeJson(filesystemRuns),
        `Run-list contract mismatch for workflow '${workflowId}'.`
      );

      comparedListRows +=
        filesystemRuns.length;
    }

    const counts =
      await client.query(
        `
          SELECT
            count(
              DISTINCT execution.id
            )::integer AS executions,
            count(
              DISTINCT node.id
            )::integer AS nodes,
            count(
              DISTINCT log.id
            )::integer AS logs,
            count(
              DISTINCT CASE
                WHEN execution.full_snapshot_json
                       #>> '{migration,selectionReason}'
                     = 'RECOVERED_RUN_PROVENANCE'
                THEN execution.id
              END
            )::integer AS recovered_links,
            count(
              DISTINCT CASE
                WHEN execution.full_snapshot_json
                       #>> '{migration,selectionReason}'
                     = 'CURRENT_EXACT_MATCH'
                THEN execution.id
              END
            )::integer AS current_links,
            count(
              DISTINCT CASE
                WHEN execution.full_snapshot_json
                       #>> '{migration,selectionReason}'
                     = 'HIGHEST_EXACT_MATCH'
                THEN execution.id
              END
            )::integer AS historical_links,
            count(
              DISTINCT CASE
                WHEN execution.retention_expires_at
                     IS NOT NULL
                THEN execution.id
              END
            )::integer AS expiring_imports
          FROM autoflow.workflow_execution execution
          LEFT JOIN autoflow.node_execution node
            ON node.execution_id =
               execution.id
          LEFT JOIN autoflow.execution_log log
            ON log.execution_id =
               execution.id
          WHERE execution.full_snapshot_json
                  #>> '{migration,batchId}'
                = $1
        `,
        [batchId]
      );

    const summary = counts.rows[0];

    assert.strictEqual(
      Number(summary.executions),
      106,
      'Expected exactly 106 migrated executions.'
    );
    assert.strictEqual(
      Number(summary.nodes),
      626,
      'Expected exactly 626 migrated node executions.'
    );
    assert.strictEqual(
      Number(summary.logs),
      0,
      'Expected zero legacy execution logs.'
    );
    assert.strictEqual(
      Number(summary.recovered_links),
      27,
      'Expected 27 recovered historical-version links.'
    );
    assert.strictEqual(
      Number(summary.current_links),
      79,
      'Expected 79 current-version links.'
    );
    assert.strictEqual(
      Number(summary.historical_links),
      0,
      'Expected zero fallback historical-version links.'
    );
    assert.strictEqual(
      Number(summary.expiring_imports),
      0,
      'Imported historical runs must not expire.'
    );

    console.log('');
    console.log(
      `Migration batch            : ${batchId}`
    );
    console.log(
      `Filesystem snapshots       : ${files.length}`
    );
    console.log(
      `Database executions        : ${summary.executions}`
    );
    console.log(
      `Snapshots compared         : ${comparedSnapshots}`
    );
    console.log(
      `Node records compared      : ${comparedNodes}`
    );
    console.log(
      `Workflow run lists compared: ${workflowIds.length}`
    );
    console.log(
      `List rows compared         : ${comparedListRows}`
    );
    console.log(
      `Recovered-version links    : ${summary.recovered_links}`
    );
    console.log(
      `Current-version links      : ${summary.current_links}`
    );
    console.log(
      `Other historical links     : ${summary.historical_links}`
    );
    console.log(
      `Expiring imported runs     : ${summary.expiring_imports}`
    );
    console.log(
      'Sanitized full snapshots   : PASS'
    );
    console.log(
      'Run-list response contract : PASS'
    );
    console.log(
      'Source SHA-256 parity      : PASS'
    );
    console.log(
      'Filesystem changes         : NONE'
    );
    console.log(
      'PostgreSQL changes         : NONE'
    );
    console.log('');
    console.log(
      'RESULT                     : EXECUTION API PARITY VERIFIED'
    );
  } finally {
    client.release();
  }
}

main()
  .catch((error) => {
    console.error('');
    console.error(
      'RESULT                     : EXECUTION API PARITY FAILED'
    );
    console.error(
      error.stack || error.message
    );
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
