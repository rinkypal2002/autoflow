AutoFlow Database Phase 2 - Step 6B.3 Fix 1
================================================

Issue
-----
Node.js 24 rejects:

  node --check server.js.step6b3.tmp

because ".tmp" is not a recognized JavaScript extension.

Impact
------
The patch stopped before replacing server.js or config.js.
The original application files remain unchanged.

Fix
---
The patcher now:

- creates temporary files ending in ".tmp.js";
- runs node --check successfully under Node.js 24;
- removes temporary files automatically if validation fails;
- atomically renames validated files into place;
- preserves the existing timestamped backup behavior.

Apply
-----
Extract into the AutoFlow project root using -Force.

From backend:

  del /Q "server.js.step6b3.tmp" 2>NUL
  del /Q "config.js.step6b3.tmp" 2>NUL

  node --check scripts\applyStep6B3ServerPatch.js
  node scripts\applyStep6B3ServerPatch.js --dry-run
  node scripts\applyStep6B3ServerPatch.js --apply

Expected:

  server.js syntax           : PASS
  config.js syntax           : PASS
  RESULT                     : STEP 6B.3 SERVER PATCH APPLIED
