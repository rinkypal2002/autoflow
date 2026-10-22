AutoFlow Database Phase 3 - Step 7B.7 Fix 3
Secret JSON Null Contract

Purpose
-------
Corrects the read-only database closure invariant for secret workflow variables.
PostgreSQL jsonb 'null' is an empty/redacted value and must not be counted as persisted secret content.

Verified user database counts
-----------------------------
- Secret rows: 45
- SQL NULL only: 35
- JSON null only: 10
- Actual non-null secret content: 0

Changes
-------
- Counts a secret as persisted only when value_json or default_value_json contains real non-null JSON content.
- Adds a regression assertion for both value_json and default_value_json.
- No schema migration.
- No INSERT, UPDATE, DELETE, ALTER, DROP, CREATE, or TRUNCATE statement.
- No secret values are displayed or modified.

Expected inspection verdict
---------------------------
DATABASE_CLOSURE_CONTRACT_VERIFIED
