/** Launch-critical frontend stability checks. */
import { humanizeMessage, validateWorkflow } from '../src/lib/executionStatus';
import { toEngineProxyUrl } from '../src/lib/engineProxyUrl';

let pass = 0;
let fail = 0;

const check = (name: string, actual: unknown, expected: unknown): void => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name}\n        expected ${e}\n        actual   ${a}`);
  }
};

console.log('\n[1] SAME-ORIGIN BACKEND ROUTING');
check(
  'engine URL uses the proxy',
  toEngineProxyUrl('http://localhost:8080/engine/api/database/health_check'),
  '/engine/api/database/health_check'
);
check(
  'scanner URL uses the proxy',
  toEngineProxyUrl('http://127.0.0.1:8080/VulnerabilityScanner/api/triage/run'),
  '/VulnerabilityScanner/api/triage/run'
);
check(
  'voice URL uses the proxy',
  toEngineProxyUrl('http://localhost:8080/voice_transcription/api/transcription/upload'),
  '/voice_transcription/api/transcription/upload'
);
check(
  'query strings are preserved',
  toEngineProxyUrl('http://localhost:8080/engine/v1/datasets/abc/rows?offset=10'),
  '/engine/v1/datasets/abc/rows?offset=10'
);
check(
  'remote customer endpoints remain direct',
  toEngineProxyUrl('https://engine.example.com/engine/api/run'),
  'https://engine.example.com/engine/api/run'
);

console.log('\n[2] ERROR PRESENTATION');
check(
  'CORS 403 is not mislabeled as authentication',
  humanizeMessage('API error: 403 - Invalid CORS request', 'error').title,
  'Request blocked by CORS'
);
check(
  'ordinary 403 remains authorization',
  humanizeMessage('API error: 403 - Forbidden', 'error').title,
  'Authorization failed'
);
check(
  'network failure is actionable',
  humanizeMessage('Failed to fetch', 'error').title,
  'Engine unavailable'
);

console.log('\n[3] PRE-RUN REQUIRED FIELD VALIDATION');
const validation = validateWorkflow([
  {
    id: 'db-health',
    name: 'Health Check',
    properties: { host: 'localhost', port: '' },
    propertyConfig: {
      host: { label: 'Host', required: true },
      port: { label: 'Port', required: true },
    },
  },
  {
    id: 'start',
    name: 'Start',
    isControlNode: true,
    properties: {},
    propertyConfig: { ignored: { required: true } },
  },
]);
check('one invalid business node is reported', validation.count, 1);
check('missing field label is friendly', validation.issues[0]?.missing, ['Port']);

console.log(`\nFrontend stability suite: ${pass} passed, ${fail} failed.`);
if (fail > 0) process.exit(1);
