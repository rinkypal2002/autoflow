AutoFlow Database Phase 2 - Step 6A
========================================

Milestone
---------
Execution Persistence Foundation

This package verifies the PostgreSQL mapping for:
- autoflow.workflow_execution
- autoflow.node_execution
- autoflow.execution_log

It does not change the live /api/workspace/.../runs endpoints yet.

Files
-----
backend/db/executionRepository.js
backend/scripts/testDatabaseExecutionRepository.js
backend/scripts/inspectFilesystemRuns.js

Safety
------
- The repository test uses a real migrated workflow version.
- Temporary execution data is created inside one transaction.
- It verifies two incremental snapshots of the same run.
- It verifies normalized node rows and structured logs.
- It redacts likely password/token/secret keys.
- It deletes the temporary execution to verify cascades.
- The entire test transaction is rolled back.
- Current PostgreSQL execution counts remain unchanged.
- Existing .runs files remain untouched.

Commands
--------
From backend:

1. Verify execution repository:
   node scripts\testDatabaseExecutionRepository.js

Expected:
   RESULT : EXECUTION FOUNDATION VERIFIED

2. Inspect existing filesystem run snapshots:
   node scripts\inspectFilesystemRuns.js

Possible expected outcomes:
   RESULT : NO FILESYSTEM RUNS FOUND
or
   RESULT : FILESYSTEM RUN INSPECTION PASSED

Next step
---------
After both commands pass, Step 6B will:
- add PostgreSQL-compatible run API routes;
- migrate valid .runs snapshots;
- compare database and filesystem run history;
- switch execution persistence using an independent rollback flag.

Keep:
PERSISTENCE_MODE=postgres

Do not change execution run routing yet.
