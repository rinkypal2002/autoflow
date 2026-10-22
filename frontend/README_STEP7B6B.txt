AutoFlow Database Phase 3 - Step 7B.6B
=======================================

Purpose
-------
Connect the existing localStorage Version History feature to the read-only
PostgreSQL workflow-version API in shadow mode.

Safety model
------------
- Visible Version History remains localStorage-backed.
- PostgreSQL versions are loaded only when the History modal is opened.
- No restore, save, delete, update, or database write API is introduced.
- PostgreSQL mode is deliberately blocked and safely behaves as shadow mode.
- Secret values are normalized/redacted before parity fingerprints are built.
- API requests are cached and in-flight deduplicated per workflow.

New frontend setting
--------------------
VITE_WORKFLOW_VERSION_HISTORY_READ_MODE=legacy

Supported values
----------------
legacy   Existing localStorage History only; zero version API calls.
shadow   Load PostgreSQL history, compare silently, show localStorage History.
postgres Blocked in this step; effective mode remains shadow.

Files added
-----------
src/lib/workflowVersionHistoryMode.ts
src/lib/workflowVersionHistoryApi.ts
src/lib/workflowVersionHistoryParity.ts
tests/workflowVersionHistoryParity.test.ts
README_STEP7B6B.txt

Files updated
-------------
package.json
.env.example
src/vite-env.d.ts
src/pages/WorkspaceEditorPage.tsx

Verification
------------
npm run test:workflow-version-shadow
npm run typecheck
npm run build

Expected test ending
--------------------
Step 7B.6B workflow version-history shadow tests: PASS
Assertions passed: 25
Assertions failed: 0
Legacy mode network calls: 0
PostgreSQL requests per workflow: cached and in-flight deduplicated
Visible Version History source: localStorage
Database restore actions: disabled

Runtime certification sequence
------------------------------
1. Start with VITE_WORKFLOW_VERSION_HISTORY_READ_MODE=legacy.
2. Open History and confirm zero /versions requests.
3. Change only the frontend mode to shadow and restart Vite.
4. Open History once and confirm one HTTP 200 /versions request.
5. Confirm the visible History list is unchanged.
6. Inspect the console entry: [AutoFlow workflow-version shadow].
7. Keep restore disabled. Do not use postgres mode in this step.

Session-storage evidence
------------------------
autoflow:workflow-version-shadow:last:v1
autoflow:workflow-version-shadow:reports:v1
