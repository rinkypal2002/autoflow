AutoFlow Step 5 Fix - Filesystem Folder Move / Trash
====================================================

Root cause
----------
The Directory UI uses moveItem() for Move to trash and sends:

  PUT /api/workspace/folders/:id
  { "parentId": "<trash-folder-id>" }

The legacy filesystem endpoint previously required "name" and did not support
parentId, so it returned "name is required".

Fix
---
The folder PUT endpoint now supports:
- rename with { "name": "..." }
- move with { "parentId": "..." }
- rename and move together
- root protection
- missing target validation
- cycle prevention
- duplicate sibling-name validation
- physical folder move
- stale metadata recovery when the physical folder is missing

Apply
-----
Extract this ZIP into the AutoFlow project root with -Force.

Then:
1. Keep PERSISTENCE_MODE=filesystem temporarily.
2. Restart backend.
3. Refresh Directory.
4. Move DB-CUTOVER-TEST-20260803 to trash.
5. Open Trash and delete it permanently.
6. Verify counts are 22 folders and 32 workflows.
7. Continue PostgreSQL cutover.
