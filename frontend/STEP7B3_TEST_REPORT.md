# AutoFlow Database Phase 3 — Step 7B.3 Test Report

## Scope

Controlled committed output-index backfill, read-only verification, and targeted batch rollback.

## Prior user-certified gates

| Gate | Result |
|---|---:|
| Step 7B.1 projection regression | PASS |
| Full readiness analysis | 750 final nodes / 8,257 projected rows |
| Projection errors | 0 |
| Truncated nodes | 0 |
| Duplicate binding paths | 0 |
| Step 7B.2 full constraint-checked inserts | 8,257 |
| Step 7B.2 transaction | ROLLED BACK |
| Rows remaining after Step 7B.2 | 0 |

## Package verification

| Check | Result |
|---|---|
| Common helper syntax | PASS |
| Apply script syntax | PASS |
| Verify script syntax | PASS |
| Rollback script syntax | PASS |
| Helper test syntax | PASS |
| Deterministic source fingerprint fixture | PASS |
| Deterministic batch ID fixture | PASS |
| Backfill metadata tagging fixture | PASS |
| Unsupported partial/force apply flags blocked in code | PASS |
| Explicit apply confirmation required | PASS |
| Targeted rollback confirmation required | PASS |
| Rollback filters by JSONB batch ID | PASS |
| Existing execution snapshots modified | NO |
| Live repository integration enabled | NO |

## Database execution boundary

The packaging environment has no access to the user's PostgreSQL instance. The committed apply and rollback must therefore be executed locally. The apply script validates all row counts, constraints, secret safety, binding-view parity, final-node coverage, RAW-root coverage, and source stability before and after commit.
