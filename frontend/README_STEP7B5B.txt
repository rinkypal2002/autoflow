AutoFlow Database Phase 3 - Step 7B.5B
==========================================
Frontend PostgreSQL Output-Source Shadow Integration

Purpose
-------
Load the certified PostgreSQL output-source API alongside the existing
snapshot-derived Binding Picker catalogue, compare them, and record parity
without changing anything the user sees or inserts.

Safety model
------------
- Default frontend mode: legacy
- legacy mode performs zero output-source API calls
- shadow mode renders the legacy Binding Picker unchanged
- postgres mode is safety-downgraded to shadow until Step 7B.5C
- API failures are recorded but never block editing or execution
- parity reports contain tokens/types/paths only; no value previews
- reports are bounded to 20 entries in browser sessionStorage
- workflow execution and PostgreSQL writes are unchanged

Frontend environment
--------------------
VITE_EXECUTION_OUTPUT_SOURCE_READ_MODE=legacy

Modes
-----
legacy   existing snapshot catalogue only
shadow   load PostgreSQL, compare, still display legacy
postgres reserved for Step 7B.5C; currently behaves as shadow

Browser evidence
----------------
Latest report:
  sessionStorage.getItem('autoflow:output-source-shadow:last:v1')

Bounded report history:
  sessionStorage.getItem('autoflow:output-source-shadow:reports:v1')

Files
-----
src/lib/outputSourceMode.ts
src/lib/outputSourceApi.ts
src/lib/outputSourceParity.ts
src/pages/WorkspaceEditorPage.tsx
src/vite-env.d.ts
tests/outputSourceParity.test.ts
.env.example
package.json

Test
----
npm run test:output-source-shadow
npm run typecheck
npm run build
