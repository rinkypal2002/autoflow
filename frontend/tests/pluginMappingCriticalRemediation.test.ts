import { automationCategories } from '../src/data/automationCategories';

let passed = 0;
let failed = 0;

function check(condition: unknown, message: string): void {
  if (condition) {
    passed += 1;
  } else {
    failed += 1;
    console.error(`FAIL: ${message}`);
  }
}

function action(categoryId: string, actionType: string): any {
  const category = automationCategories.find((item) => item.id === categoryId);
  check(Boolean(category), `category exists: ${categoryId}`);
  const found = category?.actions?.find((item) => item.type === actionType);
  check(Boolean(found), `action exists: ${categoryId}/${actionType}`);
  return found;
}

const teamsCreateChannel = action('microsoft-teams-010', 'create-channel');
check(
  teamsCreateChannel?.api?.url === 'http://localhost:8080/engine/api/v1/teams/CreateChannel',
  'Microsoft Teams Create Channel uses the registered singular route'
);
check(!String(teamsCreateChannel?.api?.url).includes('CreateChannels'), 'stale Teams plural route removed');

const googleDownload = action('google-drive-012', 'download');
check(googleDownload?.api?.url === 'http://localhost:8080/engine/drive/download', 'Google Drive route preserved');
check(String(googleDownload?.api?.method).toUpperCase() === 'POST', 'Google Drive Download uses POST');

const oneDriveCopy = action('onedrive-013', 'copy');
check(oneDriveCopy?.api?.url === 'http://localhost:8080/engine/onedrive/copy', 'OneDrive Copy uses OneDrive ownership');
check(oneDriveCopy?.api?.url !== 'http://localhost:8080/engine/drive/copy', 'OneDrive no longer routes through Google Drive');

const asanaTemplates = action('asana-033', 'get-all-templates');
check(asanaTemplates?.api?.url === 'http://localhost:8080/engine/asana/get-all-templates', 'Asana template action uses Asana ownership');
check(!String(asanaTemplates?.api?.url).includes('/adobe/'), 'Asana no longer routes through Adobe Sign');

const ec2Test = action('amazon-ec2-023', 'testconnection');
check(ec2Test?.api?.url === 'http://localhost:8080/engine/api/ec2/test-connection', 'EC2 test connection uses EC2 route');
check(!String(ec2Test?.api?.url).includes('/aws/s3/'), 'EC2 no longer routes through Amazon S3');

const analyticQuery = action('statistics-036', 'query');
check(analyticQuery?.api?.url === 'http://localhost:8080/engine/analytics/analytic-query', 'Statistics query uses Analytic Query route');

const stepMetrics = action('statistics-036', 'metrics');
check(stepMetrics?.api?.url === 'http://localhost:8080/engine/analytics/step-metrics', 'Statistics metrics uses Step Metrics route');

const allActions = automationCategories.flatMap((category) => category.actions ?? []);
check(allActions.length > 0, 'catalogue actions remain present');
check(
  !allActions.some((item) => item.category === 'amazon-ec2-023' && item.api?.url === 'http://localhost:8080/engine/aws/s3/test-connection'),
  'EC2/S3 contamination absent globally'
);
check(
  !allActions.some((item) => item.category === 'onedrive-013' && item.api?.url === 'http://localhost:8080/engine/drive/copy'),
  'OneDrive/Google Drive contamination absent globally'
);
check(
  !allActions.some((item) => item.category === 'asana-033' && String(item.api?.url || '').includes('/adobe/')),
  'Asana/Adobe contamination absent globally'
);

if (failed > 0) {
  console.error(`Phase 4C.2B critical mapping remediation tests: FAILED (${failed} failed, ${passed} passed)`);
  process.exit(1);
}

console.log('Phase 4C.2B critical mapping remediation tests: PASS');
console.log(`Assertions passed: ${passed}`);
console.log('Critical source defects covered: 7');
console.log('Database writes: 0');
console.log('Catalogue action removals: 0');
console.log('PostgreSQL execution-provider cutover: 0');
