'use strict';

const { query } = require('./pool');

const REQUIRED_TABLES = Object.freeze([
  'workspace',
  'workspace_folder',
  'workflow',
  'workflow_version',
  'credential_reference',
  'workflow_node',
  'workflow_connection',
  'workflow_variable',
  'workflow_schedule',
  'workflow_trigger',
  'workflow_execution',
  'node_execution',
  'execution_output_index',
  'execution_log',
  'execution_artifact',
  'plugin_endpoint_mapping',
  'connector_configuration',
  'audit_log',
]);

const REQUIRED_VIEWS = Object.freeze([
  'workflow_frontend_summary_v1',
  'workflow_current_definition_v1',
  'workflow_execution_summary_v1',
  'output_binding_source_v1',
]);

const CRITICAL_COLUMNS = Object.freeze({
  workspace: [
    'id', 'workspace_key', 'name', 'status', 'settings', 'row_version',
    'created_at', 'updated_at', 'deleted_at',
  ],
  workspace_folder: [
    'id', 'workspace_id', 'folder_key', 'name', 'parent_id', 'is_root',
    'sort_order', 'metadata', 'row_version', 'deleted_at',
  ],
  workflow: [
    'id', 'workspace_id', 'folder_id', 'workflow_key', 'name', 'status',
    'current_version_number', 'metadata', 'row_version', 'deleted_at',
  ],
  workflow_version: [
    'id', 'workspace_id', 'workflow_id', 'version_number', 'version_label',
    'definition_json', 'definition_sha256', 'definition_schema_version',
    'action_count', 'connection_count', 'variable_count', 'source_type',
    'created_at',
  ],
  workflow_node: [
    'id', 'workspace_id', 'workflow_id', 'workflow_version_id', 'node_key',
    'node_type', 'properties_json', 'node_json',
  ],
  workflow_connection: [
    'id', 'workspace_id', 'workflow_id', 'workflow_version_id',
    'connection_key', 'source_node_key', 'target_node_key', 'connection_json',
  ],
  workflow_variable: [
    'id', 'workspace_id', 'workflow_id', 'workflow_version_id',
    'variable_key', 'name', 'data_type', 'scope', 'is_secret', 'value_json',
    'default_value_json',
  ],
  workflow_execution: [
    'id', 'workspace_id', 'workflow_id', 'workflow_version_id',
    'execution_key', 'status', 'started_at', 'updated_at', 'full_snapshot_json',
    'retention_expires_at', 'deleted_at',
  ],
  node_execution: [
    'id', 'workspace_id', 'workflow_id', 'workflow_version_id', 'execution_id',
    'node_key',
    'execution_instance_key', 'execution_instance_sequence', 'is_instance_final_attempt',
    'status', 'business_output_json', 'technical_output_json',
    'flattened_output_json', 'error_json',
  ],
  execution_output_index: [
    'id', 'execution_id', 'node_execution_id', 'field_key', 'field_path',
    'binding_path', 'field_kind', 'value_type', 'value_json',
  ],
  execution_artifact: ['id', 'execution_id'],
  credential_reference: ['id', 'workspace_id'],
  connector_configuration: ['id', 'workspace_id'],
  plugin_endpoint_mapping: ['id'],
  audit_log: ['id', 'workspace_id', 'occurred_at'],
});

const REQUIRED_TRIGGERS = Object.freeze([
  'trg_workflow_version_sync_current',
]);

function rowsToSet(rows, field) {
  return new Set(rows.map((row) => String(row[field])));
}

function countValue(result, field = 'count') {
  const raw = result?.rows?.[0]?.[field];
  const value = Number(raw);
  return Number.isFinite(value) ? value : 0;
}

async function inspectDatabaseContract(options = {}) {
  const queryFn = options.queryFn || query;
  const schema = String(options.schema || process.env.DB_SCHEMA || 'autoflow');
  if (!/^[a-z_][a-z0-9_]*$/i.test(schema)) {
    throw new Error(`Invalid PostgreSQL schema identifier '${schema}'.`);
  }
  const startedAt = Date.now();

  const schemaResult = await queryFn(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.schemata WHERE schema_name = $1
     ) AS exists`,
    [schema]
  );
  const schemaExists = Boolean(schemaResult.rows[0]?.exists);

  if (!schemaExists) {
    return {
      status: 'error',
      verdict: 'DATABASE_SCHEMA_MISSING',
      readOnly: true,
      schema,
      durationMs: Date.now() - startedAt,
      problems: [`Required PostgreSQL schema '${schema}' does not exist.`],
      warnings: [],
      objects: {
        requiredTables: REQUIRED_TABLES.length,
        existingTables: 0,
        missingTables: [...REQUIRED_TABLES],
        requiredViews: REQUIRED_VIEWS.length,
        existingViews: 0,
        missingViews: [...REQUIRED_VIEWS],
        missingColumns: [],
        missingTriggers: [...REQUIRED_TRIGGERS],
      },
      invariants: {},
      futureModules: {},
    };
  }

  const [tableResult, viewResult, columnResult, triggerResult] = await Promise.all([
    queryFn(
      `SELECT table_name
         FROM information_schema.tables
        WHERE table_schema = $1 AND table_type = 'BASE TABLE'`,
      [schema]
    ),
    queryFn(
      `SELECT table_name
         FROM information_schema.views
        WHERE table_schema = $1`,
      [schema]
    ),
    queryFn(
      `SELECT table_name, column_name
         FROM information_schema.columns
        WHERE table_schema = $1`,
      [schema]
    ),
    queryFn(
      `SELECT trigger_name
         FROM information_schema.triggers
        WHERE trigger_schema = $1`,
      [schema]
    ),
  ]);

  const existingTables = rowsToSet(tableResult.rows, 'table_name');
  const existingViews = rowsToSet(viewResult.rows, 'table_name');
  const existingTriggers = rowsToSet(triggerResult.rows, 'trigger_name');
  const columnsByTable = new Map();
  for (const row of columnResult.rows) {
    const tableName = String(row.table_name);
    const bucket = columnsByTable.get(tableName) || new Set();
    bucket.add(String(row.column_name));
    columnsByTable.set(tableName, bucket);
  }

  const missingTables = REQUIRED_TABLES.filter((name) => !existingTables.has(name));
  const missingViews = REQUIRED_VIEWS.filter((name) => !existingViews.has(name));
  const missingTriggers = REQUIRED_TRIGGERS.filter((name) => !existingTriggers.has(name));
  const missingColumns = [];
  for (const [tableName, requiredColumns] of Object.entries(CRITICAL_COLUMNS)) {
    const columns = columnsByTable.get(tableName) || new Set();
    for (const columnName of requiredColumns) {
      if (!columns.has(columnName)) missingColumns.push(`${tableName}.${columnName}`);
    }
  }

  const invariants = {};
  const canRunCoreChecks = missingTables.length === 0 && missingColumns.length === 0;
  if (canRunCoreChecks) {
    const invariantResults = await Promise.all([
      queryFn(
        `SELECT count(*)::integer AS count
           FROM ${schema}.workflow workflow
          WHERE workflow.deleted_at IS NULL
            AND NOT EXISTS (
              SELECT 1
                FROM ${schema}.workflow_version version
               WHERE version.workspace_id = workflow.workspace_id
                 AND version.workflow_id = workflow.id
                 AND version.version_number = workflow.current_version_number
            )`
      ),
      queryFn(
        `SELECT count(*)::integer AS count
           FROM ${schema}.workflow_version
          WHERE definition_sha256 IS NULL
             OR definition_sha256 !~ '^[0-9a-f]{64}$'
             OR definition_sha256 = repeat('0', 64)`
      ),
      queryFn(
        `SELECT count(*)::integer AS count
           FROM ${schema}.workflow_variable
          WHERE is_secret = true
            AND (
              (value_json IS NOT NULL AND value_json <> 'null'::jsonb)
              OR
              (default_value_json IS NOT NULL AND default_value_json <> 'null'::jsonb)
            )`
      ),
      queryFn(
        `SELECT count(*)::integer AS count
           FROM ${schema}.workflow_connection connection
          WHERE NOT EXISTS (
                  SELECT 1 FROM ${schema}.workflow_node node
                   WHERE node.workspace_id = connection.workspace_id
                     AND node.workflow_version_id = connection.workflow_version_id
                     AND node.node_key = connection.source_node_key
                )
             OR NOT EXISTS (
                  SELECT 1 FROM ${schema}.workflow_node node
                   WHERE node.workspace_id = connection.workspace_id
                     AND node.workflow_version_id = connection.workflow_version_id
                     AND node.node_key = connection.target_node_key
                )`
      ),
      queryFn(
        `SELECT count(*)::integer AS count
           FROM ${schema}.workflow_execution execution
          WHERE NOT EXISTS (
            SELECT 1 FROM ${schema}.workflow_version version
             WHERE version.id = execution.workflow_version_id
               AND version.workspace_id = execution.workspace_id
          )`
      ),
      queryFn(
        `SELECT count(*)::integer AS count
           FROM (
             SELECT execution_id, node_execution_id, field_path, field_kind, count(*)
               FROM ${schema}.execution_output_index
              GROUP BY execution_id, node_execution_id, field_path, field_kind
             HAVING count(*) > 1
           ) duplicate_paths`
      ),
    ]);

    invariants.workflowsMissingCurrentVersion = countValue(invariantResults[0]);
    invariants.invalidDefinitionHashes = countValue(invariantResults[1]);
    invariants.secretValuesPersisted = countValue(invariantResults[2]);
    invariants.danglingConnections = countValue(invariantResults[3]);
    invariants.executionsMissingVersion = countValue(invariantResults[4]);
    invariants.duplicateOutputIndexPaths = countValue(invariantResults[5]);
  }

  const problems = [];
  const warnings = [];
  if (missingTables.length) problems.push(`Missing tables: ${missingTables.join(', ')}`);
  if (missingViews.length) problems.push(`Missing views: ${missingViews.join(', ')}`);
  if (missingColumns.length) problems.push(`Missing critical columns: ${missingColumns.join(', ')}`);
  if (missingTriggers.length) problems.push(`Missing triggers: ${missingTriggers.join(', ')}`);

  for (const [name, value] of Object.entries(invariants)) {
    if (value > 0) problems.push(`${name}: ${value}`);
  }

  const futureModules = {
    credentialsReady: existingTables.has('credential_reference'),
    connectorsReady: existingTables.has('connector_configuration'),
    pluginMappingReady: existingTables.has('plugin_endpoint_mapping'),
    fileArtifactsReady: existingTables.has('execution_artifact'),
    auditReady: existingTables.has('audit_log'),
  };
  for (const [name, ready] of Object.entries(futureModules)) {
    if (!ready) warnings.push(`${name} is not ready.`);
  }

  return {
    status: problems.length ? 'error' : 'success',
    verdict: problems.length
      ? 'DATABASE_CLOSURE_BLOCKED'
      : 'DATABASE_CLOSURE_CONTRACT_VERIFIED',
    readOnly: true,
    schema,
    durationMs: Date.now() - startedAt,
    problems,
    warnings,
    objects: {
      requiredTables: REQUIRED_TABLES.length,
      existingTables: REQUIRED_TABLES.filter((name) => existingTables.has(name)).length,
      missingTables,
      requiredViews: REQUIRED_VIEWS.length,
      existingViews: REQUIRED_VIEWS.filter((name) => existingViews.has(name)).length,
      missingViews,
      missingColumns,
      missingTriggers,
    },
    invariants,
    futureModules,
  };
}

module.exports = {
  REQUIRED_TABLES,
  REQUIRED_VIEWS,
  CRITICAL_COLUMNS,
  REQUIRED_TRIGGERS,
  inspectDatabaseContract,
};
