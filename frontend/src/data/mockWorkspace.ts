import { WorkspaceItem as StoreWorkspaceItem } from '../store/useWorkspaceStore';

/**
 * FALLBACK / DEMO SEED ONLY — this file is NOT the source of truth.
 *
 * The live workspace state comes from `useWorkspaceStore` (backed by the
 * filesystem via the backend). The store provides its own onboarding fallback
 * (`FALLBACK_ROOT`), so this seed is only useful for demos, tests, or rendering
 * a populated tree without a backend. Prefer `useWorkspaceStore()` everywhere
 * in app code.
 */

export type WorkspaceItem = StoreWorkspaceItem;

export const DEFAULT_WORKSPACE_SEED: WorkspaceItem[] = [
  {
    id: 'root',
    name: 'My Workspace',
    type: 'folder',
    parentId: null,
    updatedAt: '2023-10-27T10:00:00Z',
  },
  {
    id: 'f1',
    name: 'Marketing Automations',
    type: 'folder',
    parentId: 'root',
    updatedAt: '2023-10-26T14:30:00Z',
  },
  {
    id: 'f2',
    name: 'IT Support',
    type: 'folder',
    parentId: 'root',
    updatedAt: '2023-10-25T09:15:00Z',
  },
  {
    id: 'w1',
    name: 'Lead Nurturing Sequence',
    type: 'workflow',
    parentId: 'f1',
    status: 'active',
    lastRun: '10 mins ago',
    updatedAt: '2023-10-27T11:20:00Z',
    icon: 'Mail',
    description: 'Automated email sequence for new leads',
    actions: [],
    connections: [],
    variables: [],
    version: '1.0.0',
    createdAt: '2023-10-20T10:00:00Z',
  },
  {
    id: 'w2',
    name: 'New Employee Onboarding',
    type: 'workflow',
    parentId: 'f2',
    status: 'active',
    lastRun: 'Yesterday',
    updatedAt: '2023-10-26T10:30:00Z',
    icon: 'UserPlus',
    description: 'Onboarding tasks for new hires',
    actions: [],
    connections: [],
    variables: [],
    version: '1.0.0',
    createdAt: '2023-10-21T09:00:00Z',
  },
  {
    id: 'w3',
    name: 'Ad-hoc Data Extract',
    type: 'workflow',
    parentId: 'root',
    status: 'draft',
    updatedAt: '2023-10-27T12:00:00Z',
    icon: 'Database',
    description: 'Manual data extraction workflow',
    actions: [],
    connections: [],
    variables: [],
    version: '1.0.0',
    createdAt: '2023-10-27T12:00:00Z',
  },
];

export const DEFAULT_RECENT_SEED: WorkspaceItem[] = [
  DEFAULT_WORKSPACE_SEED[3], // w1
  DEFAULT_WORKSPACE_SEED[4], // w2
  DEFAULT_WORKSPACE_SEED[5], // w3
];

/** Fresh deep copies so callers can't mutate the base seed arrays. */
export const getInitialWorkspaceItems = (): WorkspaceItem[] =>
  JSON.parse(JSON.stringify(DEFAULT_WORKSPACE_SEED));

export const getInitialRecentWorkflows = (): WorkspaceItem[] =>
  JSON.parse(JSON.stringify(DEFAULT_RECENT_SEED));

/** Legacy aliases kept for backward-compatible imports. */
export const MOCK_WORKSPACE_ITEMS = DEFAULT_WORKSPACE_SEED;
export const MOCK_RECENT_WORKFLOWS = DEFAULT_RECENT_SEED;