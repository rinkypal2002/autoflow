AutoFlow Database Phase 3 - Step 7B.4
========================================
Live Transactional Execution Output Indexing

Purpose
-------
Indexes every new or updated final node execution in the same PostgreSQL
transaction that stores workflow_execution, node_execution and execution_log.

Safety
------
- Disabled by default.
- Existing 8,257 Step 7B.3 rows are not modified while the flag is false.
- A projection failure rolls back the complete execution snapshot transaction.
- Secret previews and JSON values remain suppressed.
- Previous retry-attempt index rows are removed when a new final attempt wins.
- Raw execution snapshots and existing API response contracts are preserved.

Feature flag
------------
EXECUTION_OUTPUT_INDEX_WRITE_ENABLED=false

Installation verification
-------------------------
cd backend
npm run test:output-projection
npm run test:output-index-backfill-tools
npm run test:live-output-index

Controlled certification sequence
---------------------------------
1. Keep the flag false and start the backend.
2. Confirm /api/health reports executionOutputIndexWriteEnabled=false.
3. Stop the backend, set EXECUTION_OUTPUT_INDEX_WRITE_ENABLED=true, restart.
4. Confirm /api/health reports executionOutputIndexWriteEnabled=true.
5. Execute exactly one controlled workflow from the UI.
6. Run:
   npm run inspect:live-output-index -- --out migration_backups\step7b4-live-output-index-status.json
7. Confirm LIVE_OUTPUT_INDEX_COVERAGE_VERIFIED.
8. Confirm historical Step 7B.3 rows are still present.

Immediate rollback
------------------
Stop the backend, set EXECUTION_OUTPUT_INDEX_WRITE_ENABLED=false, and restart.
This disables all future live index writes without changing execution history.
