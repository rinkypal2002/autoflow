AutoFlow DB Integration Step 2 - Fix 1
======================================

Issue:
The PostgreSQL workspace table uses the JSONB column "settings", while the
read repository queried a nonexistent column named "metadata".

Correction:
SELECT settings AS metadata

This keeps the database schema unchanged and preserves the repository/API
response property named "metadata".

Apply this overlay to the AutoFlow project root, then run:

cd backend
node scripts\testWorkspaceReadRepository.js
