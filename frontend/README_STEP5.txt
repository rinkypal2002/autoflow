AutoFlow Database Integration - Step 5
======================================

Purpose
-------
Switch the existing frontend-compatible /api/workspace CRUD endpoints from
filesystem persistence to PostgreSQL while preserving the same response shapes.

Step 5 moves
------------
- folders
- workflows
- immutable workflow versions
- nodes
- connections
- variables
- schedules
- triggers

Still on filesystem during Step 5
---------------------------------
- execution run snapshots under .runs/
- file-operation sandbox
- imported/exported artifacts

Why the old routes remain in server.js
--------------------------------------
The PostgreSQL compatibility router is mounted first only when:
  PERSISTENCE_MODE=postgres

Matching workspace CRUD calls are handled by PostgreSQL. Unmatched endpoints,
including workflow run snapshots, continue to the stabilized filesystem code.

Safety switches
---------------
PERSISTENCE_MODE=postgres
DATABASE_PRIMARY_WRITE_ENABLED=true

Both are required for full database CRUD. A rollback requires only:
PERSISTENCE_MODE=filesystem

Files
-----
backend/config.js
backend/server.js
backend/db/workspaceReadRepository.js
backend/db/workspaceWriteRepository.js
backend/routes/databaseWorkspaceRoutes.js
backend/routes/postgresWorkspaceCompatibilityRoutes.js
backend/scripts/testPostgresCutoverReadiness.js
backend/.env.step5.additions

Required order
--------------
1. Keep PERSISTENCE_MODE=filesystem.
2. Extract overlay.
3. Run:
   node scripts\testPostgresCutoverReadiness.js
4. Confirm:
   RESULT : POSTGRES CUTOVER READY
5. Edit .env:
   PERSISTENCE_MODE=postgres
   DATABASE_PRIMARY_WRITE_ENABLED=true
6. Start backend.
7. Verify:
   curl.exe http://localhost:8081/api/health
   curl.exe http://localhost:8081/api/workspace/status
   curl.exe http://localhost:8081/api/workspace/tree
8. Open frontend and test:
   - open existing workflow
   - create temporary folder
   - move folder
   - create temporary workflow
   - save two-node workflow
   - rename workflow
   - delete temporary workflow/folder

Instant rollback
----------------
Stop backend, set:
  PERSISTENCE_MODE=filesystem

Then restart. Existing filesystem files were not changed by PostgreSQL CRUD.
