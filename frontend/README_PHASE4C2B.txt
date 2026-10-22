Phase 4C.2B — Critical Plugin Mapping Source Remediation

Purpose
-------
Safely correct the seven CRITICAL frontend mapping defects identified by the
Phase 4C.2A live remediation report, without overwriting the user's complete
automationCategories.ts file.

Corrected defects
-----------------
1. Microsoft Teams Create Channel: CreateChannels -> CreateChannel
2. Google Drive Download: GET -> POST
3. OneDrive Copy: remove Google Drive route ownership
4. Asana Get all templates: remove Adobe Sign route ownership
5. Amazon EC2 TestConnection: remove Amazon S3 route ownership
6. Statistics query: /analytics/query -> /analytics/analytic-query
7. Statistics metrics: /analytics/metrics -> /analytics/step-metrics

Safety
------
- The apply script patches the existing source in place.
- It refuses to run unless every old/new value is found exactly once in the
  expected category.
- It creates an exact source backup before writing.
- It verifies the action marker count is unchanged.
- It performs no database writes.
- It does not switch the frontend to PostgreSQL execution routing.
- OneDrive Copy and Asana Get all templates remain explicit frontend-only
  actions until real engine providers are implemented; they are not silently
  redirected to another plugin.

Apply
-----
node scripts/apply-phase4c2b-critical-mapping-remediation.mjs --confirm APPLY_PHASE4C2B_CRITICAL_MAPPING_FIXES

Test
----
node scripts/run-tests.mjs pluginMappingCriticalRemediation

Rollback
--------
node scripts/rollback-phase4c2b-critical-mapping-remediation.mjs --confirm ROLLBACK_PHASE4C2B_CRITICAL_MAPPING_FIXES
