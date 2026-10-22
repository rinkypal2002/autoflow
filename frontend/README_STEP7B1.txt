AutoFlow Database Phase 3 - Step 7B.1
Output Index Foundation and Readiness Analyzer
================================================

BASELINE
--------
Frontend / Node platform:
AutoFlow_Frontend_V1_Stabilized-Database-Phase2-Certified-2026-08-03.zip
SHA-256: 85C63DC6E21DD872F700E2298C5B90532CBF2AB36FC8DE0E53CFAA12EFA01B7E

Products Engine:
Products_Engine_v11_3_foundation (2).zip
SHA-256: B728F61A0D1E67CA01F6ADA70A996143C8F304C32A34FA0C4283F24F5C031B06

SCOPE
-----
This step adds a backend projection library, a guarded output-index repository,
a read-only PostgreSQL readiness analyzer, and deterministic unit tests.

It does NOT:
- change the React frontend;
- change any API route;
- modify Products Engine;
- populate execution_output_index;
- modify node_execution or workflow_execution;
- enable output-index writes;
- switch the Binding Picker to PostgreSQL.

ADDED FILES
-----------
backend\db\outputProjection.js
backend\db\executionOutputIndexRepository.js
backend\scripts\analyzeExecutionOutputIndexReadiness.js
backend\scripts\testExecutionOutputProjection.js
README_STEP7B1.txt

UPDATED FILES
-------------
backend\package.json
backend\.env.example

INSTALL OVERLAY
---------------
1. Stop only the Node/Express platform backend if it is running.
2. Extract the overlay into the AutoFlow project root.
3. Allow Windows to merge folders and overwrite backend\package.json and
   backend\.env.example.
4. No database SQL is required.
5. Products Engine remains unchanged.

TEST THE FOUNDATION
-------------------
From the project root:

cd backend
npm run test:output-projection

Expected:
Step 7B.1 output projection tests: PASS

RUN THE READ-ONLY DATABASE ANALYZER
-----------------------------------
The existing backend\.env may already contain the PostgreSQL connection.
From the backend folder:

npm run analyze:output-index -- --out "migration_backups\step7b1-output-index-readiness.json"

The analyzer opens:
BEGIN TRANSACTION READ ONLY

It reads final node executions, projects index records in memory, prints a JSON
report, writes the optional report file, and executes ROLLBACK.

It performs zero INSERT, UPDATE or DELETE operations.

OPTIONAL LIMIT FOR A FIRST SMOKE TEST
-------------------------------------
npm run analyze:output-index -- --limit 25 --out "migration_backups\step7b1-output-index-readiness-smoke.json"

VERIFY NO DATABASE WRITES
-------------------------
Before and after the analyzer, this count must be identical:

"C:\Program Files\PostgreSQL\16\bin\psql.exe" -h localhost -p 5432 -U postgres -d autoflow -c "SELECT count(*) FROM autoflow.execution_output_index;"

WRITE SAFETY
------------
The repository rejects every write unless this flag is explicitly enabled:

EXECUTION_OUTPUT_INDEX_WRITE_ENABLED=false

Keep it false for Step 7B.1.

ROLLBACK
--------
Delete the four added backend files and README_STEP7B1.txt, then restore the two
updated files from the certified Phase 2 ZIP. No database rollback is needed
because this step performs no database writes.

NEXT GATE
---------
Review the generated readiness JSON. Step 7B.2 starts only after:
- projection errors = 0;
- duplicate binding paths = 0;
- secret previews/values = 0;
- truncated nodes have been reviewed;
- projected row volume is accepted.
