AutoFlow Loop Iteration Instance Persistence Fix
================================================

Purpose
-------
Persist repeated executions of the same canvas node as separate physical
execution instances while preserving the existing clean logical UI/binding
model and preserving attempt_number as retry-only.

Changed project files
---------------------
1. src/types/workflow.ts
2. src/lib/executionContext.ts
3. backend/db/executionRepository.js

Database migration
------------------
APPLY_NODE_EXECUTION_INSTANCE_MIGRATION.sql

Important deployment order
--------------------------
1. Stop/restart window: stop the Node backend before applying the migration.
2. Run APPLY_NODE_EXECUTION_INSTANCE_MIGRATION.sql in pgAdmin against autoflow.
3. Extract this overlay into the project root with -Force.
4. Restart backend and frontend.
5. Run npm run typecheck and npm run test:loops.
6. Execute the 3-item For Each certification workflow once.

Compatibility contract
----------------------
- Existing endpoints unchanged.
- Existing table names unchanged.
- attempt_number remains retry attempt number.
- is_final_attempt remains ONE logical latest row per run + canvas node.
- is_instance_final_attempt marks the final retry attempt of EACH physical
  execution instance.
- output/binding indexing remains attached only to is_final_attempt=true,
  preventing loop iterations from cluttering the normal Binding Picker.
- Full execution snapshots gain an optional executionInstances[] array. Old
  snapshots without it continue to persist through outputs[].

Certification query
-------------------
After the run, execute VERIFY_NODE_EXECUTION_INSTANCES.sql in pgAdmin.
For the current 3-item test, Calculated Column should show:
- physical_instances = 3
- stored_attempt_rows = 3 (when no retries occur)
- logical_latest_rows = 1
The three instance outputs should contain totals 20, 21, 20 in physical order.
