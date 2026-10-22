'use strict';

const { randomUUID } = require('crypto');
const { query, withTransaction } = require('./pool');

const ROOT_FOLDER_ID = 'root';
const WORKFLOW_STATUSES = new Set(['draft', 'active', 'paused']);
const VARIABLE_TYPES = new Set([
  'string',
  'number',
  'boolean',
  'object',
  'array',
  'dictionary',
]);
const CONNECTION_TYPES = new Set([
  'success',
  'error',
  'conditional',
  'default',
]);

function applicationError(status, code, message) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function sanitizeName(value, label = 'name') {
  if (typeof value !== 'string') {
    throw applicationError(400, 'INVALID_NAME', `${label} must be a string.`);
  }

  const sanitized = value
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/\s+/g, ' ');

  if (!sanitized) {
    throw applicationError(400, 'INVALID_NAME', `${label} is invalid.`);
  }

  return sanitized;
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value
    : {};
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function jsonRoundTrip(value) {
  const serialized = JSON.stringify(value);
  return serialized === undefined ? null : JSON.parse(serialized);
}

const WORKFLOW_SECRET_KEY_PATTERN =
  /^(password|passwd|pwd|secret|token|access(?:-|\x5F)?token|refresh(?:-|\x5F)?token|api(?:-|\x5F)?key|x(?:-|\x5F)?api(?:-|\x5F)?key|access(?:-|\x5F)?key|secret(?:-|\x5F)?access(?:-|\x5F)?key|aws(?:-|\x5F)?access(?:-|\x5F)?key(?:-|\x5F)?id|aws(?:-|\x5F)?secret(?:-|\x5F)?access(?:-|\x5F)?key|authorization|cookie|private(?:-|\x5F)?key|client(?:-|\x5F)?secret|connection(?:-|\x5F)?string)$/i;

const WORKFLOW_SECRET_PLACEHOLDERS = new Set([
  '********',
  'REDACTED',
  '<REDACTED>',
]);
function isWorkflowBindingExpression(value) {
  return (
    typeof value === 'string' &&
    /\{\{[^{}]+\}\}/.test(value)
  );
}

/**
 * Remove primitive credentials from durable workflow definitions.
 *
 * Object-valued configuration descriptors such as
 * propertyConfig.password are preserved. Dynamic bindings are also
 * preserved because they reference a runtime value rather than embedding
 * the credential itself.
 */
function sanitizeWorkflowSecrets(value, parentKey = '') {
  if (value === null || value === undefined) return value;

  const primitive =
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean';

  if (
    primitive &&
    WORKFLOW_SECRET_KEY_PATTERN.test(String(parentKey))
  ) {
    if (isWorkflowBindingExpression(value)) {
      return value;
    }

    if (
      typeof value === 'string' &&
      (value.length === 0 ||
        WORKFLOW_SECRET_PLACEHOLDERS.has(value))
    ) {
      return '';
    }

    return '';
  }

  if (Array.isArray(value)) {
    return value.map((item) =>
      sanitizeWorkflowSecrets(item)
    );
  }

  if (typeof value !== 'object') {
    return value;
  }

  const out = {};

  for (const [key, child] of Object.entries(value)) {
    out[key] = sanitizeWorkflowSecrets(child, key);
  }

  return out;
}

function sanitizeDefinition(definition) {
  const cloned = jsonRoundTrip(definition) || {};
  const sanitized = sanitizeWorkflowSecrets(cloned);

  sanitized.actions = asArray(sanitized.actions);
  sanitized.connections = asArray(sanitized.connections);
  sanitized.variables = asArray(sanitized.variables);
  sanitized.triggers = asArray(sanitized.triggers);

  sanitized.variables = sanitized.variables.map((variable) => {
    if (!variable || typeof variable !== 'object') return variable;

    const isSecret =
      variable.isSecret === true || variable.scope === 'secret';

    if (!isSecret) return variable;

    return {
      ...variable,
      value: null,
      defaultValue: null,
      secretValueRedacted: true,
      credentialReferenceRequired: true,
    };
  });

  return sanitized;
}

function parseDate(value, fallback = null) {
  if (!value) return fallback;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date.toISOString();
}

function validateDefinition(definition) {
  const nodeIds = new Set();

  for (const [index, action] of definition.actions.entries()) {
    const nodeId = String(action?.id || '').trim();
    if (!nodeId) {
      throw applicationError(
        400,
        'INVALID_NODE',
        `Action at index ${index} has no id.`
      );
    }
    if (nodeIds.has(nodeId)) {
      throw applicationError(
        409,
        'DUPLICATE_NODE',
        `Duplicate node id '${nodeId}'.`
      );
    }
    nodeIds.add(nodeId);
  }

  const connectionIds = new Set();

  for (const [index, connection] of definition.connections.entries()) {
    const connectionId = String(
      connection?.id || `connection-${index + 1}`
    );
    const sourceId = String(connection?.sourceId || '');
    const targetId = String(connection?.targetId || '');

    if (connectionIds.has(connectionId)) {
      throw applicationError(
        409,
        'DUPLICATE_CONNECTION',
        `Duplicate connection id '${connectionId}'.`
      );
    }
    connectionIds.add(connectionId);

    if (!nodeIds.has(sourceId) || !nodeIds.has(targetId)) {
      throw applicationError(
        400,
        'DANGLING_CONNECTION',
        `Connection '${connectionId}' must reference two existing nodes.`
      );
    }
  }

  const variableIds = new Set();
  const variableNames = new Set();

  for (const [index, variable] of definition.variables.entries()) {
    const variableId = String(variable?.id || '').trim();
    const variableName = String(variable?.name || '').trim();

    if (!variableId || !variableName) {
      throw applicationError(
        400,
        'INVALID_VARIABLE',
        `Variable at index ${index} requires id and name.`
      );
    }

    if (variableIds.has(variableId)) {
      throw applicationError(
        409,
        'DUPLICATE_VARIABLE',
        `Duplicate variable id '${variableId}'.`
      );
    }

    const normalizedName = variableName.toLowerCase();
    if (variableNames.has(normalizedName)) {
      throw applicationError(
        409,
        'DUPLICATE_VARIABLE',
        `Duplicate variable name '${variableName}'.`
      );
    }

    variableIds.add(variableId);
    variableNames.add(normalizedName);
  }
}

function runner(options, work) {
  if (options?.client) {
    return work(options.client);
  }
  return withTransaction(work);
}

async function workspaceRow(client, workspaceKey = 'default') {
  const result = await client.query(
    `
      SELECT
        id,
        workspace_key,
        name,
        description,
        status,
        storage_mode,
        storage_root,
        settings,
        created_at,
        updated_at
      FROM autoflow.workspace
      WHERE workspace_key = $1
        AND deleted_at IS NULL
      LIMIT 1
    `,
    [workspaceKey]
  );

  if (result.rowCount !== 1) {
    throw applicationError(
      404,
      'WORKSPACE_NOT_FOUND',
      `Workspace '${workspaceKey}' was not found.`
    );
  }

  return result.rows[0];
}

async function folderRow(client, workspaceId, folderKey) {
  const result = await client.query(
    `
      SELECT
        folder.id,
        folder.folder_key,
        folder.name,
        folder.parent_id,
        parent.folder_key AS parent_key,
        folder.is_root,
        folder.sort_order,
        folder.metadata,
        folder.row_version,
        folder.created_at,
        folder.updated_at
      FROM autoflow.workspace_folder folder
      LEFT JOIN autoflow.workspace_folder parent
        ON parent.workspace_id = folder.workspace_id
       AND parent.id = folder.parent_id
      WHERE folder.workspace_id = $1
        AND folder.folder_key = $2
        AND folder.deleted_at IS NULL
      LIMIT 1
    `,
    [workspaceId, folderKey]
  );

  if (result.rowCount !== 1) {
    throw applicationError(
      404,
      'FOLDER_NOT_FOUND',
      `Folder '${folderKey}' was not found.`
    );
  }

  return result.rows[0];
}

function folderDto(row) {
  return {
    id: row.folder_key,
    name: row.name,
    parentId: row.parent_key ?? null,
    type: 'folder',
    isRoot: row.is_root,
    sortOrder: row.sort_order,
    metadata: row.metadata || {},
    rowVersion: Number(row.row_version || 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    path: null,
  };
}

async function workflowRow(client, workspaceId, workflowKey, options = {}) {
  const result = await client.query(
    `
      SELECT
        workflow.id,
        workflow.workflow_key,
        workflow.name,
        workflow.description,
        workflow.status,
        workflow.icon,
        workflow.current_version_number,
        workflow.last_run_at,
        workflow.metadata,
        workflow.row_version,
        workflow.created_at,
        workflow.updated_at,
        folder.folder_key AS parent_key,
        version.id AS version_id,
        version.definition_json
      FROM autoflow.workflow workflow
      JOIN autoflow.workspace_folder folder
        ON folder.workspace_id = workflow.workspace_id
       AND folder.id = workflow.folder_id
       AND folder.deleted_at IS NULL
      LEFT JOIN autoflow.workflow_version version
        ON version.workspace_id = workflow.workspace_id
       AND version.workflow_id = workflow.id
       AND version.version_number = workflow.current_version_number
      WHERE workflow.workspace_id = $1
        AND workflow.workflow_key = $2
        AND workflow.deleted_at IS NULL
      LIMIT 1
      ${options.forUpdate === true ? 'FOR UPDATE OF workflow' : ''}
    `,
    [workspaceId, workflowKey]
  );

  if (result.rowCount !== 1) {
    throw applicationError(
      404,
      'WORKFLOW_NOT_FOUND',
      `Workflow '${workflowKey}' was not found.`
    );
  }

  return result.rows[0];
}

function workflowDefinitionDto(row) {
  const stored = asObject(row.definition_json);
  return {
    ...stored,
    id: row.workflow_key,
    name: row.name,
    type: 'workflow',
    parentId: row.parent_key,
    status: row.status,
    description: row.description || '',
    icon: row.icon || stored.icon,
    version: Number(row.current_version_number),
    lastRun: row.last_run_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    actions: asArray(stored.actions),
    connections: asArray(stored.connections),
    variables: asArray(stored.variables),
    triggers: asArray(stored.triggers),
    path: null,
  };
}

function workflowSummaryDto(row) {
  return {
    id: row.workflow_key,
    name: row.name,
    type: 'workflow',
    parentId: row.parent_key,
    status: row.status,
    lastRun: row.last_run_at,
    updatedAt: row.updated_at,
    icon: row.icon,
    description: row.description || '',
    version: String(row.current_version_number),
    createdAt: row.created_at,
    metadata: row.metadata || {},
    rowVersion: Number(row.row_version || 0),
    path: null,
  };
}

async function createFolder(input, options = {}) {
  return runner(options, async (client) => {
    const workspace = await workspaceRow(
      client,
      options.workspaceKey || 'default'
    );
    const parentId = input.parentId || ROOT_FOLDER_ID;
    const parent = await folderRow(client, workspace.id, parentId);
    const name = sanitizeName(input.name, 'Folder name');
    const folderKey = input.id || randomUUID();

    try {
      const result = await client.query(
        `
          INSERT INTO autoflow.workspace_folder (
            workspace_id,
            folder_key,
            parent_id,
            name,
            is_root,
            sort_order,
            metadata,
            created_by,
            updated_by
          )
          VALUES (
            $1,
            $2,
            $3,
            $4,
            false,
            (
              SELECT COALESCE(max(sort_order), -1) + 1
              FROM autoflow.workspace_folder
              WHERE workspace_id = $1
                AND parent_id = $3
                AND deleted_at IS NULL
            ),
            $5::jsonb,
            'postgres-workspace-api',
            'postgres-workspace-api'
          )
          RETURNING *
        `,
        [
          workspace.id,
          folderKey,
          parent.id,
          name,
          JSON.stringify({
            frontendType: 'folder',
            source: 'postgresql',
          }),
        ]
      );

      return folderDto({
        ...result.rows[0],
        parent_key: parent.folder_key,
      });
    } catch (error) {
      if (error.code === '23505') {
        throw applicationError(
          409,
          'DUPLICATE_NAME',
          `A folder named '${name}' already exists here.`
        );
      }
      throw error;
    }
  });
}

async function updateFolder(folderKey, input, options = {}) {
  return runner(options, async (client) => {
    const workspace = await workspaceRow(
      client,
      options.workspaceKey || 'default'
    );
    const current = await folderRow(client, workspace.id, folderKey);

    if (current.is_root) {
      throw applicationError(
        403,
        'ROOT_PROTECTED',
        'The root folder cannot be changed.'
      );
    }

    const name =
      input.name !== undefined
        ? sanitizeName(input.name, 'Folder name')
        : current.name;

    const targetParentKey =
      input.parentId !== undefined
        ? String(input.parentId)
        : current.parent_key;

    if (targetParentKey === folderKey) {
      throw applicationError(
        400,
        'INVALID_FOLDER_MOVE',
        'A folder cannot be moved into itself.'
      );
    }

    const targetParent = await folderRow(
      client,
      workspace.id,
      targetParentKey
    );

    if (targetParent.id !== current.parent_id) {
      const cycleCheck = await client.query(
        `
          WITH RECURSIVE descendants AS (
            SELECT id
            FROM autoflow.workspace_folder
            WHERE workspace_id = $1
              AND id = $2
              AND deleted_at IS NULL

            UNION ALL

            SELECT child.id
            FROM autoflow.workspace_folder child
            JOIN descendants parent
              ON child.parent_id = parent.id
            WHERE child.workspace_id = $1
              AND child.deleted_at IS NULL
          )
          SELECT EXISTS (
            SELECT 1
            FROM descendants
            WHERE id = $3
          ) AS would_create_cycle
        `,
        [workspace.id, current.id, targetParent.id]
      );

      if (cycleCheck.rows[0].would_create_cycle) {
        throw applicationError(
          400,
          'INVALID_FOLDER_MOVE',
          'A folder cannot be moved into one of its descendants.'
        );
      }
    }

    try {
      const result = await client.query(
        `
          UPDATE autoflow.workspace_folder
          SET
            parent_id = $3,
            name = $4,
            sort_order = CASE
              WHEN parent_id IS DISTINCT FROM $3 THEN (
                SELECT COALESCE(max(sibling.sort_order), -1) + 1
                FROM autoflow.workspace_folder sibling
                WHERE sibling.workspace_id = $1
                  AND sibling.parent_id = $3
                  AND sibling.deleted_at IS NULL
                  AND sibling.id <> autoflow.workspace_folder.id
              )
              ELSE sort_order
            END,
            updated_by = 'database-workspace-api'
          WHERE workspace_id = $1
            AND folder_key = $2
            AND deleted_at IS NULL
          RETURNING *
        `,
        [workspace.id, folderKey, targetParent.id, name]
      );

      return folderDto({
        ...result.rows[0],
        parent_key: targetParent.folder_key,
      });
    } catch (error) {
      if (error.code === '23505') {
        throw applicationError(
          409,
          'DUPLICATE_NAME',
          `A folder named '${name}' already exists here.`
        );
      }
      throw error;
    }
  });
}

async function renameFolder(folderKey, input, options = {}) {
  return updateFolder(folderKey, input, options);
}

async function deleteFolder(folderKey, options = {}) {
  return runner(options, async (client) => {
    const workspace = await workspaceRow(
      client,
      options.workspaceKey || 'default'
    );
    const current = await folderRow(client, workspace.id, folderKey);

    if (current.is_root) {
      throw applicationError(
        403,
        'ROOT_PROTECTED',
        'The root folder cannot be deleted.'
      );
    }

    const descendants = await client.query(
      `
        WITH RECURSIVE tree AS (
          SELECT
            id,
            folder_key,
            parent_id,
            0 AS depth
          FROM autoflow.workspace_folder
          WHERE workspace_id = $1
            AND folder_key = $2
            AND deleted_at IS NULL

          UNION ALL

          SELECT
            child.id,
            child.folder_key,
            child.parent_id,
            tree.depth + 1
          FROM autoflow.workspace_folder child
          JOIN tree
            ON child.parent_id = tree.id
          WHERE child.workspace_id = $1
            AND child.deleted_at IS NULL
        )
        SELECT id, folder_key, depth
        FROM tree
        ORDER BY depth DESC
      `,
      [workspace.id, folderKey]
    );

    const folderIds = descendants.rows.map((row) => row.id);
    const folderKeys = descendants.rows.map((row) => row.folder_key);
    const now = new Date().toISOString();

    const workflowResult = await client.query(
      `
        UPDATE autoflow.workflow
        SET
          deleted_at = $3::timestamptz,
          updated_by = 'postgres-workspace-api'
        WHERE workspace_id = $1
          AND folder_id = ANY($2::uuid[])
          AND deleted_at IS NULL
        RETURNING workflow_key
      `,
      [workspace.id, folderIds, now]
    );

    await client.query(
      `
        UPDATE autoflow.workspace_folder
        SET
          deleted_at = $3::timestamptz,
          updated_by = 'postgres-workspace-api'
        WHERE workspace_id = $1
          AND id = ANY($2::uuid[])
          AND is_root = false
          AND deleted_at IS NULL
      `,
      [workspace.id, folderIds, now]
    );

    return {
      message:
        `Folder and ${workflowResult.rowCount} workflow(s) deleted`,
      deletedFolders: folderKeys,
      deletedWorkflows: workflowResult.rows.map(
        (row) => row.workflow_key
      ),
    };
  });
}

async function saveVersion(
  client,
  workspace,
  workflow,
  definition,
  versionNumber,
  sourceType = 'MANUAL'
) {
  const persisted = sanitizeDefinition(definition);
  validateDefinition(persisted);

  const versionResult = await client.query(
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
        action_count,
        connection_count,
        variable_count,
        is_published,
        created_by
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        $7,
        1,
        $8::jsonb,
        repeat('0', 64),
        $9,
        $10,
        $11,
        false,
        'postgres-workspace-api'
      )
      RETURNING id
    `,
    [
      workspace.id,
      workflow.id,
      versionNumber,
      `v${versionNumber}`,
      `Database save v${versionNumber}`,
      'Saved through the primary PostgreSQL workspace API.',
      sourceType,
      JSON.stringify(persisted),
      persisted.actions.length,
      persisted.connections.length,
      persisted.variables.length,
    ]
  );

  const workflowVersionId = versionResult.rows[0].id;

  for (const [index, action] of persisted.actions.entries()) {
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
          icon,
          logo,
          position_x,
          position_y,
          width,
          height,
          sequence_hint,
          is_control_node,
          is_disabled,
          properties_json,
          api_json,
          property_config_json,
          input_mapping_json,
          output_mapping_json,
          execution_policy_json,
          node_json
        )
        VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,
          $13,$14,$15,$16,$17,$18,$19,
          $20::jsonb,$21::jsonb,$22::jsonb,$23::jsonb,
          $24::jsonb,$25::jsonb,$26::jsonb
        )
      `,
      [
        workspace.id,
        workflow.id,
        workflowVersionId,
        String(action.id),
        String(action.type || 'unknown'),
        action.category || null,
        action.pluginId || action.plugin || action.category || null,
        action.actionId || action.type || null,
        String(action.name || action.type || action.id),
        action.description || null,
        action.icon || null,
        action.logo || null,
        Number(action.x || 0),
        Number(action.y || 0),
        action.width == null ? null : Number(action.width),
        action.height == null ? null : Number(action.height),
        index,
        Boolean(action.isControlNode),
        Boolean(action.disabled),
        JSON.stringify(asObject(action.properties)),
        JSON.stringify(asObject(action.api)),
        JSON.stringify(asObject(action.propertyConfig)),
        JSON.stringify(asObject(action.inputMapping)),
        JSON.stringify(asObject(action.outputMapping)),
        JSON.stringify({
          retries: action.retries,
          retryDelay: action.retryDelay,
          timeout: action.timeout,
          onError: action.onError,
          fallbackActionId: action.fallbackActionId,
          dependsOn: action.dependsOn,
        }),
        JSON.stringify(action),
      ]
    );
  }

  for (const [index, connection] of persisted.connections.entries()) {
    const connectionType = CONNECTION_TYPES.has(connection.type)
      ? connection.type
      : 'default';

    const pointIndex = Number(connection.sourcePointIndex);
    const validPointIndex =
      Number.isInteger(pointIndex) &&
      pointIndex >= 0 &&
      pointIndex <= 7
        ? pointIndex
        : null;

    await client.query(
      `
        INSERT INTO autoflow.workflow_connection (
          workspace_id,
          workflow_id,
          workflow_version_id,
          connection_key,
          source_node_key,
          target_node_key,
          connection_type,
          condition_expression,
          condition_type,
          priority,
          routing_strategy,
          label,
          source_port,
          target_port,
          source_point_index,
          line_style,
          color,
          is_disabled,
          metadata,
          connection_json
        )
        VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,
          $12,$13,$14,$15,$16,$17,$18,$19::jsonb,$20::jsonb
        )
      `,
      [
        workspace.id,
        workflow.id,
        workflowVersionId,
        String(connection.id || `connection-${index + 1}`),
        String(connection.sourceId),
        String(connection.targetId),
        connectionType,
        connection.condition || null,
        ['script', 'expression'].includes(connection.conditionType)
          ? connection.conditionType
          : null,
        Math.max(0, Number(connection.priority || 0)),
        connection.routingStrategy === 'all-match'
          ? 'all-match'
          : 'first-match',
        connection.label || null,
        connection.sourcePort || null,
        connection.targetPort || null,
        validPointIndex,
        connection.style || null,
        connection.color || null,
        Boolean(connection.isDisabled),
        JSON.stringify(asObject(connection.metadata)),
        JSON.stringify(connection),
      ]
    );
  }

  for (const variable of persisted.variables) {
    const isSecret =
      variable.isSecret === true || variable.scope === 'secret';
    const variableType = VARIABLE_TYPES.has(variable.type)
      ? variable.type
      : 'string';
    const scope = ['global', 'local', 'secret'].includes(variable.scope)
      ? variable.scope
      : isSecret
        ? 'secret'
        : 'global';

    await client.query(
      `
        INSERT INTO autoflow.workflow_variable (
          workspace_id,
          workflow_id,
          workflow_version_id,
          variable_key,
          name,
          data_type,
          scope,
          description,
          is_secret,
          is_required,
          is_masked,
          value_json,
          default_value_json,
          validation_rules_json,
          metadata,
          last_updated_at
        )
        VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,
          $12::jsonb,$13::jsonb,$14::jsonb,$15::jsonb,
          $16::timestamptz
        )
      `,
      [
        workspace.id,
        workflow.id,
        workflowVersionId,
        String(variable.id),
        String(variable.name),
        variableType,
        scope,
        variable.description || null,
        isSecret,
        Boolean(variable.required),
        Boolean(variable.masked),
        isSecret ? null : JSON.stringify(variable.value ?? null),
        isSecret ? null : JSON.stringify(variable.defaultValue ?? null),
        JSON.stringify(asObject(variable.validationRules)),
        JSON.stringify({
          source: 'postgres-workspace-api',
          secretValueRedacted: isSecret,
        }),
        parseDate(variable.lastUpdated),
      ]
    );
  }

  let scheduleId = null;

  if (
    persisted.schedule &&
    typeof persisted.schedule === 'object' &&
    !Array.isArray(persisted.schedule)
  ) {
    const schedule = persisted.schedule;
    const scheduleResult = await client.query(
      `
        INSERT INTO autoflow.workflow_schedule (
          workspace_id,
          workflow_id,
          workflow_version_id,
          schedule_key,
          enabled,
          schedule_type,
          schedule_value,
          timezone,
          next_run_at,
          last_run_at,
          retry_on_failure,
          max_runs,
          total_runs,
          metadata
        )
        VALUES (
          $1,$2,$3,'schedule',$4,$5,$6,$7,
          $8::timestamptz,$9::timestamptz,$10,$11,0,$12::jsonb
        )
        RETURNING id
      `,
      [
        workspace.id,
        workflow.id,
        workflowVersionId,
        Boolean(schedule.enabled),
        schedule.type === 'cron' ? 'cron' : 'interval',
        String(schedule.value || '1h'),
        String(schedule.timezone || 'UTC'),
        parseDate(schedule.nextRun),
        parseDate(schedule.lastRun),
        Boolean(schedule.retryOnFailure),
        Math.max(0, Number(schedule.maxRuns || 0)),
        JSON.stringify(schedule),
      ]
    );
    scheduleId = scheduleResult.rows[0].id;
  }

  for (const [index, trigger] of persisted.triggers.entries()) {
    const allowedTypes = new Set([
      'manual',
      'schedule',
      'file-watcher',
      'webhook',
      'email',
      'event',
    ]);
    const triggerType = allowedTypes.has(trigger.type)
      ? trigger.type
      : 'manual';

    if (triggerType === 'schedule' && !scheduleId) {
      throw applicationError(
        400,
        'SCHEDULE_REQUIRED',
        'A schedule trigger requires a workflow schedule.'
      );
    }

    await client.query(
      `
        INSERT INTO autoflow.workflow_trigger (
          workspace_id,
          workflow_id,
          workflow_version_id,
          trigger_key,
          trigger_type,
          name,
          description,
          enabled,
          schedule_id,
          properties_json,
          conditions_json,
          retry_policy_json,
          last_triggered_at,
          metadata
        )
        VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,
          $10::jsonb,$11::jsonb,$12::jsonb,
          $13::timestamptz,$14::jsonb
        )
      `,
      [
        workspace.id,
        workflow.id,
        workflowVersionId,
        String(trigger.id || `trigger-${index + 1}`),
        triggerType,
        String(trigger.name || triggerType),
        trigger.description || null,
        trigger.enabled !== false,
        triggerType === 'schedule' ? scheduleId : null,
        JSON.stringify(asObject(trigger.properties)),
        JSON.stringify(asArray(trigger.conditions)),
        JSON.stringify(asObject(trigger.retryPolicy)),
        parseDate(trigger.lastTriggeredAt),
        JSON.stringify(trigger),
      ]
    );
  }

  return {
    workflowVersionId,
    persisted,
  };
}

async function createWorkflow(input, options = {}) {
  return runner(options, async (client) => {
    const workspace = await workspaceRow(
      client,
      options.workspaceKey || 'default'
    );
    const parentId = input.parentId || ROOT_FOLDER_ID;
    const parent = await folderRow(client, workspace.id, parentId);
    const name = sanitizeName(input.name, 'Workflow name');
    const workflowKey = input.id || randomUUID();
    const now = new Date().toISOString();

    const definition = sanitizeDefinition({
      id: workflowKey,
      name,
      type: 'workflow',
      parentId,
      status: 'draft',
      description: input.description || '',
      icon: input.icon,
      actions: [],
      connections: [],
      variables: [],
      triggers: [],
      version: 1,
      createdAt: now,
      updatedAt: now,
    });

    try {
      const workflowResult = await client.query(
        `
          INSERT INTO autoflow.workflow (
            workspace_id,
            folder_id,
            workflow_key,
            name,
            description,
            status,
            icon,
            current_version_number,
            sort_order,
            metadata,
            created_by,
            updated_by,
            created_at,
            updated_at
          )
          VALUES (
            $1,$2,$3,$4,$5,'draft',$6,1,
            (
              SELECT COALESCE(max(sort_order), -1) + 1
              FROM autoflow.workflow
              WHERE workspace_id = $1
                AND folder_id = $2
                AND deleted_at IS NULL
            ),
            $7::jsonb,
            'postgres-workspace-api',
            'postgres-workspace-api',
            $8::timestamptz,
            $8::timestamptz
          )
          RETURNING *
        `,
        [
          workspace.id,
          parent.id,
          workflowKey,
          name,
          input.description || '',
          input.icon || 'FileCode2',
          JSON.stringify({
            source: 'postgresql',
            shadowApiCreated: true,
          }),
          now,
        ]
      );

      const workflow = workflowResult.rows[0];

      await saveVersion(
        client,
        workspace,
        workflow,
        definition,
        1,
        'MANUAL'
      );

      const saved = await workflowRow(
        client,
        workspace.id,
        workflowKey
      );

      return workflowDefinitionDto(saved);
    } catch (error) {
      if (error.code === '23505') {
        throw applicationError(
          409,
          'DUPLICATE_NAME',
          `A workflow named '${name}' already exists here.`
        );
      }
      throw error;
    }
  });
}

async function getWorkflow(workflowKey, options = {}) {
  const client = options.client || { query };

  const workspace = await workspaceRow(
    client,
    options.workspaceKey || 'default'
  );
  const row = await workflowRow(client, workspace.id, workflowKey);
  return workflowDefinitionDto(row);
}

async function updateWorkflow(workflowKey, updates, options = {}) {
  return runner(options, async (client) => {
    const workspace = await workspaceRow(
      client,
      options.workspaceKey || 'default'
    );
    const current = await workflowRow(
      client,
      workspace.id,
      workflowKey,
      { forUpdate: true }
    );
    const currentDefinition = workflowDefinitionDto(current);

    const parentId =
      updates.parentId !== undefined
        ? String(updates.parentId)
        : current.parent_key;
    const parent = await folderRow(client, workspace.id, parentId);

    const name =
      updates.name !== undefined
        ? sanitizeName(updates.name, 'Workflow name')
        : current.name;

    const status =
      updates.status !== undefined
        ? String(updates.status).toLowerCase()
        : current.status;

    if (!WORKFLOW_STATUSES.has(status)) {
      throw applicationError(
        400,
        'INVALID_STATUS',
        `Unsupported workflow status '${status}'.`
      );
    }

    const nextVersion = Number(current.current_version_number) + 1;
    const now = new Date().toISOString();

    const definition = sanitizeDefinition({
      ...currentDefinition,
      ...updates,
      id: workflowKey,
      name,
      type: 'workflow',
      parentId,
      status,
      description:
        updates.description !== undefined
          ? String(updates.description)
          : current.description || '',
      icon:
        updates.icon !== undefined
          ? updates.icon
          : current.icon || currentDefinition.icon,
      actions:
        updates.actions !== undefined
          ? asArray(updates.actions)
          : asArray(currentDefinition.actions),
      connections:
        updates.connections !== undefined
          ? asArray(updates.connections)
          : asArray(currentDefinition.connections),
      variables:
        updates.variables !== undefined
          ? asArray(updates.variables)
          : asArray(currentDefinition.variables),
      triggers:
        updates.triggers !== undefined
          ? asArray(updates.triggers)
          : asArray(currentDefinition.triggers),
      schedule:
        updates.schedule !== undefined
          ? updates.schedule
          : currentDefinition.schedule,
      version: nextVersion,
      createdAt: current.created_at,
      updatedAt: now,
      path: undefined,
    });

    validateDefinition(definition);

    try {
      await client.query(
        `
          UPDATE autoflow.workflow
          SET
            folder_id = $3,
            name = $4,
            description = $5,
            status = $6,
            icon = $7,
            last_run_at = $8::timestamptz,
            current_version_number = $9,
            updated_by = 'database-workspace-api',
            updated_at = $10::timestamptz
          WHERE workspace_id = $1
            AND workflow_key = $2
            AND deleted_at IS NULL
        `,
        [
          workspace.id,
          workflowKey,
          parent.id,
          name,
          definition.description || '',
          status,
          definition.icon || 'FileCode2',
          parseDate(definition.lastRun),
          nextVersion,
          now,
        ]
      );

      await saveVersion(
        client,
        workspace,
        current,
        definition,
        nextVersion,
        'MANUAL'
      );

      const saved = await workflowRow(
        client,
        workspace.id,
        workflowKey
      );

      return workflowDefinitionDto(saved);
    } catch (error) {
      if (error.code === '23505') {
        throw applicationError(
          409,
          'DUPLICATE_NAME',
          `A workflow named '${name}' already exists here.`
        );
      }
      throw error;
    }
  });
}

async function renameWorkflow(workflowKey, input, options = {}) {
  return updateWorkflow(
    workflowKey,
    { name: input.name },
    options
  );
}

async function deleteWorkflow(workflowKey, options = {}) {
  return runner(options, async (client) => {
    const workspace = await workspaceRow(
      client,
      options.workspaceKey || 'default'
    );
    await workflowRow(client, workspace.id, workflowKey);

    const result = await client.query(
      `
        UPDATE autoflow.workflow
        SET
          deleted_at = clock_timestamp(),
          updated_by = 'postgres-workspace-api'
        WHERE workspace_id = $1
          AND workflow_key = $2
          AND deleted_at IS NULL
        RETURNING workflow_key
      `,
      [workspace.id, workflowKey]
    );

    return {
      message: `Workflow '${result.rows[0].workflow_key}' deleted`,
    };
  });
}

async function getFolder(folderKey, options = {}) {
  const client = options.client || { query };
  const workspace = await workspaceRow(
    client,
    options.workspaceKey || 'default'
  );
  const row = await folderRow(client, workspace.id, folderKey);
  return folderDto(row);
}

async function listChildren(parentKey, options = {}) {
  const client = options.client || { query };
  const workspace = await workspaceRow(
    client,
    options.workspaceKey || 'default'
  );
  const parent = await folderRow(client, workspace.id, parentKey);

  const folderResult = await client.query(
    `
      SELECT
        folder.*,
        $2::text AS parent_key
      FROM autoflow.workspace_folder folder
      WHERE folder.workspace_id = $1
        AND folder.parent_id = $3
        AND folder.deleted_at IS NULL
      ORDER BY folder.sort_order, lower(folder.name)
    `,
    [workspace.id, parentKey, parent.id]
  );

  const workflowResult = await client.query(
    `
      SELECT
        workflow.*,
        $2::text AS parent_key
      FROM autoflow.workflow workflow
      WHERE workflow.workspace_id = $1
        AND workflow.folder_id = $3
        AND workflow.deleted_at IS NULL
      ORDER BY workflow.sort_order, lower(workflow.name)
    `,
    [workspace.id, parentKey, parent.id]
  );

  return {
    folders: folderResult.rows.map(folderDto),
    workflows: workflowResult.rows.map(workflowSummaryDto),
  };
}

async function getBreadcrumb(itemKey, options = {}) {
  const client = options.client || { query };
  const workspace = await workspaceRow(
    client,
    options.workspaceKey || 'default'
  );

  const folderLookup = await client.query(
    `
      SELECT id, folder_key, name, parent_id
      FROM autoflow.workspace_folder
      WHERE workspace_id = $1
        AND folder_key = $2
        AND deleted_at IS NULL
      LIMIT 1
    `,
    [workspace.id, itemKey]
  );

  let item;

  if (folderLookup.rowCount === 1) {
    item = {
      id: folderLookup.rows[0].folder_key,
      name: folderLookup.rows[0].name,
      type: 'folder',
      databaseId: folderLookup.rows[0].id,
      parentDatabaseId: folderLookup.rows[0].parent_id,
    };
  } else {
    const workflowLookup = await client.query(
      `
        SELECT
          workflow.workflow_key,
          workflow.name,
          workflow.folder_id
        FROM autoflow.workflow workflow
        WHERE workflow.workspace_id = $1
          AND workflow.workflow_key = $2
          AND workflow.deleted_at IS NULL
        LIMIT 1
      `,
      [workspace.id, itemKey]
    );

    if (workflowLookup.rowCount !== 1) {
      throw applicationError(
        404,
        'ITEM_NOT_FOUND',
        `Item '${itemKey}' was not found.`
      );
    }

    item = {
      id: workflowLookup.rows[0].workflow_key,
      name: workflowLookup.rows[0].name,
      type: 'workflow',
      databaseId: null,
      parentDatabaseId: workflowLookup.rows[0].folder_id,
    };
  }

  const chain = [
    {
      id: item.id,
      name: item.name,
      type: item.type,
    },
  ];

  let currentParentId = item.parentDatabaseId;

  while (currentParentId) {
    const parentResult = await client.query(
      `
        SELECT id, folder_key, name, parent_id
        FROM autoflow.workspace_folder
        WHERE workspace_id = $1
          AND id = $2
          AND deleted_at IS NULL
        LIMIT 1
      `,
      [workspace.id, currentParentId]
    );

    if (parentResult.rowCount !== 1) break;

    const parent = parentResult.rows[0];
    chain.unshift({
      id: parent.folder_key,
      name: parent.name,
      type: 'folder',
    });
    currentParentId = parent.parent_id;
  }

  return chain;
}

async function checkDuplicate(input, options = {}) {
  const client = options.client || { query };
  const workspace = await workspaceRow(
    client,
    options.workspaceKey || 'default'
  );
  const parent = await folderRow(
    client,
    workspace.id,
    input.parentId || ROOT_FOLDER_ID
  );
  const name = sanitizeName(input.name);
  const excludeId = input.excludeId || null;

  if (input.type === 'folder') {
    const result = await client.query(
      `
        SELECT EXISTS (
          SELECT 1
          FROM autoflow.workspace_folder
          WHERE workspace_id = $1
            AND parent_id = $2
            AND lower(name) = lower($3)
            AND deleted_at IS NULL
            AND ($4::text IS NULL OR folder_key <> $4)
        ) AS duplicate
      `,
      [workspace.id, parent.id, name, excludeId]
    );
    return result.rows[0].duplicate;
  }

  const result = await client.query(
    `
      SELECT EXISTS (
        SELECT 1
        FROM autoflow.workflow
        WHERE workspace_id = $1
          AND folder_id = $2
          AND lower(name) = lower($3)
          AND deleted_at IS NULL
          AND ($4::text IS NULL OR workflow_key <> $4)
      ) AS duplicate
    `,
    [workspace.id, parent.id, name, excludeId]
  );

  return result.rows[0].duplicate;
}

module.exports = {
  checkDuplicate,
  createFolder,
  createWorkflow,
  deleteFolder,
  deleteWorkflow,
  getBreadcrumb,
  getFolder,
  getWorkflow,
  listChildren,
  renameFolder,
  renameWorkflow,
  updateFolder,
  updateWorkflow,
};
