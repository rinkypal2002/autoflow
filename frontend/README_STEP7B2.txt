AutoFlow Database Phase 3 — Step 7B.2
======================================
Output Index Transactional Dry-Run Backfill

PURPOSE
-------
This package performs actual DELETE/INSERT operations against
`autoflow.execution_output_index` inside a PostgreSQL transaction so that all
foreign keys, unique constraints, CHECK constraints, generated search vectors,
and the output-binding view are exercised.

SAFETY GUARANTEES
-----------------
- There is no --apply or --commit mode.
- The transaction is always rolled back.
- Counts are compared before and after rollback.
- Existing workflow_execution and node_execution records are read only.
- The certified Phase 2 execution snapshots are not changed.
- An advisory transaction lock prevents concurrent Step 7B.2 runs.

FIRST RUN — 25 NODE SMOKE TEST
------------------------------
From the backend folder:

  set PGPASSWORD=root

  "C:\Program Files\PostgreSQL\16\bin\psql.exe" -h localhost -p 5432 -U postgres -d autoflow -c "SELECT count(*) AS output_index_rows_before FROM autoflow.execution_output_index;"

  npm run dry-run:output-index-backfill -- --limit 25 --out "migration_backups\step7b2-output-index-dry-run-smoke.json"

  "C:\Program Files\PostgreSQL\16\bin\psql.exe" -h localhost -p 5432 -U postgres -d autoflow -c "SELECT count(*) AS output_index_rows_after FROM autoflow.execution_output_index;"

The before and after values must match. Current expected value: 0.

FULL DRY RUN
------------
  npm run dry-run:output-index-backfill -- --sample-limit 50 --out "migration_backups\step7b2-output-index-dry-run-full.json"

Expected final verdict:

  DRY_RUN_BACKFILL_VERIFIED
  writesCommitted: 0
  transaction: ROLLED_BACK
  readyForApplyPackage: true

CLEANUP
-------
  set PGPASSWORD=

FILES ADDED/UPDATED
-------------------
- backend/scripts/dryRunExecutionOutputIndexBackfill.js
- backend/package.json
- README_STEP7B2.txt
- STEP7B2_TEST_REPORT.md
- STEP7B2_MANIFEST.json
