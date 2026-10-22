const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const srcPath = path.join('src', 'lib', 'pluginMappingRemediation.ts');
const testPath = path.join('tests', 'pluginMappingRemediation.test.ts');
const evidenceDir = process.env.D1G_C6E_DIR;

if (!evidenceDir) {
  throw new Error('D1G_C6E_DIR is not set');
}

const expectedSrc = 'af4372a1025424956990c2851391913c7faf0e1ca82dfbc3a7eb39d8753e50c4';
const expectedTest = '946d7399b777312bac304ff9dd8d291d1dc3c1423da1e1f7922ae8bd3ef62c73';

function sha256(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

function toLf(text) {
  return text.replace(/\r\n/g, '\n');
}

function restoreEol(text, eol) {
  return eol === '\r\n' ? text.replace(/\n/g, '\r\n') : text;
}

function replaceOnce(text, oldText, newText, label) {
  const first = text.indexOf(oldText);
  if (first < 0) throw new Error(`${label}: anchor missing`);
  if (text.indexOf(oldText, first + oldText.length) >= 0) {
    throw new Error(`${label}: anchor is not unique`);
  }
  return text.slice(0, first) + newText + text.slice(first + oldText.length);
}

const srcRaw = fs.readFileSync(srcPath, 'utf8');
const testRaw = fs.readFileSync(testPath, 'utf8');

const srcPreHash = sha256(srcRaw);
const testPreHash = sha256(testRaw);

if (srcPreHash !== expectedSrc) {
  throw new Error(`Production pre-patch hash mismatch: ${srcPreHash}`);
}
if (testPreHash !== expectedTest) {
  throw new Error(`Test pre-patch hash mismatch: ${testPreHash}`);
}

fs.mkdirSync(evidenceDir, { recursive: true });

const srcBackup = path.join(evidenceDir, 'pluginMappingRemediation.pre-c6e-b3.ts');
const testBackup = path.join(evidenceDir, 'pluginMappingRemediation.test.pre-c6e-b3.ts');

if (!fs.existsSync(srcBackup)) fs.copyFileSync(srcPath, srcBackup);
if (!fs.existsSync(testBackup)) fs.copyFileSync(testPath, testBackup);

const srcEol = srcRaw.includes('\r\n') ? '\r\n' : '\n';
const testEol = testRaw.includes('\r\n') ? '\r\n' : '\n';

let src = toLf(srcRaw);
let test = toLf(testRaw);

src = replaceOnce(
  src,
  "  | 'SEPARATE_SERVICE_ACTION_NOT_REGISTERED'\n  | 'ENGINE_ONLY_ACTION'",
  "  | 'SEPARATE_SERVICE_ACTION_NOT_REGISTERED'\n  | 'SEPARATE_SERVICE_PROVIDER_REGISTERED'\n  | 'ENGINE_ONLY_ACTION'",
  'finding type'
);

src = replaceOnce(
  src,
  "  endpointOwnership?: PluginMappingEndpointOwnership;\n  frontendEndpoint?: string;",
  "  endpointOwnership?: PluginMappingEndpointOwnership;\n  executionProviderId?: string;\n  frontendEndpoint?: string;",
  'finding provider field'
);

src = replaceOnce(
  src,
  "  'vulnerability-triage-041': ['vulnerability-scanner'],\n};\n\nconst SEVERITY_ORDER",
  `  'vulnerability-triage-041': ['vulnerability-scanner'],
};

interface SeparateServiceProviderPolicy {
  providerId: string;
  categoryId: string;
  actionType: string;
  method: string;
  path: string;
}

const SEPARATE_SERVICE_PROVIDER_POLICIES: SeparateServiceProviderPolicy[] = [
  {
    providerId: 'VulnerabilityScanner',
    categoryId: 'vulnerability-triage-041',
    actionType: 'vuln-analyze-verdicts',
    method: 'POST',
    path: '/VulnerabilityScanner/api/triage/run',
  },
];

const SEVERITY_ORDER`,
  'provider policy registry'
);

src = replaceOnce(
  src,
  "function pathTokens(path: string): Set<string> {",
  `function registeredSeparateServiceProvider(
  match: ActionMatch
): SeparateServiceProviderPolicy | undefined {
  if (match.ownership !== 'LOCAL_SEPARATE_SERVICE') return undefined;
  const method = normalizeMethod(match.frontend.method);
  const endpointPath = normalizePath(match.rawEndpoint);
  return SEPARATE_SERVICE_PROVIDER_POLICIES.find((policy) =>
    policy.categoryId === match.frontend.categoryId &&
    policy.actionType === match.frontend.actionType &&
    policy.method === method &&
    normalizePath(policy.path) === endpointPath
  );
}

function pathTokens(path: string): Set<string> {`,
  'registered provider helper'
);

src = replaceOnce(
  src,
  `    findings.push(baseFinding(
      match,
      'SEPARATE_SERVICE_ACTION_NOT_REGISTERED',
      'MEDIUM',
      'This action targets a separate local service rather than the Products Engine action registry.',
      'Register the service as a separate execution provider or explicitly retain it in the static catalogue during cutover.'
    ));
    return;`,
  `    const registeredProvider = registeredSeparateServiceProvider(match);
    if (registeredProvider) {
      const finding = baseFinding(
        match,
        'SEPARATE_SERVICE_PROVIDER_REGISTERED',
        'INFO',
        \`This action is explicitly owned by the registered \${registeredProvider.providerId} separate-service execution provider.\`,
        'Retain the action in the static frontend catalogue and certify the provider endpoint independently of the Products Engine registry.'
      );
      finding.executionProviderId = registeredProvider.providerId;
      findings.push(finding);
      return;
    }

    findings.push(baseFinding(
      match,
      'SEPARATE_SERVICE_ACTION_NOT_REGISTERED',
      'MEDIUM',
      'This action targets a separate local service rather than the Products Engine action registry.',
      'Register the service as a separate execution provider or explicitly retain it in the static catalogue during cutover.'
    ));
    return;`,
  'separate-service unmatched branch'
);

src = replaceOnce(
  src,
  "    'endpointOwnership',\n    'frontendEndpoint',",
  "    'endpointOwnership',\n    'executionProviderId',\n    'frontendEndpoint',",
  'CSV provider column'
);

const oldTestBlock = `const separateServiceFindings = report.findings.filter(function (f) { return f.findingType === 'SEPARATE_SERVICE_ACTION_NOT_REGISTERED'; });
check(separateServiceFindings.length === 2, 'two unregistered local separate-service actions are classified');
function isVuln(f) { if (f.actionType !== 'vuln-analyze-verdicts') return false; if (f.endpointOwnership !== 'LOCAL_SEPARATE_SERVICE') return false; return f.blockingCutover === true; }
function isUnknownLocal(f) { if (f.actionType !== 'unregistered-local-control') return false; if (f.endpointOwnership !== 'LOCAL_SEPARATE_SERVICE') return false; return f.blockingCutover === true; }
check(separateServiceFindings.some(isVuln), 'VulnerabilityScanner action is currently classified as blocking separate service');
check(separateServiceFindings.some(isUnknownLocal), 'unknown local service remains blocking');`;

const newTestBlock = `const separateServiceFindings = report.findings.filter(function (f) { return f.findingType === 'SEPARATE_SERVICE_ACTION_NOT_REGISTERED'; });
check(separateServiceFindings.length === 1, 'only the unknown local separate-service action remains unregistered');
function isUnknownLocal(f) { if (f.actionType !== 'unregistered-local-control') return false; if (f.endpointOwnership !== 'LOCAL_SEPARATE_SERVICE') return false; return f.blockingCutover === true; }
check(separateServiceFindings.some(isUnknownLocal), 'unknown local service remains blocking');
const registeredProviderFindings = report.findings.filter(function (f) { return f.findingType === 'SEPARATE_SERVICE_PROVIDER_REGISTERED'; });
check(registeredProviderFindings.length === 1, 'one registered separate-service provider action is classified');
function isRegisteredVuln(f) { if (f.actionType !== 'vuln-analyze-verdicts') return false; if (f.endpointOwnership !== 'LOCAL_SEPARATE_SERVICE') return false; if (f.executionProviderId !== 'VulnerabilityScanner') return false; if (f.severity !== 'INFO') return false; return f.blockingCutover === false; }
check(registeredProviderFindings.some(isRegisteredVuln), 'VulnerabilityScanner action is registered and non-blocking');
check(!separateServiceFindings.some(function (f) { return f.actionType === 'vuln-analyze-verdicts'; }), 'registered VulnerabilityScanner action is not reported as unregistered');`;

test = replaceOnce(test, oldTestBlock, newTestBlock, 'B2 assertion block');

const srcOut = restoreEol(src, srcEol);
const testOut = restoreEol(test, testEol);

fs.writeFileSync(srcPath, srcOut, 'utf8');
fs.writeFileSync(testPath, testOut, 'utf8');

console.log('C6E-B3 provider-policy patch: APPLIED');
console.log(`SourcePreHash=${srcPreHash}`);
console.log(`SourcePostHash=${sha256(srcOut)}`);
console.log(`TestPreHash=${testPreHash}`);
console.log(`TestPostHash=${sha256(testOut)}`);
console.log(`SourceBackup=${srcBackup}`);
console.log(`TestBackup=${testBackup}`);
