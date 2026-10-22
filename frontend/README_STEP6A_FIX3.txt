AutoFlow Database Phase 2 - Step 6A Fix 3
================================================

Purpose
-------
Repair legacy .runs JSON files that contain a valid snapshot followed by
appended JSON or other trailing content.

Safety rules
------------
- Dry run is the default.
- Apply requires --apply.
- The tool inspects all currently invalid .runs JSON files.
- workflowId must match the parent directory.
- runId must match the filename.
- A file containing another workflow/run snapshot is blocked.
- When multiple matching snapshots exist, the newest/most complete one is
  selected deterministically.
- Every original file is backed up before modification.
- Rewrites use a temporary file and atomic rename.
- Repaired files are parsed and identity-checked again.
- No PostgreSQL writes occur.

Commands
--------
From backend:

1. Analyze:
   node scripts\repairAppendedRunJson.js --dry-run

Expected when all three are safe:
   Automatically repairable : 3
   Blocked as ambiguous     : 0
   RESULT : RUN JSON REPAIR DRY RUN PASSED

2. Repair:
   node scripts\repairAppendedRunJson.js --apply

Expected:
   Files repaired           : 3
   Post-repair validation   : PASS
   RESULT : RUN JSON FILES REPAIRED

3. Re-inspect:
   node scripts\inspectFilesystemRuns.js

Expected:
   Snapshot files           : 106
   Valid snapshots          : 106
   Invalid snapshots        : 0
   RESULT : FILESYSTEM RUN INSPECTION PASSED

Backup location
---------------
backend\migration_backups\run-json-repair-<timestamp>\
