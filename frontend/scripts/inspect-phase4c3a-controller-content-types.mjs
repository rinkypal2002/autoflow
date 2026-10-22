
import fs from 'node:fs';
import path from 'node:path';
import {
  auditContentTypeFindings,
  toCsv,
  toMarkdown,
} from './lib/phase4c3aContentTypeAudit.mjs';

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      args[key] = true;
    } else {
      args[key] = next;
      i += 1;
    }
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
const engineRoot = path.resolve(args['engine-root'] || '');
const reportPath = path.resolve(
  args.report || 'migration_backups/phase4c2c/phase4c2a-plugin-mapping-remediation.json',
);
const registryPath = path.resolve(
  args.registry || path.join(engineRoot, 'Products_Engine/src/main/resources/action-registry.json'),
);
const outDir = path.resolve(args['out-dir'] || 'migration_backups/phase4c3a');

for (const [label, filePath] of [
  ['engine root', engineRoot],
  ['Phase 4C.2C report', reportPath],
  ['engine action registry', registryPath],
]) {
  if (!filePath || !fs.existsSync(filePath)) {
    console.error(`${label} not found: ${filePath}`);
    process.exit(2);
  }
}

const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
if (!Array.isArray(registry) || registry.length !== 343) {
  console.error(`Expected a 343-record action registry, received ${Array.isArray(registry) ? registry.length : 'non-array'}.`);
  process.exit(2);
}

const audit = auditContentTypeFindings({ report, registry, engineRoot });
fs.mkdirSync(outDir, { recursive: true });

const jsonFile = path.join(outDir, 'phase4c3a-controller-content-type-certification.json');
const csvFile = path.join(outDir, 'phase4c3a-controller-content-type-certification.csv');
const markdownFile = path.join(outDir, 'phase4c3a-controller-content-type-certification.md');

fs.writeFileSync(jsonFile, `${JSON.stringify(audit, null, 2)}\n`, 'utf8');
fs.writeFileSync(csvFile, `${toCsv(audit)}\n`, 'utf8');
fs.writeFileSync(markdownFile, `${toMarkdown(audit)}\n`, 'utf8');

console.log(JSON.stringify({
  status: audit.status,
  verdict: audit.verdict,
  readOnly: audit.readOnly,
  databaseWritesPerformed: audit.databaseWritesPerformed,
  frontendSourceChangesPerformed: audit.frontendSourceChangesPerformed,
  engineSourceChangesPerformed: audit.engineSourceChangesPerformed,
  executionRoutingChanged: audit.executionRoutingChanged,
  summary: audit.summary,
  files: { jsonFile, csvFile, markdownFile },
}, null, 2));

process.exit(audit.status === 'success' ? 0 : 3);
