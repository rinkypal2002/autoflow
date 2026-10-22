import type { AutomationCategory } from '../src/types/workflow';
import type { PluginEndpointMappingReadRecord } from '../src/lib/pluginMappingApi';
import { comparePluginMappings } from '../src/lib/pluginMappingParity';
import { resolvePluginMappingMode } from '../src/lib/pluginMappingMode';
import {
  buildPluginMappingRemediationReport,
  pluginMappingRemediationToCsv,
  pluginMappingRemediationToMarkdown,
} from '../src/lib/pluginMappingRemediation';

let passed = 0;
let failed = 0;
function check(condition: unknown, message: string): void {
  if (condition) passed += 1;
  else {
    failed += 1;
    console.error(`FAIL: ${message}`);
  }
}

const categories: AutomationCategory[] = [
  {
    id: 'google-drive-012', name: 'Google Drive', icon: 'Drive', color: 'bg-blue-500', description: 'Drive',
    actions: [
      { type: 'download', category: 'google-drive-012', name: 'Download', description: '', icon: 'Download', api: { url: 'http://localhost:8080/engine/drive/download', method: 'GET' } } as any,
    ],
  },
  {
    id: 'amazon-ec2-023', name: 'Amazon EC2', icon: 'Cloud', color: 'bg-orange-500', description: 'EC2',
    actions: [
      { type: 'testconnection', category: 'amazon-ec2-023', name: 'TestConnection', description: '', icon: 'Wifi', api: { url: 'http://localhost:8080/engine/aws/s3/test-connection', method: 'POST' } } as any,
    ],
  },
  {
    id: 'sftp-019', name: 'SFTP Plugins', icon: 'Server', color: 'bg-slate-500', description: 'SFTP',
    actions: [
      { type: 'upload-file', category: 'sftp-019', name: 'Upload File', description: '', icon: 'Upload', api: { url: 'http://localhost:8080/engine/sftp-plugin/api/sftp/upload/file', method: 'POST' } } as any,
    ],
  },
  {
    id: 'sharepoint-021', name: 'SharePoint', icon: 'Share', color: 'bg-cyan-500', description: 'SharePoint',
    actions: [
      { type: 'login', category: 'sharepoint-021', name: 'Login', description: '', icon: 'LogIn', api: { url: 'http://localhost:8080/engine/sharepoint/login', method: 'POST', headers: { 'Content-Type': 'application/json' } } } as any,
      { type: 'creds2', category: 'sharepoint-021', name: 'Creds2', description: '', icon: 'Key', api: { url: 'https://graph.microsoft.com/v1.0/sites/{{siteId}}/lists', method: 'GET' } } as any,
    ],
  },
  {
    id: 'vulnerability-triage-041', name: 'Vulnerability Triage', icon: 'Shield', color: 'bg-red-500', description: 'Separate service fixture',
    actions: [
      { type: 'vuln-analyze-verdicts', category: 'vulnerability-triage-041', name: 'Analyze Verdicts', description: '', icon: 'Shield', api: { url: 'http://localhost:8080/VulnerabilityScanner/api/triage/run', method: 'POST' } } as any,
      { type: 'unregistered-local-control', category: 'vulnerability-triage-041', name: 'Unregistered Local Control', description: '', icon: 'Shield', api: { url: 'http://localhost:8080/UnregisteredLocal/api/run', method: 'POST' } } as any,
    ],
  },
  {
    id: 'unavailable-connector-999',
    name: 'Unavailable Connector',
    icon: 'Lock',
    color: 'bg-amber-500',
    description: 'Quarantined connector',
    control: {
      enabled: false,
      availability: {
        state: 'unavailable',
        code: 'BACKEND_CONNECTOR_NOT_INSTALLED',
        reason: 'Backend connector not installed',
      },
    },
    actions: [
      { type: 'blocked-engine', category: 'unavailable-connector-999', name: 'Blocked Engine', description: '', icon: 'Lock', api: { url: '/engine/unavailable/blocked-engine', method: 'POST' } } as any,
      { type: 'blocked-external', category: 'unavailable-connector-999', name: 'Blocked External', description: '', icon: 'Lock', api: { url: 'https://example.invalid/blocked-external', method: 'GET' } } as any,
    ],
  },
];

function mapping(overrides: Partial<PluginEndpointMappingReadRecord>): PluginEndpointMappingReadRecord {
  return {
    engineVersion: 'v11.3', engineContextPath: '/engine', pluginId: 'googledrive', pluginName: 'Google Drive',
    actionId: 'googledrive.download', actionName: 'Download', httpMethod: 'POST',
    canonicalPath: '/api/v1/googledrive/drive/download', legacyPath: '/drive/download',
    requestContentTypes: ['application/json'], responseContentTypes: ['application/json'], bodyType: 'json',
    schemaStatus: 'PLACEHOLDER', enabled: true, deprecated: false, metadata: { legacyEndpoints: ['/drive/download'] },
    ...overrides,
  };
}

const mappings = [
  mapping({}),
  mapping({ pluginId: 'aws.s3', pluginName: 'AWS S3', actionId: 'aws.s3.testConnection', actionName: 'Test Connection', canonicalPath: '/api/v1/aws/s3/test-connection', legacyPath: '/aws/s3/test-connection', requestContentTypes: ['multipart/form-data'] }),
  mapping({ pluginId: 'sftp', pluginName: 'SFTP', actionId: 'sftp.uploadFile', actionName: 'Upload File', canonicalPath: '/api/v1/sftp/upload-file', legacyPath: '/api/sftp/upload/file', requestContentTypes: ['application/json'] }),
  mapping({ pluginId: 'sharepoint', pluginName: 'SharePoint', actionId: 'sharepoint.login', actionName: 'Login', canonicalPath: '/api/v1/sharepoint/login', legacyPath: '/sharepoint/login', requestContentTypes: ['multipart/form-data'] }),
  mapping({ pluginId: 'excel', pluginName: 'Excel', actionId: 'excel.engineOnly', actionName: 'Engine Only', canonicalPath: '/api/v1/excel/engine-only', legacyPath: '/excel/engine-only' }),
];

const parity = comparePluginMappings({
  mode: resolvePluginMappingMode('shadow'),
  categories,
  mappings,
});
const report = buildPluginMappingRemediationReport({ categories, mappings, parityReport: parity });

check(report.status === 'success', 'report succeeds');
check(report.readOnly === true, 'report is read-only');
check(report.databaseWritesPerformed === 0, 'report writes zero rows');
check(report.visibleCatalogueSource === 'static-frontend', 'visible catalogue remains static');
check(report.executionRoutingChanged === false, 'execution routing remains unchanged');
check(parity.summary.frontendUnavailableActions === 2, 'quarantined actions are counted as unavailable');
check(
  !report.findings.some((f) => f.categoryName === 'Unavailable Connector'),
  'quarantined actions do not generate executable mapping findings'
);
check(report.findings.some((f) => f.findingType === 'METHOD_MISMATCH' && f.severity === 'CRITICAL'), 'method mismatch is critical');
check(report.findings.some((f) => f.findingType === 'PLUGIN_OWNERSHIP_MISMATCH' && f.severity === 'CRITICAL'), 'cross-plugin ownership is critical');
check(report.findings.some((f) => f.findingType === 'ROUTE_PREFIX_DRIFT' && f.severity === 'HIGH'), 'SFTP prefix drift is high');
check(report.findings.some((f) => f.findingType === 'CONTENT_TYPE_MISMATCH' && f.severity === 'HIGH'), 'content type mismatch is high');
check(report.findings.some((f) => f.findingType === 'EXTERNAL_ACTION_NOT_REGISTERED' && f.severity === 'MEDIUM'), 'external action is explicitly classified');
check(report.findings.some((f) => f.findingType === 'ENGINE_ONLY_ACTION'), 'engine-only action is classified');
check(report.findings.some((f) => f.findingType === 'PLACEHOLDER_SCHEMA_PLUGIN'), 'placeholder schema plugin is classified');
const separateServiceFindings = report.findings.filter(function (f) { return f.findingType === 'SEPARATE_SERVICE_ACTION_NOT_REGISTERED'; });
check(separateServiceFindings.length === 1, 'only the unknown local separate-service action remains unregistered');
function isUnknownLocal(f) { if (f.actionType !== 'unregistered-local-control') return false; if (f.endpointOwnership !== 'LOCAL_SEPARATE_SERVICE') return false; return f.blockingCutover === true; }
check(separateServiceFindings.some(isUnknownLocal), 'unknown local service remains blocking');
const registeredProviderFindings = report.findings.filter(function (f) { return f.findingType === 'SEPARATE_SERVICE_PROVIDER_REGISTERED'; });
check(registeredProviderFindings.length === 1, 'one registered separate-service provider action is classified');
function isRegisteredVuln(f) { if (f.actionType !== 'vuln-analyze-verdicts') return false; if (f.endpointOwnership !== 'LOCAL_SEPARATE_SERVICE') return false; if (f.executionProviderId !== 'VulnerabilityScanner') return false; if (f.severity !== 'INFO') return false; return f.blockingCutover === false; }
check(registeredProviderFindings.some(isRegisteredVuln), 'VulnerabilityScanner action is registered and non-blocking');
check(!separateServiceFindings.some(function (f) { return f.actionType === 'vuln-analyze-verdicts'; }), 'registered VulnerabilityScanner action is not reported as unregistered');
check(report.summary.policyExcludedActions === 0, 'no policy exclusions are invented');
check(report.policyExclusions.length === 0, 'policy exclusion details are empty by default');
check(report.summary.blockingCutover > 0, 'cutover remains blocked');
check(report.recommendedBatches.length === 5, 'five remediation batches provided');

const csv = pluginMappingRemediationToCsv(report);
const markdown = pluginMappingRemediationToMarkdown(report);
check(csv.includes('PLUGIN_OWNERSHIP_MISMATCH'), 'CSV contains findings');
check(markdown.includes('Critical findings'), 'Markdown contains critical section');
check(!report.findings.some((f) => f.autoFixSafe !== false), 'no auto-fix is marked safe');

const policyMappings: PluginEndpointMappingReadRecord[] = [
  ...mappings,
  mapping({
    pluginId: 'transform',
    pluginName: 'Transform',
    actionId: 'transform.filter',
    actionName: 'Filter',
    canonicalPath: '/api/v1/transform/filter',
    legacyPath: '/api/data-transform/filter',
    metadata: {
      legacyEndpoints: ['/api/data-transform/filter'],
      actionRole: 'ALIAS',
      workflowEligible: false,
      replacementActionKey: 'transform.filterRows',
    },
  }),
  mapping({
    pluginId: 'transform',
    pluginName: 'Transform',
    actionId: 'transform.catalogue',
    actionName: 'Catalogue',
    canonicalPath: '/api/v1/transform/catalogue',
    legacyPath: '/api/data-transform/operations',
    httpMethod: 'GET',
    metadata: {
      legacyEndpoints: ['/api/data-transform/operations'],
      actionRole: 'CONTROL',
      workflowEligible: false,
    },
  }),
  mapping({
    pluginId: 'linux',
    pluginName: 'Linux',
    actionId: 'linux.fileManager',
    actionName: 'File Manager',
    canonicalPath: '/api/v1/linux/file-manager',
    legacyPath: '/api/terminal/FileManager',
    metadata: {
      legacyEndpoints: ['/api/terminal/FileManager'],
      actionExposure: 'NOT_CERTIFIED',
      workflowEligible: false,
    },
  }),
];
const policyParity = comparePluginMappings({
  mode: resolvePluginMappingMode('shadow'),
  categories,
  mappings: policyMappings,
});
const policyReport = buildPluginMappingRemediationReport({
  categories,
  mappings: policyMappings,
  parityReport: policyParity,
});
check(policyReport.summary.policyExcludedActions === 3, 'three policy exclusions are summarized');
check(policyReport.policyExclusions.length === 3, 'policy exclusions remain auditable');
check(
  !policyReport.findings.some((f) =>
    ['transform.filter', 'transform.catalogue', 'linux.fileManager'].includes(f.actionId || '')
  ),
  'aliases, controls, and not-certified mappings do not emit engine-only findings'
);
check(
  policyReport.findings.some((f) =>
    f.findingType === 'PLACEHOLDER_SCHEMA_PLUGIN' && f.pluginId === 'transform'
  ),
  'policy exclusion does not hide Transform placeholder schema coverage'
);
check(
  policyReport.findings.some((f) =>
    f.findingType === 'PLACEHOLDER_SCHEMA_PLUGIN' && f.pluginId === 'linux'
  ),
  'policy exclusion does not hide Linux placeholder schema coverage'
);
check(
  pluginMappingRemediationToMarkdown(policyReport).includes('Explicit policy exclusions'),
  'Markdown report documents policy exclusions'
);

const phase4c3dCategories: AutomationCategory[] = [
  {
    id: 'phase4c3d-ai', name: 'AI Bridge', icon: 'Bot', color: 'bg-indigo-500', description: 'Regression',
    actions: [{
      id: 'chat-json', type: 'chat-json', category: 'phase4c3d-ai', name: 'Chat JSON', description: '', icon: 'Bot',
      api: { url: '/engine/ai/chat', method: 'POST', bodyType: 'json', headers: { 'Content-Type': 'application/json' } },
    } as any],
  },
  {
    id: 'phase4c3d-asana', name: 'Asana', icon: 'List', color: 'bg-rose-500', description: 'Regression',
    actions: [{
      id: 'get-workspaces', type: 'get-workspaces', category: 'phase4c3d-asana', name: 'Get Workspaces', description: '', icon: 'List',
      api: { url: '/engine/asana/get-workspaces', method: 'POST', bodyType: 'json', headers: { 'Content-Type': 'application/json' } },
    } as any],
  },
];
const phase4c3dMappings: PluginEndpointMappingReadRecord[] = [
  mapping({ pluginId: 'ai.bridge', pluginName: 'AI Bridge', actionId: 'ai.chat', actionName: 'Chat', canonicalPath: '/api/v1/ai/chat', legacyPath: '/ai/chat', requestContentTypes: ['multipart/form-data'], bodyType: 'multipart', metadata: { legacyEndpoints: ['/ai/chat'] } }),
  mapping({ pluginId: 'ai.bridge', pluginName: 'AI Bridge', actionId: 'ai.chatJson', actionName: 'Chat JSON', canonicalPath: '/api/v1/ai/chat-json', legacyPath: '/ai/chat', requestContentTypes: ['application/json'], bodyType: 'json', metadata: { legacyEndpoints: ['/ai/chat'] } }),
  mapping({ pluginId: 'asana', pluginName: 'Asana', actionId: 'asana.getWorkspaces', actionName: 'Get Workspaces', canonicalPath: '/api/v1/asana/get-workspaces', legacyPath: '/asana/get-workspaces', requestContentTypes: ['*/*'], bodyType: 'json', metadata: { legacyEndpoints: ['/asana/get-workspaces'] } }),
];
const phase4c3dParity = comparePluginMappings({ mode: resolvePluginMappingMode('shadow'), categories: phase4c3dCategories, mappings: phase4c3dMappings });
const phase4c3dReport = buildPluginMappingRemediationReport({ categories: phase4c3dCategories, mappings: phase4c3dMappings, parityReport: phase4c3dParity });
check(phase4c3dReport.summary.contentTypeMismatches === 0, 'remediation removes sibling and wildcard false positives');
check(!phase4c3dReport.findings.some((f) => f.findingType === 'CONTENT_TYPE_MISMATCH'), 'no false content-type finding is emitted');

if (failed > 0) {
  console.error('Phase 4C.2A plugin mapping remediation tests: FAIL');
  console.error(`Assertions passed: ${passed}`);
  console.error(`Assertions failed: ${failed}`);
  process.exitCode = 1;
} else {
  console.log('Phase 4C.2A plugin mapping remediation tests: PASS');
  console.log(`Assertions passed: ${passed}`);
  console.log('Detailed classification: method, route, ownership, content type, frontend-only, engine-only');
  console.log('Automatic source changes: 0');
  console.log('Database writes: 0');
  console.log('Visible catalogue and execution routing changes: 0');
}
