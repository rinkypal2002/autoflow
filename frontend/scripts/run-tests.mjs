/**
 * Runs the workflow carry-forward verification suite.
 *
 * The suite is written in TypeScript against the real `src/lib` modules, so it
 * exercises exactly the code the executor uses at run time — not a copy. esbuild
 * (already present as a Vite dependency) bundles it for Node before running.
 *
 *   npm run test:carry-forward
 */
import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
// Suite name comes from argv, defaulting to the carry-forward suite so the
// original `npm run test:carry-forward` invocation is unchanged.
const suite = process.argv[2] ?? 'carryForward';
const outfile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'wf-tests-')), 'suite.cjs');

if (!fs.existsSync(path.join(root, 'tests', `${suite}.test.ts`))) {
  console.error(`Unknown suite "${suite}".`);
  process.exit(1);
}

await build({
  entryPoints: [path.join(root, 'tests', `${suite}.test.ts`)],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outfile,
  logLevel: 'error',
});

const result = spawnSync(process.execPath, [outfile], { stdio: 'inherit' });
process.exit(result.status ?? 1);
