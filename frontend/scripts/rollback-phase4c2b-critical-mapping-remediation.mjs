#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const CONFIRM_TOKEN = 'ROLLBACK_PHASE4C2B_CRITICAL_MAPPING_FIXES';
const args = process.argv.slice(2);
const confirmIndex = args.indexOf('--confirm');
const confirm = confirmIndex >= 0 ? args[confirmIndex + 1] : '';

if (confirm !== CONFIRM_TOKEN) {
  console.error(`Refusing rollback. Re-run with --confirm ${CONFIRM_TOKEN}`);
  process.exit(2);
}

const root = process.cwd();
const sourceFile = path.join(root, 'src', 'data', 'automationCategories.ts');
const backupFile = path.join(
  root,
  '_phase4_step4c2b_backup',
  'src',
  'data',
  'automationCategories.ts.before-phase4c2b'
);
const rollbackReport = path.join(
  root,
  'migration_backups',
  'phase4c2b',
  'phase4c2b-critical-mapping-rollback-report.json'
);

function sha256(value) {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

if (!fs.existsSync(backupFile)) {
  console.error(`Backup not found: ${backupFile}`);
  process.exit(3);
}

const current = fs.existsSync(sourceFile) ? fs.readFileSync(sourceFile, 'utf8') : '';
const backup = fs.readFileSync(backupFile, 'utf8');
const safetyCopy = `${sourceFile}.before-phase4c2b-rollback`;

if (current) fs.writeFileSync(safetyCopy, current, 'utf8');
const temporaryFile = `${sourceFile}.phase4c2b.rollback.tmp`;
fs.writeFileSync(temporaryFile, backup, 'utf8');
fs.renameSync(temporaryFile, sourceFile);

const report = {
  generatedAt: new Date().toISOString(),
  status: 'success',
  verdict: 'PHASE4C2B_CRITICAL_MAPPING_SOURCE_REMEDIATION_ROLLED_BACK',
  sourceFile,
  restoredFrom: backupFile,
  safetyCopy,
  beforeRollbackSha256: sha256(current),
  restoredSha256: sha256(backup),
  databaseWritesPerformed: 0,
};

fs.mkdirSync(path.dirname(rollbackReport), { recursive: true });
fs.writeFileSync(rollbackReport, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ ...report, rollbackReport }, null, 2));
