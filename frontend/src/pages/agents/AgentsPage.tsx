import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Bot, CheckCircle2, Clock, SearchX } from 'lucide-react';
import AppShell from '../../components/layout/AppShell';
import { AGENTS } from './data';
import type { AgentDefinition } from './types';

/**
 * Agents catalog. Lists every backend agent as a card. Active agents are
 * clickable and navigate to their dedicated page; everything else renders a
 * "Coming Soon" state. New agents are added in `data.ts` only.
 */
const AgentsPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');

  const agents = useMemo<AgentDefinition[]>(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return AGENTS;
    return AGENTS.filter(
      (agent) =>
        agent.name.toLowerCase().includes(q) ||
        agent.description.toLowerCase().includes(q) ||
        agent.category.toLowerCase().includes(q) ||
        (agent.tags ?? []).some((tag) => tag.toLowerCase().includes(q)),
    );
  }, [searchTerm]);

  const activeCount = useMemo(() => AGENTS.filter((a) => a.status === 'active').length, []);

  const openAgent = (agent: AgentDefinition) => {
    if (agent.status === 'active' && agent.route) navigate(agent.route);
  };

  return (
    <AppShell
      searchValue={searchTerm}
      onSearchChange={setSearchTerm}
      searchPlaceholder="Search agents by name, category, or tag..."
    >
      <div className="max-w-[1600px] mx-auto space-y-6 lg:space-y-8">
        {/* Page heading */}
        <section className="motion-safe:animate-fade-in">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="min-w-0">
              <div className="flex items-center gap-2.5 mb-2 flex-wrap">
                <h2 className="text-[22px] sm:text-[24px] font-extrabold tracking-tight text-ink-primary">Agents</h2>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-brand-cyan-500/25 bg-brand-cyan-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-brand-cyan-400">
                  <Bot className="w-3 h-3" /> <span className="tabular-nums">{activeCount}</span> Active
                </span>
                {searchTerm.trim() && (
                  <span className="inline-flex items-center rounded-full border border-white/[0.06] bg-surface-2 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] tabular-nums text-ink-tertiary">
                    {agents.length} match{agents.length === 1 ? '' : 'es'}
                  </span>
                )}
              </div>
              <p className="max-w-2xl text-[13px] leading-relaxed text-ink-tertiary">
                Backend automation agents available in your workspace. Open an active agent to configure and run it.
              </p>
            </div>
          </div>
        </section>

        {/* Catalog grid */}
        <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4 lg:gap-5 motion-safe:animate-fade-in">
          {agents.map((agent) => {
            const Icon = agent.icon;
            const isActive = agent.status === 'active';
            return (
              <button
                key={agent.id}
                type="button"
                onClick={() => openAgent(agent)}
                disabled={!isActive}
                aria-disabled={!isActive}
                className={`group relative flex min-h-[200px] flex-col overflow-hidden rounded-2xl border bg-surface-2 p-5 text-left outline-none transition-all duration-200 ease-std ${
                  isActive
                    ? 'border-white/[0.06] cursor-pointer hover:border-white/[0.12] hover:shadow-e2 motion-safe:hover:-translate-y-0.5 focus-visible:border-brand-cyan-500/40 focus-visible:ring-2 focus-visible:ring-brand-cyan-500/40'
                    : 'border-white/[0.04] opacity-70 cursor-not-allowed'
                }`}
              >
                {isActive && (
                  <span aria-hidden="true" className="pointer-events-none absolute -right-12 -top-14 h-32 w-32 rounded-full bg-brand-cyan-500/[0.08] opacity-0 blur-2xl transition-opacity duration-300 group-hover:opacity-100 group-focus-visible:opacity-100" />
                )}

                <div className="relative mb-4 flex items-start justify-between gap-3">
                  <div
                    className={`flex h-11 w-11 items-center justify-center rounded-xl border ${
                      isActive
                        ? 'border-brand-cyan-500/20 bg-gradient-to-br from-brand-cyan-500/[0.18] to-brand-indigo-500/[0.08] shadow-e1'
                        : 'border-white/[0.06] bg-white/[0.03]'
                    }`}
                  >
                    <Icon className={`w-5 h-5 ${isActive ? 'text-brand-cyan-400' : 'text-ink-muted'}`} strokeWidth={2} />
                  </div>

                  {isActive ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-emerald-300">
                      <CheckCircle2 className="w-3 h-3" /> Active
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.04] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-ink-tertiary">
                      <Clock className="w-3 h-3" /> Coming Soon
                    </span>
                  )}
                </div>

                <div className="relative min-w-0 flex-1">
                  <div className="mb-1.5 flex flex-wrap items-center gap-2">
                    <h3 className={`text-[15px] font-bold tracking-tight transition-colors ${isActive ? 'text-ink-primary group-hover:text-white' : 'text-ink-tertiary'}`}>
                      {agent.name}
                    </h3>
                    <span className="rounded-md border border-white/[0.06] bg-white/[0.04] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.12em] text-ink-muted">
                      {agent.category}
                    </span>
                  </div>
                  <p className={`text-[12px] leading-relaxed ${isActive ? 'text-ink-tertiary' : 'text-ink-muted'}`}>{agent.description}</p>
                </div>

                <div className="relative mt-4 flex items-center justify-between gap-3 border-t border-white/[0.06] pt-3.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {(agent.tags ?? []).map((tag) => (
                      <span
                        key={tag}
                        className="rounded-md border border-white/[0.06] bg-surface-3/60 px-1.5 py-0.5 text-[9px] font-semibold text-ink-tertiary"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>

                  {isActive ? (
                    <span className="flex shrink-0 items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-brand-cyan-400 transition-colors group-hover:text-brand-cyan-300">
                      Open <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
                    </span>
                  ) : (
                    <span className="shrink-0 text-[11px] font-bold uppercase tracking-[0.12em] text-ink-muted">Unavailable</span>
                  )}
                </div>
              </button>
            );
          })}
        </section>

        {agents.length === 0 ? (
          <div role="status" className="rounded-2xl border border-white/[0.06] bg-surface-2 p-10 text-center shadow-e1 motion-safe:animate-fade-in">
            <div className="mx-auto mb-3.5 grid h-12 w-12 place-items-center rounded-xl border border-white/[0.06] bg-surface-3/60">
              <SearchX className="h-5 w-5 text-ink-muted" />
            </div>
            <p className="text-sm font-semibold text-ink-primary">No agents match your search</p>
            <p className="mt-1 text-[13px] text-ink-tertiary">Try a different name, category, or tag.</p>
          </div>
        ) : null}
      </div>
    </AppShell>
  );
};

export default AgentsPage;