AutoFlow Database Phase 3 - Step 7B.6A
Workflow Version-History Read API
==============================================

Purpose
-------
Expose immutable PostgreSQL workflow versions through a read-only API before
changing the visible Version History modal.

New endpoints
-------------
GET /api/workspace/version-history/status
GET /api/workspace/workflows/:workflowId/versions
GET /api/workspace/workflows/:workflowId/versions/:versionIdentifier

Safety
------
- API disabled by default.
- No restore/write endpoint is added.
- Repository issues SELECT queries only.
- Secret variable values and sensitive keys are redacted defensively.
- Existing localStorage Version History remains untouched.
- Workflow save, execution, output indexing and Binding Picker are unchanged.

New environment settings
------------------------
WORKFLOW_VERSION_HISTORY_API_ENABLED=false
WORKFLOW_VERSION_HISTORY_DEFAULT_LIMIT=40
WORKFLOW_VERSION_HISTORY_MAX_LIMIT=100

Tests
-----
cd backend
npm run test:workflow-version-api

Expected result
---------------
Step 7B.6A workflow version-history read API tests: PASS
Read-model queries: SELECT only
Secret values in version definitions: redacted
Version restore writes: disabled
Disabled-path database calls: 0
Frontend-compatible WorkflowVersion mapping: verified
