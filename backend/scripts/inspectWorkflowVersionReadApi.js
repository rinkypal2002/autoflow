'use strict';

const fs = require('fs');
const path = require('path');

function parseArgs(argv) {
  const args = { workflowId: null, out: null };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--workflow-id') args.workflowId = argv[++index] || null;
    else if (argv[index] === '--out') args.out = argv[++index] || null;
    else throw new Error(`Unknown argument '${argv[index]}'.`);
  }
  if (!args.workflowId) throw new Error('--workflow-id is required.');
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const baseUrl = process.env.WORKSPACE_API_URL || 'http://localhost:8081/api/workspace';
  const url = `${baseUrl}/workflows/${encodeURIComponent(args.workflowId)}/versions?includeDefinition=true&limit=100`;
  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  const body = await response.json();
  if (!response.ok) throw new Error(`${response.status}: ${body.error || JSON.stringify(body)}`);

  const sourceTypes = {};
  let actions = 0;
  let connections = 0;
  let variables = 0;
  for (const version of body.versions || []) {
    sourceTypes[version.sourceType] = (sourceTypes[version.sourceType] || 0) + 1;
    actions += Number(version.stats?.actions) || 0;
    connections += Number(version.stats?.connections) || 0;
    variables += Number(version.stats?.variables) || 0;
  }

  const report = {
    generatedAt: new Date().toISOString(),
    mode: 'READ_ONLY_API_INSPECTION',
    workflowId: body.workflowId,
    workflowName: body.workflowName,
    currentVersionNumber: body.currentVersionNumber,
    totalVersions: body.coverage?.totalVersions || 0,
    returnedVersions: body.coverage?.returnedVersions || 0,
    hasMore: Boolean(body.coverage?.hasMore),
    sourceTypes,
    aggregateStats: { actions, connections, variables },
    newestVersion: body.versions?.[0] || null,
    oldestVersion: body.versions?.at(-1) || null,
    safety: {
      source: body.source,
      readOnly: body.readOnly,
      restoreEnabled: body.restoreEnabled,
      writesPerformed: 0,
    },
    verdict: {
      status:
        body.readOnly === true && body.restoreEnabled === false
          ? 'WORKFLOW_VERSION_HISTORY_READ_MODEL_VERIFIED'
          : 'WORKFLOW_VERSION_HISTORY_READ_MODEL_UNSAFE',
    },
  };

  console.log(JSON.stringify(report, null, 2));
  if (args.out) {
    const target = path.resolve(args.out);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, JSON.stringify(report, null, 2));
    console.log(`\nVersion-history inspection written to: ${target}`);
  }
  if (report.verdict.status !== 'WORKFLOW_VERSION_HISTORY_READ_MODEL_VERIFIED') {
    process.exitCode = 2;
  }
}

main().catch((error) => {
  console.error('[Step 7B.6A] Workflow version-history API inspection failed.');
  console.error(error);
  process.exitCode = 1;
});
