AutoFlow DB Integration Step 3 - Fix 3
======================================

This package corrects two issues:

1. Parity checker false positives
   PostgreSQL jsonb uses JSON semantics. JavaScript undefined properties do
   not survive JSON serialization, so direct object comparison reported every
   imported definition as different.

2. Secret values in workflow_version.definition_json
   The normalized workflow_variable table was redacted, but the full immutable
   definition could retain secret variable values.

Files
-----
backend/db/filesystemWorkspaceMigration.js
backend/scripts/remediateImportedSecretVersions.js
backend/scripts/testMigrationSanitizer.js

Required sequence
-----------------
1. Stop backend.
2. Extract Fix 3.
3. Unit check:
   node scripts\testMigrationSanitizer.js
4. Audit:
   node scripts\remediateImportedSecretVersions.js --dry-run
5. Remove unsafe imported versions:
   node scripts\remediateImportedSecretVersions.js --apply
6. Recreate sanitized versions:
   node scripts\migrateFilesystemWorkspaceToPostgres.js --apply
7. Verify:
   node scripts\compareWorkspaceSources.js

The remediation refuses to delete a version if any workflow execution already
references it. It never prints or writes secret values to its manifest.
