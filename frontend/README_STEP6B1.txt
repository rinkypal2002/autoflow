AutoFlow Database Phase 2 - Step 6B.1
==========================================

Milestone
---------
Historical execution migration readiness.

Purpose
-------
Before writing 106 filesystem run snapshots into PostgreSQL, verify that:

- every snapshot identity matches its directory and filename;
- every workflow exists in PostgreSQL;
- every executed node can be linked to one immutable workflow_version;
- workflow/node statuses satisfy database constraints;
- required timestamps and node fields are valid;
- duplicate final node records do not exist;
- existing PostgreSQL executions are detected for idempotency.

Safety
------
This step is completely read-only:

- no filesystem files are modified;
- no PostgreSQL rows are inserted, updated, or deleted;
- a metadata-only report is written under backend\run_migration_reports;
- workflow inputs, outputs, variables, logs, and secret values are not copied
  into the report.

Apply
-----
Extract this ZIP into the AutoFlow project root with -Force.

From backend run:

  node --check scripts\analyzeExecutionMigrationReadiness.js
  node scripts\analyzeExecutionMigrationReadiness.js

Ideal result:

  Snapshot files              : 106
  Ready for migration         : 106
  Blocked snapshots           : 0
  RESULT                      : RUN MIGRATION READY

Next step
---------
When readiness passes, Step 6B.2 will perform a transactional, idempotent
migration into:

- autoflow.workflow_execution
- autoflow.node_execution
- autoflow.execution_log

It will preserve the original .runs files until API cutover and parity tests
have passed.
