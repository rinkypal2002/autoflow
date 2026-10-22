AutoFlow Phase 4B.2 — Transactional Plugin Endpoint Mapping Apply
==================================================================

Purpose
-------
Safely populate/update autoflow.plugin_endpoint_mapping from the live Products
Engine action registry after the Phase 4B.1 read-only dry-run has passed.

Safety model
------------
- Writes disabled by default.
- CLI-only apply; no HTTP apply endpoint.
- Explicit confirmation token required.
- Live registry SHA-256 guard supported.
- PostgreSQL advisory transaction lock per engine version.
- Stale-plan database fingerprint protection.
- Exact pre-apply JSON snapshot created before the transaction.
- Missing live actions are retired (disabled + deprecated), not deleted.
- Post-apply zero-difference verification runs inside the same transaction.
- Exact snapshot rollback tool included.
- No frontend catalogue change.
- No Products Engine source change.

New scripts
-----------
- npm run test:plugin-endpoint-mapping-apply
- npm run apply:plugin-endpoint-mapping
- npm run verify:plugin-endpoint-mapping
- npm run rollback:plugin-endpoint-mapping

Normal runtime setting
----------------------
PLUGIN_ENDPOINT_MAPPING_WRITE_ENABLED=false
PLUGIN_ENDPOINT_MAPPING_RETIRE_MISSING=true

Do not enable writes until automated tests and the live Phase 4B.1 dry-run pass.
