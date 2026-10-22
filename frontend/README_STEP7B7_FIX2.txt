AutoFlow Database Phase 3 - Step 7B.7 Fix 2

Purpose:
- Correct the read-only duplicate output-index invariant query.
- The actual autoflow.execution_output_index column is execution_id.
- The prior checker incorrectly referenced workflow_execution_id.
- No database schema or data changes are included.

Files replaced:
- backend/db/databaseContract.js
- backend/scripts/testDatabaseClosureHardening.js
