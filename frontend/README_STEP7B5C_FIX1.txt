AutoFlow Database Phase 3 - Step 7B.5C Fix 1
=============================================

Purpose
-------
Align the existing Step 7B.5B.1 shadow regression test with the intentionally
unblocked PostgreSQL cutover gate introduced by Step 7B.5C.

Why the prior test failed
-------------------------
The production cutover code correctly changed postgres mode from blocked to
active. The older shadow regression test still expected postgres mode to be
blocked, so one stale assertion failed even though the new cutover test,
TypeScript check, and production build passed.

Files replaced
--------------
tests/outputSourceParity.test.ts

Runtime impact
--------------
None. This package changes only a regression-test expectation. It does not
change the frontend, backend, database, binding tokens, or Products Engine.
