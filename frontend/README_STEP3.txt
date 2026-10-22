AutoFlow Database Integration - Step 3
======================================

Purpose
-------
Migrate the current filesystem workspace into PostgreSQL without deleting or
changing workspace.json, workflow JSON files, or the current frontend API.

Files added
-----------
backend/db/filesystemWorkspaceMigration.js
backend/scripts/migrateFilesystemWorkspaceToPostgres.js
backend/scripts/compareWorkspaceSources.js

Data imported
-------------
- workspace storage-root metadata
- folders
- workflow metadata
- immutable workflow versions
- workflow nodes
- connections
- variables
- schedule
- triggers
- audit entry

Safety controls
---------------
1. Dry run is the default.
2. Apply requires the explicit --apply flag.
3. Apply creates a timestamped file backup before opening the DB transaction.
4. All DB writes use one PostgreSQL transaction.
5. Existing source files are not modified or deleted.
6. Unchanged workflow definitions are not duplicated on rerun.
7. Secret workflow variable values are redacted.

Commands
--------
From backend:

1. Dry run:
   node scripts\migrateFilesystemWorkspaceToPostgres.js --dry-run

2. Apply:
   node scripts\migrateFilesystemWorkspaceToPostgres.js --apply

3. Compare:
   node scripts\compareWorkspaceSources.js

Optional explicit workspace root:
   --workspace-root "D:\LE-PRODUCT-NEW\NewTestFiles"

Expected backup location
------------------------
backend/migration_backups/filesystem-to-postgres-<timestamp>/

Do not set PERSISTENCE_MODE=postgres yet.
Run the parity check first.
