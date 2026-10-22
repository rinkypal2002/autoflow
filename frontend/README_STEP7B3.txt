AutoFlow Database Phase 3 — Step 7B.3
======================================
Controlled Output-Index Apply, Verification and Rollback

PURPOSE
-------
This package performs the first committed population of:

  autoflow.execution_output_index

It uses the output projection that passed Step 7B.1 and the constraint-checked
750-node rollback test that passed Step 7B.2.

CURRENT CERTIFIED INPUT COUNTS
------------------------------
Final node executions : 750
Workflow executions   : 115
Workflows             : 10
Projected index rows  : 8,257
Business rows         : 5,335
Technical rows        : 2,172
RAW root rows         : 750
Truncated nodes       : 0
Duplicate paths       : 0
Projection errors     : 0

SAFETY MODEL
------------
- Explicit confirmation phrase is mandatory.
- Apply always covers the complete eligible dataset; partial --limit apply is
  intentionally unsupported.
- workflow_execution and node_execution are locked against writes during the
  short maintenance transaction.
- execution_output_index is locked against concurrent writers.
- A PostgreSQL advisory transaction lock prevents simultaneous Step 7B.3 runs.
- Every row receives a deterministic batch ID and source fingerprint in JSONB
  metadata.
- Apply refuses to replace any untagged or unrelated output-index row.
- An unchanged source produces the same batch ID, so re-running is idempotent.
- Workflow execution snapshots are never changed.
- Rollback deletes only rows tagged with the requested batch ID.
- Live output-index writes remain disabled after this historical backfill.

FILES ADDED
-----------
backend\scripts\outputIndexBackfillCommon.js
backend\scripts\applyExecutionOutputIndexBackfill.js
backend\scripts\verifyExecutionOutputIndexBackfill.js
backend\scripts\rollbackExecutionOutputIndexBackfill.js
backend\scripts\testOutputIndexBackfillTools.js
README_STEP7B3.txt
STEP7B3_TEST_REPORT.md
STEP7B3_MANIFEST.json

FILE UPDATED
------------
backend\package.json

INSTALL
-------
1. Stop the Node/Express platform backend. Do not run workflows during apply.
2. Back up backend\package.json.
3. Extract this overlay into the AutoFlow project root with -Force.
4. Do not set EXECUTION_OUTPUT_INDEX_WRITE_ENABLED=true in backend\.env.

REGRESSION TESTS
----------------
From the backend folder:

  npm run test:output-projection
  npm run test:output-index-backfill-tools

PRE-APPLY COUNT
---------------
  set PGPASSWORD=root

  "C:\Program Files\PostgreSQL\16\bin\psql.exe" -h localhost -p 5432 -U postgres -d autoflow -c "SELECT count(*) AS output_index_rows_before_apply FROM autoflow.execution_output_index;"

Expected for the first apply: 0

COMMITTED APPLY
---------------
  npm run apply:output-index-backfill -- --confirm APPLY_OUTPUT_INDEX_BACKFILL --expected-node-executions 750 --expected-index-rows 8257 --out "migration_backups\step7b3-output-index-apply.json"

Expected verdict:

  status             OUTPUT_INDEX_BACKFILL_APPLIED
  writesCommitted    8257
  transaction        COMMITTED
  readyForReadApi    true

The apply report contains the deterministic batch ID and the exact rollback
command.

POST-APPLY VERIFY
-----------------
  npm run verify:output-index-backfill -- --report "migration_backups\step7b3-output-index-apply.json" --out "migration_backups\step7b3-output-index-verify.json"

Expected verdict:

  status             OUTPUT_INDEX_BACKFILL_VERIFIED
  writesPerformed    0
  transaction        READ ONLY / ROLLBACK

DATABASE COUNTS
---------------
  "C:\Program Files\PostgreSQL\16\bin\psql.exe" -h localhost -p 5432 -U postgres -d autoflow -c "SELECT field_kind, count(*) FROM autoflow.execution_output_index GROUP BY field_kind ORDER BY field_kind;"

Expected for the current certified dataset:

  BUSINESS   5335
  RAW         750
  TECHNICAL  2172

TARGETED ROLLBACK
-----------------
Use the apply report so no batch ID needs to be copied manually:

  npm run rollback:output-index-backfill -- --report "migration_backups\step7b3-output-index-apply.json" --confirm ROLLBACK_OUTPUT_INDEX_BACKFILL --expected-rows 8257 --out "migration_backups\step7b3-output-index-rollback.json"

Rollback is idempotent. Re-running it reports ALREADY_ROLLED_BACK and deletes
zero additional rows. It never truncates the table and never deletes unrelated
rows.

CLEANUP
-------
  set PGPASSWORD=

IMPORTANT
---------
This step backfills historical searchable output metadata only. It does not yet:
- write output-index rows during new workflow executions;
- expose a new output-source API;
- switch the React Binding Picker to PostgreSQL;
- change Products Engine response contracts.

The next gate is Step 7B.4: read-only output-source API and shadow parity.
