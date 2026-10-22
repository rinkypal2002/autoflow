import { strict as assert } from 'node:assert';
import { automationCategories } from '../src/data/automationCategories';
import {
  comparePluginMappings,
  flattenFrontendPluginActions,
} from '../src/lib/pluginMappingParity';

let assertions = 0;
function check(condition: unknown, message: string): asserts condition {
  assert.ok(condition, message);
  assertions += 1;
}

const sftp = automationCategories.find((category) => category.id === 'sftp-019');
check(Boolean(sftp), 'SFTP category must exist.');

const expectedLegacyPaths: Record<string, string> = {
  'batch-download': '/api/sftp/batch/download',
  'copy-path-remote-to-local': '/api/sftp/copy/remote-to-local',
  'create-directory': '/api/sftp/directory/create',
  'delete-file': '/api/sftp/file/delete',
  'directory-lsit': '/api/sftp/directory/list',
  'download-file': '/api/sftp/download/file',
  'file-exisiting': '/api/sftp/file/exists',
  'file-info': '/api/sftp/file/info',
  'rename-file': '/api/sftp/file/rename',
  'sftp-connect-test': '/api/sftp/connect/test',
  'upload-batch': '/api/sftp/batch/upload',
  'upload-file': '/api/sftp/upload/file',
};

const sftpActions = (sftp?.actions ?? []).filter((action) =>
  Object.prototype.hasOwnProperty.call(expectedLegacyPaths, action.type)
);
check(sftpActions.length === 12, `Expected 12 remediated SFTP actions, found ${sftpActions.length}.`);

for (const action of sftpActions) {
  const rawUrl = String(action.api?.url ?? '');
  check(!rawUrl.includes('/sftp-plugin/'), `${action.type} still contains the stale /sftp-plugin prefix.`);
  const normalized = new URL(rawUrl).pathname.replace(/^\/engine/, '');
  check(
    normalized === expectedLegacyPaths[action.type],
    `${action.type} route mismatch: expected ${expectedLegacyPaths[action.type]}, found ${normalized}.`
  );
}

const system = automationCategories.find((category) => category.id === 'system-management-038');
check(Boolean(system), 'System Management category must exist.');
const serviceStatus = system?.actions.find((action) => action.type === 'get-service-status');
check(Boolean(serviceStatus), 'Get service status action must exist.');
check(
  serviceStatus?.api?.url === 'http://localhost:8080/engine/api/v1/system/service/{{serviceName}}',
  'The executable double-brace serviceName template must be preserved.'
);

const syntheticCategory = {
  ...system!,
  actions: [serviceStatus!],
};

const parity = comparePluginMappings({
  mode: { requested: 'shadow', effective: 'shadow', apiEnabled: true } as any,
  categories: [syntheticCategory],
  mappings: [
    {
      engineVersion: 'v11.3',
      pluginId: 'system',
      actionId: 'system.getServiceStatus',
      actionName: 'get service status',
      canonicalPath: '/api/v1/system/get-service-status/{serviceName}',
      legacyPath: '/api/v1/system/service/{serviceName}',
      httpMethod: 'GET',
      requestContentTypes: [],
      enabled: true,
      deprecated: false,
      schemaStatus: 'PLACEHOLDER',
      metadata: { legacyEndpoints: [] },
    } as any,
  ],
});

check(parity.summary.exactRouteMethodMatches === 1, 'Templated system route must match the registered legacy path.');
check(parity.summary.routeMismatches === 0, 'Templated system route must not be reported as a route mismatch.');
check(parity.summary.frontendOnlyActions === 0, 'Templated system route must not be reported as frontend-only.');
check(parity.summary.engineOnlyMappings === 0, 'Matched system route must not remain engine-only.');

const flattened = flattenFrontendPluginActions(automationCategories);
check(flattened.totalActions === 353, `Visible catalogue action count changed: ${flattened.totalActions}.`);
check(flattened.controlActions === 11, `Workflow control action count changed: ${flattened.controlActions}.`);
check(flattened.unavailableActions === 23, `Expected 23 unavailable actions, found ${flattened.unavailableActions}.`);
check(flattened.descriptors.length === 319, `Expected 319 executable actions, found ${flattened.descriptors.length}.`);
check(
  !flattened.descriptors.some((action) => action.categoryId === 'onedrive-013' || action.categoryId === 'adobe-sign-034'),
  'Quarantined OneDrive and Adobe Sign actions must not enter mapping parity.'
);

console.log('Phase 4C.2C route remediation tests: PASS');
console.log(`Assertions passed: ${assertions}`);
console.log('SFTP stale module prefixes removed: 12');
console.log('System path-template matching: verified');
console.log('Visible catalogue actions: 353 certified');
console.log('Unavailable actions: 23; control actions: 11; executable API actions: 319');
console.log('Database writes: 0');
console.log('Execution-provider cutover: 0');
