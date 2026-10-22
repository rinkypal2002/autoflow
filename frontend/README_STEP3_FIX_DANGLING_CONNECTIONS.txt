AutoFlow Step 3 Fix - Dangling Workflow Connections
====================================================

Problem detected
----------------
The migration dry run found a workflow connection whose source or target node
no longer exists. PostgreSQL correctly refuses this because workflow_connection
has foreign keys to workflow_node.

Why removal is correct
----------------------
A connection without both endpoint nodes cannot be rendered or executed. It is
a stale canvas edge, usually left after a node was deleted.

Safety
------
- Dry run is the default.
- Apply requires --apply.
- Every affected workflow JSON file is backed up first.
- The script removes only exact connection ID/source/target matches.
- Writes use a temporary file and atomic rename.
- No PostgreSQL data is changed.
- workspace.json is not changed.

Commands
--------
From backend:

1. Inspect:
   node scripts\repairDanglingConnections.js --dry-run

2. Repair:
   node scripts\repairDanglingConnections.js --apply

3. Validate migration again:
   node scripts\migrateFilesystemWorkspaceToPostgres.js --dry-run

Expected backup location
------------------------
backend\migration_backups\dangling-connections-<timestamp>\
