import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const outfile = path.join(
  fs.mkdtempSync(path.join(os.tmpdir(), 'autoflow-phase4c2a-')),
  'plugin-mapping-remediation.cjs'
);

await build({
  entryPoints: [path.join(root, 'scripts', 'pluginMappingRemediationCli.ts')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outfile,
  logLevel: 'error',
});

const result = spawnSync(process.execPath, [outfile, ...process.argv.slice(2)], {
  cwd: root,
  stdio: 'inherit',
});
process.exit(result.status ?? 1);
