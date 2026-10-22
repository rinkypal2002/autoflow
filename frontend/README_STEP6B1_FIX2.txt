AutoFlow Database Phase 2 - Step 6B.1 Fix 2
================================================

Milestone
---------
Create immutable execution-observed historical workflow versions.

Planned result
--------------
The verified plan requires:

- 7 recovered workflow_version rows
- 38 recovered workflow_node rows
- 4 affected workflows
- 27 previously blocked historical runs
- no change to any live workflow.current_version_number

What is persisted
-----------------
Only execution-observed definition metadata:

- node ID
- node name
- step key
- node type
- category
- observed sequence
- run IDs and source-file references as recovery provenance

What is NOT copied into workflow versions
-----------------------------------------
- execution inputs
- execution outputs
- variables or environment
- logs
- credentials or secrets
- historical node properties that were not present in run snapshots
- inferred connections

The recovered definitions are explicitly marked:

- source_type = MIGRATION
- executionObservedOnly = true
- editable = false
- is_published = false

Safety
------
- Dry run is the default.
- Apply is one PostgreSQL transaction.
- A PostgreSQL advisory lock prevents concurrent recovery.
- The live sync-current trigger is disabled only inside the transaction.
- The trigger is re-enabled before commit.
- Transactional DDL means rollback restores the trigger automatically on error.
- Every workflow current_version_number is verified unchanged.
- Every inserted node signature is verified before commit.
- Existing .runs files remain untouched.
- A recovery manifest and rollback command are written after commit.
- Rollback is allowed only before executions reference the recovered versions.

Files
-----
backend\scripts\applyHistoricalWorkflowVersionRecovery.js
backend\scripts\rollbackHistoricalWorkflowVersionRecovery.js

Commands
--------
From backend:

1. Dry run:
   node scripts\applyHistoricalWorkflowVersionRecovery.js --dry-run

Expected:
   Recovered versions planned : 7
   Recovered nodes planned    : 38
   Planning blockers          : 0
   RESULT : HISTORICAL VERSION RECOVERY DRY RUN PASSED

2. Stop the backend before apply.

3. Apply:
   node scripts\applyHistoricalWorkflowVersionRecovery.js --apply

Expected:
   Versions inserted           : 7
   Nodes inserted              : 38
   Current versions preserved : PASS
   Definition provenance      : PASS
   Node signature verification: PASS
   Database transaction       : COMMITTED
   RESULT : HISTORICAL WORKFLOW VERSIONS RECOVERED

4. Re-run readiness:
   node scripts\analyzeExecutionMigrationReadiness.js

Expected:
   Snapshot files              : 106
   Ready for migration         : 106
   Blocked snapshots           : 0
   RESULT                      : RUN MIGRATION READY

Rollback
--------
The apply command prints a batch ID and writes a manifest containing the exact
rollback command. Rollback must be performed before execution migration:

  node scripts\rollbackHistoricalWorkflowVersionRecovery.js --dry-run --batch-id "<batch-id>"
  node scripts\rollbackHistoricalWorkflowVersionRecovery.js --apply --batch-id "<batch-id>"

After execution rows reference these versions, rollback is deliberately blocked.
