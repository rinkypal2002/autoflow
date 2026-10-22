AutoFlow DB Integration Step 3 - Fix 2
======================================

Problem
-------
Migration failed on uq_workflow_sibling_name although workspace.json passed
validation. One or more workflow files contain stale identity/location fields.

Correction
----------
- workspace.json is authoritative for workflow id, name, parentId, status,
  description, icon, version and index timestamps.
- workflow JSON remains authoritative for actions, connections, variables,
  schedules and triggers.
- dry run now reports file-vs-metadata identity drift.
- dry run validates the exact normalized sibling names that will reach SQL.

No SQL changes are required. The failed PostgreSQL transaction was rolled back.
