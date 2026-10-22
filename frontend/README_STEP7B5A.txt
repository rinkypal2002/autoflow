AutoFlow Database Phase 3 - Step 7B.5A
PostgreSQL Output-Source Read API Foundation
================================================

Purpose
-------
Expose indexed workflow outputs through a read-only Node/Express API without
changing the visible Binding Picker or Outputs panel.

New endpoints
-------------
GET /api/workspace/output-source/status
GET /api/workspace/workflows/:workflowId/output-sources
GET /api/workspace/workflows/:workflowId/runs/:runId/outputs

Safety
------
- API data endpoints are disabled by default.
- EXECUTION_OUTPUT_SOURCE_API_ENABLED=false
- No frontend files are changed.
- No workflow execution code is changed.
- No output-index write code is changed.
- Repository SQL contains SELECT / WITH RECURSIVE only.
- Technical details are hidden by default on the general source endpoint.
- targetNodeId uses persisted workflow connections to return graph ancestors.

Install
-------
Extract this overlay into the AutoFlow project root using -Force.
The user's backend/.env is not included and is not replaced.

First verification
------------------
cd backend
npm run test:output-projection
npm run test:output-index-backfill-tools
npm run test:live-output-index
npm run test:output-source-api

Do not enable EXECUTION_OUTPUT_SOURCE_API_ENABLED until all four tests pass.
