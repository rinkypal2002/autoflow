'use strict';

const fs = require('fs');
const path = require('path');
const axios = require('axios');

function parseBoolean(value) {
  if (value === undefined) return undefined;
  const normalized = String(value).trim().toLowerCase();
  if (!['true', 'false'].includes(normalized)) {
    throw new Error(`Expected true or false but received '${value}'.`);
  }
  return normalized === 'true';
}

function parseArgs(argv) {
  const args = {
    baseUrl: 'http://localhost:8081/api/workspace',
    workflowId: null,
    runId: null,
    targetNodeId: null,
    search: '',
    includeTechnical: false,
    includeRaw: true,
    limit: 500,
    offset: 0,
    out: null,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (key === '--base-url') args.baseUrl = argv[++index];
    else if (key === '--workflow-id') args.workflowId = argv[++index];
    else if (key === '--run-id') args.runId = argv[++index];
    else if (key === '--target-node-id') args.targetNodeId = argv[++index];
    else if (key === '--search') args.search = argv[++index] || '';
    else if (key === '--include-technical') args.includeTechnical = parseBoolean(argv[++index]);
    else if (key === '--include-raw') args.includeRaw = parseBoolean(argv[++index]);
    else if (key === '--limit') args.limit = Number(argv[++index]);
    else if (key === '--offset') args.offset = Number(argv[++index]);
    else if (key === '--out') args.out = argv[++index];
    else throw new Error(`Unknown argument '${key}'.`);
  }
  if (!args.workflowId) throw new Error('--workflow-id is required.');
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const root = String(args.baseUrl).replace(/\/+$/, '');
  const statusResponse = await axios.get(`${root}/output-source/status`, { timeout: 10000 });

  const params = {
    includeTechnical: args.includeTechnical,
    includeRaw: args.includeRaw,
    limit: args.limit,
    offset: args.offset,
  };
  if (args.search) params.search = args.search;
  if (args.targetNodeId) params.targetNodeId = args.targetNodeId;

  const endpoint = args.runId
    ? `${root}/workflows/${encodeURIComponent(args.workflowId)}/runs/${encodeURIComponent(args.runId)}/outputs`
    : `${root}/workflows/${encodeURIComponent(args.workflowId)}/output-sources`;
  if (!args.runId) params.runId = undefined;

  const response = await axios.get(endpoint, { params, timeout: 15000 });
  const report = {
    generatedAt: new Date().toISOString(),
    mode: 'READ_ONLY_HTTP_INSPECTION',
    endpoint,
    status: statusResponse.data,
    result: response.data,
    verdict: {
      status:
        response.data.readOnly === true &&
        response.data.source === 'postgres' &&
        response.data.coverage &&
        response.data.coverage.missingIndexedNodes === 0
          ? 'OUTPUT_SOURCE_API_COVERAGE_VERIFIED'
          : 'OUTPUT_SOURCE_API_COVERAGE_INCOMPLETE',
      writesPerformed: 0,
    },
  };

  console.log(JSON.stringify(report, null, 2));
  if (args.out) {
    const target = path.resolve(args.out);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, JSON.stringify(report, null, 2));
    console.log(`\nOutput-source API report written to: ${target}`);
  }
  if (report.verdict.status !== 'OUTPUT_SOURCE_API_COVERAGE_VERIFIED') {
    process.exitCode = 2;
  }
}

main().catch((error) => {
  console.error('[Step 7B.5A] Output-source API inspection failed.');
  if (error.response) {
    console.error(JSON.stringify({
      status: error.response.status,
      data: error.response.data,
    }, null, 2));
  } else {
    console.error(error);
  }
  process.exitCode = 1;
});
