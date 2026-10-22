'use strict';

require('dotenv').config();

const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const crypto = require('crypto');

const { pool, closePool } = require('../db/pool');
const {
  upsertExecutionSnapshot,
} = require('../db/executionRepository');

const MIGRATION_SOURCE = 'filesystem-runs-v1';

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

function parseArguments(argv) {
  return {
    apply: argv.includes('--apply'),
  };
}

function sha256(value) {
  return crypto
    .createHash('sha256')
    .update(value)
    .digest('hex');
}

function safeTimestamp() {
  return new Date()
    .toISOString()
    .replace(/[:.]/g, '-');
}

function normalizedString(value) {
  return typeof value === 'string'
    ? value.trim()
    : '';
}

async function readRunFiles(runsRoot) {
  const files = [];

  if (!fs.existsSync(runsRoot)) {
    return files;
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
        workflowDirectory: directory.name,
        expectedRunId: path.basename(
          entry.name,
          '.json'
        ),
        sourceSha256: sha256(content),
        sizeBytes: content.length,
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

function validateFiles(files) {
  const blockers = [];
  const identity = new Set();

  for (const file of files) {
    const snapshot = file.snapshot;

    if (
      snapshot.workflowId !==
      file.workflowDirectory
    ) {
      blockers.push(
        `${file.relativePath}: workflowId does not match its directory.`
      );
    }

    if (
      snapshot.runId !==
      file.expectedRunId
    ) {
      blockers.push(
        `${file.relativePath}: runId does not match its filename.`
      );
    }

    if (!Array.isArray(snapshot.outputs)) {
      blockers.push(
        `${file.relativePath}: outputs is not an array.`
      );
    }

    const key =
      `${snapshot.workflowId}::${snapshot.runId}`;

    if (identity.has(key)) {
      blockers.push(
        `${file.relativePath}: duplicate workflowId/runId identity.`
      );
    }

    identity.add(key);
  }

  return blockers;
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

async function loadVersionModel(
  client,
  workspaceKey
) {
  const workspaceResult =
    await client.query(
      `
        SELECT id
        FROM autoflow.workspace
        WHERE workspace_key = $1
          AND deleted_at IS NULL
        LIMIT 1
      `,
      [workspaceKey]
    );

  if (workspaceResult.rowCount !== 1) {
    throw new Error(
      `Workspace '${workspaceKey}' was not found.`
    );
  }

  const workspaceId =
    workspaceResult.rows[0].id;

  const rows = await client.query(
    `
      SELECT
        workflow.id AS workflow_id,
        workflow.workflow_key,
        workflow.name,
        workflow.current_version_number,
        version.id AS version_id,
        version.version_number,
        version.source_type,
        version.definition_json
          #> '{metadata,runIds}'
            AS recovery_run_ids,
        version.definition_json
          #>> '{metadata,recoveryBatchId}'
            AS recovery_batch_id,
        COALESCE(
          array_agg(
            node.node_key
            ORDER BY node.node_key
          ) FILTER (
            WHERE node.node_key IS NOT NULL
          ),
          ARRAY[]::varchar[]
        ) AS node_keys
      FROM autoflow.workflow workflow
      JOIN autoflow.workflow_version version
        ON version.workspace_id =
           workflow.workspace_id
       AND version.workflow_id =
           workflow.id
      LEFT JOIN autoflow.workflow_node node
        ON node.workspace_id =
           version.workspace_id
       AND node.workflow_id =
           version.workflow_id
       AND node.workflow_version_id =
           version.id
      WHERE workflow.workspace_id = $1
        AND workflow.deleted_at IS NULL
      GROUP BY
        workflow.id,
        workflow.workflow_key,
        workflow.name,
        workflow.current_version_number,
        version.id,
        version.version_number,
        version.source_type,
        recovery_run_ids,
        recovery_batch_id
      ORDER BY
        workflow.workflow_key,
        version.version_number
    `,
    [workspaceId]
  );

  const workflows = new Map();

  for (const row of rows.rows) {
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
      versionNumber:
        Number(row.version_number),
      sourceType: row.source_type,
      nodeKeys: row.node_keys || [],
      recoveryRunIds:
        Array.isArray(row.recovery_run_ids)
          ? row.recovery_run_ids
          : [],
      recoveryBatchId:
        row.recovery_batch_id || null,
    });
  }

  return {
    workspaceId,
    workflows,
  };
}

function selectVersion(
  workflow,
  snapshot
) {
  if (!workflow) {
    return {
      selected: null,
      reason: 'WORKFLOW_NOT_FOUND',
      candidates: [],
    };
  }

  const nodeIds = [
    ...new Set(
      snapshot.outputs
        .map((record) =>
          normalizedString(record.nodeId)
        )
        .filter(Boolean)
    ),
  ];

  const exact = workflow.versions.filter(
    (version) => {
      const keys =
        new Set(version.nodeKeys);

      return nodeIds.every((nodeId) =>
        keys.has(nodeId)
      );
    }
  );

  const provenanceMatches =
    exact.filter((version) =>
      version.recoveryRunIds.includes(
        snapshot.runId
      )
    );

  if (provenanceMatches.length > 1) {
    return {
      selected: null,
      reason:
        'MULTIPLE_RECOVERY_PROVENANCE_MATCHES',
      candidates:
        provenanceMatches,
    };
  }

  if (provenanceMatches.length === 1) {
    return {
      selected:
        provenanceMatches[0],
      reason:
        'RECOVERED_RUN_PROVENANCE',
      candidates: exact,
    };
  }

  const current = exact.find(
    (version) =>
      version.versionNumber ===
      workflow.currentVersionNumber
  );

  if (current) {
    return {
      selected: current,
      reason:
        'CURRENT_EXACT_MATCH',
      candidates: exact,
    };
  }

  const highest = [...exact].sort(
    (left, right) =>
      right.versionNumber -
      left.versionNumber
  )[0];

  if (highest) {
    return {
      selected: highest,
      reason:
        'HIGHEST_EXACT_MATCH',
      candidates: exact,
    };
  }

  return {
    selected: null,
    reason:
      'NO_EXACT_VERSION_MATCH',
    candidates: [],
  };
}

function planMigration(
  files,
  versionModel
) {
  const blockers = [];
  const plan = [];

  for (const file of files) {
    const workflow =
      versionModel.workflows.get(
        file.snapshot.workflowId
      );
    const selection =
      selectVersion(
        workflow,
        file.snapshot
      );

    if (!selection.selected) {
      blockers.push({
        relativePath:
          file.relativePath,
        workflowId:
          file.snapshot.workflowId,
        runId:
          file.snapshot.runId,
        reason:
          selection.reason,
      });
      continue;
    }

    plan.push({
      ...file,
      workflow,
      selectedVersion:
        selection.selected,
      selectionReason:
        selection.reason,
      candidateVersionNumbers:
        selection.candidates.map(
          (version) =>
            version.versionNumber
        ),
    });
  }

  return {
    blockers,
    plan,
  };
}

function cloneForMigration(
  item,
  batchId
) {
  return {
    ...item.snapshot,
    migration: {
      source:
        MIGRATION_SOURCE,
      batchId,
      sourceFile:
        item.relativePath,
      sourceSha256:
        item.sourceSha256,
      selectedVersionId:
        item.selectedVersion.versionId,
      selectedVersionNumber:
        item.selectedVersion.versionNumber,
      selectionReason:
        item.selectionReason,
    },
  };
}

async function countBatch(
  client,
  batchId
) {
  const result = await client.query(
    `
      SELECT
        count(DISTINCT execution.id)::integer
          AS executions,
        count(
          DISTINCT node.id
        )::integer AS nodes,
        count(
          DISTINCT log.id
        )::integer AS logs,
        count(
          DISTINCT output_index.id
        )::integer AS output_index_rows,
        count(
          DISTINCT artifact.id
        )::integer AS artifacts
      FROM autoflow.workflow_execution execution
      LEFT JOIN autoflow.node_execution node
        ON node.execution_id =
           execution.id
      LEFT JOIN autoflow.execution_log log
        ON log.execution_id =
           execution.id
      LEFT JOIN autoflow.execution_output_index output_index
        ON output_index.execution_id =
           execution.id
      LEFT JOIN autoflow.execution_artifact artifact
        ON artifact.execution_id =
           execution.id
      WHERE execution.full_snapshot_json
              #>> '{migration,batchId}'
            = $1
    `,
    [batchId]
  );

  return result.rows[0];
}

async function verifyMigration(
  client,
  workspaceId,
  plan,
  batchId,
  expectedNodeCount,
  expectedLogCount
) {
  const batchCounts =
    await countBatch(
      client,
      batchId
    );

  if (
    Number(batchCounts.executions) !==
    plan.length
  ) {
    throw new Error(
      `Expected ${plan.length} migrated executions, found ${batchCounts.executions}.`
    );
  }

  if (
    Number(batchCounts.nodes) !==
    expectedNodeCount
  ) {
    throw new Error(
      `Expected ${expectedNodeCount} migrated node executions, found ${batchCounts.nodes}.`
    );
  }

  if (
    Number(batchCounts.logs) !==
    expectedLogCount
  ) {
    throw new Error(
      `Expected ${expectedLogCount} migrated logs, found ${batchCounts.logs}.`
    );
  }

  for (const item of plan) {
    const result = await client.query(
      `
        SELECT
          execution.id,
          execution.workflow_version_id,
          execution.status,
          execution.full_snapshot_json
            #>> '{migration,batchId}'
              AS batch_id,
          execution.full_snapshot_json
            #>> '{migration,sourceSha256}'
              AS source_sha256,
          COALESCE(
            array_agg(
              node.node_key
              ORDER BY node.node_key
            ) FILTER (
              WHERE node.node_key IS NOT NULL
                AND node.is_final_attempt = true
            ),
            ARRAY[]::varchar[]
          ) AS node_keys
        FROM autoflow.workflow_execution execution
        LEFT JOIN autoflow.node_execution node
          ON node.execution_id =
             execution.id
        WHERE execution.workspace_id = $1
          AND execution.workflow_id = $2
          AND execution.execution_key = $3
          AND execution.deleted_at IS NULL
        GROUP BY
          execution.id,
          execution.workflow_version_id,
          execution.status,
          batch_id,
          source_sha256
      `,
      [
        workspaceId,
        item.workflow.workflowId,
        item.snapshot.runId,
      ]
    );

    if (result.rowCount !== 1) {
      throw new Error(
        `Migrated execution '${item.snapshot.runId}' was not found.`
      );
    }

    const row = result.rows[0];

    if (
      String(row.workflow_version_id) !==
      String(
        item.selectedVersion.versionId
      )
    ) {
      throw new Error(
        `Execution '${item.snapshot.runId}' linked to the wrong workflow version.`
      );
    }

    if (row.batch_id !== batchId) {
      throw new Error(
        `Execution '${item.snapshot.runId}' has incorrect migration provenance.`
      );
    }

    if (
      row.source_sha256 !==
      item.sourceSha256
    ) {
      throw new Error(
        `Execution '${item.snapshot.runId}' source hash mismatch.`
      );
    }

    const expectedNodeKeys = [
      ...new Set(
        item.snapshot.outputs.map(
          (record) =>
            normalizedString(
              record.nodeId
            )
        )
      ),
    ]
      .filter(Boolean)
      .sort();

    const actualNodeKeys =
      [...row.node_keys].sort();

    if (
      JSON.stringify(
        expectedNodeKeys
      ) !==
      JSON.stringify(
        actualNodeKeys
      )
    ) {
      throw new Error(
        `Execution '${item.snapshot.runId}' node signature mismatch.`
      );
    }
  }

  return batchCounts;
}

async function verifySourceFiles(
  plan
) {
  for (const item of plan) {
    const current =
      await fsp.readFile(
        item.filePath
      );

    if (
      sha256(current) !==
      item.sourceSha256
    ) {
      throw new Error(
        `Source run file changed during migration: ${item.relativePath}`
      );
    }
  }
}

async function main() {
  const args =
    parseArguments(
      process.argv.slice(2)
    );
  const backendDir =
    path.resolve(__dirname, '..');
  const workspaceRoot =
    resolveWorkspaceRoot(
      backendDir
    );
  const runsRoot =
    path.join(
      workspaceRoot,
      '.runs'
    );
  const workspaceKey =
    process.env.DB_WORKSPACE_KEY ||
    'default';

  console.log('============================================================');
  console.log(' AutoFlow Execution History Migration - Step 6B.2');
  console.log('============================================================');
  console.log(
    `Mode                       : ${args.apply ? 'APPLY' : 'DRY RUN / ROLLBACK'}`
  );
  console.log(
    `Workspace key              : ${workspaceKey}`
  );
  console.log(
    `Runs directory             : ${runsRoot}`
  );

  const files =
    await readRunFiles(
      runsRoot
    );
  const fileBlockers =
    validateFiles(files);
  const batchId =
    buildBatchId(files);

  const client =
    await pool.connect();

  try {
    const versionModel =
      await loadVersionModel(
        client,
        workspaceKey
      );
    const migration =
      planMigration(
        files,
        versionModel
      );

    const blockers = [
      ...fileBlockers.map(
        (reason) => ({
          reason,
        })
      ),
      ...migration.blockers,
    ];

    const expectedNodeCount =
      migration.plan.reduce(
        (sum, item) =>
          sum +
          item.snapshot.outputs.length,
        0
      );

    const expectedLogCount =
      migration.plan.reduce(
        (sum, item) =>
          sum +
          (
            Array.isArray(
              item.snapshot.logs
            )
              ? item.snapshot.logs.length
              : 0
          ),
        0
      );

    const recoveredSelections =
      migration.plan.filter(
        (item) =>
          item.selectionReason ===
          'RECOVERED_RUN_PROVENANCE'
      ).length;

    const currentSelections =
      migration.plan.filter(
        (item) =>
          item.selectionReason ===
          'CURRENT_EXACT_MATCH'
      ).length;

    const historicalSelections =
      migration.plan.filter(
        (item) =>
          item.selectionReason ===
          'HIGHEST_EXACT_MATCH'
      ).length;

    console.log('');
    console.log(
      `Migration batch            : ${batchId}`
    );
    console.log(
      `Snapshot files             : ${files.length}`
    );
    console.log(
      `Executions planned         : ${migration.plan.length}`
    );
    console.log(
      `Node executions planned    : ${expectedNodeCount}`
    );
    console.log(
      `Execution logs planned     : ${expectedLogCount}`
    );
    console.log(
      `Recovered-version links    : ${recoveredSelections}`
    );
    console.log(
      `Current-version links      : ${currentSelections}`
    );
    console.log(
      `Other historical links     : ${historicalSelections}`
    );
    console.log(
      `Migration blockers         : ${blockers.length}`
    );

    if (blockers.length > 0) {
      console.log('');
      blockers.forEach(
        (blocker, index) => {
          console.log(
            `  #${index + 1} ${blocker.relativePath || ''}`
          );
          console.log(
            `  Blocker              : ${blocker.reason}`
          );
        }
      );

      console.log('');
      console.log(
        'Filesystem changes         : NONE'
      );
      console.log(
        'PostgreSQL changes         : NONE'
      );
      console.log(
        'RESULT                     : EXECUTION HISTORY MIGRATION BLOCKED'
      );
      process.exitCode = 1;
      return;
    }

    await client.query('BEGIN');

    try {
      await client.query(
        `
          SELECT pg_advisory_xact_lock(
            hashtext(
              'autoflow-execution-history-migration-v1'
            )
          )
        `
      );

      for (
        const [index, item]
        of migration.plan.entries()
      ) {
        const snapshot =
          cloneForMigration(
            item,
            batchId
          );

        await upsertExecutionSnapshot(
          item.snapshot.workflowId,
          snapshot,
          {
            client,
            workspaceKey,
            workflowVersionId:
              item.selectedVersion.versionId,
            retentionDays: 0,
          }
        );

        if (
          (index + 1) % 20 === 0 ||
          index + 1 ===
            migration.plan.length
        ) {
          console.log(
            `Progress                   : ${index + 1}/${migration.plan.length}`
          );
        }
      }

      const verifiedCounts =
        await verifyMigration(
          client,
          versionModel.workspaceId,
          migration.plan,
          batchId,
          expectedNodeCount,
          expectedLogCount
        );

      await verifySourceFiles(
        migration.plan
      );

      if (args.apply) {
        await client.query(
          'COMMIT'
        );
      } else {
        await client.query(
          'ROLLBACK'
        );
      }

      console.log('');
      console.log(
        `Executions verified        : ${verifiedCounts.executions}`
      );
      console.log(
        `Node executions verified   : ${verifiedCounts.nodes}`
      );
      console.log(
        `Execution logs verified    : ${verifiedCounts.logs}`
      );
      console.log(
        'Workflow-version linkage   : PASS'
      );
      console.log(
        'Execution node signatures  : PASS'
      );
      console.log(
        'Migration provenance       : PASS'
      );
      console.log(
        'Source file hashes         : PASS'
      );
      console.log(
        `Database transaction       : ${args.apply ? 'COMMITTED' : 'ROLLED BACK'}`
      );
      console.log(
        'Filesystem run changes     : NONE'
      );

      if (!args.apply) {
        console.log('');
        console.log(
          'RESULT                     : EXECUTION HISTORY MIGRATION DRY RUN PASSED'
        );
        return;
      }

      const manifestDirectory =
        path.join(
          backendDir,
          'migration_backups',
          batchId
        );

      await fsp.mkdir(
        manifestDirectory,
        {
          recursive: true,
        }
      );

      const manifestPath =
        path.join(
          manifestDirectory,
          'execution-history-migration-manifest.json'
        );

      await fsp.writeFile(
        manifestPath,
        JSON.stringify(
          {
            formatVersion: 1,
            createdAt:
              new Date().toISOString(),
            batchId,
            source:
              MIGRATION_SOURCE,
            workspaceKey,
            workspaceRoot,
            runsRoot,
            summary: {
              executions:
                migration.plan.length,
              nodeExecutions:
                expectedNodeCount,
              executionLogs:
                expectedLogCount,
              recoveredVersionLinks:
                recoveredSelections,
              currentVersionLinks:
                currentSelections,
              historicalVersionLinks:
                historicalSelections,
            },
            executions:
              migration.plan.map(
                (item) => ({
                  workflowId:
                    item.snapshot.workflowId,
                  runId:
                    item.snapshot.runId,
                  sourceFile:
                    item.relativePath,
                  sourceSha256:
                    item.sourceSha256,
                  selectedVersionId:
                    item.selectedVersion.versionId,
                  selectedVersionNumber:
                    item.selectedVersion.versionNumber,
                  selectionReason:
                    item.selectionReason,
                })
              ),
            rollbackCommand:
              `node scripts\\rollbackExecutionHistoryMigration.js --apply --batch-id "${batchId}"`,
          },
          null,
          2
        ),
        'utf8'
      );

      console.log(
        `Manifest                   : ${manifestPath}`
      );
      console.log('');
      console.log(
        'RESULT                     : EXECUTION HISTORY MIGRATED'
      );
    } catch (error) {
      try {
        await client.query(
          'ROLLBACK'
        );
      } catch {
        // Preserve original error.
      }

      throw error;
    }
  } finally {
    client.release();
  }
}

main()
  .catch((error) => {
    console.error('');
    console.error(
      'RESULT                     : EXECUTION HISTORY MIGRATION FAILED'
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
