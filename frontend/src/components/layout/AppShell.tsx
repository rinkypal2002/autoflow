import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Bell, Search, ChevronsUpDown, PanelLeftClose, PanelLeft } from 'lucide-react';
import { NAV_GROUPS, BRAND, resolveActiveNav } from '../../config/navigation';
import { EngineStatusPill } from '../common/EngineStatusPill';
import { Tooltip } from '../ui';

/**
 * Single application shell (sidebar + topbar + background) for AutoFlow.
 * Navigation comes from `config/navigation.ts` — pages render only `children`.
 *
 * The prop contract is preserved from the previous shell so existing pages
 * (Agents, Engine Monitor, Dashboard) keep working unchanged.
 */
export interface AppShellProps {
  children: React.ReactNode;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  headerActions?: React.ReactNode;
  /** Optional page title override; defaults to the active nav label. */
  title?: string;
}

const USER_PROFILE = { initials: 'UJ', name: 'Umesh Jadhav', role: 'Workspace Admin' };

const AppShell: React.FC<AppShellProps> = ({
  children,
  searchValue,
  onSearchChange,
  searchPlaceholder = 'Search…',
  headerActions,
  title,
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);

  const active = resolveActiveNav(location.pathname);
  const activeId = active?.id;
  const pageTitle = title ?? active?.label ?? 'AutoFlow';

  return (
    <div className="relative flex h-screen overflow-hidden bg-surface-base font-sans text-ink-primary">
      {/* Ambient background — fine grid masked toward the top, two soft brand
          glows, a faint top sheen, and a gentle depth vignette. Quieter than
          before so content carries the contrast. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 select-none overflow-hidden">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,0.024) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.024) 1px, transparent 1px)',
            backgroundSize: '44px 44px',
            maskImage: 'radial-gradient(ellipse 95% 70% at 50% 0%, black 0%, transparent 76%)',
            WebkitMaskImage: 'radial-gradient(ellipse 95% 70% at 50% 0%, black 0%, transparent 76%)',
          }}
        />
        <div className="absolute left-[-12%] top-[-24%] h-[54%] w-[50%] rounded-full bg-brand-indigo-500/10 blur-[150px]" />
        <div className="absolute bottom-[-26%] right-[-12%] h-[46%] w-[44%] rounded-full bg-brand-cyan-500/[0.08] blur-[140px]" />
        <div className="absolute inset-x-0 top-0 h-44 bg-[linear-gradient(180deg,rgba(129,140,248,0.05)_0%,transparent_100%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_transparent_55%,_rgba(2,4,10,0.45)_100%)]" />
      </div>

      {/* Sidebar */}
      <nav
        aria-label="Primary"
        className={`relative z-20 flex shrink-0 flex-col border-r border-white/[0.06] bg-surface-1/85 shadow-e2 backdrop-blur-2xl transition-[width] duration-300 ease-std motion-reduce:transition-none ${
          collapsed ? 'w-[72px]' : 'w-[248px]'
        }`}
      >
        {/* Hairline highlight along the sidebar's outer edge */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 right-[-1px] w-px bg-gradient-to-b from-white/[0.08] via-white/[0.02] to-transparent"
        />

        {/* Brand */}
        <div className={`flex h-16 shrink-0 items-center border-b border-white/[0.05] ${collapsed ? 'justify-center px-2' : 'px-4'}`}>
          <button
            type="button"
            onClick={() => navigate('/')}
            aria-label="AutoFlow — go to dashboard"
            className="group -m-1 flex min-w-0 items-center gap-3 rounded-xl p-1 outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan-500/40"
          >
            {/* Brand mark: conic brand ring around a dark lozenge so the
                multicolour logo reads crisply on the dark UI. */}
            <div className="relative grid h-9 w-9 shrink-0 place-items-center transition-transform duration-200 ease-std group-hover:scale-[1.05] group-active:scale-[0.98] motion-reduce:transition-none">
              <div className="absolute inset-0 rounded-xl bg-[conic-gradient(from_180deg_at_50%_50%,#6FC962_0deg,#F6A151_72deg,#F4806F_144deg,#EE4A4F_216deg,#3891A3_288deg,#33BDF2_360deg)] opacity-90 shadow-[0_0_20px_rgba(51,189,242,0.22)] transition-opacity duration-200 group-hover:opacity-100" />
              <div className="absolute inset-[1.5px] rounded-[10px] border border-white/[0.06] bg-[linear-gradient(160deg,#131B2C_0%,#0A0F1A_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.07)]" />
              <img
                src="/Transperent-Product-Logo.png"
                alt=""
                className="pointer-events-none relative z-10 h-[22px] w-[22px] select-none object-contain"
                draggable={false}
                onError={(e) => (e.currentTarget.style.display = 'none')}
              />
            </div>
            {!collapsed && (
              <div className="min-w-0 text-left">
                <h1 className="text-[15px] font-extrabold leading-none tracking-tight text-ink-primary">{BRAND.name}</h1>
                <span className="mt-[3px] block text-[9px] font-bold uppercase tracking-[0.22em] text-ink-muted">
                  {BRAND.tagline}
                </span>
              </div>
            )}
          </button>
        </div>

        {/* Groups */}
        <div className="custom-scrollbar flex flex-1 flex-col gap-5 overflow-y-auto overflow-x-hidden px-3 py-4">
          {NAV_GROUPS.map((group, groupIndex) => (
            <div key={group.id}>
              {collapsed ? (
                groupIndex > 0 ? (
                  <div aria-hidden="true" className="mx-auto mb-3 h-px w-7 rounded-full bg-white/[0.07]" />
                ) : null
              ) : (
                <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.16em] text-ink-muted">{group.label}</p>
              )}
              <div className="flex flex-col gap-1">
                {group.items.map((item) => {
                  const isActive = item.id === activeId;
                  const Icon = item.icon;
                  const btn = (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        if (item.comingSoon) return;
                        navigate(item.path);
                      }}
                      disabled={item.comingSoon}
                      aria-current={isActive ? 'page' : undefined}
                      title={collapsed ? item.label : undefined}
                      className={`group relative flex w-full items-center gap-3 rounded-lg border text-left text-[13px] outline-none transition-all duration-150 ease-std focus-visible:ring-2 focus-visible:ring-brand-cyan-500/40 motion-reduce:transition-none ${
                        collapsed ? 'justify-center px-2 py-2.5' : 'px-3 py-2.5'
                      } ${
                        isActive
                          ? 'border-brand-cyan-500/20 bg-gradient-to-r from-brand-cyan-500/[0.13] via-brand-cyan-500/[0.06] to-transparent font-semibold text-brand-cyan-400 shadow-e1'
                          : item.comingSoon
                          ? 'cursor-not-allowed border-transparent font-medium text-ink-muted opacity-60'
                          : 'border-transparent font-medium text-ink-secondary hover:bg-white/[0.045] hover:text-ink-primary active:bg-white/[0.07]'
                      }`}
                    >
                      {/* Active rail */}
                      <span
                        aria-hidden="true"
                        className={`pointer-events-none absolute left-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-r-full bg-brand-cyan-400 shadow-[0_0_8px_rgba(51,189,242,0.45)] transition-opacity duration-200 ${
                          isActive && !collapsed ? 'opacity-100' : 'opacity-0'
                        }`}
                      />
                      <Icon
                        aria-hidden="true"
                        className={`h-[18px] w-[18px] shrink-0 transition-colors duration-150 ${
                          isActive ? '' : 'text-ink-tertiary group-hover:text-brand-indigo-400'
                        }`}
                      />
                      {!collapsed && <span className="truncate">{item.label}</span>}
                      {!collapsed && item.comingSoon && (
                        <span className="ml-auto shrink-0 rounded-full border border-white/[0.07] bg-white/[0.04] px-1.5 py-px text-[8.5px] font-bold uppercase tracking-wider text-ink-muted">
                          Soon
                        </span>
                      )}
                    </button>
                  );
                  return collapsed ? (
                    <Tooltip key={item.id} label={item.label} side="right">
                      {btn}
                    </Tooltip>
                  ) : (
                    btn
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Profile */}
        <div className="shrink-0 border-t border-white/[0.05] p-3">
          <button
            type="button"
            aria-label={`Account — ${USER_PROFILE.name}, ${USER_PROFILE.role}`}
            className={`group flex w-full items-center gap-2.5 rounded-xl border border-transparent p-2 outline-none transition-colors duration-150 hover:border-white/[0.05] hover:bg-white/[0.04] focus-visible:ring-2 focus-visible:ring-brand-cyan-500/40 ${
              collapsed ? 'justify-center' : 'justify-between'
            }`}
          >
            <div className="flex min-w-0 items-center gap-2.5">
              <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gradient-to-br from-brand-indigo-500 to-purple-600 text-[11px] font-bold text-white ring-1 ring-white/15 shadow-[0_2px_8px_rgba(99,102,241,0.25)]">
                {USER_PROFILE.initials}
              </div>
              {!collapsed && (
                <div className="min-w-0 text-left">
                  <p className="truncate text-[12px] font-semibold leading-tight text-ink-primary">{USER_PROFILE.name}</p>
                  <p className="mt-px truncate text-[10px] text-ink-tertiary">{USER_PROFILE.role}</p>
                </div>
              )}
            </div>
            {!collapsed && (
              <ChevronsUpDown
                aria-hidden="true"
                className="h-3.5 w-3.5 shrink-0 text-ink-tertiary transition-colors duration-150 group-hover:text-ink-secondary"
              />
            )}
          </button>
        </div>
      </nav>

      {/* Main column */}
      <main className="relative z-10 flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex h-16 shrink-0 items-center justify-between gap-3 border-b border-white/[0.05] bg-surface-1/70 px-4 backdrop-blur-xl sm:px-6">
          {/* Left: sidebar toggle + page title */}
          <div className="flex min-w-0 items-center gap-2">
            <Tooltip label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} side="bottom">
              <button
                type="button"
                onClick={() => setCollapsed((v) => !v)}
                aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                aria-expanded={!collapsed}
                className="rounded-lg p-2 text-ink-tertiary outline-none transition-colors duration-150 hover:bg-white/[0.05] hover:text-ink-primary focus-visible:ring-2 focus-visible:ring-brand-cyan-500/40 active:bg-white/[0.08]"
              >
                {collapsed ? <PanelLeft aria-hidden="true" className="h-4 w-4" /> : <PanelLeftClose aria-hidden="true" className="h-4 w-4" />}
              </button>
            </Tooltip>
            <div aria-hidden="true" className="hidden h-5 w-px bg-white/[0.07] sm:block" />
            <span className="truncate text-[13.5px] font-semibold tracking-tight text-ink-primary">{pageTitle}</span>
          </div>

          {/* Center: search */}
          <div role="search" className="group relative hidden max-w-md flex-1 md:block">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted transition-colors duration-150 group-focus-within:text-brand-cyan-400"
            />
            <input
              type="text"
              aria-label={searchPlaceholder}
              placeholder={searchPlaceholder}
              value={searchValue ?? ''}
              onChange={(e) => onSearchChange?.(e.target.value)}
              className="h-9 w-full rounded-lg border border-white/[0.06] bg-surface-3/50 pl-10 pr-16 text-[12.5px] font-medium text-ink-primary placeholder-ink-muted shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] outline-none transition-all duration-150 hover:border-white/10 hover:bg-surface-3/70 focus:border-brand-cyan-500/40 focus:bg-surface-3/80 focus:ring-2 focus:ring-brand-cyan-500/25"
            />
            <kbd
              aria-hidden="true"
              className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 inline-flex items-center rounded-md border border-white/[0.07] bg-white/[0.04] px-1.5 py-[3px] font-mono text-[9px] font-bold uppercase tracking-wide text-ink-muted shadow-[0_1px_0_rgba(0,0,0,0.25)]"
            >
              Ctrl K
            </kbd>
          </div>

          {/* Right: status, notifications, page actions */}
          <div className="flex shrink-0 items-center gap-2.5">
            <EngineStatusPill />
            <Tooltip label="Notifications" side="bottom">
              <button
                type="button"
                aria-label="Notifications"
                className="relative rounded-lg p-2 text-ink-secondary outline-none transition-colors duration-150 hover:bg-white/[0.05] hover:text-ink-primary focus-visible:ring-2 focus-visible:ring-brand-cyan-500/40"
              >
                <Bell aria-hidden="true" className="h-4 w-4" />
                <span
                  aria-hidden="true"
                  className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full border-[1.5px] border-surface-base bg-danger-500 shadow-[0_0_6px_rgba(239,68,68,0.55)]"
                />
              </button>
            </Tooltip>
            {headerActions ? (
              <>
                <div aria-hidden="true" className="hidden h-6 w-px bg-white/[0.07] sm:block" />
                {headerActions}
              </>
            ) : null}
          </div>
        </header>

        <div className="custom-scrollbar flex-1 overflow-y-auto px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</div>
      </main>
    </div>
  );
};

export default AppShell;