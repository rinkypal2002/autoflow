AutoFlow Database Phase 2 - Step 6B.1 Fix 1
================================================

Milestone
---------
Historical workflow-version recovery planning.

Why this is needed
------------------
27 legacy execution snapshots reference node IDs that are no longer present in
any migrated PostgreSQL workflow_version.

The database correctly requires node_execution rows to reference a normalized
workflow_node belonging to the execution's immutable workflow version. The
foreign key must not be removed.

This tool determines whether execution-observed historical versions can be
recovered safely without changing the workflow currently displayed in AutoFlow.

What it checks
--------------
- Groups blocked runs by workflow and exact executed-node signature.
- Calculates the minimum number of recovered versions required.
- Selects the existing version with the highest node overlap as a base.
- Finds missing node IDs.
- Verifies node name/type/category metadata is consistent across runs.
- Finds unused positive version numbers below current_version_number.
- Plans recovered versions only in those historical gaps.
- Confirms the live current version number can remain unchanged.

Safety
------
- Read-only against PostgreSQL.
- Read-only against .runs.
- Does not create workflow versions or workflow nodes.
- Does not change current_version_number.
- Does not migrate execution history.
- Writes a metadata-only plan under backend\run_migration_reports.

Commands
--------
Extract into the AutoFlow project root.

From backend:

  node --check scripts\planHistoricalWorkflowVersionRecovery.js
  node scripts\planHistoricalWorkflowVersionRecovery.js

Ideal ending:

  Planning blockers : 0
  RESULT             : HISTORICAL VERSION RECOVERY PLAN READY

Next step
---------
When the plan passes, Step 6B.1 Fix 2 will create the planned immutable
SYSTEM/MIGRATION versions transactionally, keep every current workflow version
unchanged, and rerun migration readiness.
