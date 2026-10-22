AutoFlow Phase 4B.1 - Engine Registry and Plugin Endpoint Mapping Foundation
=============================================================================

Purpose
-------
Read the live Products Engine action registry, normalize and validate every
action, compare it with autoflow.plugin_endpoint_mapping, and create a dry-run
report. This phase performs no INSERT, UPDATE, DELETE, schema migration, plugin
execution, frontend catalogue change, or engine source modification.

Endpoints
---------
GET  /api/engine-registry/status
POST /api/engine-registry/dry-run

Safety
------
- PLUGIN_ENDPOINT_MAPPING_API_ENABLED defaults to false.
- There is no apply endpoint in this package.
- PostgreSQL repository uses SELECT only.
- Secret field names may be recorded as contract metadata; secret values are
  never read from workflows or written to plugin_endpoint_mapping.
- Existing frontend actions and workflow execution remain unchanged.

Live inspection command
-----------------------
npm run inspect:plugin-endpoint-mapping -- --out "migration_backups\phase4b1-plugin-endpoint-mapping-dry-run.json"

Expected first-run result when the mapping table is empty
---------------------------------------------------------
verdict: PLUGIN_ENDPOINT_MAPPING_DRY_RUN_VERIFIED
actions: 343
added: 343
changed: 0
retired: 0
writesPerformed: 0
