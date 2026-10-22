AutoFlow Database Phase 2 - Step 6A Fix 1
================================================

Failure
-------
ck_node_execution_error_object rejected error_json.

Root cause
----------
The repository serialized a missing error using JSON.stringify(null), sending:

  'null'::jsonb

That is a JSON null value. It is not SQL NULL.

The schema correctly requires:

  error_json IS NULL
  OR jsonb_typeof(error_json) = 'object'

Fix
---
When no error exists, the repository now passes JavaScript null directly to
node-postgres. The driver sends a real SQL NULL.

The correction applies to:
- autoflow.node_execution.error_json
- autoflow.execution_log.error_json

Actual error values continue to be stored as redacted JSON objects.

No schema modification is required.

Apply
-----
Extract into the AutoFlow project root using -Force.

Then from backend run:

  node --check db\executionRepository.js
  node scripts\testDatabaseExecutionRepository.js

After the repository test passes:

  node scripts\inspectFilesystemRuns.js
