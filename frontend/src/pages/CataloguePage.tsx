import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as Icons from 'lucide-react';
import { LayoutGrid, Search, ArrowRight, Lock, Zap, Plug, Code2 } from 'lucide-react';
import AppShell from '../components/layout/AppShell';
import {
  PageHeader,
  Card,
  Button,
  Badge,
  Select,
  Field,
  Tabs,
  Drawer,
  EmptyState,
  cn,
} from '../components/ui';
import type { Tone } from '../components/ui';
import { automationCategories } from '../data/automationCategories';
import type { AutomationCategory } from '../types/workflow';
import { resolveEngineUrl } from '../config/services';
import { loadPluginMappings } from '../lib/pluginMappingApi';
import {
  comparePluginMappings,
  createPluginMappingShadowFailure,
  persistPluginMappingShadowReport,
} from '../lib/pluginMappingParity';
import {
  PLUGIN_MAPPING_MODE,
  isPluginMappingShadowEnabled,
} from '../lib/pluginMappingMode';

type CatAction = AutomationCategory['actions'][number];

/** Literal class strings so Tailwind generates per-category accent colors. */
const HUE: Record<string, { tile: string; icon: string }> = {
  blue: { tile: 'bg-blue-500/10 border-blue-500/20', icon: 'text-blue-400' },
  sky: { tile: 'bg-sky-500/10 border-sky-500/20', icon: 'text-sky-400' },
  cyan: { tile: 'bg-cyan-500/10 border-cyan-500/20', icon: 'text-cyan-400' },
  indigo: { tile: 'bg-indigo-500/10 border-indigo-500/20', icon: 'text-indigo-400' },
  violet: { tile: 'bg-violet-500/10 border-violet-500/20', icon: 'text-violet-400' },
  purple: { tile: 'bg-purple-500/10 border-purple-500/20', icon: 'text-purple-400' },
  emerald: { tile: 'bg-emerald-500/10 border-emerald-500/20', icon: 'text-emerald-400' },
  teal: { tile: 'bg-teal-500/10 border-teal-500/20', icon: 'text-teal-400' },
  green: { tile: 'bg-green-500/10 border-green-500/20', icon: 'text-green-400' },
  amber: { tile: 'bg-amber-500/10 border-amber-500/20', icon: 'text-amber-400' },
  orange: { tile: 'bg-orange-500/10 border-orange-500/20', icon: 'text-orange-400' },
  rose: { tile: 'bg-rose-500/10 border-rose-500/20', icon: 'text-rose-400' },
  pink: { tile: 'bg-pink-500/10 border-pink-500/20', icon: 'text-pink-400' },
  red: { tile: 'bg-red-500/10 border-red-500/20', icon: 'text-red-400' },
  slate: { tile: 'bg-slate-500/10 border-slate-500/20', icon: 'text-slate-400' },
};

function hueOf(color?: string): { tile: string; icon: string } {
  const m = /bg-([a-z]+)-\d+/.exec(color || '');
  return HUE[m?.[1] ?? 'cyan'] ?? HUE.cyan;
}

function getIcon(name?: string): React.ComponentType<{ className?: string }> {
  const Comp = (Icons as Record<string, any>)[name || ''];
  return Comp || Plug;
}

const COMPLEXITY_TONE: Record<string, Tone> = {
  basic: 'success',
  intermediate: 'warning',
  advanced: 'danger',
};

const CataloguePage: React.FC = () => {
  const navigate = useNavigate();
  const [view, setView] = useState<'categories' | 'actions'>('categories');
  const [query, setQuery] = useState('');
  const [categoryId, setCategoryId] = useState<string>('all');
  const [complexity, setComplexity] = useState<string>('all');
  const [auth, setAuth] = useState<string>('all');
  const [selected, setSelected] = useState<{ action: CatAction; category: AutomationCategory } | null>(null);

  useEffect(() => {
    if (!isPluginMappingShadowEnabled()) return;
    let cancelled = false;

    void loadPluginMappings({ mode: PLUGIN_MAPPING_MODE.effective })
      .then((result) => {
        if (cancelled || result.status !== 'loaded') return;
        const report = comparePluginMappings({
          mode: PLUGIN_MAPPING_MODE,
          categories: automationCategories,
          mappings: result.response.mappings,
        });
        persistPluginMappingShadowReport(report);
        console.info('[AutoFlow plugin-mapping shadow]', report.summary, report);
      })
      .catch((error) => {
        if (cancelled) return;
        const report = createPluginMappingShadowFailure({
          mode: PLUGIN_MAPPING_MODE,
          error,
        });
        persistPluginMappingShadowReport(report);
        console.warn('[AutoFlow plugin-mapping shadow]', report);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const totalActions = useMemo(
    () => automationCategories.reduce((s, c) => s + (c.actions?.length ?? 0), 0),
    []
  );

  // Flatten actions with their category for the "All actions" view.
  const allActions = useMemo(
    () =>
      automationCategories.flatMap((cat) =>
        (cat.actions ?? []).map((action) => ({ action, category: cat }))
      ),
    []
  );

  const filteredActions = useMemo(() => {
    const q = query.trim().toLowerCase();
    return allActions.filter(({ action, category }) => {
      if (categoryId !== 'all' && category.id !== categoryId) return false;
      if (complexity !== 'all' && (action.complexity ?? 'basic') !== complexity) return false;
      if (auth === 'required' && !action.requiresAuth) return false;
      if (auth === 'none' && action.requiresAuth) return false;
      if (!q) return true;
      const hay = `${action.name} ${action.description} ${(action.tags ?? []).join(' ')} ${category.name}`.toLowerCase();
      return hay.includes(q);
    });
  }, [allActions, query, categoryId, complexity, auth]);

  const activeView = query.trim() || categoryId !== 'all' || complexity !== 'all' || auth !== 'all' ? 'actions' : view;

  const openCategory = (cat: AutomationCategory) => {
    setCategoryId(cat.id);
    setView('actions');
  };

  return (
    <AppShell title="Catalogue" searchValue={query} onSearchChange={setQuery} searchPlaceholder="Search plugins…">
      <div className="max-w-[1600px] mx-auto space-y-6">
        <PageHeader
          title="Catalogue"
          subtitle={`${totalActions} plugin actions across ${automationCategories.length} categories`}
          badge={<Badge tone="brand" pill>{totalActions}</Badge>}
        />

        {/* Controls */}
        <div className="flex flex-col lg:flex-row lg:items-end gap-3">
          <Tabs
            tabs={[
              { id: 'categories', label: 'Categories', count: automationCategories.length },
              { id: 'actions', label: 'All actions', count: totalActions },
            ]}
            value={activeView}
            onChange={(id) => {
              setView(id as 'categories' | 'actions');
              if (id === 'categories') {
                setCategoryId('all');
                setComplexity('all');
                setAuth('all');
                setQuery('');
              }
            }}
            className="flex-1"
          />
          <div className="flex items-end gap-2">
            <Field className="w-44">
              <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} aria-label="Category">
                <option value="all">All categories</option>
                {automationCategories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field className="w-36">
              <Select value={complexity} onChange={(e) => setComplexity(e.target.value)} aria-label="Complexity">
                <option value="all">Any complexity</option>
                <option value="basic">Basic</option>
                <option value="intermediate">Intermediate</option>
                <option value="advanced">Advanced</option>
              </Select>
            </Field>
            <Field className="w-32">
              <Select value={auth} onChange={(e) => setAuth(e.target.value)} aria-label="Auth">
                <option value="all">Any auth</option>
                <option value="required">Requires auth</option>
                <option value="none">No auth</option>
              </Select>
            </Field>
          </div>
        </div>

        {/* Body */}
        {activeView === 'categories' ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {automationCategories.map((cat) => {
              const Icon = getIcon(cat.icon);
              const hue = hueOf(cat.color);
              return (
                <Card key={cat.id} interactive onClick={() => openCategory(cat)} className="flex flex-col">
                  <div className="flex items-start gap-3">
                    <div className={cn('w-11 h-11 rounded-xl border flex items-center justify-center shrink-0', hue.tile)}>
                      <Icon className={cn('w-5 h-5', hue.icon)} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="text-[14px] font-bold text-ink-primary truncate">{cat.name}</h3>
                        {cat.metadata?.featured ? <Badge tone="brand">Featured</Badge> : null}
                      </div>
                      <p className="text-[12px] text-ink-tertiary line-clamp-2 mt-0.5">{cat.description}</p>
                    </div>
                  </div>
                  <div className="mt-4 pt-3 border-t border-white/[0.04] flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-ink-tertiary">{cat.actions?.length ?? 0} actions</span>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-brand-cyan-400 flex items-center gap-1">
                      Browse <ArrowRight className="w-3.5 h-3.5" />
                    </span>
                  </div>
                </Card>
              );
            })}
          </div>
        ) : filteredActions.length === 0 ? (
          <EmptyState
            icon={<Search className="w-5 h-5" />}
            title="No actions match"
            description="Try a different search term or clear the filters."
            action={
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setQuery('');
                  setCategoryId('all');
                  setComplexity('all');
                  setAuth('all');
                }}
              >
                Clear filters
              </Button>
            }
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {filteredActions.map(({ action, category }) => {
              const Icon = getIcon(action.icon || category.icon);
              const hue = hueOf(category.color);
              return (
                <button
                  key={`${category.id}-${action.type}`}
                  onClick={() => setSelected({ action, category })}
                  className="text-left bg-surface-2 border border-white/[0.06] rounded-lg p-4 transition-all duration-150 hover:border-brand-cyan-500/30 hover:shadow-e2 hover:-translate-y-0.5 group"
                >
                  <div className="flex items-start gap-3">
                    <div className={cn('w-9 h-9 rounded-lg border flex items-center justify-center shrink-0', hue.tile)}>
                      <Icon className={cn('w-4 h-4', hue.icon)} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-[13px] font-bold text-ink-primary truncate group-hover:text-white">{action.name}</h3>
                      <p className="text-[11px] text-ink-tertiary truncate">{category.name}</p>
                    </div>
                  </div>
                  <p className="text-[12px] text-ink-secondary line-clamp-2 mt-2.5">{action.description}</p>
                  <div className="mt-3 flex items-center gap-1.5 flex-wrap">
                    <Badge tone={COMPLEXITY_TONE[action.complexity ?? 'basic'] ?? 'neutral'}>{action.complexity ?? 'basic'}</Badge>
                    {action.requiresAuth ? (
                      <Badge tone="warning">
                        <Lock className="w-2.5 h-2.5" /> Auth
                      </Badge>
                    ) : null}
                    {action.retryable ? (
                      <Badge tone="info">
                        <Zap className="w-2.5 h-2.5" /> Retryable
                      </Badge>
                    ) : null}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Detail drawer */}
      <Drawer
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected?.action.name}
        subtitle={selected?.category.name}
        headerAccessory={
          selected ? (
            <div className={cn('w-10 h-10 rounded-lg border flex items-center justify-center shrink-0', hueOf(selected.category.color).tile)}>
              {React.createElement(getIcon(selected.action.icon || selected.category.icon), {
                className: cn('w-5 h-5', hueOf(selected.category.color).icon),
              })}
            </div>
          ) : undefined
        }
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setSelected(null)}>
              Close
            </Button>
            <Button variant="primary" size="sm" leftIcon={<ArrowRight className="w-4 h-4" />} onClick={() => navigate('/workspace')}>
              Use in Builder
            </Button>
          </div>
        }
      >
        {selected ? (
          <div className="space-y-5">
            <p className="text-[13px] text-ink-secondary leading-relaxed">{selected.action.description}</p>

            <div className="flex flex-wrap gap-1.5">
              <Badge tone={COMPLEXITY_TONE[selected.action.complexity ?? 'basic'] ?? 'neutral'}>
                {selected.action.complexity ?? 'basic'}
              </Badge>
              <Badge tone={selected.action.requiresAuth ? 'warning' : 'neutral'}>
                <Lock className="w-2.5 h-2.5" /> {selected.action.requiresAuth ? 'Requires auth' : 'No auth'}
              </Badge>
              {selected.action.retryable ? (
                <Badge tone="info">
                  <Zap className="w-2.5 h-2.5" /> Retryable
                </Badge>
              ) : null}
              {typeof selected.action.timeout === 'number' && selected.action.timeout > 0 ? (
                <Badge tone="neutral">timeout {selected.action.timeout}ms</Badge>
              ) : null}
            </div>

            {selected.action.api?.url ? (
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-ink-tertiary mb-2 flex items-center gap-1.5">
                  <Code2 className="w-3.5 h-3.5" /> Endpoint
                </p>
                <div className="bg-surface-3 border border-white/10 rounded-md p-3 font-mono text-[11px] break-all">
                  <span className="text-brand-cyan-400 font-bold">{(selected.action.api.method || 'POST').toUpperCase()}</span>{' '}
                  <span className="text-ink-secondary">{resolveEngineUrl(selected.action.api.url)}</span>
                </div>
              </div>
            ) : null}

            {selected.action.tags && selected.action.tags.length > 0 ? (
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-ink-tertiary mb-2">Tags</p>
                <div className="flex flex-wrap gap-1.5">
                  {selected.action.tags.map((t) => (
                    <span key={t} className="text-[11px] font-medium text-ink-secondary bg-white/5 border border-white/5 rounded px-2 py-0.5">
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="rounded-md bg-info-500/5 border border-info-500/15 p-3">
              <p className="text-[11px] text-ink-tertiary leading-relaxed">
                <LayoutGrid className="w-3 h-3 inline mr-1 -mt-0.5" />
                Catalogue is a discovery view. Execution and credentials are configured in the Builder; plugin behavior is unchanged.
              </p>
            </div>
          </div>
        ) : null}
      </Drawer>
    </AppShell>
  );
};

export default CataloguePage;
