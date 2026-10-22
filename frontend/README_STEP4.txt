AutoFlow Database Integration - Step 4
======================================

Purpose
-------
Verify PostgreSQL create/update/move/version/delete behavior through a separate
shadow API. The stabilized frontend still uses /api/workspace/* and remains on
filesystem persistence.

New/updated files
-----------------
backend/db/workspaceWriteRepository.js
backend/routes/databaseWorkspaceRoutes.js
backend/scripts/testDatabaseWorkspaceCrud.js
backend/.env.step4.additions

Shadow write endpoints
----------------------
POST   /api/db/workspace/folders
PUT    /api/db/workspace/folders/:id
DELETE /api/db/workspace/folders/:id

POST   /api/db/workspace/workflows
GET    /api/db/workspace/workflows/:id
PUT    /api/db/workspace/workflows/:id
PUT    /api/db/workspace/workflows/:id/rename
DELETE /api/db/workspace/workflows/:id

POST   /api/db/workspace/check-duplicate

Additional read parity endpoints
--------------------------------
GET /api/db/workspace/children/:parentId
GET /api/db/workspace/breadcrumb/:id
GET /api/db/workspace/folders/:id

Safety
------
- Writes require DATABASE_SHADOW_WRITE_ENABLED=true.
- The repository uses PostgreSQL transactions.
- Workflow saves create immutable versions.
- Nodes, connections, variables, schedules, and triggers are normalized.
- Secret variable values are redacted from both definition_json and variables.
- The automated CRUD test runs inside one transaction and rolls it back.
- Existing filesystem workspace files are not read or modified by Step 4.
- PERSISTENCE_MODE must remain filesystem.

Verification
------------
From backend:

1. Add Step 4 environment settings to .env.
2. Run:
   node scripts\testDatabaseWorkspaceCrud.js

Expected:
   RESULT : SHADOW CRUD VERIFIED

3. Start backend:
   npm start

4. Check:
   curl.exe http://localhost:8081/api/db/workspace/status

The response should include:
   "writeEnabled": true
