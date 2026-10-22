'use strict';

require('dotenv').config();

const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');

const { pool, closePool } = require('../db/pool');

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

function normalizedString(value) {
  return typeof value === 'string'
    ? value.trim()
    : '';
}

function parseTime(value) {
  const parsed = new Date(value || 0).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function nodeSignature(nodeIds) {
  return [...new Set(nodeIds)]
    .sort()
    .join('|');
}

function displaySignature(signature) {
  return signature
    ? signature.split('|')
    : [];
}

function nodeRecordFingerprint(record) {
  return JSON.stringify({
    nodeId: normalizedString(record.nodeId),
    nodeName: normalizedString(record.nodeName),
    stepKey: normalizedString(record.stepKey),
    type: normalizedString(record.type),
    category: normalizedString(record.category),
  });
}

async function loadDatabaseModel(client, workspaceKey) {
  const workspaceResult = await client.query(
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
      `PostgreSQL workspace '${workspaceKey}' was not found.`
    );
  }

  const workspaceId = workspaceResult.rows[0].id;

  const rows = await client.query(
    `
      SELECT
        workflow.id AS workflow_id,
        workflow.workflow_key,
        workflow.name,
        workflow.current_version_number,
        version.id AS version_id,
        version.version_number,
        version.label,
        version.source_type,
        version.created_at,
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
        version.label,
        version.source_type,
        version.created_at
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
      versionNumber: Number(row.version_number),
      label: row.label,
      sourceType: row.source_type,
      createdAt: row.created_at,
      nodeKeys: row.node_keys || [],
    });
  }

  return {
    workspaceId,
    workflows,
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

  for (const workflowDirectory of workflowDirectories) {
    const directoryPath = path.join(
      runsRoot,
      workflowDirectory.name
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
      const snapshot = JSON.parse(
        await fsp.readFile(filePath, 'utf8')
      );

      snapshots.push({
        filePath,
        relativePath: path.relative(runsRoot, filePath),
        workflowDirectory: workflowDirectory.name,
        runId: snapshot.runId,
        startedAt: snapshot.startedAt,
        updatedAt: snapshot.updatedAt,
        finishedAt: snapshot.finishedAt,
        outputs: Array.isArray(snapshot.outputs)
          ? snapshot.outputs
          : [],
      });
    }
  }

  return snapshots;
}

function findExactVersion(workflow, nodeIds) {
  if (!workflow) return null;

  const matches = workflow.versions
    .filter((version) => {
      const keys = new Set(version.nodeKeys);
      return nodeIds.every((nodeId) =>
        keys.has(nodeId)
      );
    })
    .sort((left, right) => {
      const leftCurrent =
        left.versionNumber ===
        workflow.currentVersionNumber
          ? 1
          : 0;
      const rightCurrent =
        right.versionNumber ===
        workflow.currentVersionNumber
          ? 1
          : 0;

      return (
        rightCurrent - leftCurrent ||
        right.versionNumber - left.versionNumber
      );
    });

  return matches[0] || null;
}

function findBestBaseVersion(workflow, nodeIds) {
  if (!workflow || workflow.versions.length === 0) {
    return null;
  }

  return [...workflow.versions]
    .map((version) => {
      const keys = new Set(version.nodeKeys);
      const matched = nodeIds.filter((nodeId) =>
        keys.has(nodeId)
      );
      const missing = nodeIds.filter(
        (nodeId) => !keys.has(nodeId)
      );

      return {
        ...version,
        matchedNodeCount: matched.length,
        missingNodeKeys: missing,
      };
    })
    .sort(
      (left, right) =>
        right.matchedNodeCount -
          left.matchedNodeCount ||
        right.versionNumber -
          left.versionNumber
    )[0];
}

function collectMetadataConsistency(group) {
  const byNodeId = new Map();

  for (const run of group.runs) {
    for (const record of run.outputs) {
      const nodeId = normalizedString(record.nodeId);
      if (!nodeId) continue;

      if (!byNodeId.has(nodeId)) {
        byNodeId.set(nodeId, {
          nodeId,
          fingerprints: new Map(),
        });
      }

      const bucket = byNodeId.get(nodeId);
      const fingerprint =
        nodeRecordFingerprint(record);

      if (!bucket.fingerprints.has(fingerprint)) {
        bucket.fingerprints.set(fingerprint, {
          count: 0,
          record: {
            nodeId,
            nodeName:
              normalizedString(record.nodeName) ||
              nodeId,
            stepKey:
              normalizedString(record.stepKey) ||
              normalizedString(record.nodeName) ||
              nodeId,
            type:
              normalizedString(record.type) ||
              'legacy-execution-node',
            category:
              normalizedString(record.category) ||
              null,
          },
        });
      }

      bucket.fingerprints.get(fingerprint).count += 1;
    }
  }

  const conflicts = [];
  const canonicalRecords = [];

  for (const bucket of byNodeId.values()) {
    const variants = [
      ...bucket.fingerprints.values(),
    ].sort((left, right) =>
      right.count - left.count
    );

    canonicalRecords.push(variants[0].record);

    if (variants.length > 1) {
      conflicts.push({
        nodeId: bucket.nodeId,
        variants: variants.map((variant) => ({
          count: variant.count,
          ...variant.record,
        })),
      });
    }
  }

  return {
    canonicalRecords,
    conflicts,
  };
}

function availableHistoricalSlots(workflow) {
  const occupied = new Set(
    workflow.versions.map(
      (version) => version.versionNumber
    )
  );

  const slots = [];

  for (
    let version = 1;
    version < workflow.currentVersionNumber;
    version += 1
  ) {
    if (!occupied.has(version)) {
      slots.push(version);
    }
  }

  return slots;
}

function compactGroup(group) {
  return {
    workflowId: group.workflowId,
    workflowName: group.workflowName,
    signatureId: group.signatureId,
    runCount: group.runs.length,
    earliestRunAt: group.earliestRunAt,
    latestRunAt: group.latestRunAt,
    nodeCount: group.nodeIds.length,
    nodeIds: group.nodeIds,
    baseVersionNumber:
      group.baseVersion?.versionNumber || null,
    baseMatchedNodes:
      group.baseVersion?.matchedNodeCount || 0,
    missingNodeKeys:
      group.baseVersion?.missingNodeKeys ||
      group.nodeIds,
    plannedVersionNumber:
      group.plannedVersionNumber,
    metadataConflictCount:
      group.metadata.conflicts.length,
    metadataConflicts:
      group.metadata.conflicts,
    sampleRuns: group.runs
      .slice(0, 5)
      .map((run) => run.relativePath),
  };
}

async function main() {
  const backendDir = path.resolve(__dirname, '..');
  const workspaceRoot =
    resolveWorkspaceRoot(backendDir);
  const runsRoot = path.join(
    workspaceRoot,
    '.runs'
  );
  const workspaceKey =
    process.env.DB_WORKSPACE_KEY || 'default';

  console.log('============================================================');
  console.log(' AutoFlow Historical Version Recovery Plan - Step 6B.1 Fix');
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
    const snapshots = await readSnapshots(
      runsRoot
    );

    const blockedRuns = [];

    for (const snapshot of snapshots) {
      const workflow =
        database.workflows.get(
          snapshot.workflowDirectory
        );

      const nodeIds = [
        ...new Set(
          snapshot.outputs
            .map((record) =>
              normalizedString(record.nodeId)
            )
            .filter(Boolean)
        ),
      ];

      const exact = findExactVersion(
        workflow,
        nodeIds
      );

      if (!exact) {
        blockedRuns.push({
          ...snapshot,
          workflow,
          nodeIds,
          signature:
            nodeSignature(nodeIds),
        });
      }
    }

    const groupMap = new Map();

    for (const run of blockedRuns) {
      const key =
        `${run.workflowDirectory}::${run.signature}`;

      if (!groupMap.has(key)) {
        groupMap.set(key, {
          workflowId:
            run.workflowDirectory,
          workflowName:
            run.workflow?.name || null,
          signature:
            run.signature,
          nodeIds:
            displaySignature(run.signature),
          runs: [],
        });
      }

      groupMap.get(key).runs.push(run);
    }

    const groups = [...groupMap.values()];

    for (const group of groups) {
      const workflow =
        database.workflows.get(group.workflowId);

      group.baseVersion =
        findBestBaseVersion(
          workflow,
          group.nodeIds
        );

      group.metadata =
        collectMetadataConsistency(group);

      group.earliestRunAt =
        group.runs
          .map((run) =>
            run.startedAt ||
            run.updatedAt ||
            run.finishedAt
          )
          .sort(
            (left, right) =>
              parseTime(left) -
              parseTime(right)
          )[0] || null;

      group.latestRunAt =
        group.runs
          .map((run) =>
            run.updatedAt ||
            run.finishedAt ||
            run.startedAt
          )
          .sort(
            (left, right) =>
              parseTime(right) -
              parseTime(left)
          )[0] || null;

      group.signatureId =
        `${group.workflowId.slice(0, 8)}-${Buffer.from(
          group.signature
        )
          .toString('base64url')
          .slice(0, 12)}`;
    }

    const groupsByWorkflow = new Map();

    for (const group of groups) {
      if (!groupsByWorkflow.has(group.workflowId)) {
        groupsByWorkflow.set(
          group.workflowId,
          []
        );
      }

      groupsByWorkflow
        .get(group.workflowId)
        .push(group);
    }

    const workflowPlans = [];
    const blockers = [];

    for (
      const [workflowId, workflowGroups]
      of groupsByWorkflow.entries()
    ) {
      const workflow =
        database.workflows.get(workflowId);

      if (!workflow) {
        blockers.push({
          workflowId,
          reason:
            'Workflow does not exist in PostgreSQL.',
        });
        continue;
      }

      const orderedGroups = [
        ...workflowGroups,
      ].sort(
        (left, right) =>
          parseTime(left.earliestRunAt) -
            parseTime(right.earliestRunAt) ||
          left.signature.localeCompare(
            right.signature
          )
      );

      const slots =
        availableHistoricalSlots(workflow);

      if (
        slots.length <
        orderedGroups.length
      ) {
        blockers.push({
          workflowId,
          reason:
            `Needs ${orderedGroups.length} recovered historical versions but only ${slots.length} unused version number(s) exist below current version ${workflow.currentVersionNumber}.`,
        });
      }

      orderedGroups.forEach(
        (group, index) => {
          group.plannedVersionNumber =
            slots[index] ?? null;

          if (
            group.metadata.conflicts.length > 0
          ) {
            blockers.push({
              workflowId,
              signatureId:
                group.signatureId,
              reason:
                `${group.metadata.conflicts.length} node metadata conflict(s) must be resolved before recovery.`,
            });
          }

          if (!group.baseVersion) {
            blockers.push({
              workflowId,
              signatureId:
                group.signatureId,
              reason:
                'No existing workflow version is available as a recovery base.',
            });
          }
        }
      );

      workflowPlans.push({
        workflowId,
        workflowName: workflow.name,
        currentVersionNumber:
          workflow.currentVersionNumber,
        existingVersionNumbers:
          workflow.versions.map(
            (version) =>
              version.versionNumber
          ),
        availableHistoricalSlots: slots,
        requiredRecoveredVersions:
          orderedGroups.length,
        plannedRecoveredVersions:
          orderedGroups.map(
            compactGroup
          ),
      });
    }

    const affectedWorkflowCount =
      workflowPlans.length;
    const missingNodeIds = new Set();

    for (const group of groups) {
      for (
        const nodeId
        of group.baseVersion
          ?.missingNodeKeys ||
        group.nodeIds
      ) {
        missingNodeIds.add(
          `${group.workflowId}::${nodeId}`
        );
      }
    }

    const report = {
      formatVersion: 1,
      createdAt: new Date().toISOString(),
      workspaceKey,
      workspaceRoot,
      runsRoot,
      summary: {
        totalSnapshots:
          snapshots.length,
        blockedSnapshots:
          blockedRuns.length,
        affectedWorkflows:
          affectedWorkflowCount,
        uniqueExecutionSignatures:
          groups.length,
        uniqueMissingWorkflowNodes:
          missingNodeIds.size,
        planningBlockers:
          blockers.length,
      },
      blockers,
      workflows: workflowPlans,
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
      `historical-version-recovery-plan-${safeTimestamp()}.json`
    );

    await fsp.writeFile(
      reportPath,
      JSON.stringify(
        report,
        null,
        2
      ),
      'utf8'
    );

    console.log('');
    console.log(
      `Total snapshots            : ${snapshots.length}`
    );
    console.log(
      `Blocked historical runs    : ${blockedRuns.length}`
    );
    console.log(
      `Affected workflows         : ${affectedWorkflowCount}`
    );
    console.log(
      `Unique node signatures     : ${groups.length}`
    );
    console.log(
      `Unique missing nodes       : ${missingNodeIds.size}`
    );
    console.log(
      `Planning blockers          : ${blockers.length}`
    );
    console.log(
      `Recovery plan              : ${reportPath}`
    );

    for (const workflow of workflowPlans) {
      console.log('');
      console.log(
        `Workflow                   : ${workflow.workflowName || '(unnamed)'} (${workflow.workflowId})`
      );
      console.log(
        `Current version            : ${workflow.currentVersionNumber}`
      );
      console.log(
        `Existing versions          : ${workflow.existingVersionNumbers.join(', ')}`
      );
      console.log(
        `Unused historical slots    : ${workflow.availableHistoricalSlots.length}`
      );
      console.log(
        `Recovered versions needed  : ${workflow.requiredRecoveredVersions}`
      );

      workflow.plannedRecoveredVersions.forEach(
        (group, index) => {
          console.log('');
          console.log(
            `  Group ${index + 1}`
          );
          console.log(
            `  Runs                  : ${group.runCount}`
          );
          console.log(
            `  Executed nodes        : ${group.nodeCount}`
          );
          console.log(
            `  Base version          : ${group.baseVersionNumber}`
          );
          console.log(
            `  Base node match       : ${group.baseMatchedNodes}/${group.nodeCount}`
          );
          console.log(
            `  Missing node IDs      : ${group.missingNodeKeys.join(', ')}`
          );
          console.log(
            `  Planned version       : ${group.plannedVersionNumber}`
          );
          console.log(
            `  Metadata conflicts    : ${group.metadataConflictCount}`
          );
        }
      );
    }

    if (blockers.length > 0) {
      console.log('');
      console.log('Planning blockers');
      console.log('-----------------');

      blockers.forEach(
        (blocker, index) => {
          console.log('');
          console.log(
            `  #${index + 1} ${blocker.workflowId}`
          );
          console.log(
            `  Reason               : ${blocker.reason}`
          );
        }
      );
    }

    console.log('');
    console.log(
      'Filesystem changes         : NONE'
    );
    console.log(
      'PostgreSQL changes         : NONE'
    );

    if (blockers.length > 0) {
      console.log(
        'RESULT                     : HISTORICAL VERSION RECOVERY PLAN BLOCKED'
      );
      process.exitCode = 1;
      return;
    }

    console.log(
      'RESULT                     : HISTORICAL VERSION RECOVERY PLAN READY'
    );
  } finally {
    client.release();
  }
}

main()
  .catch((error) => {
    console.error('');
    console.error(
      'RESULT                     : HISTORICAL VERSION RECOVERY PLAN FAILED'
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
