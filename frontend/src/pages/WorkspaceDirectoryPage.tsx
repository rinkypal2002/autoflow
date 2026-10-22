import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Folder,
  Workflow,
  Plus,
  FolderPlus,
  FilePlus2,
  Search,
  LayoutGrid,
  List,
  Trash2,
  RotateCcw,
  Copy,
  PenLine,
  ChevronRight,
  ArrowRight,
  HardDriveDownload,
  X,
  Clock,
  AlertTriangle,
  FolderOpen,
  CornerLeftUp,
  HardDrive,
  Layers,
} from 'lucide-react';
import AppShell from '../components/layout/AppShell';
import {
  PageHeader,
  Card,
  Button,
  Badge,
  Input,
  Field,
  Select,
  Modal,
  EmptyState,
  Skeleton,
  Tooltip,
  cn,
} from '../components/ui';
import type { Tone } from '../components/ui';
import {
  useWorkspaceStore,
  type WorkspaceItem,
  type WorkspaceFolder,
} from '../store/useWorkspaceStore';

const ROOT_ID = 'root';
const TRASH_NAME = '.trash';
const RECENTS_KEY = 'autoflow:recentWorkspaces';

const STATUS_TONE: Record<string, Tone> = { active: 'success', paused: 'warning', draft: 'neutral' };

function readRecents(): string[] {
  try {
    const raw = localStorage.getItem(RECENTS_KEY);
    return raw ? (JSON.parse(raw) as string[]).slice(0, 5) : [];
  } catch {
    return [];
  }
}
function pushRecent(path: string) {
  try {
    const next = [path, ...readRecents().filter((p) => p !== path)].slice(0, 5);
    localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}
function timeAgo(iso?: string): string {
  if (!iso) return '—';
  const d = Date.parse(iso);
  if (Number.isNaN(d)) return '—';
  const s = Math.floor((Date.now() - d) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

type ModalState =
  | { kind: 'create-folder' | 'create-workflow'; name: string; error: string; busy: boolean }
  | { kind: 'rename'; id: string; name: string; error: string; busy: boolean }
  | { kind: 'delete'; ids: string[]; busy: boolean }
  | { kind: 'empty-trash'; busy: boolean }
  | null;

const WorkspaceDirectoryPage: React.FC = () => {
  const navigate = useNavigate();
  const {
    items,
    hasActiveWorkspace,
    isLoadingWorkspace,
    loadingState,
    error,
    workspaceRoot,
    initialize,
    refreshWorkspace,
    selectWorkspace,
    changeWorkspace,
    getItemById,
    addFolder,
    addWorkflow,
    renameItem,
    moveItem,
    deleteItem,
    duplicateWorkflow,
  } = useWorkspaceStore();

  const [currentParent, setCurrentParent] = useState<string>(ROOT_ID);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'folder' | 'workflow'>('all');
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showTrash, setShowTrash] = useState(false);
  const [modal, setModal] = useState<ModalState>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [pathInput, setPathInput] = useState('');
  const [openingError, setOpeningError] = useState<string | null>(null);
  const [busyBulk, setBusyBulk] = useState(false);

  useEffect(() => {
    initialize();
  }, [initialize]);

  // ── Trash folder (client-side, built from existing move/delete) ──────────
  const trashFolder = useMemo(
    () => items.find((i) => i.type === 'folder' && i.parentId === ROOT_ID && i.name === TRASH_NAME) as WorkspaceFolder | undefined,
    [items]
  );
  const trashId = trashFolder?.id;

  const isInTrash = useCallback(
    (item: WorkspaceItem): boolean => {
      if (!trashId) return false;
      let cur: WorkspaceItem | undefined = item;
      let guard = 0;
      while (cur && guard < 100) {
        if (cur.id === trashId || cur.parentId === trashId) return true;
        if (!cur.parentId) return false;
        cur = items.find((i) => i.id === cur!.parentId);
        guard++;
      }
      return false;
    },
    [items, trashId]
  );

  const ensureTrash = useCallback(async (): Promise<string | undefined> => {
    if (trashId) return trashId;
    try {
      const f = await addFolder(TRASH_NAME, ROOT_ID);
      return f.id;
    } catch {
      return undefined;
    }
  }, [trashId, addFolder]);

  // ── Breadcrumb (root → current) ──────────────────────────────────────────
  const crumbs = useMemo(() => {
    const chain: WorkspaceFolder[] = [];
    let id: string | null = currentParent;
    let guard = 0;
    while (id && id !== ROOT_ID && guard < 100) {
      const f = getItemById(id);
      if (f && f.type === 'folder') chain.unshift(f as WorkspaceFolder);
      id = f?.parentId ?? null;
      guard++;
    }
    return chain;
  }, [currentParent, getItemById]);

  // ── Visible items ────────────────────────────────────────────────────────
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list: WorkspaceItem[];
    if (q) {
      // tree-wide search (excludes trash)
      list = items.filter(
        (i) => i.id !== ROOT_ID && !isInTrash(i) && i.name.toLowerCase().includes(q)
      );
    } else {
      list = items.filter((i) => i.parentId === currentParent && i.id !== trashId);
    }
    if (typeFilter !== 'all') list = list.filter((i) => i.type === typeFilter);
    // folders first, then by name
    return [...list].sort((a, b) => {
      if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }, [items, search, currentParent, trashId, isInTrash, typeFilter]);

  const trashItems = useMemo(
    () => (trashId ? items.filter((i) => i.parentId === trashId) : []),
    [items, trashId]
  );

  // Workspace-wide counts (excluding root + trash) for the summary bar.
  const counts = useMemo(() => {
    let folders = 0;
    let workflows = 0;
    for (const i of items) {
      if (i.id === ROOT_ID || isInTrash(i)) continue;
      if (i.type === 'folder') folders += 1;
      else workflows += 1;
    }
    return { folders, workflows };
  }, [items, isInTrash]);

  // ── Selection ────────────────────────────────────────────────────────────
  const toggleSelect = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const clearSelection = () => setSelected(new Set());

  // ── Open / navigate ──────────────────────────────────────────────────────
  const open = (item: WorkspaceItem) => {
    if (item.type === 'folder') {
      setCurrentParent(item.id);
      setSearch('');
      clearSelection();
    } else {
      navigate(`/workspace/editor/${item.id}`);
    }
  };

  // ── Bulk actions ─────────────────────────────────────────────────────────
  const withBusy = async (fn: () => Promise<void>) => {
    setBusyBulk(true);
    try {
      await fn();
      await refreshWorkspace();
    } catch {
      /* surfaced via store error */
    } finally {
      setBusyBulk(false);
    }
  };

  const moveToTrash = (ids: string[]) =>
    withBusy(async () => {
      const tid = await ensureTrash();
      if (!tid) return;
      for (const id of ids) if (id !== tid) await moveItem(id, tid);
      clearSelection();
      setModal(null);
    });

  const restoreItems = (ids: string[]) =>
    withBusy(async () => {
      for (const id of ids) await moveItem(id, ROOT_ID);
    });

  const deleteForever = (ids: string[]) =>
    withBusy(async () => {
      for (const id of ids) await deleteItem(id);
      setModal(null);
    });

  const duplicateItems = (ids: string[]) =>
    withBusy(async () => {
      for (const id of ids) {
        const it = getItemById(id);
        if (it?.type === 'workflow') await duplicateWorkflow(id);
      }
      clearSelection();
    });

  const moveInto = (ids: string[], targetFolderId: string) =>
    withBusy(async () => {
      for (const id of ids) if (id !== targetFolderId) await moveItem(id, targetFolderId);
      clearSelection();
    });

  // ── Drag & drop (native) ─────────────────────────────────────────────────
  const onDragStart = (id: string) => (e: React.DragEvent) => {
    const ids = selected.has(id) ? Array.from(selected) : [id];
    e.dataTransfer.setData('text/plain', JSON.stringify(ids));
    e.dataTransfer.effectAllowed = 'move';
  };
  const onDropFolder = (folderId: string) => (e: React.DragEvent) => {
    e.preventDefault();
    setDragOverId(null);
    try {
      const ids = JSON.parse(e.dataTransfer.getData('text/plain')) as string[];
      if (ids?.length) moveInto(ids, folderId);
    } catch {
      /* ignore */
    }
  };

  // ── Create / rename ──────────────────────────────────────────────────────
  const submitModal = async () => {
    if (!modal) return;
    if (modal.kind === 'create-folder' || modal.kind === 'create-workflow') {
      const name = modal.name.trim();
      if (!name) return setModal({ ...modal, error: 'Name is required' });
      setModal({ ...modal, busy: true, error: '' });
      try {
        if (modal.kind === 'create-folder') {
          await addFolder(name, currentParent);
          await refreshWorkspace();
          setModal(null);
        } else {
          const wf = await addWorkflow(name, currentParent);
          await refreshWorkspace();
          setModal(null);
          navigate(`/workspace/editor/${wf.id}`);
        }
      } catch (err) {
        setModal({ ...modal, busy: false, error: err instanceof Error ? err.message : 'Failed' });
      }
    } else if (modal.kind === 'rename') {
      const name = modal.name.trim();
      if (!name) return setModal({ ...modal, error: 'Name is required' });
      setModal({ ...modal, busy: true, error: '' });
      try {
        await renameItem(modal.id, name);
        await refreshWorkspace();
        setModal(null);
      } catch (err) {
        setModal({ ...modal, busy: false, error: err instanceof Error ? err.message : 'Failed' });
      }
    }
  };

  // ── Workspace open ───────────────────────────────────────────────────────
  const openWorkspace = async (path: string) => {
    const p = path.trim();
    if (!p) return setOpeningError('Enter a workspace folder path.');
    setOpeningError(null);
    try {
      await selectWorkspace(p);
      await refreshWorkspace();
      pushRecent(p);
      setPathInput('');
    } catch (err) {
      setOpeningError(err instanceof Error ? err.message : 'Could not open workspace.');
    }
  };

  const recents = readRecents();
  const selCount = selected.size;

  /* ── Onboarding (no workspace) ─────────────────────────────────────────── */
  if (!hasActiveWorkspace && !isLoadingWorkspace && loadingState !== 'loading') {
    return (
      <AppShell title="Directory">
        <div className="max-w-xl mx-auto mt-10 motion-safe:animate-fade-in">
          <Card padded className="relative overflow-hidden text-center">
            <div aria-hidden="true" className="pointer-events-none absolute inset-0">
              <div className="absolute -top-24 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-brand-cyan-500/[0.09] blur-3xl" />
              <div className="absolute -bottom-28 -right-16 h-64 w-64 rounded-full bg-brand-indigo-500/[0.07] blur-3xl" />
            </div>
            <div className="relative">
              <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-white/10 bg-gradient-to-br from-brand-cyan-500/20 to-brand-indigo-500/20 shadow-e1">
                <HardDriveDownload className="w-7 h-7 text-brand-cyan-400" />
              </div>
              <h2 className="text-[20px] font-extrabold tracking-tight text-ink-primary">Open a workspace</h2>
              <p className="mx-auto mt-2 max-w-sm text-[13px] leading-relaxed text-ink-tertiary">
                A workspace is a folder on the backend where your workflows live. Point AutoFlow at one to get started.
              </p>
              <div className="mt-6 flex flex-col gap-2.5 text-left">
                <Field label="Workspace folder path" error={openingError ?? undefined}>
                  <Input
                    value={pathInput}
                    onChange={(e) => setPathInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && openWorkspace(pathInput)}
                    placeholder="e.g. D:\AutoFlow\workspace"
                    leftIcon={<Folder className="w-4 h-4" />}
                  />
                </Field>
                <Button variant="primary" size="lg" onClick={() => openWorkspace(pathInput)} className="justify-center">
                  Open workspace
                </Button>
              </div>
              {recents.length > 0 && (
                <div className="mt-7 text-left">
                  <p className="mb-2.5 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-muted">Recent workspaces</p>
                  <div className="flex flex-col gap-1.5">
                    {recents.map((p) => (
                      <button
                        key={p}
                        onClick={() => openWorkspace(p)}
                        className="group flex items-center gap-2.5 rounded-lg border border-white/[0.06] bg-surface-3/50 px-3 py-2.5 text-left outline-none transition-colors hover:border-brand-cyan-500/30 hover:bg-white/[0.04] focus-visible:border-brand-cyan-500/40 focus-visible:ring-2 focus-visible:ring-brand-cyan-500/30"
                      >
                        <Clock className="w-3.5 h-3.5 text-ink-muted shrink-0" />
                        <span className="flex-1 truncate font-mono text-[12px] text-ink-secondary transition-colors group-hover:text-ink-primary">{p}</span>
                        <ArrowRight className="w-3.5 h-3.5 shrink-0 text-ink-muted opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </Card>
        </div>
      </AppShell>
    );
  }

  /* ── Loading (restoring workspace) ─────────────────────────────────────── */
  if (isLoadingWorkspace || loadingState === 'loading') {
    return (
      <AppShell title="Directory">
        <div className="max-w-[1600px] mx-auto space-y-6" aria-busy="true">
          <PageHeader title="Directory" subtitle="Loading workspace…" />
          <span role="status" className="sr-only">Loading workspace…</span>
          <Skeleton className="h-16 w-full" rounded="lg" />
          <div className="flex items-center justify-between gap-3">
            <Skeleton className="h-7 w-44" rounded="md" />
            <Skeleton className="h-8 w-40" rounded="md" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Card key={i} padded>
                <div className="flex items-start justify-between">
                  <Skeleton className="h-11 w-11" rounded="lg" />
                  <Skeleton className="h-4 w-4" rounded="md" />
                </div>
                <Skeleton className="h-4 w-2/3 mt-4 mb-2.5" />
                <div className="flex items-center justify-between gap-2">
                  <Skeleton className="h-3 w-1/3" />
                  <Skeleton className="h-4 w-12" rounded="full" />
                </div>
              </Card>
            ))}
          </div>
        </div>
      </AppShell>
    );
  }

  /* ── Main directory ────────────────────────────────────────────────────── */
  return (
    <AppShell
      title="Directory"
      searchValue={search}
      onSearchChange={setSearch}
      searchPlaceholder="Search all workflows & folders…"
      headerActions={
        <div className="flex items-center gap-2">
          <Tooltip label="Change workspace" side="bottom">
            <Button variant="subtle" size="icon" onClick={() => changeWorkspace()} aria-label="Change workspace">
              <HardDriveDownload className="w-4 h-4" />
            </Button>
          </Tooltip>
          <Button variant="secondary" size="md" leftIcon={<FolderPlus className="w-4 h-4" />} onClick={() => setModal({ kind: 'create-folder', name: '', error: '', busy: false })}>
            New folder
          </Button>
          <Button variant="primary" size="md" leftIcon={<Plus className="w-4 h-4" />} onClick={() => setModal({ kind: 'create-workflow', name: '', error: '', busy: false })}>
            New workflow
          </Button>
        </div>
      }
    >
      <div className="max-w-[1600px] mx-auto space-y-6">
        <PageHeader
          title={showTrash ? 'Trash' : 'Directory'}
          subtitle={
            showTrash
              ? 'Items moved to trash. Restore them or delete permanently.'
              : 'Browse, organise, and open your automations'
          }
          actions={
            <div className="flex items-center gap-2">
              <Button
                variant={showTrash ? 'secondary' : 'ghost'}
                size="sm"
                leftIcon={<Trash2 className="w-4 h-4" />}
                onClick={() => {
                  setShowTrash((v) => !v);
                  clearSelection();
                }}
              >
                {showTrash ? 'Back to Directory' : `Trash${trashItems.length ? ` (${trashItems.length})` : ''}`}
              </Button>
              {!showTrash && (
                <div role="group" aria-label="View mode" className="flex items-center gap-0.5 rounded-lg border border-white/[0.06] bg-surface-3/60 p-0.5">
                  <Tooltip label="Grid view" side="bottom">
                    <button onClick={() => setView('grid')} className={cn('rounded-md p-1.5 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand-cyan-500/40', view === 'grid' ? 'bg-white/10 text-ink-primary shadow-e1' : 'text-ink-tertiary hover:text-ink-secondary')} aria-label="Grid view">
                      <LayoutGrid className="w-4 h-4" />
                    </button>
                  </Tooltip>
                  <Tooltip label="List view" side="bottom">
                    <button onClick={() => setView('list')} className={cn('rounded-md p-1.5 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand-cyan-500/40', view === 'list' ? 'bg-white/10 text-ink-primary shadow-e1' : 'text-ink-tertiary hover:text-ink-secondary')} aria-label="List view">
                      <List className="w-4 h-4" />
                    </button>
                  </Tooltip>
                </div>
              )}
            </div>
          }
        />

        {error && (
          <div role="alert" className="flex items-center gap-2.5 rounded-xl border border-danger-500/25 bg-danger-500/10 px-4 py-3 text-[13px] text-danger-400 motion-safe:animate-fade-in">
            <AlertTriangle className="w-4 h-4 shrink-0" /> {error}
          </div>
        )}

        {showTrash ? (
          /* ── Trash view ── */
          trashItems.length === 0 ? (
            <EmptyState icon={<Trash2 className="w-5 h-5" />} title="Trash is empty" description="Deleted folders and workflows will appear here." />
          ) : (
            <div className="space-y-3 motion-safe:animate-fade-in">
              <div className="flex items-center justify-between gap-3">
                <span className="rounded-full border border-white/[0.06] bg-surface-2 px-2.5 py-1 text-[11px] font-semibold tabular-nums text-ink-tertiary">
                  {trashItems.length} item{trashItems.length === 1 ? '' : 's'}
                </span>
                <Button variant="danger" size="sm" leftIcon={<Trash2 className="w-4 h-4" />} loading={busyBulk} onClick={() => setModal({ kind: 'empty-trash', busy: false })}>
                  Empty trash
                </Button>
              </div>
              <div className="flex flex-col gap-2">
                {trashItems.map((item) => (
                  <div key={item.id} className="group flex items-center gap-3 rounded-xl border border-white/[0.06] bg-surface-2 px-4 py-2.5 shadow-e1 transition-colors hover:border-white/[0.1]">
                    <span className={cn('grid h-8 w-8 shrink-0 place-items-center rounded-lg border', item.type === 'folder' ? 'border-amber-500/15 bg-amber-500/[0.08]' : 'border-brand-cyan-500/15 bg-brand-cyan-500/[0.08]')}>
                      {item.type === 'folder' ? <Folder className="w-4 h-4 text-amber-400/80" /> : <Workflow className="w-4 h-4 text-brand-cyan-400/80" />}
                    </span>
                    <span className="flex-1 truncate text-[13px] font-medium text-ink-secondary">{item.name}</span>
                    <Button variant="ghost" size="sm" leftIcon={<RotateCcw className="w-3.5 h-3.5" />} onClick={() => restoreItems([item.id])}>
                      Restore
                    </Button>
                    <Button variant="ghost" size="sm" leftIcon={<X className="w-3.5 h-3.5" />} onClick={() => setModal({ kind: 'delete', ids: [item.id], busy: false })}>
                      Delete
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )
        ) : (
          <>
            {/* Workspace summary */}
            <section aria-label="Active workspace" className="relative flex flex-wrap items-center gap-x-5 gap-y-3 overflow-hidden rounded-xl border border-white/[0.06] bg-surface-2 px-4 py-3.5 shadow-e1 motion-safe:animate-fade-in">
              <div aria-hidden="true" className="pointer-events-none absolute -left-12 -top-16 h-44 w-44 rounded-full bg-brand-cyan-500/[0.07] blur-3xl" />
              <div className="relative flex min-w-0 items-center gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/10 bg-gradient-to-br from-brand-cyan-500/20 to-brand-indigo-500/20 shadow-e1">
                  <HardDrive className="w-4 h-4 text-brand-cyan-400" />
                </span>
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase leading-none tracking-[0.14em] text-ink-muted">Active workspace</p>
                  <p className="mt-1.5 max-w-[320px] truncate font-mono text-[12px] text-ink-secondary" title={workspaceRoot ?? undefined}>
                    {workspaceRoot ?? '—'}
                  </p>
                </div>
              </div>
              <div className="hidden h-9 w-px bg-white/[0.08] sm:block" />
              <div className="relative flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.06] bg-surface-3/50 px-2.5 py-1.5 text-[11px] text-ink-tertiary">
                  <Folder className="w-3.5 h-3.5 text-amber-400" />
                  <span className="font-mono font-bold tabular-nums text-ink-primary">{counts.folders}</span> folders
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.06] bg-surface-3/50 px-2.5 py-1.5 text-[11px] text-ink-tertiary">
                  <Workflow className="w-3.5 h-3.5 text-brand-cyan-400" />
                  <span className="font-mono font-bold tabular-nums text-ink-primary">{counts.workflows}</span> workflows
                </span>
              </div>
              <div className="flex-1" />
              <Button variant="subtle" size="sm" leftIcon={<HardDriveDownload className="w-3.5 h-3.5" />} onClick={() => changeWorkspace()}>
                Change
              </Button>
            </section>

            {/* Breadcrumb + filter */}
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <nav className="flex items-center gap-0.5 flex-wrap text-[12px]" aria-label="Breadcrumb">
                <button onClick={() => { setCurrentParent(ROOT_ID); clearSelection(); }} className={cn('flex items-center gap-1.5 rounded-md px-2 py-1 font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand-cyan-500/40', currentParent === ROOT_ID ? 'bg-white/[0.06] text-ink-primary' : 'text-ink-tertiary hover:bg-white/[0.04] hover:text-brand-cyan-400')}>
                  <Layers className="w-3.5 h-3.5" /> Workspace
                </button>
                {crumbs.map((c) => (
                  <React.Fragment key={c.id}>
                    <ChevronRight aria-hidden="true" className="w-3.5 h-3.5 shrink-0 text-ink-muted/70" />
                    <button onClick={() => { setCurrentParent(c.id); clearSelection(); }} className={cn('max-w-[180px] truncate rounded-md px-2 py-1 font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand-cyan-500/40', c.id === currentParent ? 'bg-white/[0.06] text-ink-primary' : 'text-ink-tertiary hover:bg-white/[0.04] hover:text-brand-cyan-400')}>
                      {c.name}
                    </button>
                  </React.Fragment>
                ))}
              </nav>
              <div className="flex items-center gap-3">
                {!search && (
                  <span className="rounded-full border border-white/[0.06] bg-surface-2 px-2.5 py-1 text-[11px] font-semibold tabular-nums text-ink-tertiary">
                    {visible.length} item{visible.length === 1 ? '' : 's'}
                  </span>
                )}
                <Field className="w-44">
                  <Select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as any)} aria-label="Filter by type">
                    <option value="all">All items</option>
                    <option value="folder">Folders only</option>
                    <option value="workflow">Workflows only</option>
                  </Select>
                </Field>
              </div>
            </div>

            {/* Bulk action bar */}
            {selCount > 0 && (
              <div role="status" className="flex flex-wrap items-center gap-2 rounded-xl border border-brand-cyan-500/25 bg-brand-cyan-500/[0.08] px-4 py-2.5 shadow-e1 motion-safe:animate-fade-in">
                <Badge tone="brand" pill>{selCount}</Badge>
                <span className="text-[12px] font-semibold text-ink-secondary">selected</span>
                <div className="flex-1" />
                <Button variant="subtle" size="sm" leftIcon={<Copy className="w-3.5 h-3.5" />} loading={busyBulk} onClick={() => duplicateItems(Array.from(selected))}>
                  Duplicate
                </Button>
                <Button variant="subtle" size="sm" leftIcon={<Trash2 className="w-3.5 h-3.5" />} loading={busyBulk} onClick={() => setModal({ kind: 'delete', ids: Array.from(selected), busy: false })}>
                  Move to trash
                </Button>
                <Button variant="ghost" size="sm" onClick={clearSelection}>
                  Clear
                </Button>
              </div>
            )}

            {/* Items */}
            {visible.length === 0 ? (
              search ? (
                <EmptyState icon={<Search className="w-5 h-5" />} title="No matches" description={`Nothing matches “${search}”.`} action={<Button variant="secondary" size="sm" onClick={() => setSearch('')}>Clear search</Button>} />
              ) : (
                <EmptyState
                  icon={<FolderOpen className="w-5 h-5" />}
                  title="This folder is empty"
                  description="Create a workflow or a subfolder to get started."
                  action={
                    <div className="flex gap-2">
                      <Button variant="secondary" size="sm" leftIcon={<FolderPlus className="w-4 h-4" />} onClick={() => setModal({ kind: 'create-folder', name: '', error: '', busy: false })}>Folder</Button>
                      <Button variant="primary" size="sm" leftIcon={<FilePlus2 className="w-4 h-4" />} onClick={() => setModal({ kind: 'create-workflow', name: '', error: '', busy: false })}>Workflow</Button>
                    </div>
                  }
                />
              )
            ) : view === 'grid' ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4 motion-safe:animate-fade-in">
                {visible.map((item) => {
                  const isFolder = item.type === 'folder';
                  const isSel = selected.has(item.id);
                  const isDragOver = dragOverId === item.id && isFolder;
                  const childCount = isFolder
                    ? items.filter((c) => c.parentId === item.id && c.id !== trashId).length
                    : 0;
                  return (
                    <div
                      key={item.id}
                      draggable
                      onDragStart={onDragStart(item.id)}
                      onDragOver={isFolder ? (e) => { e.preventDefault(); setDragOverId(item.id); } : undefined}
                      onDragLeave={isFolder ? () => setDragOverId(null) : undefined}
                      onDrop={isFolder ? onDropFolder(item.id) : undefined}
                      onClick={() => open(item)}
                      className={cn(
                        'group relative overflow-hidden rounded-xl border bg-surface-2 p-4 cursor-pointer transition-all duration-200 ease-std hover:shadow-e2 motion-safe:hover:-translate-y-0.5',
                        isSel ? 'border-brand-cyan-500/50 ring-1 ring-brand-cyan-500/40 bg-brand-cyan-500/[0.04]' : 'border-white/[0.06] hover:border-white/[0.12]',
                        isDragOver && 'border-brand-cyan-500/60 ring-2 ring-brand-cyan-500/50 bg-brand-cyan-500/[0.06]'
                      )}
                    >
                      {/* hover glow keyed to item type */}
                      <span aria-hidden="true" className={cn('pointer-events-none absolute -right-12 -top-14 h-32 w-32 rounded-full blur-2xl opacity-0 transition-opacity duration-300 group-hover:opacity-100', isFolder ? 'bg-amber-500/[0.08]' : 'bg-brand-cyan-500/[0.08]')} />

                      <input
                        type="checkbox"
                        checked={isSel}
                        onChange={() => {}}
                        onClick={(e) => toggleSelect(item.id, e)}
                        className="absolute top-3 right-3 z-20 h-4 w-4 cursor-pointer rounded border-white/20 bg-surface-3 accent-brand-cyan-500 opacity-0 outline-none transition-opacity checked:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-brand-cyan-500/50"
                        aria-label={`Select ${item.name}`}
                      />

                      <div className={cn(
                        'relative flex h-11 w-11 items-center justify-center rounded-xl border shadow-e1',
                        isFolder
                          ? 'border-amber-500/20 bg-gradient-to-br from-amber-500/[0.18] to-amber-500/[0.03]'
                          : 'border-brand-cyan-500/20 bg-gradient-to-br from-brand-cyan-500/[0.18] to-brand-indigo-500/[0.08]'
                      )}>
                        {isFolder ? <Folder className="w-5 h-5 text-amber-400" /> : <Workflow className="w-5 h-5 text-brand-cyan-400" />}
                      </div>

                      <p className="relative mt-3.5 truncate text-[13px] font-bold tracking-tight text-ink-primary transition-colors group-hover:text-white">{item.name}</p>

                      <div className="relative mt-2 flex min-h-[20px] items-center justify-between gap-2">
                        <span className="inline-flex items-center gap-1 text-[11px] tabular-nums text-ink-tertiary">
                          <Clock className="w-3 h-3 text-ink-muted" /> {timeAgo(item.updatedAt)}
                        </span>
                        {isFolder ? (
                          <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-ink-muted">
                            {childCount} item{childCount === 1 ? '' : 's'}
                          </span>
                        ) : (
                          <Badge tone={STATUS_TONE[(item as any).status ?? 'draft'] ?? 'neutral'}>{(item as any).status ?? 'draft'}</Badge>
                        )}
                      </div>

                      {/* hover actions */}
                      <div className="absolute bottom-3 right-3 z-20 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                        <Tooltip label="Rename" side="top">
                          <button onClick={(e) => { e.stopPropagation(); setModal({ kind: 'rename', id: item.id, name: item.name, error: '', busy: false }); }} className="rounded-md border border-white/10 bg-surface-3/90 p-1.5 text-ink-tertiary outline-none backdrop-blur-sm transition-colors hover:border-white/20 hover:text-ink-primary focus-visible:ring-2 focus-visible:ring-brand-cyan-500/40" aria-label="Rename">
                            <PenLine className="w-3.5 h-3.5" />
                          </button>
                        </Tooltip>
                        <Tooltip label="Move to trash" side="top">
                          <button onClick={(e) => { e.stopPropagation(); setModal({ kind: 'delete', ids: [item.id], busy: false }); }} className="rounded-md border border-white/10 bg-surface-3/90 p-1.5 text-ink-tertiary outline-none backdrop-blur-sm transition-colors hover:border-danger-500/30 hover:text-danger-400 focus-visible:ring-2 focus-visible:ring-danger-500/40" aria-label="Move to trash">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </Tooltip>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              /* list view */
              <div className="flex flex-col overflow-hidden rounded-xl border border-white/[0.06] bg-surface-2 shadow-e1 motion-safe:animate-fade-in">
                {/* column header */}
                <div className="hidden sm:flex items-center gap-3 border-b border-white/[0.06] bg-surface-3/40 px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.12em] text-ink-muted">
                  <span className="w-4" />
                  <span className="w-7" />
                  <span className="flex-1">Name</span>
                  <span className="w-24 text-right">Modified</span>
                  <span className="w-20 text-center">Status</span>
                  <span className="w-16" />
                </div>
                <div className="flex flex-col divide-y divide-white/[0.04]">
                {visible.map((item) => {
                  const isFolder = item.type === 'folder';
                  const isSel = selected.has(item.id);
                  const isDragOver = dragOverId === item.id && isFolder;
                  const childCount = isFolder
                    ? items.filter((c) => c.parentId === item.id && c.id !== trashId).length
                    : 0;
                  return (
                    <div
                      key={item.id}
                      draggable
                      onDragStart={onDragStart(item.id)}
                      onDragOver={isFolder ? (e) => { e.preventDefault(); setDragOverId(item.id); } : undefined}
                      onDragLeave={isFolder ? () => setDragOverId(null) : undefined}
                      onDrop={isFolder ? onDropFolder(item.id) : undefined}
                      onClick={() => open(item)}
                      className={cn('group flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors', isSel ? 'bg-brand-cyan-500/[0.08]' : 'hover:bg-white/[0.03]', isDragOver && 'bg-brand-cyan-500/[0.08] ring-1 ring-inset ring-brand-cyan-500/40')}
                    >
                      <input type="checkbox" checked={isSel} onChange={() => {}} onClick={(e) => toggleSelect(item.id, e)} className="h-4 w-4 shrink-0 cursor-pointer rounded border-white/20 bg-surface-3 accent-brand-cyan-500 outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan-500/50" aria-label={`Select ${item.name}`} />
                      <span className={cn('grid h-7 w-7 shrink-0 place-items-center rounded-lg border', isFolder ? 'border-amber-500/20 bg-amber-500/10' : 'border-brand-cyan-500/20 bg-brand-cyan-500/10')}>
                        {isFolder ? <Folder className="w-3.5 h-3.5 text-amber-400" /> : <Workflow className="w-3.5 h-3.5 text-brand-cyan-400" />}
                      </span>
                      <span className="flex-1 truncate text-[13px] font-semibold tracking-tight text-ink-primary transition-colors group-hover:text-white">
                        {item.name}
                        {isFolder && <span className="ml-2 text-[11px] font-medium tracking-normal text-ink-muted">{childCount} item{childCount === 1 ? '' : 's'}</span>}
                      </span>
                      <span className="hidden w-24 text-right text-[11px] tabular-nums text-ink-tertiary sm:block">{timeAgo(item.updatedAt)}</span>
                      <span className="flex w-20 justify-center">
                        {!isFolder && <Badge tone={STATUS_TONE[(item as any).status ?? 'draft'] ?? 'neutral'}>{(item as any).status ?? 'draft'}</Badge>}
                      </span>
                      <div className="flex w-16 items-center justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                        <button onClick={(e) => { e.stopPropagation(); setModal({ kind: 'rename', id: item.id, name: item.name, error: '', busy: false }); }} className="rounded-md p-1.5 text-ink-tertiary outline-none transition-colors hover:bg-white/[0.06] hover:text-ink-primary focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-brand-cyan-500/40" aria-label="Rename"><PenLine className="w-3.5 h-3.5" /></button>
                        <button onClick={(e) => { e.stopPropagation(); setModal({ kind: 'delete', ids: [item.id], busy: false }); }} className="rounded-md p-1.5 text-ink-tertiary outline-none transition-colors hover:bg-danger-500/10 hover:text-danger-400 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-danger-500/40" aria-label="Move to trash"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    </div>
                  );
                })}
                </div>
              </div>
            )}

            {/* Drop-to-parent hint when inside a folder */}
            {currentParent !== ROOT_ID && (
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOverId('__up__'); }}
                onDragLeave={() => setDragOverId(null)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOverId(null);
                  try {
                    const ids = JSON.parse(e.dataTransfer.getData('text/plain')) as string[];
                    const parentOfCurrent = getItemById(currentParent)?.parentId ?? ROOT_ID;
                    if (ids?.length) moveInto(ids, parentOfCurrent);
                  } catch { /* ignore */ }
                }}
                className={cn('flex items-center justify-center gap-2 rounded-xl border border-dashed px-4 py-3 text-[12px] font-medium transition-colors', dragOverId === '__up__' ? 'border-brand-cyan-500/50 bg-brand-cyan-500/[0.06] text-brand-cyan-400' : 'border-white/[0.08] text-ink-muted')}
              >
                <CornerLeftUp className="w-3.5 h-3.5" /> Drop here to move up one level
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Modals ── */}
      <Modal
        open={modal?.kind === 'create-folder' || modal?.kind === 'create-workflow' || modal?.kind === 'rename'}
        onClose={() => setModal(null)}
        title={modal?.kind === 'rename' ? 'Rename item' : modal?.kind === 'create-folder' ? 'New folder' : 'New workflow'}
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setModal(null)}>Cancel</Button>
            <Button variant="primary" size="sm" loading={(modal as any)?.busy} onClick={submitModal}>
              {modal?.kind === 'rename' ? 'Rename' : 'Create'}
            </Button>
          </>
        }
      >
        {modal && (modal.kind === 'create-folder' || modal.kind === 'create-workflow' || modal.kind === 'rename') && (
          <Field
            label={modal.kind === 'create-folder' ? 'Folder name' : modal.kind === 'rename' ? 'New name' : 'Workflow name'}
            required
            error={(modal as any).error || undefined}
          >
            <Input
              autoFocus
              value={modal.name}
              onChange={(e) => setModal({ ...modal, name: e.target.value, error: '' } as ModalState)}
              onKeyDown={(e) => e.key === 'Enter' && submitModal()}
              placeholder={modal.kind === 'create-folder' ? 'e.g. Client projects' : modal.kind === 'create-workflow' ? 'e.g. Lead enrichment' : 'Enter a new name…'}
            />
          </Field>
        )}
      </Modal>

      <Modal
        open={modal?.kind === 'delete'}
        onClose={() => setModal(null)}
        title={showTrash ? 'Delete permanently?' : 'Move to trash?'}
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setModal(null)}>Cancel</Button>
            {showTrash ? (
              <Button variant="danger" size="sm" loading={busyBulk} onClick={() => modal?.kind === 'delete' && deleteForever(modal.ids)}>Delete permanently</Button>
            ) : (
              <Button variant="primary" size="sm" loading={busyBulk} onClick={() => modal?.kind === 'delete' && moveToTrash(modal.ids)}>Move to trash</Button>
            )}
          </>
        }
      >
        {modal?.kind === 'delete' && (
          <p className="text-[13px] leading-relaxed text-ink-secondary">
            {showTrash ? 'Permanently delete ' : 'Move '}
            <span className="font-bold text-ink-primary">{modal.ids.length} item{modal.ids.length === 1 ? '' : 's'}</span>
            {showTrash ? '? This cannot be undone.' : ' to trash? You can restore them later.'}
          </p>
        )}
      </Modal>

      <Modal
        open={modal?.kind === 'empty-trash'}
        onClose={() => setModal(null)}
        title="Empty trash?"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setModal(null)}>Cancel</Button>
            <Button variant="danger" size="sm" loading={busyBulk} onClick={() => deleteForever(trashItems.map((i) => i.id))}>Empty trash</Button>
          </>
        }
      >
        <p className="text-[13px] leading-relaxed text-ink-secondary">
          Permanently delete all <span className="font-bold text-ink-primary">{trashItems.length} item{trashItems.length === 1 ? '' : 's'}</span> in trash? This cannot be undone.
        </p>
      </Modal>
    </AppShell>
  );
};

export default WorkspaceDirectoryPage;