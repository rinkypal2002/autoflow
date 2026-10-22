#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CONFIRM_TOKEN = 'ROLLBACK_PHASE4C2C_ROUTE_REMEDIATION';
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
const confirmIndex = args.indexOf('--confirm');
const confirm = confirmIndex >= 0 ? args[confirmIndex + 1] : '';

if (confirm !== CONFIRM_TOKEN) {
  console.error(`Refusing to restore source. Re-run with --confirm ${CONFIRM_TOKEN}`);
  process.exit(2);
}

const relativeFiles = [
  path.join('src', 'data', 'automationCategories.ts'),
  path.join('src', 'lib', 'pluginMappingParity.ts'),
  path.join('src', 'lib', 'pluginMappingRemediation.ts'),
];

const restored = [];
for (const relative of relativeFiles) {
  const backup = path.join(root, '_phase4_step4c2c_backup', `${relative}.before-phase4c2c`);
  const target = path.join(root, relative);
  if (!fs.existsSync(backup)) {
    console.error(`Backup not found: ${backup}`);
    process.exit(3);
  }
  fs.copyFileSync(backup, target);
  restored.push(target);
}

console.log(JSON.stringify({
  status: 'success',
  verdict: 'PHASE4C2C_ROUTE_REMEDIATION_ROLLED_BACK',
  restored,
  databaseWritesPerformed: 0,
}, null, 2));
