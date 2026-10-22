#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const CONFIRM_TOKEN = 'APPLY_PHASE4C2C_ROUTE_REMEDIATION';
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
const confirmIndex = args.indexOf('--confirm');
const confirm = confirmIndex >= 0 ? args[confirmIndex + 1] : '';

if (confirm !== CONFIRM_TOKEN) {
  console.error(`Refusing to modify source. Re-run with --confirm ${CONFIRM_TOKEN}`);
  process.exit(2);
}

const sourceFile = path.join(root, 'src', 'data', 'automationCategories.ts');
const parityFile = path.join(root, 'src', 'lib', 'pluginMappingParity.ts');
const remediationFile = path.join(root, 'src', 'lib', 'pluginMappingRemediation.ts');
const backupRoot = path.join(root, '_phase4_step4c2c_backup');
const reportDir = path.join(root, 'migration_backups', 'phase4c2c');
const reportFile = path.join(reportDir, 'phase4c2c-route-remediation-apply-report.json');

for (const file of [sourceFile, parityFile, remediationFile]) {
  if (!fs.existsSync(file)) {
    console.error(`Required file not found: ${file}`);
    process.exit(3);
  }
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function backup(file) {
  const relative = path.relative(root, file);
  const target = path.join(backupRoot, `${relative}.before-phase4c2c`);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  if (!fs.existsSync(target)) {
    fs.copyFileSync(file, target);
  }
  return target;
}

const backups = [sourceFile, parityFile, remediationFile].map(backup);

const originalSource = fs.readFileSync(sourceFile, 'utf8');
const originalParity = fs.readFileSync(parityFile, 'utf8');
const originalRemediation = fs.readFileSync(remediationFile, 'utf8');

const oldSftpPrefix = 'http://localhost:8080/engine/sftp-plugin/api/sftp/';
const newSftpPrefix = 'http://localhost:8080/engine/api/sftp/';
const oldSftpCount = originalSource.split(oldSftpPrefix).length - 1;
const newSftpCountBefore = originalSource.split(newSftpPrefix).length - 1;

let updatedSource = originalSource;
let sftpRoutesApplied = 0;
let sftpRoutesAlreadyApplied = 0;

if (oldSftpCount === 12) {
  updatedSource = updatedSource.split(oldSftpPrefix).join(newSftpPrefix);
  sftpRoutesApplied = 12;
} else if (oldSftpCount === 0 && newSftpCountBefore >= 12) {
  sftpRoutesAlreadyApplied = 12;
} else {
  console.error(`Unexpected SFTP route state. Expected 12 old prefixes or at least 12 corrected prefixes; found old=${oldSftpCount}, corrected=${newSftpCountBefore}.`);
  process.exit(4);
}

const normalizerMarker = '// Phase 4C.2C: normalize encoded workflow placeholders for route comparison.';
const normalizerAnchor = "  path = path.replace(/^\\/engine(?=\\/|$)/i, '') || '/';";
const normalizerInsert = [
  '  ' + normalizerMarker,
  '  try {',
  '    path = decodeURIComponent(path);',
  '  } catch {',
  '    // Keep the original path when malformed percent-encoding is encountered.',
  '  }',
  "  path = path.replace(/\\{\\{([^{}]+)\\}\\}/g, '{$1}');",
  normalizerAnchor,
].join('\n');

function patchNormalizer(content, fileLabel) {
  if (content.includes(normalizerMarker)) {
    return { content, applied: 0, alreadyApplied: 1 };
  }
  const functionIndex = content.indexOf('function normalizePath(value: string): string {');
  if (functionIndex < 0) {
    throw new Error(`normalizePath function not found in ${fileLabel}`);
  }
  const anchorIndex = content.indexOf(normalizerAnchor, functionIndex);
  if (anchorIndex < 0) {
    throw new Error(`normalizePath anchor not found in ${fileLabel}`);
  }
  const nextFunctionIndex = content.indexOf('\nfunction ', functionIndex + 1);
  if (nextFunctionIndex >= 0 && anchorIndex > nextFunctionIndex) {
    throw new Error(`normalizePath anchor resolved outside normalizePath in ${fileLabel}`);
  }
  return {
    content: content.slice(0, anchorIndex) + normalizerInsert + content.slice(anchorIndex + normalizerAnchor.length),
    applied: 1,
    alreadyApplied: 0,
  };
}

let parityPatch;
let remediationPatch;
try {
  parityPatch = patchNormalizer(originalParity, 'pluginMappingParity.ts');
  remediationPatch = patchNormalizer(originalRemediation, 'pluginMappingRemediation.ts');
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(5);
}

const beforeActionMarkers = (originalSource.match(/"type"\s*:/g) || []).length;
const afterActionMarkers = (updatedSource.match(/"type"\s*:/g) || []).length;
if (beforeActionMarkers !== afterActionMarkers) {
  console.error(`Action marker count changed unexpectedly: ${beforeActionMarkers} -> ${afterActionMarkers}`);
  process.exit(6);
}

const correctedSftpCount = updatedSource.split(newSftpPrefix).length - 1;
if (correctedSftpCount < 12 || updatedSource.includes(oldSftpPrefix)) {
  console.error('SFTP prefix remediation verification failed.');
  process.exit(7);
}

const systemTemplate = 'http://localhost:8080/engine/api/v1/system/service/{{serviceName}}';
if (!updatedSource.includes(systemTemplate)) {
  console.error('System service template must remain in double-brace execution form.');
  process.exit(8);
}

fs.writeFileSync(sourceFile, updatedSource, 'utf8');
fs.writeFileSync(parityFile, parityPatch.content, 'utf8');
fs.writeFileSync(remediationFile, remediationPatch.content, 'utf8');

fs.mkdirSync(reportDir, { recursive: true });
const report = {
  status: 'success',
  verdict: 'PHASE4C2C_ROUTE_REMEDIATION_APPLIED',
  expectedResolvedRouteFindings: 13,
  sftpPrefixRoutes: {
    applied: sftpRoutesApplied,
    alreadyApplied: sftpRoutesAlreadyApplied,
    correctedTotal: correctedSftpCount,
  },
  pathTemplateNormalizers: {
    applied: parityPatch.applied + remediationPatch.applied,
    alreadyApplied: parityPatch.alreadyApplied + remediationPatch.alreadyApplied,
    files: [
      'src/lib/pluginMappingParity.ts',
      'src/lib/pluginMappingRemediation.ts',
    ],
  },
  systemServiceExecutionTemplatePreserved: true,
  beforeActionMarkers,
  afterActionMarkers,
  visibleCatalogueActionCountChanged: false,
  databaseWritesPerformed: 0,
  executionProviderCutoverPerformed: false,
  files: {
    automationCategories: {
      path: sourceFile,
      beforeSha256: sha256(originalSource),
      afterSha256: sha256(updatedSource),
    },
    pluginMappingParity: {
      path: parityFile,
      beforeSha256: sha256(originalParity),
      afterSha256: sha256(parityPatch.content),
    },
    pluginMappingRemediation: {
      path: remediationFile,
      beforeSha256: sha256(originalRemediation),
      afterSha256: sha256(remediationPatch.content),
    },
    backups,
    reportFile,
  },
};

fs.writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report, null, 2));
