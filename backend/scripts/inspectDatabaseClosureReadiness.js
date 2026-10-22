'use strict';

const fs = require('fs');
const path = require('path');
const { inspectDatabaseContract } = require('../db/databaseContract');
const { closePool } = require('../db/pool');

function option(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

async function main() {
  const outputPath = option('--out');
  const report = await inspectDatabaseContract();
  const payload = {
    generatedAt: new Date().toISOString(),
    mode: 'READ_ONLY_DATABASE_CLOSURE_INSPECTION',
    ...report,
  };

  console.log(JSON.stringify(payload, null, 2));
  if (outputPath) {
    const resolved = path.resolve(outputPath);
    fs.mkdirSync(path.dirname(resolved), { recursive: true });
    fs.writeFileSync(resolved, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
    console.log(`\nDatabase closure report written to: ${resolved}`);
  }

  if (report.status !== 'success') process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error('Database closure inspection failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    try { await closePool(); } catch { /* ignore shutdown error */ }
  });
