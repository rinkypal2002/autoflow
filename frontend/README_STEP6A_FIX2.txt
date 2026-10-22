AutoFlow Database Phase 2 - Step 6A Fix 2
================================================

Purpose
-------
Identify the exact three invalid legacy .runs snapshots before migration.

The script reports:
- absolute and relative file path
- invalid JSON vs invalid snapshot contract
- runId/workflowId/status when readable
- every validation reason
- aggregate counts and statuses

It also writes a metadata-only JSON report under:

  backend\run_inspection_reports\

The report does not copy workflow inputs, outputs, variables, credentials,
logs, or secret values.

Safety
------
- Read only against D:\LE-PRODUCT-NEW\NewTestFiles\.runs
- Does not rename, delete, repair, quarantine, or migrate any file
- Does not write to PostgreSQL
- Does not expose snapshot payloads in the report

Apply
-----
Extract into the AutoFlow project root with -Force.

Then from backend run:

  node scripts\inspectFilesystemRunsDetailed.js

Share the complete output. Based on the exact reasons, the next package will
either repair compatible metadata or quarantine irrecoverably corrupted files
after creating backups.
