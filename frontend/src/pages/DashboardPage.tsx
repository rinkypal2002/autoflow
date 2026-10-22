import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Workflow,
  FolderTree,
  LayoutGrid,
  Bot,
  Plus,
  ArrowRight,
  Clock,
  Activity,
  Cpu,
  PlayCircle,
  FilePlus2,
  Sparkles,
  TrendingUp,
  BarChart3,
  PieChart,
  CircleDot,
} from 'lucide-react';
import AppShell from '../components/layout/AppShell';
import {
  Card,
  CardHeader,
  Button,
  StatusPill,
  Badge,
  EmptyState,
  Skeleton,
  SkeletonCard,
  cn,
} from '../components/ui';
import { SERVICES } from '../config/services';
import { automationCategories } from '../data/automationCategories';
import { AGENTS } from './agents/data';
import type { Tone } from '../components/ui';

/* ────────────────────────────────────────────────────────────────────────── */
/*  Types & helpers                                                            */
/* ────────────────────────────────────────────────────────────────────────── */

interface WorkflowRow {
  id: string;
  name: string;
  parentId?: string;
  status?: string;
  updatedAt?: string;
}

const STATUS_TONE: Record<string, Tone> = {
  active: 'success',
  paused: 'warning',
  draft: 'neutral',
};

// Hex tokens (mirror tailwind.config.js) for SVG/inline-styled chart fills.
const C = {
  cyan: '#22D3EE',
  cyanDeep: '#06B6D4',
  indigo: '#818CF8',
  indigoDeep: '#6366F1',
  success: '#10B981',
  warning: '#F59E0B',
  draft: '#6B7A8D',
  track: 'rgba(255,255,255,0.06)',
};

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

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  Charts (dependency-free; pure SVG / CSS)                                   */
/* ────────────────────────────────────────────────────────────────────────── */

type DonutSegment = { key: string; label: string; value: number; color: string };

/** Donut / pie chart rendered with stacked stroked arcs. */
const Donut: React.FC<{ segments: DonutSegment[]; total: number; size?: number; thickness?: number }> = ({
  segments,
  total,
  size = 150,
  thickness = 15,
}) => {
  const r = (size - thickness) / 2;
  const circ = 2 * Math.PI * r;
  const cx = size / 2;
  const cy = size / 2;
  let offset = 0;
  return (
    <div
      role="img"
      aria-label={`${total} workflow${total === 1 ? '' : 's'}: ${segments.map((s) => `${s.value} ${s.label.toLowerCase()}`).join(', ')}`}
      className="relative grid place-items-center"
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={C.track} strokeWidth={thickness} />
        {total > 0 &&
          segments.map((s) => {
            if (s.value <= 0) return null;
            const len = (s.value / total) * circ;
            const node = (
              <circle
                key={s.key}
                cx={cx}
                cy={cy}
                r={r}
                fill="none"
                stroke={s.color}
                strokeWidth={thickness}
                strokeDasharray={`${len} ${circ - len}`}
                strokeDashoffset={-offset}
              >
                <title>{`${s.label}: ${s.value}`}</title>
              </circle>
            );
            offset += len;
            return node;
          })}
      </svg>
      <div className="absolute inset-0 grid place-items-center">
        <div className="text-center">
          <div className="text-[26px] leading-none font-bold font-mono tabular-nums text-ink-primary">{total}</div>
          <div className="mt-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-tertiary">
            workflow{total === 1 ? '' : 's'}
          </div>
        </div>
      </div>
    </div>
  );
};

/** Vertical bar chart (CSS-based; scales cleanly at any width). */
const BarsChart: React.FC<{ data: Array<{ label: string; count: number }>; suffix?: string }> = ({
  data,
  suffix = 'updated',
}) => {
  const max = Math.max(1, ...data.map((d) => d.count));
  const peak = Math.max(...data.map((d) => d.count));
  return (
    <div>
      <div className="relative h-44">
        {/* gridlines */}
        {[0, 1, 2, 3].map((i) => (
          <div key={i} aria-hidden="true" className="absolute inset-x-0 border-t border-white/[0.05]" style={{ top: `${(i / 3) * 100}%` }} />
        ))}
        {/* bars */}
        <div className="absolute inset-0 flex items-end justify-between gap-2 pb-px">
          {data.map((d, i) => (
            <div key={i} className="group flex-1 h-full flex flex-col items-center justify-end">
              <div className="relative w-full flex justify-center">
                <div
                  className="w-full max-w-[30px] rounded-t-md bg-gradient-to-t from-brand-cyan-500/30 to-brand-cyan-400 transition-all duration-200 ease-std group-hover:from-brand-cyan-500/50 group-hover:to-brand-cyan-300"
                  style={{ height: `${(d.count / max) * 150}px`, minHeight: d.count > 0 ? 6 : 2 }}
                >
                  <span className="pointer-events-none absolute -top-5 left-1/2 -translate-x-1/2 text-[10px] font-mono font-bold text-ink-secondary opacity-0 group-hover:opacity-100 transition-opacity">
                    {d.count}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
      {/* x labels */}
      <div className="mt-2 flex items-center justify-between gap-2">
        {data.map((d, i) => (
          <span key={i} className="flex-1 text-center text-[10px] font-semibold text-ink-tertiary">
            {d.label}
          </span>
        ))}
      </div>
      <p className="mt-3 text-[11px] text-ink-muted">
        Peak: <span className="font-mono font-bold tabular-nums text-ink-secondary">{peak}</span> {suffix} in a day · last 7 days
      </p>
    </div>
  );
};

/** Horizontal bar list (for ranked categories). */
const BarList: React.FC<{ items: Array<{ label: string; value: number }>; color: string }> = ({ items, color }) => {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <div className="space-y-2.5">
      {items.map((it, i) => (
        <div key={i} className="flex items-center gap-3">
          <span className="w-32 truncate text-[12px] font-medium text-ink-secondary" title={it.label}>
            {it.label}
          </span>
          <div className="flex-1 h-2.5 rounded-full bg-white/5 overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500 ease-std"
              style={{ width: `${(it.value / max) * 100}%`, background: color }}
            />
          </div>
          <span className="w-7 text-right text-[12px] font-mono font-bold text-ink-primary tabular-nums">{it.value}</span>
        </div>
      ))}
    </div>
  );
};

/* ────────────────────────────────────────────────────────────────────────── */
/*  Enhanced metric card (Dashboard-local)                                     */
/* ────────────────────────────────────────────────────────────────────────── */

type MetricTone = 'cyan' | 'indigo' | 'success' | 'warning';

const METRIC_TONE: Record<MetricTone, { bar: string; icon: string; chip: string; glow: string; ring: string }> = {
  cyan: { bar: 'from-brand-cyan-500 to-brand-cyan-400', icon: 'text-brand-cyan-400', chip: 'bg-brand-cyan-500/10 border-brand-cyan-500/20', glow: 'bg-brand-cyan-500/10', ring: 'focus-visible:ring-brand-cyan-500/40' },
  indigo: { bar: 'from-brand-indigo-500 to-brand-indigo-400', icon: 'text-brand-indigo-400', chip: 'bg-brand-indigo-500/10 border-brand-indigo-500/20', glow: 'bg-brand-indigo-500/10', ring: 'focus-visible:ring-brand-indigo-500/40' },
  success: { bar: 'from-success-500 to-success-400', icon: 'text-success-400', chip: 'bg-success-500/10 border-success-500/20', glow: 'bg-success-500/10', ring: 'focus-visible:ring-success-500/40' },
  warning: { bar: 'from-warning-500 to-warning-400', icon: 'text-warning-400', chip: 'bg-warning-500/10 border-warning-500/20', glow: 'bg-warning-500/10', ring: 'focus-visible:ring-warning-500/40' },
};

const Metric: React.FC<{
  label: string;
  value: React.ReactNode;
  icon: React.ReactNode;
  hint?: React.ReactNode;
  tone?: MetricTone;
  danger?: boolean;
  onClick?: () => void;
  delay?: number;
}> = ({ label, value, icon, hint, tone = 'cyan', danger, onClick, delay = 0 }) => {
  const t = METRIC_TONE[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ animationDelay: `${delay}ms` }}
      className={cn(
        'group relative overflow-hidden rounded-xl border border-white/[0.06] bg-surface-2 p-4 text-left shadow-e1 outline-none motion-safe:animate-fade-in',
        onClick && 'transition-all duration-200 ease-std cursor-pointer hover:border-white/[0.12] hover:shadow-e2 motion-safe:hover:-translate-y-0.5 focus-visible:ring-2',
        onClick && t.ring
      )}
    >
      <span aria-hidden="true" className={cn('absolute left-0 top-0 h-full w-[3px] bg-gradient-to-b', t.bar)} />
      <span aria-hidden="true" className={cn('pointer-events-none absolute -top-10 -right-8 w-28 h-28 rounded-full blur-2xl opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity duration-300', t.glow)} />
      <div className="relative flex items-center justify-between">
        <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-ink-tertiary">{label}</span>
        <span className={cn('grid h-7 w-7 place-items-center rounded-lg border', t.chip)}>
          <span className={t.icon}>{icon}</span>
        </span>
      </div>
      <div className="relative mt-3 text-[30px] leading-none font-bold font-mono tabular-nums text-ink-primary">{value}</div>
      {hint ? (
        <div className={cn('relative mt-2 text-[12px] font-medium', danger ? 'text-danger-400' : 'text-ink-tertiary')}>{hint}</div>
      ) : null}
    </button>
  );
};

/* ────────────────────────────────────────────────────────────────────────── */
/*  Page                                                                       */
/* ────────────────────────────────────────────────────────────────────────── */

const DashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [reachable, setReachable] = useState(true);
  const [workflows, setWorkflows] = useState<WorkflowRow[]>([]);
  const [folderCount, setFolderCount] = useState<number | null>(null);

  const pluginCount = useMemo(
    () => automationCategories.reduce((sum, c) => sum + (c.actions?.length ?? 0), 0),
    []
  );
  const activeAgents = useMemo(() => AGENTS.filter((a) => a.status === 'active'), []);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`${SERVICES.nodeApiBase}/workspace/tree`);
        if (!res.ok) throw new Error('unavailable');
        const data = await res.json();
        if (!active) return;
        const wf: WorkflowRow[] = Object.values(data.workflows ?? {});
        const folders = Object.values(data.folders ?? {}).filter((f: any) => f.id !== 'root');
        setWorkflows(wf);
        setFolderCount(folders.length);
        setReachable(true);
      } catch {
        if (!active) return;
        setReachable(false);
        setWorkflows([]);
        setFolderCount(null);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const recent = useMemo(
    () =>
      [...workflows]
        .sort((a, b) => (Date.parse(b.updatedAt ?? '') || 0) - (Date.parse(a.updatedAt ?? '') || 0))
        .slice(0, 5),
    [workflows]
  );

  const total = workflows.length;

  // Status distribution (real).
  const dist = useMemo(() => {
    const c = { active: 0, paused: 0, draft: 0 };
    for (const wf of workflows) {
      const s = (wf.status as keyof typeof c) ?? 'draft';
      if (s in c) c[s] += 1;
      else c.draft += 1;
    }
    return c;
  }, [workflows]);

  const donutSegments: DonutSegment[] = [
    { key: 'active', label: 'Active', value: dist.active, color: C.success },
    { key: 'paused', label: 'Paused', value: dist.paused, color: C.warning },
    { key: 'draft', label: 'Draft', value: dist.draft, color: C.draft },
  ];

  // 7-day edit activity (real — bucketed from updatedAt).
  const activity7 = useMemo(() => {
    const days: Array<{ label: string; count: number; key: string }> = [];
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      d.setHours(0, 0, 0, 0);
      days.push({ label: d.toLocaleDateString(undefined, { weekday: 'short' }).charAt(0), count: 0, key: d.toISOString().slice(0, 10) });
    }
    for (const wf of workflows) {
      if (!wf.updatedAt) continue;
      const dt = new Date(wf.updatedAt);
      if (Number.isNaN(dt.getTime())) continue;
      dt.setHours(0, 0, 0, 0);
      const key = dt.toISOString().slice(0, 10);
      const slot = days.find((x) => x.key === key);
      if (slot) slot.count += 1;
    }
    return days;
  }, [workflows]);

  // Top automation categories by plugin count (real — static catalogue).
  const topCats = useMemo(
    () =>
      [...automationCategories]
        .map((c) => ({ label: c.name, value: c.actions?.length ?? 0 }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 6),
    []
  );

  const quickActions = [
    { label: 'New workflow', icon: FilePlus2, onClick: () => navigate('/workspace/editor'), primary: true },
    { label: 'Browse catalogue', icon: LayoutGrid, onClick: () => navigate('/catalogue') },
    { label: 'Open directory', icon: FolderTree, onClick: () => navigate('/workspace') },
    { label: 'Engine monitor', icon: Cpu, onClick: () => navigate('/system/engine-monitor') },
  ];

  return (
    <AppShell
      title="Dashboard"
      headerActions={
        <Button variant="primary" size="md" leftIcon={<Plus className="w-4 h-4" />} onClick={() => navigate('/workspace/editor')}>
          New workflow
        </Button>
      }
    >
      <div className="max-w-[1600px] mx-auto space-y-6">
        {/* ── Hero band (no engine status here — it lives once in System health) ── */}
        <div className="relative overflow-hidden rounded-2xl border border-white/[0.07] bg-surface-2 shadow-e2 motion-safe:animate-fade-in">
          <div aria-hidden="true" className="pointer-events-none absolute inset-0">
            <div className="absolute inset-0 bg-[radial-gradient(120%_140%_at_0%_0%,rgba(99,102,241,0.12)_0%,transparent_55%),radial-gradient(120%_140%_at_100%_100%,rgba(6,182,212,0.10)_0%,transparent_55%)]" />
            <div className="absolute -top-24 right-24 h-72 w-72 rounded-full bg-brand-cyan-500/[0.08] blur-3xl" />
          </div>
          <div className="relative px-6 py-6 sm:px-8 sm:py-7 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-brand-cyan-400/90">
                <Sparkles className="w-3.5 h-3.5" /> Workspace overview
              </div>
              <h1 className="mt-2 text-[24px] sm:text-[27px] font-extrabold text-ink-primary tracking-tight">
                {greeting()} — welcome to AutoFlow
              </h1>
              <p className="mt-1.5 max-w-xl text-[13px] leading-relaxed text-ink-secondary">
                {reachable
                  ? 'Your automation command center. Resume recent work, monitor activity, or build something new.'
                  : 'Connect your workspace backend to see live workflows, folders, and activity here.'}
              </p>
            </div>

            {/* Headline stat + mini sparkline (real data, no engine wording) */}
            <div className="shrink-0 w-full lg:w-auto">
              <div className="rounded-xl border border-white/[0.08] bg-surface-3/50 px-5 py-4 shadow-e1 backdrop-blur-sm">
                <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-ink-tertiary">Workflows</p>
                <div className="mt-1.5 flex items-end gap-3">
                  <span className="text-[34px] leading-none font-bold font-mono tabular-nums text-ink-primary">{reachable ? total : '—'}</span>
                  <span className="mb-1 text-[12px] text-ink-tertiary">
                    <span className="font-bold tabular-nums text-success-400">{dist.active}</span> active
                  </span>
                </div>
                <div className="mt-3 flex items-end gap-1 h-8" aria-hidden>
                  {activity7.map((d, i) => {
                    const m = Math.max(1, ...activity7.map((x) => x.count));
                    return (
                      <div
                        key={i}
                        className="w-2 rounded-sm bg-gradient-to-t from-brand-cyan-500/40 to-brand-cyan-400/90"
                        style={{ height: `${Math.max(8, (d.count / m) * 100)}%` }}
                        title={`${d.count} updated`}
                      />
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Metrics ───────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {loading ? (
            Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)
          ) : (
            <>
              <Metric label="Workflows" value={reachable ? total : '—'} icon={<Workflow className="w-4 h-4" />} hint={reachable ? 'in active workspace' : 'workspace offline'} tone="cyan" danger={!reachable} onClick={() => navigate('/workspace')} delay={0} />
              <Metric label="Folders" value={folderCount ?? '—'} icon={<FolderTree className="w-4 h-4" />} hint={reachable ? 'organising your work' : 'workspace offline'} tone="indigo" danger={!reachable} onClick={() => navigate('/workspace')} delay={60} />
              <Metric label="Active agents" value={activeAgents.length} icon={<Bot className="w-4 h-4" />} hint={`of ${AGENTS.length} available`} tone="warning" onClick={() => navigate('/agents')} delay={120} />
              <Metric label="Plugins" value={pluginCount} icon={<LayoutGrid className="w-4 h-4" />} hint={`across ${automationCategories.length} categories`} tone="success" onClick={() => navigate('/catalogue')} delay={180} />
            </>
          )}
        </div>

        {/* ── Charts row: activity (graph) + status (pie) ───────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card padded className="lg:col-span-2 motion-safe:animate-fade-in">
            <CardHeader>
              <h2 className="flex items-center gap-2 text-[14px] font-bold tracking-tight text-ink-primary">
                <TrendingUp className="w-4 h-4 text-brand-cyan-400" /> Activity — last 7 days
              </h2>
              <Badge tone="brand" pill>{activity7.reduce((s, d) => s + d.count, 0)} updates</Badge>
            </CardHeader>
            {loading ? (
              <Skeleton className="h-44 w-full" />
            ) : !reachable ? (
              <EmptyState icon={<Activity className="w-5 h-5" />} title="Workspace offline" description="Connect the backend to chart recent activity." />
            ) : (
              <BarsChart data={activity7} />
            )}
          </Card>

          <Card padded className="motion-safe:animate-fade-in">
            <CardHeader>
              <h2 className="flex items-center gap-2 text-[14px] font-bold tracking-tight text-ink-primary">
                <PieChart className="w-4 h-4 text-brand-indigo-400" /> Workflow status
              </h2>
            </CardHeader>
            {loading ? (
              <div className="flex flex-col items-center gap-4">
                <Skeleton className="h-[150px] w-[150px]" rounded="full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : !reachable ? (
              <EmptyState icon={<PieChart className="w-5 h-5" />} title="Workspace offline" description="Connect the backend to see status." />
            ) : (
              <div className="flex flex-col items-center">
                <Donut segments={donutSegments} total={total} />
                <div className="mt-5 w-full grid grid-cols-3 gap-2">
                  {donutSegments.map((s) => (
                    <div key={s.key} className="rounded-lg border border-white/[0.06] bg-surface-3/40 px-2 py-2 text-center">
                      <div className="flex items-center justify-center gap-1.5 text-[11px] font-semibold text-ink-tertiary">
                        <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full" style={{ background: s.color }} /> {s.label}
                      </div>
                      <div className="mt-1 text-[16px] leading-none font-bold font-mono tabular-nums text-ink-primary">{s.value}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>
        </div>

        {/* ── Main grid ─────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left column */}
          <div className="lg:col-span-2 space-y-6">
            <Card padded className="motion-safe:animate-fade-in">
              <CardHeader>
                <h2 className="flex items-center gap-2 text-[14px] font-bold tracking-tight text-ink-primary">
                  <Clock className="w-4 h-4 text-ink-tertiary" /> Recent workflows
                </h2>
                <Button variant="ghost" size="sm" rightIcon={<ArrowRight className="w-3.5 h-3.5" />} onClick={() => navigate('/workspace')}>
                  View all
                </Button>
              </CardHeader>
              {loading ? (
                <div className="space-y-2">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : !reachable ? (
                <EmptyState
                  icon={<Activity className="w-5 h-5" />}
                  title="Workspace backend unreachable"
                  description="Start the backend and select a workspace in Directory to see your workflows here."
                  action={<Button variant="secondary" size="sm" onClick={() => navigate('/workspace')}>Go to Directory</Button>}
                />
              ) : recent.length === 0 ? (
                <EmptyState
                  icon={<Workflow className="w-5 h-5" />}
                  title="No workflows yet"
                  description="Create your first workflow to start automating."
                  action={<Button variant="primary" size="sm" leftIcon={<Plus className="w-4 h-4" />} onClick={() => navigate('/workspace/editor')}>New workflow</Button>}
                />
              ) : (
                <div className="flex flex-col divide-y divide-white/[0.04]">
                  {recent.map((wf) => (
                    <button
                      key={wf.id}
                      onClick={() => navigate(`/workspace/editor/${wf.id}`)}
                      className="group -mx-2 flex items-center gap-3 rounded-lg px-2 py-3 text-left outline-none transition-colors hover:bg-white/[0.03] focus-visible:bg-white/[0.04] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-cyan-500/40"
                    >
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-brand-cyan-500/20 bg-gradient-to-br from-brand-cyan-500/[0.16] to-brand-indigo-500/[0.06] transition-colors group-hover:border-brand-cyan-500/40">
                        <Workflow className="w-4 h-4 text-brand-cyan-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="truncate text-[13px] font-semibold tracking-tight text-ink-primary transition-colors group-hover:text-white">{wf.name}</p>
                        <p className="mt-0.5 flex items-center gap-1.5 text-[11px] tabular-nums text-ink-tertiary">
                          <Clock className="w-3 h-3 text-ink-muted" /> {timeAgo(wf.updatedAt)}
                        </p>
                      </div>
                      <Badge tone={STATUS_TONE[wf.status ?? 'draft'] ?? 'neutral'}>{wf.status ?? 'draft'}</Badge>
                      <ArrowRight className="w-4 h-4 shrink-0 text-ink-muted transition-all group-hover:translate-x-0.5 group-hover:text-brand-cyan-400" />
                    </button>
                  ))}
                </div>
              )}
            </Card>

            {/* Top categories — horizontal bar graph (real catalogue data) */}
            <Card padded className="motion-safe:animate-fade-in">
              <CardHeader>
                <h2 className="flex items-center gap-2 text-[14px] font-bold tracking-tight text-ink-primary">
                  <BarChart3 className="w-4 h-4 text-brand-indigo-400" /> Top plugin categories
                </h2>
                <Button variant="ghost" size="sm" rightIcon={<ArrowRight className="w-3.5 h-3.5" />} onClick={() => navigate('/catalogue')}>
                  Catalogue
                </Button>
              </CardHeader>
              <BarList items={topCats} color={`linear-gradient(90deg, ${C.indigoDeep}, ${C.indigo})`} />
            </Card>
          </div>

          {/* Right column */}
          <div className="space-y-6">
            {/* The single, authoritative Engine status on this page */}
            <Card padded className="motion-safe:animate-fade-in">
              <CardHeader>
                <h2 className="flex items-center gap-2 text-[14px] font-bold tracking-tight text-ink-primary">
                  <Activity className="w-4 h-4 text-ink-tertiary" /> System health
                </h2>
              </CardHeader>
              <div className="space-y-2.5">
                <div className="flex items-center gap-3 rounded-lg border border-white/[0.06] bg-surface-3/40 px-3 py-2.5">
                  <Cpu className="w-4 h-4 text-ink-tertiary" />
                  <span className="flex-1 text-[13px] text-ink-secondary">Engine</span>
                  <StatusPill tone={reachable ? 'success' : 'danger'} label={reachable ? 'Connected' : 'Unreachable'} pulse={!reachable} />
                </div>
                {activeAgents.map((a) => {
                  const Icon = a.icon;
                  return (
                    <div key={a.id} className="flex items-center gap-3 rounded-lg border border-white/[0.06] bg-surface-3/40 px-3 py-2.5">
                      <Icon className="w-4 h-4 text-ink-tertiary" />
                      <span className="flex-1 text-[13px] text-ink-secondary truncate">{a.name}</span>
                      <StatusPill tone="success" label="Active" />
                    </div>
                  );
                })}
                <Button variant="ghost" size="sm" className="w-full justify-center" rightIcon={<ArrowRight className="w-3.5 h-3.5" />} onClick={() => navigate('/system/engine-monitor')}>
                  Open Engine Monitor
                </Button>
              </div>
            </Card>

            <Card padded className="motion-safe:animate-fade-in">
              <CardHeader>
                <h2 className="flex items-center gap-2 text-[14px] font-bold tracking-tight text-ink-primary">
                  <Sparkles className="w-4 h-4 text-ink-tertiary" /> Quick actions
                </h2>
              </CardHeader>
              <div className="grid grid-cols-2 gap-2">
                {quickActions.map((qa) => {
                  const Icon = qa.icon;
                  return (
                    <button
                      key={qa.label}
                      onClick={qa.onClick}
                      className={cn(
                        'group flex flex-col items-start gap-2 rounded-xl border p-3 text-left outline-none transition-all duration-200 ease-std motion-safe:hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-brand-cyan-500/40',
                        qa.primary
                          ? 'bg-brand-cyan-500/10 border-brand-cyan-500/20 hover:bg-brand-cyan-500/15 hover:border-brand-cyan-500/40'
                          : 'bg-surface-3/50 border-white/[0.06] hover:bg-white/[0.05] hover:border-white/[0.12]'
                      )}
                    >
                      <Icon className={cn('w-4 h-4 transition-transform motion-safe:group-hover:scale-110', qa.primary ? 'text-brand-cyan-400' : 'text-ink-secondary')} />
                      <span className={cn('text-[12px] font-semibold', qa.primary ? 'text-brand-cyan-400' : 'text-ink-primary')}>{qa.label}</span>
                    </button>
                  );
                })}
              </div>
            </Card>

            <Card padded className="motion-safe:animate-fade-in">
              <CardHeader>
                <h2 className="flex items-center gap-2 text-[14px] font-bold tracking-tight text-ink-primary">
                  <CircleDot className="w-4 h-4 text-ink-tertiary" /> Recent runs
                </h2>
              </CardHeader>
              <EmptyState
                icon={<PlayCircle className="w-5 h-5" />}
                title="No runs recorded"
                description="Execution results will appear here after you run a workflow."
              />
            </Card>
          </div>
        </div>
      </div>
    </AppShell>
  );
};

export default DashboardPage;