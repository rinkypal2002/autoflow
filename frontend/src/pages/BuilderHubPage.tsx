import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Workflow,
  Plus,
  ArrowRight,
  Clock,
  FolderTree,
  LayoutGrid,
  HardDriveDownload,
  Sparkles,
  PlayCircle,
} from 'lucide-react';
import AppShell from '../components/layout/AppShell';
import {
  PageHeader,
  Card,
  Button,
  Badge,
  Input,
  Field,
  EmptyState,
  Skeleton,
  cn,
} from '../components/ui';
import type { Tone } from '../components/ui';
import { useWorkspaceStore } from '../store/useWorkspaceStore';

const STATUS_TONE: Record<string, Tone> = { active: 'success', paused: 'warning', draft: 'neutral' };

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

/**
 * Builder hub — the landing for the Builder nav item (`/workspace/editor` with
 * no id). Previously that route mounted the canvas editor, which immediately
 * rendered a "Workflow Not Found" error because there was no workflow to load.
 *
 * This is the proper fallback: it lets the user resume a recent workflow or
 * create a new one, then routes into the real editor at `/workspace/editor/:id`.
 * It performs no workflow execution and touches no engine/contract behaviour —
 * creation goes through the existing `addWorkflow` store action.
 */
const BuilderHubPage: React.FC = () => {
  const navigate = useNavigate();
  const {
    hasActiveWorkspace,
    isLoadingWorkspace,
    loadingState,
    workspaceRoot,
    initialize,
    refreshWorkspace,
    getRecentWorkflows,
    addWorkflow,
  } = useWorkspaceStore();

  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    initialize();
  }, [initialize]);

  const loading = isLoadingWorkspace || loadingState === 'loading';

  // getRecentWorkflows reads from the store's `items`; depend on it so the list
  // refreshes after creation / workspace changes.
  const recent = useMemo(() => getRecentWorkflows(8), [getRecentWorkflows]);

  const focusName = () => {
    nameRef.current?.focus();
    nameRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const createWorkflow = async () => {
    const name = newName.trim();
    if (!name) {
      setCreateError('Give your workflow a name to continue.');
      nameRef.current?.focus();
      return;
    }
    setCreating(true);
    setCreateError(null);
    try {
      const wf = await addWorkflow(name, null);
      await refreshWorkspace();
      navigate(`/workspace/editor/${wf.id}`);
    } catch (err) {
      setCreating(false);
      setCreateError(err instanceof Error ? err.message : 'Could not create the workflow.');
    }
  };

  /* ── No workspace open ─────────────────────────────────────────────────── */
  if (!hasActiveWorkspace && !loading) {
    return (
      <AppShell title="Builder">
        <div className="max-w-xl mx-auto mt-10 motion-safe:animate-fade-in">
          <Card padded className="relative overflow-hidden text-center">
            <div aria-hidden="true" className="pointer-events-none absolute -top-24 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-brand-cyan-500/[0.08] blur-3xl" />
            <div className="relative">
              <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-white/10 bg-gradient-to-br from-brand-cyan-500/20 to-brand-indigo-500/20 shadow-e1">
                <HardDriveDownload className="w-7 h-7 text-brand-cyan-400" />
              </div>
              <h2 className="text-[20px] font-extrabold tracking-tight text-ink-primary">Open a workspace first</h2>
              <p className="mx-auto mt-2 max-w-sm text-[13px] leading-relaxed text-ink-tertiary">
                The Builder needs an active workspace before you can create or open a workflow.
              </p>
              <div className="mt-6">
                <Button
                  variant="primary"
                  leftIcon={<FolderTree className="w-4 h-4" />}
                  onClick={() => navigate('/workspace')}
                  className="justify-center"
                >
                  Go to Directory
                </Button>
              </div>
            </div>
          </Card>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Builder"
      headerActions={
        <Button variant="secondary" size="md" leftIcon={<FolderTree className="w-4 h-4" />} onClick={() => navigate('/workspace')}>
          Open Directory
        </Button>
      }
    >
      <div className="max-w-[1400px] mx-auto space-y-6">
        <PageHeader
          title="Builder"
          subtitle={
            workspaceRoot
              ? `Resume a recent automation or start a new one in ${workspaceRoot}`
              : 'Resume a recent automation or start a new one.'
          }
        />

        {/* ── Start a new workflow ───────────────────────────────────────── */}
        <Card padded className="relative overflow-hidden motion-safe:animate-fade-in">
          {/* subtle brand wash */}
          <div aria-hidden="true" className="pointer-events-none absolute inset-0">
            <div className="absolute -right-16 -top-24 h-72 w-72 rounded-full bg-brand-indigo-500/[0.08] blur-3xl" />
            <div className="absolute -bottom-28 right-24 h-64 w-64 rounded-full bg-brand-cyan-500/[0.07] blur-3xl" />
          </div>

          <div className="relative flex flex-col lg:flex-row lg:items-end gap-5">
            <div className="flex items-start gap-4 min-w-0 flex-1">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-gradient-to-br from-brand-cyan-500/20 to-brand-indigo-500/20 shadow-e1">
                <Sparkles className="w-5 h-5 text-brand-cyan-400" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-[16px] font-bold tracking-tight text-ink-primary">Start a new workflow</h2>
                <p className="mt-1 text-[13px] leading-relaxed text-ink-tertiary">
                  Name it, then design it on the canvas. You can rename or organise it later.
                </p>
                <div className="mt-3.5 max-w-md">
                  <Field error={createError ?? undefined}>
                    <Input
                      ref={nameRef}
                      autoFocus
                      value={newName}
                      onChange={(e) => {
                        setNewName(e.target.value);
                        if (createError) setCreateError(null);
                      }}
                      onKeyDown={(e) => e.key === 'Enter' && createWorkflow()}
                      placeholder="e.g. Nightly invoice sync"
                      leftIcon={<Workflow className="w-4 h-4" />}
                      disabled={creating}
                    />
                  </Field>
                </div>
              </div>
            </div>
            <div className="shrink-0">
              <Button
                variant="primary"
                size="lg"
                leftIcon={<Plus className="w-4 h-4" />}
                loading={creating}
                onClick={createWorkflow}
              >
                Create &amp; open
              </Button>
            </div>
          </div>

          <div className="relative mt-6 flex flex-wrap items-center gap-2 border-t border-white/[0.06] pt-4">
            <span className="mr-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-muted">Or</span>
            <Button variant="subtle" size="sm" leftIcon={<LayoutGrid className="w-3.5 h-3.5" />} onClick={() => navigate('/catalogue')}>
              Browse catalogue
            </Button>
            <Button variant="subtle" size="sm" leftIcon={<FolderTree className="w-3.5 h-3.5" />} onClick={() => navigate('/workspace')}>
              Open from Directory
            </Button>
          </div>
        </Card>

        {/* ── Recent workflows ───────────────────────────────────────────── */}
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <h2 className="flex items-center gap-2 text-[14px] font-bold tracking-tight text-ink-primary">
                <Clock className="w-4 h-4 text-ink-muted" /> Recent workflows
              </h2>
              {!loading && recent.length > 0 && (
                <span className="rounded-full border border-white/[0.06] bg-surface-2 px-2 py-0.5 text-[10px] font-semibold tabular-nums text-ink-tertiary">
                  {recent.length}
                </span>
              )}
            </div>
            <Button variant="ghost" size="sm" rightIcon={<ArrowRight className="w-3.5 h-3.5" />} onClick={() => navigate('/workspace')}>
              View all
            </Button>
          </div>

          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4" aria-busy="true">
              <span role="status" className="sr-only">Loading recent workflows…</span>
              {Array.from({ length: 6 }).map((_, i) => (
                <Card key={i} padded>
                  <div className="flex items-start justify-between gap-2">
                    <Skeleton className="h-11 w-11" rounded="lg" />
                    <Skeleton className="h-4 w-12" rounded="full" />
                  </div>
                  <Skeleton className="h-4 w-2/3 mt-4 mb-2.5" />
                  <Skeleton className="h-3 w-1/3" />
                </Card>
              ))}
            </div>
          ) : recent.length === 0 ? (
            <EmptyState
              icon={<PlayCircle className="w-5 h-5" />}
              title="No workflows yet"
              description="Create your first workflow above to start automating."
              action={
                <Button variant="primary" size="sm" leftIcon={<Plus className="w-4 h-4" />} onClick={focusName}>
                  Name a workflow
                </Button>
              }
            />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 motion-safe:animate-fade-in">
              {recent.map((wf) => (
                <button
                  key={wf.id}
                  onClick={() => navigate(`/workspace/editor/${wf.id}`)}
                  className={cn(
                    'group relative overflow-hidden rounded-xl border border-white/[0.06] bg-surface-2 p-4 text-left outline-none',
                    'transition-all duration-200 ease-std hover:border-white/[0.12] hover:shadow-e2 motion-safe:hover:-translate-y-0.5',
                    'focus-visible:border-brand-cyan-500/40 focus-visible:ring-2 focus-visible:ring-brand-cyan-500/40'
                  )}
                >
                  <span aria-hidden="true" className="pointer-events-none absolute -right-12 -top-14 h-32 w-32 rounded-full bg-brand-cyan-500/[0.08] opacity-0 blur-2xl transition-opacity duration-300 group-hover:opacity-100 group-focus-visible:opacity-100" />

                  <div className="relative flex items-start justify-between gap-2">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-brand-cyan-500/20 bg-gradient-to-br from-brand-cyan-500/[0.18] to-brand-indigo-500/[0.08] shadow-e1">
                      <Workflow className="w-5 h-5 text-brand-cyan-400" />
                    </div>
                    <Badge tone={STATUS_TONE[wf.status ?? 'draft'] ?? 'neutral'}>{wf.status ?? 'draft'}</Badge>
                  </div>
                  <p className="relative mt-3.5 truncate text-[13px] font-bold tracking-tight text-ink-primary transition-colors group-hover:text-white">{wf.name}</p>
                  <div className="relative mt-2 flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1 text-[11px] tabular-nums text-ink-tertiary">
                      <Clock className="w-3 h-3 text-ink-muted" /> {timeAgo(wf.updatedAt)}
                    </span>
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-brand-cyan-400 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                      Open <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
};

export default BuilderHubPage;