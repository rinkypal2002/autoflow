AutoFlow Database Phase 3 - Step 7B.5B.1
Shadow Target-Version and Binding-Path Parity Fix
==================================================

Problem fixed
-------------
The shadow frontend used a target node from the current workflow design while
querying an older immutable execution version. When the selected node did not
exist in that historical run, the backend returned:

  OUTPUT_SOURCE_TARGET_NODE_NOT_FOUND (404)

The old implementation also requested the same run catalogue repeatedly for
multiple selected nodes and counted display-path aliases as genuine mismatches.

Changes
-------
1. The frontend loads the complete PostgreSQL catalogue once per immutable run.
2. The complete catalogue is cached only after the run is terminal and coverage
   is complete.
3. Current workflow ancestors are calculated in the browser and used to filter
   the cached catalogue safely.
4. targetNodeId is no longer sent to an old execution when current-graph node
   IDs are available.
5. The backend returns an empty safe scope instead of a 404 when a direct API
   caller supplies a target node absent from that run version.
6. Parity reports now distinguish:
   - exact token matches;
   - canonical/compatible aliases;
   - compatible display-path aliases;
   - genuine missing business fields;
   - missing technical aliases;
   - additional PostgreSQL fields;
   - real type/path mismatches.
7. The visible Binding Picker remains on the certified legacy catalogue.
8. No schema, database write, execution, or Products Engine change is included.

Files replaced
--------------
backend/db/outputSourceReadRepository.js
backend/routes/postgresOutputSourceRoutes.js
backend/scripts/testOutputSourceReadApi.js
src/lib/outputSourceApi.ts
src/lib/outputSourceParity.ts
src/pages/WorkspaceEditorPage.tsx
tests/outputSourceParity.test.ts

Verified in package build environment
-------------------------------------
Backend output-source API tests: PASS
Frontend parity-fix runtime tests: PASS (24 assertions)
TypeScript no-emit check: PASS

The production Vite build must be run on the user's Windows project because the
certified ZIP contains the Windows esbuild binary, while the package assembly
environment is Linux.

Required runtime settings
-------------------------
Frontend:
  VITE_EXECUTION_OUTPUT_SOURCE_READ_MODE=shadow

Backend:
  EXECUTION_OUTPUT_INDEX_WRITE_ENABLED=true
  EXECUTION_OUTPUT_SOURCE_API_ENABLED=true

Rollback
--------
Restore the seven replaced files from the user's _phase3_step7b5b1_backup
folder and restart the Node backend and Vite frontend.
