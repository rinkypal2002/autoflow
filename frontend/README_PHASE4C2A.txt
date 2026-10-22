AutoFlow Phase 4C.2A — Detailed Plugin Mapping Remediation Report
==================================================================

Purpose
-------
Generate a complete, read-only remediation report from the current static
frontend catalogue and the PostgreSQL plugin_endpoint_mapping read API.

Safety guarantees
-----------------
- No database INSERT/UPDATE/DELETE statements.
- No write endpoint.
- No automatic edits to automationCategories.ts.
- No visible catalogue changes.
- No workflow execution-routing changes.
- No automatic route/content-type fixes.

Outputs
-------
- JSON: full machine-readable findings
- CSV: sortable action-level remediation register
- Markdown: management/engineering summary

Default command
---------------
npm run inspect:plugin-mapping-remediation -- --api-base http://localhost:8081/api/plugin-mappings --engine-version v11.3 --out-dir migration_backups/phase4c2a

The report separates:
- critical HTTP method and route mismatches
- cross-plugin route contamination
- content-type contract drift
- SFTP/module prefix drift and encoded path templates
- frontend-only engine, external, and separate-service actions
- engine-only actions needing visibility decisions
- legacy-route migration backlog
- placeholder schema coverage by plugin
