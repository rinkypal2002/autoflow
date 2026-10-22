BEGIN;

-- Add a physical execution-instance identity without changing the existing
-- logical node identity or retry attempt semantics.
ALTER TABLE autoflow.node_execution
  ADD COLUMN IF NOT EXISTS execution_instance_key text,
  ADD COLUMN IF NOT EXISTS execution_instance_sequence integer,
  ADD COLUMN IF NOT EXISTS is_instance_final_attempt boolean;

-- Existing rows predate loop-instance persistence. Treat each logical node as
-- one execution instance and preserve its existing retry/final-attempt state.
UPDATE autoflow.node_execution
SET execution_instance_key = node_key
WHERE execution_instance_key IS NULL
   OR btrim(execution_instance_key) = '';

UPDATE autoflow.node_execution
SET execution_instance_sequence = sequence_number
WHERE execution_instance_sequence IS NULL
   OR execution_instance_sequence < 1;

UPDATE autoflow.node_execution
SET is_instance_final_attempt = is_final_attempt
WHERE is_instance_final_attempt IS NULL;

ALTER TABLE autoflow.node_execution
  ALTER COLUMN execution_instance_key SET NOT NULL,
  ALTER COLUMN execution_instance_sequence SET NOT NULL,
  ALTER COLUMN is_instance_final_attempt SET NOT NULL,
  ALTER COLUMN is_instance_final_attempt SET DEFAULT true;

-- Old uniqueness collapsed every loop iteration because attempt_number is a
-- retry number, not an iteration number. Handle either a standalone unique
-- index or a constraint-backed index safely.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint constraint_row
    JOIN pg_class table_row
      ON table_row.oid = constraint_row.conrelid
    JOIN pg_namespace schema_row
      ON schema_row.oid = table_row.relnamespace
    WHERE schema_row.nspname = 'autoflow'
      AND table_row.relname = 'node_execution'
      AND constraint_row.conname = 'uq_node_execution_attempt'
  ) THEN
    ALTER TABLE autoflow.node_execution
      DROP CONSTRAINT uq_node_execution_attempt;
  ELSE
    DROP INDEX IF EXISTS autoflow.uq_node_execution_attempt;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_node_execution_instance_attempt
  ON autoflow.node_execution (
    execution_id,
    node_key,
    execution_instance_key,
    attempt_number
  );

-- Keep the existing uq_node_execution_final_attempt index unchanged. It still
-- guarantees exactly one logical latest node record per run/node, which keeps
-- the Binding Picker and output index backward-compatible.
CREATE UNIQUE INDEX IF NOT EXISTS uq_node_execution_instance_final_attempt
  ON autoflow.node_execution (
    execution_id,
    node_key,
    execution_instance_key
  )
  WHERE is_instance_final_attempt = true;

CREATE INDEX IF NOT EXISTS ix_node_execution_instance_order
  ON autoflow.node_execution (
    execution_id,
    execution_instance_sequence,
    attempt_number
  );

COMMIT;
