import { create } from 'zustand';
import { WorkflowAction, Connection, WorkflowVariable } from '../types/workflow';
import { SERVICES } from '../config/services';

/* -------------------------------------------------------------------------- */
/*                                   TYPES                                    */
/* -------------------------------------------------------------------------- */

export interface WorkspaceFolder {
  id: string;
  name: string;
  type: 'folder';
  parentId: string | null;
  updatedAt: string;
  createdAt?: string;
}

export interface WorkspaceWorkflow {
  id: string;
  name: string;
  type: 'workflow';
  parentId: string | null;
  status: 'active' | 'paused' | 'draft';
  lastRun?: string;
  updatedAt: string;
  icon: string;

  // Canvas state
  description: string;
  actions: WorkflowAction[];
  connections: Connection[];
  variables: WorkflowVariable[];
  version: string;
  createdAt: string;
}

export type WorkspaceItem = WorkspaceFolder | WorkspaceWorkflow;

export type WorkspaceLoadingState = 'idle' | 'loading' | 'ready' | 'error';

/* -------------------------------------------------------------------------- */
/*                               CONFIGURATION                                */
/* -------------------------------------------------------------------------- */

const API_BASE = `${SERVICES.nodeApiBase}/workspace`;

const ROOT_FOLDER_ID = 'root';

const FALLBACK_ROOT: WorkspaceFolder = {
  id: ROOT_FOLDER_ID,
  name: 'My Workspace',
  type: 'folder',
  parentId: null,
  updatedAt: new Date().toISOString(),
  createdAt: new Date().toISOString(),
};

const WORKSPACE_STORAGE_KEY = 'workspaceRoot';

/* -------------------------------------------------------------------------- */
/*                             API CLIENT HELPERS                             */
/* -------------------------------------------------------------------------- */

/** Thrown when a request reaches the backend and the backend rejects it. */
export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

/** Thrown when the backend cannot be reached at all (offline / network failure). */
export class NetworkError extends Error {
  constructor(message = 'Cannot reach the workspace backend.') {
    super(message);
    this.name = 'NetworkError';
  }
}

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    });
  } catch {
    // fetch only rejects on genuine network failure (server down, DNS, CORS preflight)
    throw new NetworkError();
  }

  if (!res.ok) {
    let message = `API error ${res.status}`;
    let code: string | undefined;
    try {
      const body = await res.json();
      message = body?.error ?? message;
      code = body?.code;
    } catch {
      /* ignore parse errors */
    }
    throw new ApiError(message, res.status, code);
  }

  return res.json() as Promise<T>;
}

/* -------------------------------------------------------------------------- */
/*                            NORMALISATION HELPERS                           */
/* -------------------------------------------------------------------------- */

function normaliseFolder(raw: Record<string, unknown>): WorkspaceFolder {
  const now = new Date().toISOString();
  return {
    id: raw.id as string,
    name: raw.name as string,
    type: 'folder',
    parentId: (raw.parentId as string | null) ?? null,
    updatedAt: (raw.updatedAt as string) ?? now,
    createdAt: (raw.createdAt as string) ?? now,
  };
}

function normaliseWorkflow(raw: Record<string, unknown>): WorkspaceWorkflow {
  const now = new Date().toISOString();
  return {
    id: raw.id as string,
    name: raw.name as string,
    type: 'workflow',
    parentId: (raw.parentId as string | null) ?? null,
    status: (raw.status as WorkspaceWorkflow['status']) ?? 'draft',
    lastRun: raw.lastRun as string | undefined,
    updatedAt: (raw.updatedAt as string) ?? now,
    icon: (raw.icon as string) ?? 'FileCode2',
    description: (raw.description as string) ?? '',
    actions: Array.isArray(raw.actions) ? (raw.actions as WorkflowAction[]) : [],
    connections: Array.isArray(raw.connections) ? (raw.connections as Connection[]) : [],
    variables: Array.isArray(raw.variables) ? (raw.variables as WorkflowVariable[]) : [],
    version: raw.version !== undefined ? String(raw.version) : '1',
    createdAt: (raw.createdAt as string) ?? now,
  };
}

function flattenTree(treeData: {
  folders: Record<string, Record<string, unknown>>;
  workflows: Record<string, Record<string, unknown>>;
}): WorkspaceItem[] {
  const folderItems = Object.values(treeData.folders ?? {}).map(normaliseFolder);
  const workflowItems = Object.values(treeData.workflows ?? {}).map(normaliseWorkflow);
  return [...folderItems, ...workflowItems];
}

/* -------------------------------------------------------------------------- */
/*                           PURE UTILITY FUNCTIONS                           */
/* -------------------------------------------------------------------------- */

function isDescendantOf(
  candidateId: string,
  ancestorId: string,
  allItems: WorkspaceItem[]
): boolean {
  let currentId: string | null = candidateId;
  const visited = new Set<string>();
  while (currentId) {
    if (visited.has(currentId)) break;
    visited.add(currentId);
    if (currentId === ancestorId) return true;
    const item = allItems.find((i) => i.id === currentId);
    currentId = item ? item.parentId : null;
  }
  return false;
}

function collectDescendantIds(id: string, allItems: WorkspaceItem[]): Set<string> {
  const ids = new Set<string>([id]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const item of allItems) {
      if (item.parentId !== null && ids.has(item.parentId) && !ids.has(item.id)) {
        ids.add(item.id);
        changed = true;
      }
    }
  }
  return ids;
}

/* -------------------------------------------------------------------------- */
/*                      WORKFLOW DRAFTS (OFFLINE BACKUP ONLY)                  */
/* -------------------------------------------------------------------------- */
/**
 * A draft is a *backup* of unsaved canvas work, persisted to localStorage so a
 * crash or accidental reload doesn't lose edits. It is NEVER the source of
 * truth: the backend is. Drafts are consulted only when the backend is
 * unreachable, or by the editor to offer recovery of work that is strictly
 * newer than what the backend has. A successful save clears the draft.
 *
 * These helpers are exported so the editor uses exactly one implementation
 * (previously the editor kept a divergent copy, which is what let stale drafts
 * shadow freshly-saved data).
 */

export interface WorkflowDraftSnapshot {
  name?: string;
  actions: WorkflowAction[];
  connections: Connection[];
  variables: WorkflowVariable[];
  description?: string;
  status?: WorkspaceWorkflow['status'];
  lastRun?: string;
  icon?: string;
  /** ISO timestamp of when this draft was captured. Used for newer-than checks. */
  updatedAt: string;
}

const WORKFLOW_DRAFT_STORAGE_PREFIX = 'workspaceWorkflowDraft:';

function workflowDraftKey(id: string): string {
  return `${WORKFLOW_DRAFT_STORAGE_PREFIX}${id}`;
}

const WORKFLOW_DRAFT_SECRET_KEY =
  /^(password|passwd|pwd|secret|token|accessToken|refreshToken|apiKey|api_key|authorization|privateKey|private_key|clientSecret|client_secret)$/i;

/**
 * Browser workflow drafts are recovery data, not credential storage.
 *
 * Preserve the complete workflow structure but remove primitive secret values.
 * Object-valued configuration descriptors such as propertyConfig.password are
 * traversed rather than replaced.
 */
function sanitizeWorkflowDraftSecrets(value: any, parentKey = ''): any {
  if (value === null || value === undefined) return value;

  if (
    WORKFLOW_DRAFT_SECRET_KEY.test(parentKey) &&
    typeof value !== 'object'
  ) {
    return '';
  }

  if (Array.isArray(value)) {
    return value.map((item) =>
      sanitizeWorkflowDraftSecrets(item)
    );
  }

  if (typeof value !== 'object') {
    return value;
  }

  const source = value as Record<string, any>;
  const out: Record<string, any> = {};

  Object.entries(source).forEach(([key, child]) => {
    if (
      key === 'value' &&
      source.isSecret === true &&
      (child === null || typeof child !== 'object')
    ) {
      out[key] = child === null || child === undefined ? child : '';
      return;
    }

    out[key] = sanitizeWorkflowDraftSecrets(child, key);
  });

  return out;
}

export function readWorkflowDraft(id: string): WorkflowDraftSnapshot | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(workflowDraftKey(id));
    if (!raw) return null;
    const parsed = sanitizeWorkflowDraftSecrets(
      JSON.parse(raw)
    ) as Partial<WorkflowDraftSnapshot>;
    return {
      name: parsed.name,
      actions: Array.isArray(parsed.actions) ? parsed.actions : [],
      connections: Array.isArray(parsed.connections) ? parsed.connections : [],
      variables: Array.isArray(parsed.variables) ? parsed.variables : [],
      description: parsed.description,
      status: parsed.status,
      lastRun: parsed.lastRun,
      icon: parsed.icon,
      updatedAt: parsed.updatedAt || new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export function writeWorkflowDraft(id: string, snapshot: Partial<WorkflowDraftSnapshot>): void {
  if (typeof window === 'undefined') return;
  try {
    const payload: WorkflowDraftSnapshot = {
      name: snapshot.name,
      actions: Array.isArray(snapshot.actions) ? snapshot.actions : [],
      connections: Array.isArray(snapshot.connections) ? snapshot.connections : [],
      variables: Array.isArray(snapshot.variables) ? snapshot.variables : [],
      description: snapshot.description,
      status: snapshot.status,
      lastRun: snapshot.lastRun,
      icon: snapshot.icon,
      updatedAt: snapshot.updatedAt || new Date().toISOString(),
    };
    window.localStorage.setItem(
      workflowDraftKey(id),
      JSON.stringify(sanitizeWorkflowDraftSecrets(payload))
    );
  } catch {
    /* ignore quota / serialization errors */
  }
}

export function removeWorkflowDraft(id: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(workflowDraftKey(id));
  } catch {
    /* ignore */
  }
}

/**
 * A draft is "recoverable" only if it is strictly newer than the backend copy —
 * i.e. it represents unsaved work. Equal-or-older drafts are leftovers and are
 * ignored (and should be cleared by the caller).
 */
export function isDraftNewerThan(
  draft: WorkflowDraftSnapshot | null,
  backendUpdatedAt?: string
): boolean {
  if (!draft) return false;
  const draftTime = new Date(draft.updatedAt).getTime();
  if (Number.isNaN(draftTime)) return false;
  if (!backendUpdatedAt) return true;
  const backendTime = new Date(backendUpdatedAt).getTime();
  if (Number.isNaN(backendTime)) return true;
  // small epsilon so a save written in the same tick isn't treated as unsaved
  return draftTime > backendTime + 250;
}

/* -------------------------------------------------------------------------- */
/*                              STORE INTERFACE                               */
/* -------------------------------------------------------------------------- */

export interface SaveWorkflowInput {
  actions: WorkflowAction[];
  connections: Connection[];
  variables: WorkflowVariable[];
  name?: string;
  description?: string;
  status?: WorkspaceWorkflow['status'];
  lastRun?: string;
  icon?: string;
}

export interface WorkspaceStore {
  // State
  workspaceRoot: string | null;
  isLoadingWorkspace: boolean;
  workspaceError: string | null;
  hasActiveWorkspace: boolean;
  items: WorkspaceItem[];
  loadingState: WorkspaceLoadingState;
  error: string | null;
  /** In-memory cache of last-known-good full workflows. Used as an offline
   *  fallback and for synchronous reads — never as a way to skip a fresh load. */
  workflowCache: Record<string, WorkspaceWorkflow>;

  // Initialisation
  initialize: () => Promise<void>;

  // Read Helpers
  getItemById: (id: string) => WorkspaceItem | undefined;
  getChildren: (parentId: string | null) => WorkspaceItem[];
  getParentChain: (folderId: string) => WorkspaceFolder[];
  getFolderPath: (folderId: string) => string;
  getRecentWorkflows: (limit: number) => WorkspaceWorkflow[];
  /** Loads a workflow with the backend as the source of truth. Falls back to
   *  cache/draft only when the backend is unreachable. */
  getWorkflow: (id: string) => Promise<WorkspaceWorkflow | undefined>;
  getWorkflowSync: (id: string) => WorkspaceWorkflow | undefined;
  getWorkflowsInFolder: (folderId: string) => WorkspaceWorkflow[];
  isDuplicateName: (
    name: string,
    parentId: string | null,
    type: 'folder' | 'workflow',
    excludeId?: string
  ) => boolean;
  isFolderEmpty: (folderId: string) => boolean;

  // Write Operations
  addFolder: (name: string, parentId?: string | null) => Promise<WorkspaceFolder>;
  addWorkflow: (
    name: string,
    parentId?: string | null,
    description?: string
  ) => Promise<WorkspaceWorkflow>;
  renameItem: (id: string, newName: string) => Promise<void>;
  moveItem: (id: string, newParentId: string | null) => Promise<void>;
  deleteItem: (id: string) => Promise<void>;
  duplicateWorkflow: (id: string) => Promise<WorkspaceWorkflow | undefined>;
  saveWorkflowState: (id: string, data: SaveWorkflowInput) => Promise<WorkspaceWorkflow>;
  updateWorkflowStatus: (id: string, status: WorkspaceWorkflow['status']) => Promise<void>;

  // Workspace Management
  selectWorkspace: (workspacePath: string) => Promise<void>;
  changeWorkspace: () => void;
  clearWorkspace: () => void;
  loadWorkspaceTree: () => Promise<void>;
  refreshWorkspace: () => Promise<void>;
}

/* -------------------------------------------------------------------------- */
/*                             MAIN GLOBAL STORE                              */
/* -------------------------------------------------------------------------- */

let isInitializing = false;

export const useWorkspaceStore = create<WorkspaceStore>()((set, get) => {
  const assertWorkspaceActive = () => {
    if (!get().workspaceRoot) {
      throw new Error('No workspace selected. Please select a workspace first.');
    }
  };

  /** Build a best-effort full workflow from metadata + (optional) draft, used
   *  only when the backend cannot be reached. */
  const reconstructOffline = (
    id: string,
    draft: WorkflowDraftSnapshot | null
  ): WorkspaceWorkflow | undefined => {
    const { items, workflowCache } = get();
    const cached = workflowCache[id];
    const meta = items.find((i) => i.id === id && i.type === 'workflow') as
      | WorkspaceWorkflow
      | undefined;

    const base = cached ?? meta;
    if (!base && !draft) return undefined;

    const now = new Date().toISOString();
    const skeleton: WorkspaceWorkflow =
      base ??
      ({
        id,
        name: draft?.name ?? id,
        type: 'workflow',
        parentId: null,
        status: draft?.status ?? 'draft',
        lastRun: draft?.lastRun,
        updatedAt: draft?.updatedAt ?? now,
        icon: draft?.icon ?? 'FileCode2',
        description: draft?.description ?? '',
        actions: [],
        connections: [],
        variables: [],
        version: '1',
        createdAt: now,
      } satisfies WorkspaceWorkflow);

    if (!draft) return skeleton;

    // Offline + draft present: the draft is the freshest local knowledge.
    return {
      ...skeleton,
      name: draft.name ?? skeleton.name,
      actions: draft.actions,
      connections: draft.connections,
      variables: draft.variables,
      description: draft.description ?? skeleton.description,
      status: draft.status ?? skeleton.status,
      lastRun: draft.lastRun ?? skeleton.lastRun,
      icon: draft.icon ?? skeleton.icon,
      updatedAt: draft.updatedAt,
    };
  };

  return {
    // ─── Initial State ────────────────────────────────────────────────────────
    workspaceRoot: null,
    isLoadingWorkspace: false,
    workspaceError: null,
    hasActiveWorkspace: false,
    items: [FALLBACK_ROOT],
    loadingState: 'idle',
    error: null,
    workflowCache: {},

    // ─── Initialisation ───────────────────────────────────────────────────────
    initialize: async () => {
      if (isInitializing) return;
      isInitializing = true;

      const savedRoot =
        typeof window !== 'undefined'
          ? window.localStorage.getItem(WORKSPACE_STORAGE_KEY)
          : null;

      if (savedRoot) {
        set({ isLoadingWorkspace: true });
        try {
          await apiFetch<{ status: string; root: string }>('/select', {
            method: 'POST',
            body: JSON.stringify({ path: savedRoot }),
          });
          set({ workspaceRoot: savedRoot, hasActiveWorkspace: true });
          await get().loadWorkspaceTree();
        } catch (err) {
          console.error('[WorkspaceStore] Failed to restore saved workspace:', err);
          set({
            workspaceError:
              err instanceof Error ? err.message : 'Failed to restore workspace',
            workspaceRoot: null,
            hasActiveWorkspace: false,
            items: [FALLBACK_ROOT],
          });
          if (typeof window !== 'undefined') {
            window.localStorage.removeItem(WORKSPACE_STORAGE_KEY);
          }
        } finally {
          set({ isLoadingWorkspace: false });
        }
      } else {
        set({ items: [FALLBACK_ROOT] });
      }
    },

    // ─── Read Helpers ─────────────────────────────────────────────────────────
    getItemById: (id) => get().items.find((i) => i.id === id),

    getChildren: (parentId) => get().items.filter((i) => i.parentId === parentId),

    getParentChain: (folderId) => {
      const { items } = get();
      const chain: WorkspaceFolder[] = [];
      let currentId: string | null = folderId;
      const visited = new Set<string>();
      while (currentId) {
        if (visited.has(currentId)) break;
        visited.add(currentId);
        const item = items.find((i) => i.id === currentId);
        if (!item || item.type !== 'folder') break;
        chain.unshift(item);
        currentId = item.parentId;
      }
      return chain;
    },

    getFolderPath: (folderId) =>
      get()
        .getParentChain(folderId)
        .map((f) => f.name)
        .join(' / '),

    getRecentWorkflows: (limit) =>
      get()
        .items.filter((i): i is WorkspaceWorkflow => i.type === 'workflow')
        .slice()
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
        .slice(0, limit),

    /**
     * Source-of-truth load:
     *   1. Always attempt a fresh backend fetch — this is authoritative.
     *   2. On a *network* failure, fall back to cache, then a draft-backed
     *      reconstruction, then bare metadata.
     *   3. On a backend "file missing but metadata exists" response, surface a
     *      reconstructed shell so the editor can still open (the backend also
     *      recovers this case after the batch's server fix).
     * The draft is never merged into a successful backend response here, so a
     * stale draft can no longer override freshly-saved data.
     */
    getWorkflow: async (id) => {
      assertWorkspaceActive();

      try {
        const data = await apiFetch<{ status: string; workflow: Record<string, unknown> }>(
          `/workflows/${id}`
        );
        const full = normaliseWorkflow(data.workflow);
        set((state) => ({
          workflowCache: { ...state.workflowCache, [id]: full },
          items: state.items.map((item) => (item.id === id ? full : item)),
        }));
        return full;
      } catch (err) {
        if (err instanceof NetworkError) {
          // Offline: best-effort from cache/draft/metadata.
          const offline = reconstructOffline(id, readWorkflowDraft(id));
          if (offline) {
            set((state) => ({
              workflowCache: { ...state.workflowCache, [id]: offline },
            }));
          }
          return offline;
        }

        if (err instanceof ApiError) {
          // Metadata exists but the file is missing → openable empty shell.
          if (err.code === 'FILE_MISSING') {
            const offline = reconstructOffline(id, readWorkflowDraft(id));
            return offline;
          }
          if (err.status === 404) return undefined;
        }

        throw err;
      }
    },

    getWorkflowSync: (id) => {
      const cached = get().workflowCache[id];
      if (cached) return cached;
      const item = get().items.find((i) => i.id === id);
      return item?.type === 'workflow' ? item : undefined;
    },

    getWorkflowsInFolder: (folderId) => {
      const { items } = get();
      const descendantIds = collectDescendantIds(folderId, items);
      descendantIds.delete(folderId);
      return items.filter(
        (i): i is WorkspaceWorkflow => i.type === 'workflow' && descendantIds.has(i.id)
      );
    },

    isDuplicateName: (name, parentId, type, excludeId) => {
      const lower = name.trim().toLowerCase();
      return get().items.some(
        (i) =>
          i.parentId === parentId &&
          i.type === type &&
          i.name.toLowerCase() === lower &&
          i.id !== excludeId
      );
    },

    isFolderEmpty: (folderId) => !get().items.some((i) => i.parentId === folderId),

    // ─── Write Operations ─────────────────────────────────────────────────────
    addFolder: async (name, parentId = ROOT_FOLDER_ID) => {
      assertWorkspaceActive();
      const resolvedParent = parentId ?? ROOT_FOLDER_ID;

      if (get().isDuplicateName(name, resolvedParent, 'folder')) {
        throw new Error(`A folder named "${name}" already exists here`);
      }

      const data = await apiFetch<{ status: string; folder: Record<string, unknown> }>(
        '/folders',
        { method: 'POST', body: JSON.stringify({ name, parentId: resolvedParent }) }
      );

      const folder = normaliseFolder(data.folder);
      set((state) => ({ items: [...state.items, folder] }));
      return folder;
    },

    addWorkflow: async (name, parentId = ROOT_FOLDER_ID, description = '') => {
      assertWorkspaceActive();
      const resolvedParent = parentId ?? ROOT_FOLDER_ID;

      if (get().isDuplicateName(name, resolvedParent, 'workflow')) {
        throw new Error(`A workflow named "${name}" already exists here`);
      }

      const data = await apiFetch<{ status: string; workflow: Record<string, unknown> }>(
        '/workflows',
        {
          method: 'POST',
          body: JSON.stringify({ name, parentId: resolvedParent, description }),
        }
      );

      const workflow = normaliseWorkflow(data.workflow);
      set((state) => ({
        workflowCache: { ...state.workflowCache, [workflow.id]: workflow },
        items: [...state.items, workflow],
      }));
      return workflow;
    },

    renameItem: async (id, newName) => {
      assertWorkspaceActive();
      if (id === ROOT_FOLDER_ID) return;

      const trimmed = newName.trim();
      if (!trimmed) return;

      const { items } = get();
      const target = items.find((i) => i.id === id);
      if (!target || target.name === trimmed) return;

      const now = new Date().toISOString();

      if (target.type === 'folder') {
        await apiFetch(`/folders/${id}`, {
          method: 'PUT',
          body: JSON.stringify({ name: trimmed }),
        });
        set((state) => ({
          items: state.items.map((item) =>
            item.id === id ? { ...item, name: trimmed, updatedAt: now } : item
          ),
        }));
      } else {
        const res = await apiFetch<{ status: string; workflow: Record<string, unknown> }>(
          `/workflows/${id}/rename`,
          { method: 'PUT', body: JSON.stringify({ name: trimmed }) }
        );
        const updated = normaliseWorkflow(res.workflow);
        // Keep cache fresh (backend renamed the file + bumped version).
        set((state) => ({
          workflowCache: { ...state.workflowCache, [id]: updated },
          items: state.items.map((item) => (item.id === id ? updated : item)),
        }));
      }
    },

    moveItem: async (id, newParentId) => {
      assertWorkspaceActive();
      if (id === ROOT_FOLDER_ID) return;

      const { items } = get();
      const itemToMove = items.find((i) => i.id === id);
      if (!itemToMove || itemToMove.parentId === newParentId) return;

      const resolvedParent = newParentId ?? ROOT_FOLDER_ID;

      if (itemToMove.type === 'folder' && isDescendantOf(resolvedParent, id, items)) {
        throw new Error('Cannot move a folder into itself or one of its descendants');
      }

      const now = new Date().toISOString();

      if (itemToMove.type === 'folder') {
        await apiFetch(`/folders/${id}`, {
          method: 'PUT',
          body: JSON.stringify({ parentId: resolvedParent }),
        });
        set((state) => ({
          items: state.items.map((item) =>
            item.id === id ? { ...item, parentId: resolvedParent, updatedAt: now } : item
          ),
        }));
      } else {
        const res = await apiFetch<{ status: string; workflow: Record<string, unknown> }>(
          `/workflows/${id}`,
          { method: 'PUT', body: JSON.stringify({ parentId: resolvedParent }) }
        );
        const updated = normaliseWorkflow(res.workflow);
        set((state) => ({
          workflowCache: { ...state.workflowCache, [id]: updated },
          items: state.items.map((item) => (item.id === id ? updated : item)),
        }));
      }
    },

    deleteItem: async (id) => {
      assertWorkspaceActive();
      if (id === ROOT_FOLDER_ID) return;

      const { items } = get();
      const target = items.find((i) => i.id === id);
      if (!target) return;

      if (target.type === 'folder') {
        const res = await apiFetch<{
          status: string;
          deletedFolders: string[];
          deletedWorkflows: string[];
        }>(`/folders/${id}`, { method: 'DELETE' });

        const deletedSet = new Set([...res.deletedFolders, ...res.deletedWorkflows]);
        deletedSet.forEach((did) => removeWorkflowDraft(did));

        set((state) => {
          const newCache = { ...state.workflowCache };
          deletedSet.forEach((did) => delete newCache[did]);
          return {
            workflowCache: newCache,
            items: state.items.filter((item) => !deletedSet.has(item.id)),
          };
        });
      } else {
        await apiFetch(`/workflows/${id}`, { method: 'DELETE' });
        removeWorkflowDraft(id);

        set((state) => {
          const newCache = { ...state.workflowCache };
          delete newCache[id];
          return {
            workflowCache: newCache,
            items: state.items.filter((item) => item.id !== id),
          };
        });
      }
    },

    duplicateWorkflow: async (id) => {
      assertWorkspaceActive();
      const source = await get().getWorkflow(id);
      if (!source) return undefined;

      const data = await apiFetch<{ status: string; workflow: Record<string, unknown> }>(
        '/workflows',
        {
          method: 'POST',
          body: JSON.stringify({
            name: `${source.name} (Copy)`,
            parentId: source.parentId ?? ROOT_FOLDER_ID,
            description: source.description,
          }),
        }
      );

      const created = normaliseWorkflow(data.workflow);

      const saved = await apiFetch<{ status: string; workflow: Record<string, unknown> }>(
        `/workflows/${created.id}`,
        {
          method: 'PUT',
          body: JSON.stringify({
            actions: JSON.parse(JSON.stringify(source.actions)) as WorkflowAction[],
            connections: JSON.parse(JSON.stringify(source.connections)) as Connection[],
            variables: JSON.parse(JSON.stringify(source.variables)) as WorkflowVariable[],
            icon: source.icon,
            status: 'draft' as const,
          }),
        }
      );

      const full = normaliseWorkflow(saved.workflow);
      // No draft is written: the copy is already persisted on the backend.
      set((state) => ({
        workflowCache: { ...state.workflowCache, [full.id]: full },
        items: [...state.items, full],
      }));
      return full;
    },

    /**
     * Persist canvas state. On success the backend response is authoritative:
     * cache + items are updated to match and the local draft is cleared so it
     * can never shadow the saved state. On *network* failure the data is stashed
     * as a draft (backup) and the error is rethrown so the editor can surface it.
     */
    saveWorkflowState: async (id, data) => {
      assertWorkspaceActive();

      const payload: Record<string, unknown> = {
        actions: data.actions,
        connections: data.connections,
        variables: data.variables,
      };
      if (data.name !== undefined) payload.name = data.name;
      if (data.description !== undefined) payload.description = data.description;
      if (data.status !== undefined) payload.status = data.status;
      if (data.lastRun !== undefined) payload.lastRun = data.lastRun;
      if (data.icon !== undefined) payload.icon = data.icon;

      try {
        const res = await apiFetch<{ status: string; workflow: Record<string, unknown> }>(
          `/workflows/${id}`,
          { method: 'PUT', body: JSON.stringify(payload) }
        );

        const updated = normaliseWorkflow(res.workflow);
        removeWorkflowDraft(id); // saved → no unsaved backup should remain
        set((state) => ({
          workflowCache: { ...state.workflowCache, [id]: updated },
          items: state.items.map((item) => (item.id === id ? updated : item)),
        }));
        return updated;
      } catch (err) {
        // Only keep a backup when the backend was unreachable. A genuine
        // validation/conflict error should not silently create a "newer" draft.
        if (err instanceof NetworkError) {
          writeWorkflowDraft(id, {
            name: data.name,
            actions: data.actions,
            connections: data.connections,
            variables: data.variables,
            description: data.description,
            status: data.status,
            lastRun: data.lastRun,
            icon: data.icon,
            updatedAt: new Date().toISOString(),
          });
        }
        throw err;
      }
    },

    updateWorkflowStatus: async (id, status) => {
      assertWorkspaceActive();
      const res = await apiFetch<{ status: string; workflow: Record<string, unknown> }>(
        `/workflows/${id}`,
        { method: 'PUT', body: JSON.stringify({ status }) }
      );
      const updated = normaliseWorkflow(res.workflow);
      set((state) => ({
        workflowCache: { ...state.workflowCache, [id]: updated },
        items: state.items.map((item) => (item.id === id ? updated : item)),
      }));
    },

    // ─── Workspace Management ───────────────────────────────────────────────
    loadWorkspaceTree: async () => {
      const { workspaceRoot } = get();
      if (!workspaceRoot) {
        set({ items: [], loadingState: 'idle' });
        return;
      }

      set({ loadingState: 'loading', error: null });
      try {
        const data = await apiFetch<{
          status: string;
          folders: Record<string, Record<string, unknown>>;
          workflows: Record<string, Record<string, unknown>>;
        }>('/tree');

        const flat = flattenTree(data);
        const hasRoot = flat.some((i) => i.id === ROOT_FOLDER_ID);

        // Preserve any cached full-canvas data for workflows still present, but
        // let the freshly-loaded metadata win for everything the tree returns.
        set((state) => {
          const presentIds = new Set(flat.map((i) => i.id));
          const prunedCache: Record<string, WorkspaceWorkflow> = {};
          for (const [wid, wf] of Object.entries(state.workflowCache)) {
            if (presentIds.has(wid)) prunedCache[wid] = wf;
          }
          return {
            items: hasRoot ? flat : [FALLBACK_ROOT, ...flat],
            workflowCache: prunedCache,
            loadingState: 'ready',
          };
        });
      } catch (err) {
        console.error('[WorkspaceStore] Failed to load workspace tree:', err);
        set({
          error: err instanceof Error ? err.message : 'Failed to load workspace',
          items: [FALLBACK_ROOT],
          loadingState: 'error',
        });
      }
    },

    selectWorkspace: async (workspacePath) => {
      set({ isLoadingWorkspace: true, workspaceError: null });
      try {
        await apiFetch<{ status: string; root: string }>('/select', {
          method: 'POST',
          body: JSON.stringify({ path: workspacePath }),
        });

        if (typeof window !== 'undefined') {
          window.localStorage.setItem(WORKSPACE_STORAGE_KEY, workspacePath);
        }
        set({ workspaceRoot: workspacePath, hasActiveWorkspace: true, workflowCache: {} });

        await get().loadWorkspaceTree();
      } catch (err) {
        console.error('[WorkspaceStore] Failed to select workspace:', err);
        set({
          workspaceError:
            err instanceof Error ? err.message : 'Failed to select workspace',
        });
      } finally {
        set({ isLoadingWorkspace: false });
      }
    },

    changeWorkspace: () => {
      get().clearWorkspace();
    },

    clearWorkspace: () => {
      if (typeof window !== 'undefined') {
        window.localStorage.removeItem(WORKSPACE_STORAGE_KEY);
      }
      set({
        workspaceRoot: null,
        hasActiveWorkspace: false,
        items: [],
        loadingState: 'idle',
        error: null,
        workspaceError: null,
        workflowCache: {},
      });
    },

    refreshWorkspace: async () => {
      // Drop the in-memory cache so the next reads come straight from disk.
      // Drafts are intentionally preserved (they are unsaved-work backups).
      set({ workflowCache: {} });
      await get().loadWorkspaceTree();
    },
  };
});

// Trigger store initialisation exactly once on the client immediately when imported.
if (typeof window !== 'undefined') {
  useWorkspaceStore.getState().initialize();
}