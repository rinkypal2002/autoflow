#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const CONFIRM_TOKEN = 'APPLY_PHASE4C2B_CRITICAL_MAPPING_FIXES';
const args = process.argv.slice(2);
const confirmIndex = args.indexOf('--confirm');
const confirm = confirmIndex >= 0 ? args[confirmIndex + 1] : '';

if (confirm !== CONFIRM_TOKEN) {
  console.error(`Refusing to modify source. Re-run with --confirm ${CONFIRM_TOKEN}`);
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
const reportFile = path.join(
  root,
  'migration_backups',
  'phase4c2b',
  'phase4c2b-critical-mapping-apply-report.json'
);

function sha256(value) {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

function countActionMarkers(value) {
  return (value.match(/^        "category": "/gm) || []).length;
}

function categoryBounds(value, categoryId) {
  const marker = `"id": "${categoryId}"`;
  const markerIndex = value.indexOf(marker);
  if (markerIndex < 0) throw new Error(`Category not found: ${categoryId}`);
  const start = value.lastIndexOf('\n  {', markerIndex);
  const next = value.indexOf('\n  {\n    "id": ', markerIndex + marker.length);
  return { start: start >= 0 ? start : markerIndex, end: next >= 0 ? next : value.length };
}

const changes = [
  {
    id: 'teams-create-channel-route',
    categoryId: 'microsoft-teams-010',
    action: 'Create Channel',
    oldValue: 'http://localhost:8080/engine/api/v1/teams/CreateChannels',
    newValue: 'http://localhost:8080/engine/api/v1/teams/CreateChannel',
    reason: 'Use the registered Microsoft Teams legacy route (singular CreateChannel).',
  },
  {
    id: 'google-drive-download-method',
    categoryId: 'google-drive-012',
    action: 'Download',
    oldValue: '"url": "http://localhost:8080/engine/drive/download",\n          "method": "GET"',
    newValue: '"url": "http://localhost:8080/engine/drive/download",\n          "method": "POST"',
    reason: 'Match the registered Google Drive download HTTP method.',
  },
  {
    id: 'onedrive-copy-ownership',
    categoryId: 'onedrive-013',
    action: 'Copy',
    oldValue: 'http://localhost:8080/engine/drive/copy',
    newValue: 'http://localhost:8080/engine/onedrive/copy',
    reason: 'Remove cross-plugin routing to Google Drive; OneDrive remains explicitly frontend-only until its engine provider is registered.',
  },
  {
    id: 'asana-template-ownership',
    categoryId: 'asana-033',
    action: 'Get all templates',
    oldValue: 'http://localhost:8080/engine/api/v1/adobe/templates/list',
    newValue: 'http://localhost:8080/engine/asana/get-all-templates',
    reason: 'Remove cross-plugin routing to Adobe Sign; the missing Asana engine operation remains visible for explicit ownership remediation.',
  },
  {
    id: 'ec2-test-connection-ownership',
    categoryId: 'amazon-ec2-023',
    action: 'TestConnection',
    oldValue: 'http://localhost:8080/engine/aws/s3/test-connection',
    newValue: 'http://localhost:8080/engine/api/ec2/test-connection',
    reason: 'Route EC2 connection testing to the EC2 plugin instead of Amazon S3.',
  },
  {
    id: 'statistics-analytic-query-route',
    categoryId: 'statistics-036',
    action: 'query',
    oldValue: 'http://localhost:8080/engine/analytics/query',
    newValue: 'http://localhost:8080/engine/analytics/analytic-query',
    reason: 'Use the registered analytics Analytic Query route.',
  },
  {
    id: 'statistics-step-metrics-route',
    categoryId: 'statistics-036',
    action: 'metrics',
    oldValue: 'http://localhost:8080/engine/analytics/metrics',
    newValue: 'http://localhost:8080/engine/analytics/step-metrics',
    reason: 'Use the registered analytics Step Metrics route.',
  },
];

if (!fs.existsSync(sourceFile)) {
  console.error(`Source file not found: ${sourceFile}`);
  process.exit(3);
}

const before = fs.readFileSync(sourceFile, 'utf8');
const beforeSha256 = sha256(before);
const beforeActionMarkers = countActionMarkers(before);
let updated = before;
const results = [];

for (const change of changes) {
  const { start, end } = categoryBounds(updated, change.categoryId);
  const block = updated.slice(start, end);
  const oldCount = block.split(change.oldValue).length - 1;
  const newCount = block.split(change.newValue).length - 1;

  if (oldCount === 1) {
    const replaced = block.replace(change.oldValue, change.newValue);
    updated = updated.slice(0, start) + replaced + updated.slice(end);
    results.push({ ...change, status: 'APPLIED' });
    continue;
  }

  if (oldCount === 0 && newCount === 1) {
    results.push({ ...change, status: 'ALREADY_APPLIED' });
    continue;
  }

  throw new Error(
    `${change.id}: expected exactly one old value or one already-applied value in ${change.categoryId}; ` +
    `found old=${oldCount}, new=${newCount}. Source was not modified.`
  );
}

const afterActionMarkers = countActionMarkers(updated);
if (afterActionMarkers !== beforeActionMarkers) {
  throw new Error(
    `Action marker count changed from ${beforeActionMarkers} to ${afterActionMarkers}. Source was not modified.`
  );
}

const appliedCount = results.filter((item) => item.status === 'APPLIED').length;
const alreadyAppliedCount = results.filter((item) => item.status === 'ALREADY_APPLIED').length;

if (appliedCount > 0) {
  fs.mkdirSync(path.dirname(backupFile), { recursive: true });
  if (!fs.existsSync(backupFile)) {
    fs.writeFileSync(backupFile, before, 'utf8');
  } else {
    const existingBackup = fs.readFileSync(backupFile, 'utf8');
    if (sha256(existingBackup) !== beforeSha256 && alreadyAppliedCount === 0) {
      throw new Error(`Backup already exists with a different SHA-256: ${backupFile}`);
    }
  }

  const temporaryFile = `${sourceFile}.phase4c2b.tmp`;
  fs.writeFileSync(temporaryFile, updated, 'utf8');
  fs.renameSync(temporaryFile, sourceFile);
}

const finalText = fs.readFileSync(sourceFile, 'utf8');
const report = {
  schemaVersion: '1.0',
  generatedAt: new Date().toISOString(),
  status: 'success',
  verdict: 'PHASE4C2B_CRITICAL_MAPPING_SOURCE_REMEDIATION_APPLIED',
  sourceFile,
  backupFile,
  readOnlyDatabase: true,
  databaseWritesPerformed: 0,
  visibleCatalogueActionCountChanged: false,
  executionProviderCutoverPerformed: false,
  beforeSha256,
  afterSha256: sha256(finalText),
  beforeActionMarkers,
  afterActionMarkers: countActionMarkers(finalText),
  appliedCount,
  alreadyAppliedCount,
  changes: results,
};

fs.mkdirSync(path.dirname(reportFile), { recursive: true });
fs.writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

console.log(JSON.stringify({
  status: report.status,
  verdict: report.verdict,
  appliedCount,
  alreadyAppliedCount,
  beforeActionMarkers,
  afterActionMarkers: report.afterActionMarkers,
  databaseWritesPerformed: 0,
  visibleCatalogueActionCountChanged: false,
  executionProviderCutoverPerformed: false,
  backupFile,
  reportFile,
}, null, 2));
