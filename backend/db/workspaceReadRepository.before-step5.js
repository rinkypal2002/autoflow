'use strict';

const { query } = require('./pool');

function normalizeWorkspaceKey(value) {
  const key = String(value || 'default').trim();
  if (!key) {
    throw new Error('Workspace key cannot be empty.');
  }
  if (key.length > 100) {
    throw new Error('Workspace key is too long.');
  }
  return key;
}

async function getWorkspaceRow(workspaceKey = 'default') {
  const key = normalizeWorkspaceKey(workspaceKey);

  const result = await query(
    `
      SELECT
        id,
        workspace_key,
        name,
        description,
        status,
        storage_mode,
        is_default,
        settings AS metadata,
        row_version,
        created_at,
        updated_at
      FROM autoflow.workspace
      WHERE workspace_key = $1
        AND deleted_at IS NULL
      LIMIT 1
    `,
    [key]
  );

  return result.rows[0] || null;
}

async function requireWorkspaceRow(workspaceKey = 'default') {
  const workspace = await getWorkspaceRow(workspaceKey);
  if (!workspace) {
    const error = new Error(
      `Active AutoFlow workspace '${workspaceKey}' was not found in PostgreSQL.`
    );
    error.code = 'WORKSPACE_NOT_FOUND';
    throw error;
  }
  return workspace;
}

async function getWorkspaceStatus(workspaceKey = 'default') {
  const workspace = await requireWorkspaceRow(workspaceKey);

  const result = await query(
    `
      SELECT
        count(*) FILTER (
          WHERE folder.deleted_at IS NULL
        )::integer AS folder_count,
        count(*) FILTER (
          WHERE folder.is_root = true
            AND folder.deleted_at IS NULL
        )::integer AS root_count,
        (
          SELECT count(*)::integer
          FROM autoflow.workflow workflow
          WHERE workflow.workspace_id = $1
            AND workflow.deleted_at IS NULL
        ) AS workflow_count
      FROM autoflow.workspace_folder folder
      WHERE folder.workspace_id = $1
    `,
    [workspace.id]
  );

  const counts = result.rows[0] || {
    folder_count: 0,
    root_count: 0,
    workflow_count: 0,
  };

  return {
    id: workspace.id,
    workspaceKey: workspace.workspace_key,
    name: workspace.name,
    description: workspace.description,
    status: workspace.status,
    storageMode: workspace.storage_mode,
    isDefault: workspace.is_default,
    metadata: workspace.metadata || {},
    rowVersion: Number(workspace.row_version || 0),
    createdAt: workspace.created_at,
    updatedAt: workspace.updated_at,
    folderCount: counts.folder_count,
    workflowCount: counts.workflow_count,
    rootCount: counts.root_count,
  };
}

async function listFolders(workspaceKey = 'default') {
  const workspace = await requireWorkspaceRow(workspaceKey);

  const result = await query(
    `
      SELECT
        folder.folder_key AS id,
        folder.name,
        parent.folder_key AS "parentId",
        'folder'::text AS type,
        folder.is_root AS "isRoot",
        folder.sort_order AS "sortOrder",
        folder.metadata,
        folder.row_version AS "rowVersion",
        folder.created_at AS "createdAt",
        folder.updated_at AS "updatedAt"
      FROM autoflow.workspace_folder folder
      LEFT JOIN autoflow.workspace_folder parent
        ON parent.workspace_id = folder.workspace_id
       AND parent.id = folder.parent_id
      WHERE folder.workspace_id = $1
        AND folder.deleted_at IS NULL
      ORDER BY
        folder.is_root DESC,
        folder.sort_order,
        lower(folder.name),
        folder.folder_key
    `,
    [workspace.id]
  );

  return result.rows.map((folder) => ({
    ...folder,
    rowVersion: Number(folder.rowVersion || 0),
    path: null,
  }));
}

async function listWorkflows(workspaceKey = 'default') {
  const workspace = await requireWorkspaceRow(workspaceKey);

  const result = await query(
    `
      SELECT
        workflow.workflow_key AS id,
        workflow.name,
        'workflow'::text AS type,
        folder.folder_key AS "parentId",
        workflow.status,
        workflow.last_run_at AS "lastRun",
        workflow.updated_at AS "updatedAt",
        workflow.icon,
        workflow.description,
        workflow.current_version_number::text AS version,
        workflow.created_at AS "createdAt",
        workflow.sort_order AS "sortOrder",
        workflow.metadata,
        workflow.row_version AS "rowVersion"
      FROM autoflow.workflow workflow
      JOIN autoflow.workspace_folder folder
        ON folder.workspace_id = workflow.workspace_id
       AND folder.id = workflow.folder_id
       AND folder.deleted_at IS NULL
      WHERE workflow.workspace_id = $1
        AND workflow.deleted_at IS NULL
      ORDER BY
        workflow.sort_order,
        lower(workflow.name),
        workflow.workflow_key
    `,
    [workspace.id]
  );

  return result.rows.map((workflow) => ({
    ...workflow,
    rowVersion: Number(workflow.rowVersion || 0),
    path: null,
  }));
}

async function getWorkspaceTree(workspaceKey = 'default') {
  const [workspace, folders, workflows] = await Promise.all([
    getWorkspaceStatus(workspaceKey),
    listFolders(workspaceKey),
    listWorkflows(workspaceKey),
  ]);

  const folderMap = Object.fromEntries(
    folders.map((folder) => [folder.id, folder])
  );
  const workflowMap = Object.fromEntries(
    workflows.map((workflow) => [workflow.id, workflow])
  );

  return {
    workspace,
    folders: folderMap,
    workflows: workflowMap,
  };
}

module.exports = {
  getWorkspaceStatus,
  getWorkspaceTree,
  listFolders,
  listWorkflows,
};
