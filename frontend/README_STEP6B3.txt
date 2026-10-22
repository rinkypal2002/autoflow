AutoFlow Database Phase 2 - Step 6B.3
==========================================

Milestone
---------
Execution API parity and live PostgreSQL cutover.

Already completed
-----------------
- 106 workflow_execution rows migrated
- 626 node_execution rows migrated
- 27 recovered historical-version links
- 79 current-version links
- filesystem migration batch:
  filesystem-runs-v1-107f50cdbf418f11

Files
-----
backend\routes\postgresExecutionRunRoutes.js
backend\scripts\applyStep6B3ServerPatch.js
backend\scripts\testExecutionApiParity.js
backend\scripts\testPostgresExecutionApi.js
backend\.env.step6b3.additions

Existing frontend contract preserved
------------------------------------
POST   /api/workspace/workflows/:id/runs
GET    /api/workspace/workflows/:id/runs
GET    /api/workspace/workflows/:id/runs/:runId
DELETE /api/workspace/workflows/:id/runs/:runId

Response shapes remain:
- POST:   { status: "success", runId }
- LIST:   { status: "success", runs: [...] }
- DETAIL: { status: "success", run: snapshot }
- DELETE: { status: "success" }

Internal migration provenance is not returned to the frontend.

Independent rollback
--------------------
Workspace design remains PostgreSQL-backed:

  PERSISTENCE_MODE=postgres
  DATABASE_PRIMARY_WRITE_ENABLED=true

Execution history has its own switches:

  EXECUTION_PERSISTENCE_MODE=filesystem|postgres
  DATABASE_EXECUTION_WRITE_ENABLED=false|true

Setting EXECUTION_PERSISTENCE_MODE=filesystem immediately restores the original
.runs endpoints without changing folders, workflows, versions or canvas data.

Recommended sequence
--------------------
1. Extract package.
2. Run server-patch dry run.
3. Apply server patch.
4. Keep execution persistence in filesystem mode.
5. Run execution parity test.
6. Update .env to postgres execution mode.
7. Restart backend.
8. Verify health.
9. Run API smoke test.
10. Keep .runs unchanged during the certification period.

Commands
--------
From backend:

  node scripts\applyStep6B3ServerPatch.js --dry-run
  node scripts\applyStep6B3ServerPatch.js --apply

  node --check routes\postgresExecutionRunRoutes.js
  node --check scripts\testExecutionApiParity.js
  node --check scripts\testPostgresExecutionApi.js
  node --check server.js
  node --check config.js

Before cutover:

  node scripts\testExecutionApiParity.js

Expected:
  Database executions         : 106
  Snapshots compared          : 106
  Node records compared       : 626
  Recovered-version links     : 27
  Current-version links       : 79
  Sanitized full snapshots    : PASS
  Run-list response contract  : PASS
  Source SHA-256 parity       : PASS
  RESULT                      : EXECUTION API PARITY VERIFIED

Cutover .env:

  EXECUTION_PERSISTENCE_MODE=postgres
  DATABASE_EXECUTION_WRITE_ENABLED=true
  EXECUTION_RETENTION_DAYS=30
  EXECUTION_MAX_BYTES=8388608
  EXECUTION_LIST_LIMIT=25

After backend restart:

  curl.exe http://localhost:8081/api/health
  curl.exe http://localhost:8081/api/workspace/execution-persistence/status

Then:

  node scripts\testPostgresExecutionApi.js

Expected:
  Health cutover state        : PASS
  Execution POST              : PASS
  Execution list              : PASS
  Execution detail            : PASS
  Execution DELETE            : PASS
  Temporary rows remaining    : 0
  RESULT                      : POSTGRES EXECUTION API VERIFIED

Rollback
--------
Stop backend, set:

  EXECUTION_PERSISTENCE_MODE=filesystem
  DATABASE_EXECUTION_WRITE_ENABLED=false

Restart backend. Existing .runs files were never removed, so the original
execution-history implementation becomes active immediately.

Do not delete .runs yet.
