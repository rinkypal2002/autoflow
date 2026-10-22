# AutoFlow Phase 4C.2C — Remaining Route Remediation

This overlay fixes the 13 remaining `ROUTE_PREFIX_DRIFT` findings from the
Phase 4C.2B live report without changing the catalogue size, database state, or
execution provider.

Changes:

1. Removes the stale `/sftp-plugin` module prefix from 12 SFTP frontend routes.
2. Normalizes encoded `{{pathVariable}}` placeholders only inside the shadow
   comparison/reporting functions.
3. Preserves the real executable System Management URL template:
   `/api/v1/system/service/{{serviceName}}`.

No PostgreSQL writes, no route-provider cutover, and no action removals are made.
