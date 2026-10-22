AutoFlow Database Integration - Step 2
======================================

Purpose
-------
Add a PostgreSQL-backed read repository and a separate shadow API without
changing the existing /api/workspace/* filesystem routes.

New shadow endpoints
--------------------
GET /api/db/workspace/status
GET /api/db/workspace/tree
GET /api/db/workspace/folders
GET /api/db/workspace/workflows

The existing frontend still uses:
GET /api/workspace/*
POST/PUT/DELETE /api/workspace/*

Therefore this step cannot overwrite or delete current workflow files.

Files in this overlay
---------------------
backend/db/workspaceReadRepository.js
backend/routes/databaseWorkspaceRoutes.js
backend/scripts/testWorkspaceReadRepository.js
backend/config.js
backend/server.js
backend/.env.step2.additions

Required .env additions
-----------------------
PERSISTENCE_MODE=filesystem
DATABASE_SHADOW_API_ENABLED=true
DB_WORKSPACE_KEY=default

Verification
------------
1. From backend:
   node scripts\testWorkspaceReadRepository.js

2. Start backend:
   npm start

3. From a second Command Prompt:
   curl http://localhost:8081/api/db/workspace/status
   curl http://localhost:8081/api/db/workspace/tree
   curl http://localhost:8081/api/db/workspace/folders
   curl http://localhost:8081/api/db/workspace/workflows

Expected at this stage
----------------------
- status source is "postgresql"
- folder count is 1
- folders contains root
- workflows is empty
- original /api/workspace endpoints still behave exactly as before

Do not set PERSISTENCE_MODE=postgres yet.
