AutoFlow Database Integration - Step 1
======================================

Purpose
-------
Verify that the existing Node/Express backend can connect to the PostgreSQL
database and see the 18-table AutoFlow schema. This step does not modify the
existing workspace.json or workflow-file persistence.

Overlay paths
-------------
Copy the contents of this ZIP over the root of:
AutoFlow_Frontend_V1_Stabilized

New files:
backend/db/pool.js
backend/scripts/testDatabase.js
backend/.env.database.example

Installation
------------
1. Open Command Prompt in the backend directory.

2. Install the PostgreSQL Node driver:

   npm install pg

3. Copy the settings from backend/.env.database.example into backend/.env.

4. Set DB_PASSWORD to the actual password used by your local PostgreSQL
   "postgres" account.

5. Run:

   node scripts/testDatabase.js

Expected output
---------------
PostgreSQL connection : PASS
AutoFlow tables       : 18
Workspace key         : default
Root frontend ID      : root
RESULT                : DATABASE FOUNDATION VERIFIED

Security
--------
Do not send or commit backend/.env. Only the example file belongs in source
control. This integration stores no database password in JavaScript files.
