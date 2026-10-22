AutoFlow Database Phase 3 - Step 7B.7 Fix 1

Purpose
- Align the database closure contract with the authoritative AutoFlow schema.
- autoflow.audit_log uses occurred_at, not created_at.

Files replaced
- backend/db/databaseContract.js
- backend/scripts/testDatabaseClosureHardening.js

Database changes
- None. Do not ALTER the audit_log table.
- Existing audit data is untouched.

Expected verification
1. npm run test:database-closure
2. npm run inspect:database-closure -- --out "migration_backups\step7b7-database-closure-report.json"

Expected verdict
DATABASE_CLOSURE_CONTRACT_VERIFIED
