AutoFlow Database Phase 2 - Step 6B.2
==========================================

Milestone
---------
Transactional migration of legacy execution history into PostgreSQL.

Verified source
---------------
- 10 workflow run directories
- 106 valid execution snapshots
- 626 node execution records
- 0 invalid snapshots
- 0 version-mapping blockers

Version selection
-----------------
Each run is linked using this deterministic priority:

1. Recovered historical workflow version whose recovery provenance explicitly
   contains the runId.
2. Current workflow version when it contains every executed node.
3. Highest exact matching immutable workflow version.

This prevents recovered legacy runs from being linked accidentally to a modern
workflow version that happens to contain the same subset of nodes.

Database targets
----------------
- autoflow.workflow_execution
- autoflow.node_execution
- autoflow.execution_log

The execution repository is also updated to accept an explicit immutable
workflowVersionId. Existing execution rows cannot silently change versions.

Safety
------
- Dry run performs the complete migration inside one transaction and rolls back.
- Apply performs the complete migration inside one transaction and commits.
- PostgreSQL advisory lock prevents concurrent execution-history migration.
- Source .runs files are hashed before and after.
- Source files are never renamed, deleted or modified.
- All execution/node/log counts are verified before commit.
- Every run's workflow-version link is verified.
- Every run's node signature is verified.
- Migration provenance and source SHA-256 are stored in full_snapshot_json.
- Likely password/token/secret values are redacted by executionRepository.
- retentionDays=0 preserves imported historical runs indefinitely.
- The batch ID is deterministic from source paths and SHA-256 hashes.
- Re-running the same source set is idempotent.
- A rollback script deletes only executions carrying the selected batch ID.

Files
-----
backend\db\executionRepository.js
backend\scripts\migrateFilesystemRunsToPostgres.js
backend\scripts\rollbackExecutionHistoryMigration.js

Commands
--------
1. Extract into the AutoFlow project root.

2. Back up the current repository:
   copy /Y "backend\db\executionRepository.js" ^
     "backend\db\executionRepository.before-step6b2.js"

   Do the backup BEFORE extracting when applying manually. If already extracted,
   use your Step 6A Fix 1 ZIP as the prior repository backup.

3. Syntax:
   node --check db\executionRepository.js
   node --check scripts\migrateFilesystemRunsToPostgres.js
   node --check scripts\rollbackExecutionHistoryMigration.js

4. Dry run while backend may remain stopped:
   node scripts\migrateFilesystemRunsToPostgres.js --dry-run

Expected:
   Snapshot files              : 106
   Executions planned          : 106
   Node executions planned     : 626
   Migration blockers          : 0
   Workflow-version linkage    : PASS
   Execution node signatures   : PASS
   Source file hashes          : PASS
   Database transaction        : ROLLED BACK
   RESULT                      : EXECUTION HISTORY MIGRATION DRY RUN PASSED

5. Keep backend stopped and apply:
   node scripts\migrateFilesystemRunsToPostgres.js --apply

Expected:
   Executions verified         : 106
   Node executions verified    : 626
   Database transaction        : COMMITTED
   Filesystem run changes      : NONE
   RESULT                      : EXECUTION HISTORY MIGRATED

6. Keep the printed migration batch ID and manifest.

Rollback
--------
Before API cutover, the execution migration can be rolled back:

  node scripts\rollbackExecutionHistoryMigration.js --dry-run ^
    --batch-id "<batch-id>"

  node scripts\rollbackExecutionHistoryMigration.js --apply ^
    --batch-id "<batch-id>"

This rollback does not remove the 7 recovered historical workflow versions.
Those have their own rollback tool and become protected once executions refer
to them.

Next
----
After migration passes, Step 6B.3 will compare PostgreSQL run responses against
the filesystem contract and add an independent execution persistence flag before
switching the live /api/workspace/workflows/:id/runs routes.
