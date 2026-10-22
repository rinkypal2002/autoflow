AutoFlow Database Phase 3 — Step 7B.7 Closure Hardening
========================================================

Purpose
-------
This is the final small hardening pass before leaving database work and moving
on to plugin/engine, file management, request management, and UI/UX.

What is fixed
-------------
1. PostgreSQL schema and data-integrity contract checks (read-only).
2. Optional strict startup guard so an old or incomplete schema cannot silently
   start the backend.
3. /api/health/database endpoint for operational readiness checks.
4. Graceful PostgreSQL pool shutdown on Ctrl+C / SIGTERM.
5. Workflow saves lock the workflow row before calculating the next immutable
   version number, preventing concurrent-save version races.
6. New writes are labelled postgres-workspace-api instead of the obsolete
   database-shadow-api provenance.
7. Version History shadow comparison uses summary-only network payloads and a
   server-generated comparison fingerprint. Full definitions are not sent for
   the list request, reducing the previous ~1.6 MB transfer.
8. Legacy shadow workspace API/write flags are documented as disabled after
   primary PostgreSQL cutover.

No destructive database migration is included. The inspection and startup
contract checks use SELECT statements only.

Deferred by design
------------------
- PostgreSQL Version History restore remains disabled until credential
  references are wired.
- Browser-only historical versions remain visible through localStorage shadow
  mode and are not deleted.
- credential_reference, connector_configuration, plugin_endpoint_mapping,
  execution_artifact, and audit_log are verified for existence here; their
  business APIs belong to their upcoming modules.
