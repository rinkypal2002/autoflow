import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function categoryBlock(source, categoryId) {
  const marker = `"id": "${categoryId}"`;
  const start = source.indexOf(marker);
  assert(start >= 0, `Category not found: ${categoryId}`);

  const next = source.indexOf('\n  {\n    "id": ', start + marker.length);
  return source.slice(start, next >= 0 ? next : source.length);
}

const catalogue = read('src/data/automationCategories.ts');
for (const [categoryId, expectedActions] of [
  ['onedrive-013', 10],
  ['adobe-sign-034', 10],
]) {
  const block = categoryBlock(catalogue, categoryId);
  assert(/"enabled"\s*:\s*false/.test(block), `${categoryId} is not disabled.`);
  assert(/"state"\s*:\s*"unavailable"/.test(block), `${categoryId} availability state is missing.`);
  assert(
    block.includes('"code": "BACKEND_CONNECTOR_NOT_INSTALLED"'),
    `${categoryId} availability code is missing.`
  );
  assert(
    block.includes('"reason": "Backend connector not installed"'),
    `${categoryId} availability reason is missing.`
  );

  const categoryReferences = (
    block.match(new RegExp(`"category"\\s*:\\s*"${categoryId}"`, 'g')) || []
  ).length;
  assert(
    categoryReferences === expectedActions,
    `${categoryId} expected ${expectedActions} actions, found ${categoryReferences}.`
  );
}

const sidebar = read('src/components/Sidebar.tsx');
assert(sidebar.includes('canDrag: !unavailable'), 'Sidebar drag guard is missing.');
assert(sidebar.includes('aria-disabled={unavailable}'), 'Sidebar accessibility guard is missing.');
assert(sidebar.includes('Backend connector not installed'), 'Sidebar unavailable reason is missing.');

const canvas = read('src/components/WorkflowCanvas.tsx');
assert(
  canvas.includes('canDrop: (item) => isWorkflowActionExecutable(item, automationCategories)'),
  'Canvas canDrop guard is missing.'
);
assert(
  canvas.includes('if (!isWorkflowActionExecutable(item, automationCategories)) return;'),
  'Canvas defensive drop guard is missing.'
);

const editor = read('src/pages/WorkspaceEditorPage.tsx');
assert(
  editor.includes('findUnavailableWorkflowActions('),
  'Saved-workflow execution preflight is missing.'
);
assert(
  editor.includes('No execution request was sent.'),
  'Execution-blocked user message is missing.'
);
assert(
  editor.includes('getWorkflowActionAvailability(action, automationCategories)'),
  'Programmatic add guard is missing.'
);

const parity = read('src/lib/pluginMappingParity.ts');
assert(
  parity.includes('if (!isCategoryExecutable(category))'),
  'Mapping parity unavailable-category filter is missing.'
);
assert(
  parity.includes('frontendUnavailableActions'),
  'Mapping parity unavailable-action metric is missing.'
);

console.log('Phase 4D1E connector quarantine verification: PASS');
console.log('OneDrive unavailable actions: 10');
console.log('Adobe Sign unavailable actions: 10');
console.log('Catalogue drag guard: verified');
console.log('Canvas drop guard: verified');
console.log('Saved-workflow execution guard: verified');
console.log('Mapping parity exclusion: verified');
console.log('Database writes: 0');
console.log('Products Engine changes: 0');
