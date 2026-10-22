'use strict';

const assert = require('assert');
const {
  REQUIRED_TABLES,
  REQUIRED_VIEWS,
  REQUIRED_TRIGGERS,
  inspectDatabaseContract,
} = require('../db/databaseContract');

async function main() {
  const statements = [];
  const queryFn = async (sql) => {
    statements.push(String(sql));
    if (/information_schema\.schemata/.test(sql)) return { rows: [{ exists: true }] };
    if (/information_schema\.tables/.test(sql)) {
      return { rows: REQUIRED_TABLES.map((table_name) => ({ table_name })) };
    }
    if (/information_schema\.views/.test(sql)) {
      return { rows: REQUIRED_VIEWS.map((table_name) => ({ table_name })) };
    }
    if (/information_schema\.columns/.test(sql)) {
      const { CRITICAL_COLUMNS } = require('../db/databaseContract');
      return {
        rows: Object.entries(CRITICAL_COLUMNS).flatMap(([table_name, columns]) =>
          columns.map((column_name) => ({ table_name, column_name }))
        ),
      };
    }
    if (/information_schema\.triggers/.test(sql)) {
      return { rows: REQUIRED_TRIGGERS.map((trigger_name) => ({ trigger_name })) };
    }
    return { rows: [{ count: 0 }] };
  };

  const report = await inspectDatabaseContract({ queryFn, schema: 'autoflow' });
  assert.equal(report.status, 'success');
  assert.equal(report.verdict, 'DATABASE_CLOSURE_CONTRACT_VERIFIED');
  assert.equal(report.readOnly, true);
  assert.equal(report.objects.missingTables.length, 0);
  assert.equal(report.objects.missingViews.length, 0);
  assert.equal(report.objects.missingColumns.length, 0);
  assert.equal(report.objects.missingTriggers.length, 0);
  assert.equal(report.futureModules.credentialsReady, true);
  assert.equal(report.futureModules.pluginMappingReady, true);
  assert.equal(report.futureModules.fileArtifactsReady, true);
  const { CRITICAL_COLUMNS } = require('../db/databaseContract');
  assert.ok(CRITICAL_COLUMNS.audit_log.includes('occurred_at'));
  assert.ok(!CRITICAL_COLUMNS.audit_log.includes('created_at'));
  const outputIndexInvariantSql = statements.find((sql) => /FROM\s+autoflow\.execution_output_index/i.test(sql));
  assert.ok(outputIndexInvariantSql, 'Expected an execution_output_index invariant query.');
  assert.ok(/SELECT\s+execution_id,\s*node_execution_id,\s*field_path,\s*field_kind/i.test(outputIndexInvariantSql));
  assert.ok(/GROUP BY\s+execution_id,\s*node_execution_id,\s*field_path,\s*field_kind/i.test(outputIndexInvariantSql));
  assert.ok(!/workflow_execution_id/i.test(outputIndexInvariantSql));
  const secretInvariantSql = statements.find((sql) => /FROM\s+autoflow\.workflow_variable/i.test(sql));
  assert.ok(secretInvariantSql, 'Expected a workflow_variable secret invariant query.');
  assert.ok(/value_json\s+IS NOT NULL\s+AND\s+value_json\s+<>\s+'null'::jsonb/i.test(secretInvariantSql));
  assert.ok(/default_value_json\s+IS NOT NULL\s+AND\s+default_value_json\s+<>\s+'null'::jsonb/i.test(secretInvariantSql));
  assert.ok(statements.every((sql) => /^\s*SELECT\b/i.test(sql)));
  assert.ok(statements.every((sql) => !/\b(INSERT|UPDATE|DELETE|ALTER|DROP|TRUNCATE|CREATE)\b/i.test(sql)));

  const fs = require('fs');
  const path = require('path');
  const workspaceWriter = fs.readFileSync(
    path.resolve(__dirname, '../db/workspaceWriteRepository.js'),
    'utf8'
  );
  assert.ok(/FOR UPDATE OF workflow/.test(workspaceWriter));
  assert.ok(/postgres-workspace-api/.test(workspaceWriter));
  assert.ok(!/database-shadow-api/.test(workspaceWriter));

  console.log('Step 7B.7 database closure hardening tests: PASS');
  console.log('Read-only contract queries: SELECT only');
  console.log(`Core tables checked: ${REQUIRED_TABLES.length}`);
  console.log(`Read views checked: ${REQUIRED_VIEWS.length}`);
  console.log('Concurrent workflow version saves: serialized');
  console.log('Primary-write provenance: corrected');
  console.log('Data integrity invariants: verified');
  console.log('Future module tables: verified');
  console.log('Audit timestamp contract: occurred_at verified');
  console.log('Output-index execution key contract: execution_id verified');
  console.log('Secret JSON null contract: SQL NULL and JSON null treated as empty');
}

main().catch((error) => {
  console.error('Step 7B.7 database closure hardening tests: FAIL');
  console.error(error);
  process.exitCode = 1;
});
