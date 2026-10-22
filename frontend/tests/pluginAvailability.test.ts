import { strict as assert } from 'node:assert';
import { automationCategories } from '../src/data/automationCategories';
import {
  BACKEND_CONNECTOR_NOT_INSTALLED,
  findUnavailableWorkflowActions,
  getCategoryAvailability,
  getWorkflowActionAvailability,
  isCategoryExecutable,
  isWorkflowActionExecutable,
} from '../src/lib/actionAvailability';
import { flattenFrontendPluginActions } from '../src/lib/pluginMappingParity';
import type { WorkflowAction } from '../src/types/workflow';

let assertions = 0;
function check(condition: unknown, message: string): asserts condition {
  assert.ok(condition, message);
  assertions += 1;
}

const oneDrive = automationCategories.find((category) => category.id === 'onedrive-013');
const adobeSign = automationCategories.find((category) => category.id === 'adobe-sign-034');
const asana = automationCategories.find((category) => category.id === 'asana-033');
const sharePoint = automationCategories.find((category) => category.id === 'sharepoint-021');
const zohoDesk = automationCategories.find((category) => category.id === 'zohodesk-020');
const vulnerabilityTriage = automationCategories.find((category) => category.id === 'vulnerability-triage-041');
const googleSheets = automationCategories.find((category) => category.id === 'google-sheets-042');

check(Boolean(oneDrive), 'OneDrive category must exist.');
check(Boolean(adobeSign), 'Adobe Sign category must exist.');
check(Boolean(asana), 'Asana category must exist.');
check(Boolean(sharePoint), 'SharePoint category must exist.');
check(Boolean(zohoDesk), 'Zoho Desk category must exist.');
check(Boolean(vulnerabilityTriage), 'Vulnerability Triage category must exist.');
check(Boolean(googleSheets), 'Google Sheets category must exist.');

for (const category of [oneDrive!, adobeSign!]) {
  const availability = getCategoryAvailability(category);
  check(category.control?.enabled === false, `${category.name} must be disabled.`);
  check(availability.state === 'unavailable', `${category.name} must be unavailable.`);
  check(
    availability.code === BACKEND_CONNECTOR_NOT_INSTALLED,
    `${category.name} must expose the connector-not-installed code.`
  );
  check(
    availability.reason === 'Backend connector not installed',
    `${category.name} must expose the user-facing reason.`
  );
  check(!isCategoryExecutable(category), `${category.name} must not be executable.`);
}

check(oneDrive!.actions.length === 10, `Expected 10 OneDrive actions, found ${oneDrive!.actions.length}.`);
check(adobeSign!.actions.length === 10, `Expected 10 Adobe Sign actions, found ${adobeSign!.actions.length}.`);
check(isCategoryExecutable(asana), 'An installed connector must remain executable.');
check(googleSheets!.actions.length === 7, `Expected 7 Google Sheets actions, found ${googleSheets!.actions.length}.`);
check(isCategoryExecutable(googleSheets!), 'Google Sheets connector must remain executable.');

const flattened = flattenFrontendPluginActions(automationCategories);
check(flattened.totalActions === 353, `Visible action count changed: ${flattened.totalActions}.`);
check(flattened.controlActions === 11, `Control action count changed: ${flattened.controlActions}.`);
check(flattened.unavailableActions === 23, `Unavailable action count mismatch: ${flattened.unavailableActions}.`);
check(flattened.descriptors.length === 319, `Executable action count mismatch: ${flattened.descriptors.length}.`);
check(
  !flattened.descriptors.some((action) =>
    action.categoryId === 'onedrive-013' || action.categoryId === 'adobe-sign-034'
  ),
  'Unavailable package actions must be absent from executable parity descriptors.'
);
check(
  flattened.descriptors.filter((action) => action.categoryId === 'google-sheets-042').length === 7,
  'All 7 Google Sheets actions must be present in executable parity descriptors.'
);

const sharePointCreds = sharePoint!.actions.find((action) => action.type === 'creds');
const sharePointCreds2 = sharePoint!.actions.find((action) => action.type === 'creds2');
const zohoRefreshToken = zohoDesk!.actions.find((action) => action.type === 'refresh-token');

check(isCategoryExecutable(sharePoint!), 'SharePoint package must remain executable.');
check(isCategoryExecutable(zohoDesk!), 'Zoho Desk package must remain executable.');
check(sharePointCreds?.availability?.state === 'unavailable', 'SharePoint creds must be unavailable as a workflow action.');
check(sharePointCreds?.availability?.code === 'CONNECTION_AUTH_HELPER', 'SharePoint creds must be classified as a connection/auth helper.');
check(zohoRefreshToken?.availability?.state === 'unavailable', 'Zoho refresh-token must be unavailable as a workflow action.');
check(zohoRefreshToken?.availability?.code === 'CONNECTION_AUTH_HELPER', 'Zoho refresh-token must be classified as a connection/auth helper.');
check(sharePointCreds2?.availability?.state === 'unavailable', 'SharePoint creds2 must be unavailable as a workflow action.');
check(sharePointCreds2?.availability?.code === 'ACTION_NOT_CERTIFIED', 'SharePoint creds2 must be classified as not certified.');
check(!flattened.descriptors.some((action) => action.categoryId === 'sharepoint-021' && (action.actionType === 'creds' || action.actionType === 'creds2')), 'Quarantined SharePoint helper/prototype actions must be absent from executable descriptors.');
check(!flattened.descriptors.some((action) => action.categoryId === 'zohodesk-020' && action.actionType === 'refresh-token'), 'Zoho refresh-token helper must be absent from executable descriptors.');
check(adobeSign!.actions.some((action) => action.type === 'creds'), 'Adobe Sign creds action must remain present under package-level quarantine.');
check(flattened.descriptors.some((action) => action.actionType === 'vuln-analyze-verdicts'), 'Vulnerability analysis must remain an executable workflow action.');
const actionLevelAvailabilityFixture = [
  {
    id: 'action-level-availability-999',
    name: 'Action Level Availability',
    icon: 'Shield',
    color: 'bg-slate-500',
    description: 'Action-level availability regression fixture',
    actions: [
      {
        id: 'available-action',
        type: 'available-action',
        category: 'action-level-availability-999',
        name: 'Available Action',
        description: 'Executable action',
        icon: 'Play',
        api: { url: '/engine/test/available', method: 'POST' },
      },
      {
        id: 'quarantined-action',
        type: 'quarantined-action',
        category: 'action-level-availability-999',
        name: 'Quarantined Action',
        description: 'Individually unavailable action',
        icon: 'Lock',
        availability: {
          state: 'unavailable',
          code: 'ACTION_NOT_CERTIFIED',
          reason: 'Action is not certified',
        },
        api: { url: '/engine/test/quarantined', method: 'POST' },
      },
    ],
  },
] as any;

const actionLevelFlattened = flattenFrontendPluginActions(actionLevelAvailabilityFixture);
check(actionLevelFlattened.totalActions === 2, 'Action-level fixture must retain both visible actions.');
check(actionLevelFlattened.unavailableActions === 1, 'Individually unavailable action must be counted as unavailable.');
check(actionLevelFlattened.descriptors.length === 1, 'Individually unavailable action must be excluded from executable descriptors.');
check(actionLevelFlattened.descriptors[0]?.actionType === 'available-action', 'Available sibling action must remain executable.');
check(actionLevelFlattened.descriptors.some((action) => action.actionType === 'quarantined-action') === false, 'Individually unavailable action must not produce a parity descriptor.');

const savedOneDriveNode: WorkflowAction = {
  ...(oneDrive!.actions[0] as WorkflowAction),
  id: 'saved-onedrive-node',
  x: 100,
  y: 100,
};
const savedAdobeNode: WorkflowAction = {
  ...(adobeSign!.actions[0] as WorkflowAction),
  id: 'saved-adobe-node',
  x: 200,
  y: 100,
};
const savedAsanaNode: WorkflowAction = {
  ...(asana!.actions[0] as WorkflowAction),
  id: 'saved-asana-node',
  x: 300,
  y: 100,
};

check(
  getWorkflowActionAvailability(savedOneDriveNode, automationCategories).state === 'unavailable',
  'Previously-saved OneDrive nodes must resolve against current package availability.'
);
check(
  getWorkflowActionAvailability(savedAdobeNode, automationCategories).state === 'unavailable',
  'Previously-saved Adobe Sign nodes must resolve against current package availability.'
);
check(
  !isWorkflowActionExecutable(savedOneDriveNode, automationCategories),
  'Saved OneDrive node must be blocked.'
);
check(
  !isWorkflowActionExecutable(savedAdobeNode, automationCategories),
  'Saved Adobe Sign node must be blocked.'
);
check(
  isWorkflowActionExecutable(savedAsanaNode, automationCategories),
  'Installed connector nodes must remain executable.'
);

const unavailableNodes = findUnavailableWorkflowActions(
  [savedOneDriveNode, savedAdobeNode, savedAsanaNode],
  automationCategories
);
check(unavailableNodes.length === 2, `Expected 2 blocked saved nodes, found ${unavailableNodes.length}.`);
check(
  unavailableNodes.every((node) => node.reason === 'Backend connector not installed'),
  'Blocked saved nodes must expose the configured reason.'
);

console.log('Phase 4D1E plugin availability tests: PASS');
console.log(`Assertions passed: ${assertions}`);
console.log('Visible actions: 353');
console.log('Unavailable actions: 23');
console.log('Executable actions: 319');
console.log('Saved-workflow execution guard: verified');
