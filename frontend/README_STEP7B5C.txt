AutoFlow Database Phase 3 - Step 7B.5C
Controlled PostgreSQL Binding Picker Cutover
================================================

Purpose
-------
Allow the frontend Binding Picker to use PostgreSQL-indexed workflow-step
outputs while preserving every certified legacy binding token and providing
an automatic fallback whenever PostgreSQL coverage is incomplete or the API
is unavailable.

Safety behavior
---------------
- legacy mode: current snapshot-derived Binding Picker only.
- shadow mode: PostgreSQL comparison only; visible Binding Picker stays legacy.
- postgres mode: PostgreSQL step outputs become primary only when complete.
- variables, previous-step shortcuts, runtime values, and declared schemas stay.
- legacy-only step tokens remain under collapsed Compatibility Aliases.
- loading, API error, run mismatch, target mismatch, or incomplete coverage
  automatically falls back to the legacy catalogue.
- no backend, database schema, Products Engine, or execution changes.

Files
-----
package.json
src/lib/outputSourceMode.ts
src/lib/outputSourceCutover.ts
src/pages/WorkspaceEditorPage.tsx
tests/outputSourceCutover.test.ts

Installation
------------
Extract this ZIP into the AutoFlow project root with overwrite enabled.
Do not extract it into the backend folder.

Initial verification mode
-------------------------
Keep the frontend setting in shadow mode while running tests:
VITE_EXECUTION_OUTPUT_SOURCE_READ_MODE=shadow

Tests
-----
npm run test:output-source-shadow
npm run test:output-source-cutover
npm run typecheck
npm run build

Controlled cutover
------------------
Only after all tests pass, change the frontend setting to:
VITE_EXECUTION_OUTPUT_SOURCE_READ_MODE=postgres

Restart Vite after changing the value. The backend flags remain:
EXECUTION_OUTPUT_INDEX_WRITE_ENABLED=true
EXECUTION_OUTPUT_SOURCE_API_ENABLED=true

Rollback
--------
Set VITE_EXECUTION_OUTPUT_SOURCE_READ_MODE=shadow (or legacy) and restart Vite.
No database rollback is required because this step performs reads only.
