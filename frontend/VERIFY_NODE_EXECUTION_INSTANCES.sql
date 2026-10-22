-- Run after executing the certification workflow once.
WITH latest_run AS (
  SELECT execution.id, execution.execution_key
  FROM autoflow.workflow workflow
  JOIN autoflow.workflow_execution execution
    ON execution.workflow_id = workflow.id
  WHERE workflow.workflow_key = 'a3ef623f-d03f-435b-bdb8-4489fd68c579'
  ORDER BY execution.updated_at DESC
  LIMIT 1
)
SELECT
  latest_run.execution_key AS run_id,
  node.sequence_number AS logical_sequence,
  node.execution_instance_sequence,
  node.node_name,
  node.execution_instance_key,
  node.attempt_number,
  node.is_instance_final_attempt,
  node.is_final_attempt AS logical_latest,
  node.status,
  node.resolved_input_json,
  node.business_output_json
FROM latest_run
JOIN autoflow.node_execution node
  ON node.execution_id = latest_run.id
ORDER BY
  node.execution_instance_sequence,
  node.attempt_number;

-- Compact certification summary. Calculated Column should report 3 physical
-- instances and exactly 1 logical_latest row for the 3-item For Each test.
WITH latest_run AS (
  SELECT execution.id
  FROM autoflow.workflow workflow
  JOIN autoflow.workflow_execution execution
    ON execution.workflow_id = workflow.id
  WHERE workflow.workflow_key = 'a3ef623f-d03f-435b-bdb8-4489fd68c579'
  ORDER BY execution.updated_at DESC
  LIMIT 1
)
SELECT
  node.node_name,
  count(*) FILTER (WHERE node.is_instance_final_attempt)::integer AS physical_instances,
  count(*)::integer AS stored_attempt_rows,
  count(*) FILTER (WHERE node.is_final_attempt)::integer AS logical_latest_rows
FROM latest_run
JOIN autoflow.node_execution node
  ON node.execution_id = latest_run.id
GROUP BY node.node_name
ORDER BY min(node.sequence_number), node.node_name;
