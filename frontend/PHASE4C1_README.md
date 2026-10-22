# AutoFlow Phase 4C.1

Read-only PostgreSQL plugin mapping API and frontend shadow validation.

Safety guarantees:
- No plugin mapping writes.
- No frontend catalogue replacement.
- No plugin execution route changes.
- Input and output schema JSON are excluded from the list response.
- `postgres` frontend mode is safety-downgraded to `shadow`.
