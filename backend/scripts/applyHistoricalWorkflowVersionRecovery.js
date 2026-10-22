'use strict';

require('dotenv').config();

const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const crypto = require('crypto');

const { pool, closePool } = require('../db/pool');

const RECOVERY_TOOL = 'step6b1-fix2';
const RECOVERY_SOURCE = 'legacy-run-snapshots';

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

function isControlNode(type) {
  return (
    type === 'workflow-start' ||
    type === 'workflow-end' ||
    type.startsWith('workflow-control')
  );
}

function modeValue(values, fallback = null) {
  const counts = new Map();

  for (const value of values) {
    const key = JSON.stringify(value);
    const existing = counts.get(key) || {
      value,
      count: 0,
    };
    existing.count += 1;
    counts.set(key, existing);
  }

  const ordered = [...counts.values()].sort(
    (left, right) =>
      right.count - left.count ||
      String(left.value).localeCompare(
        String(right.value)
      )
  );

  return ordered[0]?.value ?? fallback;
}

function validateLength(value, maximum, label, blockers) {
  if (value && value.length > maximum) {
    blockers.push(
      `${label} exceeds ${maximum} characters (${value.length}).`
    );
  }
}

function canonicalNodesForGroup(group) {
  const buckets = new Map();

  for (const run of group.runs) {
    for (const record of run.outputs) {
      const nodeId = normalizedString(record.nodeId);
      if (!nodeId) continue;

      if (!buckets.has(nodeId)) {
        buckets.set(nodeId, []);
      }

      buckets.get(nodeId).push(record);
    }
  }

  const nodes = [];

  for (const [nodeId, records] of buckets.entries()) {
    const name = modeValue(
      records.map((record) =>
        normalizedString(record.nodeName)
      ).filter(Boolean),
      nodeId
    );

    const stepKey = modeValue(
      records.map((record) =>
        normalizedString(record.stepKey)
      ).filter(Boolean),
      name
    );

    const type = modeValue(
      records.map((record) =>
        normalizedString(record.type)
      ).filter(Boolean),
      'legacy-execution-node'
    );

    const category = modeValue(
      records.map((record) =>
        normalizedString(record.category)
      ).filter(Boolean),
      null
    );

    const sequence = modeValue(
      records
        .map((record) => Number(record.sequence))
        .filter(
          (value) =>
            Number.isInteger(value) &&
            value >= 1
        ),
      1
    );

    nodes.push({
      nodeId,
      name,
      stepKey,
      type,
      category,
      sequence,
    });
  }

  return nodes.sort(
    (left, right) =>
      left.sequence - right.sequence ||
      left.nodeId.localeCompare(right.nodeId)
  );
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
        relativePath: path.relative(
          runsRoot,
          filePath
        ),
        workflowDirectory:
          workflowDirectory.name,
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

async function loadDatabaseModel(
  client,
  workspaceKey
) {
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

  const workspaceId =
    workspaceResult.rows[0].id;

  const rows = await client.query(
    `
      SELECT
        workflow.id AS workflow_id,
        workflow.workflow_key,
        workflow.name,
        workflow.description,
        workflow.current_version_number,
        workflow.updated_at,
        workflow.row_version,
        version.id AS version_id,
        version.version_number,
        version.source_type,
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
        workflow.description,
        workflow.current_version_number,
        workflow.updated_at,
        workflow.row_version,
        version.id,
        version.version_number,
        version.source_type
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
        description: row.description,
        currentVersionNumber:
          Number(row.current_version_number),
        originalUpdatedAt: row.updated_at,
        originalRowVersion:
          Number(row.row_version),
        versions: [],
      });
    }

    workflows.get(row.workflow_key).versions.push({
      versionId: row.version_id,
      versionNumber:
        Number(row.version_number),
      sourceType: row.source_type,
      nodeKeys: row.node_keys || [],
    });
  }

  return {
    workspaceId,
    workflows,
  };
}

function findExactVersion(
  workflow,
  nodeIds
) {
  if (!workflow) return null;

  const matches = workflow.versions
    .filter((version) => {
      const keySet =
        new Set(version.nodeKeys);

      return nodeIds.every((nodeId) =>
        keySet.has(nodeId)
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
        right.versionNumber -
          left.versionNumber
      );
    });

  return matches[0] || null;
}

function availableHistoricalSlots(workflow) {
  const occupied = new Set(
    workflow.versions.map(
      (version) =>
        version.versionNumber
    )
  );

  const slots = [];

  for (
    let number = 1;
    number < workflow.currentVersionNumber;
    number += 1
  ) {
    if (!occupied.has(number)) {
      slots.push(number);
    }
  }

  return slots;
}

function buildRecoveryPlan(
  snapshots,
  database
) {
  const blockers = [];
  const blockedRuns = [];

  for (const snapshot of snapshots) {
    const workflow =
      database.workflows.get(
        snapshot.workflowDirectory
      );

    if (!workflow) {
      blockers.push(
        `Workflow '${snapshot.workflowDirectory}' does not exist in PostgreSQL.`
      );
      continue;
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

    if (nodeIds.length === 0) {
      continue;
    }

    if (
      !findExactVersion(
        workflow,
        nodeIds
      )
    ) {
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
        workflow:
          run.workflow,
        workflowKey:
          run.workflowDirectory,
        signature:
          run.signature,
        nodeIds:
          run.nodeIds.slice().sort(),
        runs: [],
      });
    }

    groupMap.get(key).runs.push(run);
  }

  const groupsByWorkflow = new Map();

  for (const group of groupMap.values()) {
    if (
      !groupsByWorkflow.has(
        group.workflowKey
      )
    ) {
      groupsByWorkflow.set(
        group.workflowKey,
        []
      );
    }

    groupsByWorkflow
      .get(group.workflowKey)
      .push(group);
  }

  const plannedGroups = [];

  for (
    const [workflowKey, groups]
    of groupsByWorkflow.entries()
  ) {
    const workflow =
      database.workflows.get(workflowKey);
    const slots =
      availableHistoricalSlots(workflow);

    const ordered = [...groups].sort(
      (left, right) => {
        const leftTime = Math.min(
          ...left.runs.map((run) =>
            parseTime(
              run.startedAt ||
              run.updatedAt ||
              run.finishedAt
            )
          )
        );

        const rightTime = Math.min(
          ...right.runs.map((run) =>
            parseTime(
              run.startedAt ||
              run.updatedAt ||
              run.finishedAt
            )
          )
        );

        return (
          leftTime - rightTime ||
          left.signature.localeCompare(
            right.signature
          )
        );
      }
    );

    if (slots.length < ordered.length) {
      blockers.push(
        `Workflow '${workflowKey}' needs ${ordered.length} recovered versions but only ${slots.length} historical version slots are available.`
      );
      continue;
    }

    ordered.forEach((group, index) => {
      const canonicalNodes =
        canonicalNodesForGroup(group);

      if (
        canonicalNodes.length !==
        group.nodeIds.length
      ) {
        blockers.push(
          `Workflow '${workflowKey}' signature could not produce one canonical node definition per node ID.`
        );
      }

      for (const node of canonicalNodes) {
        validateLength(
          node.nodeId,
          200,
          `nodeId '${node.nodeId}'`,
          blockers
        );
        validateLength(
          node.type,
          150,
          `node type for '${node.nodeId}'`,
          blockers
        );
        validateLength(
          node.category,
          150,
          `node category for '${node.nodeId}'`,
          blockers
        );
        validateLength(
          node.name,
          300,
          `node name for '${node.nodeId}'`,
          blockers
        );
      }

      const earliestRunAt =
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
          )[0] ||
        new Date().toISOString();

      plannedGroups.push({
        ...group,
        canonicalNodes,
        plannedVersionNumber:
          slots[index],
        earliestRunAt,
      });
    });
  }

  return {
    blockers,
    blockedRuns,
    plannedGroups,
  };
}

function buildDefinition(
  group,
  batchId
) {
  const actions =
    group.canonicalNodes.map(
      (node, index) => {
        const x =
          200 + index * 180;
        const y = 240;

        return {
          id: node.nodeId,
          name: node.name,
          type: node.type,
          category:
            node.category || undefined,
          status: 'idle',
          x,
          y,
          properties: {},
          description:
            'Recovered from a legacy execution snapshot for historical execution lineage.',
          isControlNode:
            isControlNode(node.type),
          recovery: {
            source:
              RECOVERY_SOURCE,
            tool:
              RECOVERY_TOOL,
            batchId,
            observedStepKey:
              node.stepKey,
            observedSequence:
              node.sequence,
            executionObservedOnly:
              true,
          },
        };
      }
    );

  return {
    id: group.workflowKey,
    name: group.workflow.name,
    description:
      group.workflow.description || '',
    version:
      group.plannedVersionNumber,
    actions,
    connections: [],
    variables: [],
    schedule: null,
    triggers: [],
    metadata: {
      recoveredHistoricalExecutionVersion:
        true,
      executionObservedOnly:
        true,
      editable:
        false,
      source:
        RECOVERY_SOURCE,
      recoveryTool:
        RECOVERY_TOOL,
      recoveryBatchId:
        batchId,
      recoveredAt:
        new Date().toISOString(),
      workflowKey:
        group.workflowKey,
      nodeSignature:
        group.signature,
      runIds:
        group.runs
          .map((run) => run.runId)
          .sort(),
      sourceFiles:
        group.runs
          .map((run) =>
            run.relativePath
          )
          .sort(),
      limitations: [
        'Only execution-observed node identity and display metadata were recoverable.',
        'Original historical node properties, connections, variables, schedules and triggers were not present in run snapshots.',
        'This version exists only to preserve execution lineage and foreign-key integrity.',
      ],
    },
  };
}

async function verifySyncTrigger(client) {
  const result = await client.query(
    `
      SELECT
        trigger.tgenabled
      FROM pg_trigger trigger
      JOIN pg_class relation
        ON relation.oid =
           trigger.tgrelid
      JOIN pg_namespace namespace
        ON namespace.oid =
           relation.relnamespace
      WHERE namespace.nspname =
            'autoflow'
        AND relation.relname =
            'workflow_version'
        AND trigger.tgname =
            'trg_workflow_version_sync_current'
        AND trigger.tgisinternal =
            false
      LIMIT 1
    `
  );

  if (result.rowCount !== 1) {
    throw new Error(
      'Expected trigger autoflow.trg_workflow_version_sync_current was not found.'
    );
  }

  if (result.rows[0].tgenabled !== 'O') {
    throw new Error(
      `Workflow-version sync trigger is not normally enabled (state=${result.rows[0].tgenabled}).`
    );
  }
}

async function insertRecoveredVersion(
  client,
  workspaceId,
  group,
  batchId
) {
  const definition =
    buildDefinition(group, batchId);

  const versionResult =
    await client.query(
      `
        INSERT INTO autoflow.workflow_version (
          workspace_id,
          workflow_id,
          version_number,
          version_label,
          label,
          description,
          source_type,
          definition_schema_version,
          definition_json,
          definition_sha256,
          is_published,
          created_by,
          created_at
        )
        VALUES (
          $1,$2,$3,$4,$5,$6,
          'MIGRATION',
          1,
          $7::jsonb,
          repeat('0', 64),
          false,
          $8,
          $9::timestamptz
        )
        RETURNING
          id,
          version_number,
          definition_sha256,
          action_count
      `,
      [
        workspaceId,
        group.workflow.workflowId,
        group.plannedVersionNumber,
        `legacy-run-v${group.plannedVersionNumber}`,
        `${group.workflow.name} - recovered execution topology`,
        'Immutable execution-observed historical version recovered from legacy .runs snapshots.',
        JSON.stringify(definition),
        RECOVERY_TOOL,
        group.earliestRunAt,
      ]
    );

  const version =
    versionResult.rows[0];

  for (
    const [index, node]
    of group.canonicalNodes.entries()
  ) {
    const x =
      200 + index * 180;
    const y = 240;

    const nodeJson = {
      id: node.nodeId,
      name: node.name,
      type: node.type,
      category:
        node.category || undefined,
      status: 'idle',
      x,
      y,
      properties: {},
      description:
        'Recovered from a legacy execution snapshot for historical execution lineage.',
      isControlNode:
        isControlNode(node.type),
      recovery: {
        source:
          RECOVERY_SOURCE,
        tool:
          RECOVERY_TOOL,
        batchId,
        observedStepKey:
          node.stepKey,
        observedSequence:
          node.sequence,
        executionObservedOnly:
          true,
      },
    };

    await client.query(
      `
        INSERT INTO autoflow.workflow_node (
          workspace_id,
          workflow_id,
          workflow_version_id,
          node_key,
          node_type,
          category,
          plugin_id,
          action_id,
          name,
          description,
          position_x,
          position_y,
          sequence_hint,
          is_control_node,
          is_disabled,
          properties_json,
          api_json,
          property_config_json,
          input_mapping_json,
          output_mapping_json,
          execution_policy_json,
          node_json,
          created_at
        )
        VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
          $11,$12,$13,$14,false,
          '{}'::jsonb,
          '{}'::jsonb,
          '{}'::jsonb,
          '{}'::jsonb,
          '{}'::jsonb,
          $15::jsonb,
          $16::jsonb,
          $17::timestamptz
        )
      `,
      [
        workspaceId,
        group.workflow.workflowId,
        version.id,
        node.nodeId,
        node.type,
        node.category,
        node.category || null,
        node.type || null,
        node.name,
        'Execution-observed historical node recovered for immutable run lineage.',
        x,
        y,
        Math.max(
          0,
          Number(node.sequence) - 1
        ),
        isControlNode(node.type),
        JSON.stringify({
          retryable: false,
          recoveredHistoricalNode:
            true,
        }),
        JSON.stringify(nodeJson),
        group.earliestRunAt,
      ]
    );
  }

  return {
    workflowKey:
      group.workflowKey,
    workflowName:
      group.workflow.name,
    workflowId:
      group.workflow.workflowId,
    versionId:
      version.id,
    versionNumber:
      Number(version.version_number),
    definitionSha256:
      version.definition_sha256,
    nodeCount:
      Number(version.action_count),
    runIds:
      group.runs
        .map((run) => run.runId)
        .sort(),
    nodeIds:
      group.canonicalNodes
        .map((node) => node.nodeId)
        .sort(),
  };
}

async function verifyInsertedVersions(
  client,
  workspaceId,
  inserted
) {
  for (const item of inserted) {
    const result = await client.query(
      `
        SELECT
          version.version_number,
          version.source_type,
          version.definition_json
            #>> '{metadata,recoveryBatchId}'
              AS recovery_batch_id,
          count(node.id)::integer
              AS node_count,
          COALESCE(
            array_agg(
              node.node_key
              ORDER BY node.node_key
            ) FILTER (
              WHERE node.node_key IS NOT NULL
            ),
            ARRAY[]::varchar[]
          ) AS node_keys
        FROM autoflow.workflow_version version
        LEFT JOIN autoflow.workflow_node node
          ON node.workspace_id =
             version.workspace_id
         AND node.workflow_id =
             version.workflow_id
         AND node.workflow_version_id =
             version.id
        WHERE version.workspace_id = $1
          AND version.workflow_id = $2
          AND version.id = $3
        GROUP BY
          version.id,
          version.version_number,
          version.source_type,
          recovery_batch_id
      `,
      [
        workspaceId,
        item.workflowId,
        item.versionId,
      ]
    );

    if (result.rowCount !== 1) {
      throw new Error(
        `Recovered version '${item.versionId}' was not found during verification.`
      );
    }

    const row = result.rows[0];

    if (
      row.source_type !== 'MIGRATION' ||
      row.recovery_batch_id !==
        item.recoveryBatchId
    ) {
      throw new Error(
        `Recovered version '${item.versionId}' has incorrect provenance.`
      );
    }

    const actual =
      [...row.node_keys].sort();
    const expected =
      [...item.nodeIds].sort();

    if (
      JSON.stringify(actual) !==
      JSON.stringify(expected)
    ) {
      throw new Error(
        `Recovered version '${item.versionId}' node signature does not match the plan.`
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
    resolveWorkspaceRoot(backendDir);
  const runsRoot =
    path.join(workspaceRoot, '.runs');
  const workspaceKey =
    process.env.DB_WORKSPACE_KEY ||
    'default';
  const batchId =
    `legacy-version-recovery-${safeTimestamp()}`;

  console.log('============================================================');
  console.log(' AutoFlow Historical Version Recovery - Step 6B.1 Fix 2');
  console.log('============================================================');
  console.log(
    `Mode                       : ${args.apply ? 'APPLY' : 'DRY RUN'}`
  );
  console.log(
    `Workspace key              : ${workspaceKey}`
  );
  console.log(
    `Workspace root             : ${workspaceRoot}`
  );
  console.log(
    `Runs directory             : ${runsRoot}`
  );

  const client =
    await pool.connect();

  try {
    const database =
      await loadDatabaseModel(
        client,
        workspaceKey
      );
    const snapshots =
      await readSnapshots(runsRoot);
    const plan =
      buildRecoveryPlan(
        snapshots,
        database
      );

    console.log('');
    console.log(
      `Total snapshots            : ${snapshots.length}`
    );
    console.log(
      `Blocked historical runs    : ${plan.blockedRuns.length}`
    );
    console.log(
      `Recovered versions planned : ${plan.plannedGroups.length}`
    );
    console.log(
      `Recovered nodes planned    : ${plan.plannedGroups.reduce(
        (sum, group) =>
          sum +
          group.canonicalNodes.length,
        0
      )}`
    );
    console.log(
      `Planning blockers          : ${plan.blockers.length}`
    );

    for (
      const [index, group]
      of plan.plannedGroups.entries()
    ) {
      console.log('');
      console.log(
        `  #${index + 1} ${group.workflow.name}`
      );
      console.log(
        `  Workflow             : ${group.workflowKey}`
      );
      console.log(
        `  Planned version       : ${group.plannedVersionNumber}`
      );
      console.log(
        `  Historical runs       : ${group.runs.length}`
      );
      console.log(
        `  Execution nodes       : ${group.canonicalNodes.length}`
      );
    }

    if (
      plan.blockers.length > 0
    ) {
      console.log('');
      plan.blockers.forEach(
        (blocker) =>
          console.log(
            `Blocker                    : ${blocker}`
          )
      );
      console.log('');
      console.log(
        'Filesystem changes         : NONE'
      );
      console.log(
        'PostgreSQL changes         : NONE'
      );
      console.log(
        'RESULT                     : HISTORICAL VERSION RECOVERY BLOCKED'
      );
      process.exitCode = 1;
      return;
    }

    if (
      plan.plannedGroups.length === 0
    ) {
      console.log('');
      console.log(
        'Filesystem changes         : NONE'
      );
      console.log(
        'PostgreSQL changes         : NONE'
      );
      console.log(
        'RESULT                     : NO HISTORICAL VERSION RECOVERY REQUIRED'
      );
      return;
    }

    if (!args.apply) {
      console.log('');
      console.log(
        'Filesystem changes         : NONE'
      );
      console.log(
        'PostgreSQL changes         : NONE'
      );
      console.log('');
      console.log(
        'RESULT                     : HISTORICAL VERSION RECOVERY DRY RUN PASSED'
      );
      console.log('');
      console.log(
        'Stop the backend, then run with --apply.'
      );
      return;
    }

    const currentBefore =
      new Map(
        [...database.workflows.values()]
          .filter((workflow) =>
            plan.plannedGroups.some(
              (group) =>
                group.workflowKey ===
                workflow.workflowKey
            )
          )
          .map((workflow) => [
            workflow.workflowKey,
            workflow.currentVersionNumber,
          ])
      );

    await client.query('BEGIN');

    try {
      await client.query(
        `
          SELECT pg_advisory_xact_lock(
            hashtext(
              'autoflow-historical-version-recovery-v1'
            )
          )
        `
      );

      await verifySyncTrigger(client);

      // These recovered versions use historical numbers below each live
      // current version. Disable only the sync-current trigger so inserting
      // them cannot touch workflow.updated_at or row_version.
      await client.query(
        `
          ALTER TABLE autoflow.workflow_version
          DISABLE TRIGGER
          trg_workflow_version_sync_current
        `
      );

      const inserted = [];

      for (const group of plan.plannedGroups) {
        const collision =
          await client.query(
            `
              SELECT 1
              FROM autoflow.workflow_version
              WHERE workspace_id = $1
                AND workflow_id = $2
                AND version_number = $3
              LIMIT 1
            `,
            [
              database.workspaceId,
              group.workflow.workflowId,
              group.plannedVersionNumber,
            ]
          );

        if (collision.rowCount > 0) {
          throw new Error(
            `Historical version slot ${group.plannedVersionNumber} for workflow '${group.workflowKey}' became occupied after planning.`
          );
        }

        const item =
          await insertRecoveredVersion(
            client,
            database.workspaceId,
            group,
            batchId
          );

        inserted.push({
          ...item,
          recoveryBatchId:
            batchId,
        });
      }

      await client.query(
        `
          ALTER TABLE autoflow.workflow_version
          ENABLE TRIGGER
          trg_workflow_version_sync_current
        `
      );

      await verifyInsertedVersions(
        client,
        database.workspaceId,
        inserted
      );

      for (
        const [workflowKey, expectedCurrent]
        of currentBefore.entries()
      ) {
        const result =
          await client.query(
            `
              SELECT
                current_version_number
              FROM autoflow.workflow
              WHERE workspace_id = $1
                AND workflow_key = $2
              LIMIT 1
            `,
            [
              database.workspaceId,
              workflowKey,
            ]
          );

        if (
          result.rowCount !== 1 ||
          Number(
            result.rows[0]
              .current_version_number
          ) !== expectedCurrent
        ) {
          throw new Error(
            `Live current version changed for workflow '${workflowKey}'.`
          );
        }
      }

      await client.query('COMMIT');

      const reportDirectory =
        path.join(
          backendDir,
          'migration_backups',
          batchId
        );

      await fsp.mkdir(
        reportDirectory,
        {
          recursive: true,
        }
      );

      const manifestPath =
        path.join(
          reportDirectory,
          'historical-version-recovery-manifest.json'
        );

      await fsp.writeFile(
        manifestPath,
        JSON.stringify(
          {
            formatVersion: 1,
            createdAt:
              new Date().toISOString(),
            batchId,
            workspaceKey,
            workspaceRoot,
            source:
              RECOVERY_SOURCE,
            tool:
              RECOVERY_TOOL,
            currentVersionsPreserved:
              Object.fromEntries(
                currentBefore
              ),
            insertedVersions:
              inserted,
            rollbackCommand:
              `node scripts\\rollbackHistoricalWorkflowVersionRecovery.js --apply --batch-id "${batchId}"`,
          },
          null,
          2
        ),
        'utf8'
      );

      console.log('');
      console.log(
        `Recovery batch             : ${batchId}`
      );
      console.log(
        `Versions inserted          : ${inserted.length}`
      );
      console.log(
        `Nodes inserted             : ${inserted.reduce(
          (sum, item) =>
            sum + item.nodeIds.length,
          0
        )}`
      );
      console.log(
        `Current versions preserved : PASS`
      );
      console.log(
        `Definition provenance      : PASS`
      );
      console.log(
        `Node signature verification: PASS`
      );
      console.log(
        `Manifest                   : ${manifestPath}`
      );
      console.log(
        `Database transaction       : COMMITTED`
      );
      console.log(
        `Filesystem run changes     : NONE`
      );
      console.log('');
      console.log(
        'RESULT                     : HISTORICAL WORKFLOW VERSIONS RECOVERED'
      );
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // Preserve the original error.
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
      'RESULT                     : HISTORICAL VERSION RECOVERY FAILED'
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
