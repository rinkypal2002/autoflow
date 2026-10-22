import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import * as Icons from 'lucide-react';
import { ExecutionLog, ExecutionSnapshot, NodeOutputRecord } from '../types/workflow';
import { humanizeMessage, statusMeta, type UiTone } from '../lib/executionStatus';
import DebuggerPanel from './DebuggerPanel';
import type { Breakpoint, DebugSessionSnapshot } from '../lib/workflowDebugger';
import { describeType, redactSecrets, summarizeValue } from '../lib/objectUtils';
import {
  buildStepPreviewRows,
  filterStepPreviewRows,
  formatDuration,
  projectBusinessData,
  splitBusinessFields,
  stepPreviewRowsToCsv,
  stepToken,
  summarizePreviewRows,
  type PreviewField,
  type PreviewTechnicalField,
  type StepPreviewRow,
} from '../lib/carryForward';

interface Props {
  logs?: ExecutionLog[];
  /**
   * Per-node outputs captured by the execution context during the current (or
   * most recent) run. This is what makes the panel a real context inspector
   * rather than a log tail: every value here is bindable from any later node.
   */
  records?: NodeOutputRecord[];
  /** Full context image, including workflow variables and runtime buckets. */
  snapshot?: ExecutionSnapshot | null;
  runId?: string | null;
  isOpen: boolean;
  onToggle: () => void;
  onClear: () => void;
  className?: string;

  /**
   * Maximize / restore wiring. Uncontrolled by default: the panel owns its
   * own full-screen state and the parent needs no changes. Pass `isMaximized`
   * (plus `onMaximizeChange`) to make it controlled instead — for example so
   * the page can stand its own drawer chrome down while the console is up.
   * `defaultMaximized` only applies in uncontrolled mode; passing it alongside
   * `isMaximized` has no effect and is best omitted, so there is visibly one
   * source of truth.
   *
   * In controlled mode this component NEVER flips full-screen mode on its own.
   * Every route — the header button, a double-click on the title, Esc, and a
   * press on the backdrop — reports through `onMaximizeChange` and then waits
   * for the parent to send the new value back down. That is what keeps the
   * page's drawer layout and this shell from ever disagreeing.
   */
  isMaximized?: boolean;
  defaultMaximized?: boolean;
  onMaximizeChange?: (isMaximized: boolean) => void;

  /**
   * Debugger wiring. Every field is optional: without it the Debug tab falls
   * back to the raw console, so any existing mount of this panel still
   * compiles and behaves exactly as before.
   */
  debug?: DebugSessionSnapshot;
  nodeNames?: Record<string, string>;
  isRunning?: boolean;
  onToggleDebugMode?: () => void;
  onDebugResume?: () => void;
  onDebugStep?: () => void;
  onDebugPause?: () => void;
  onDebugStop?: () => void;
  onDebugRunTo?: (nodeId: string) => void;
  onUpdateBreakpoint?: (nodeId: string, patch: Partial<Omit<Breakpoint, 'nodeId'>>) => void;
  onRemoveBreakpoint?: (nodeId: string) => void;
  onClearBreakpoints?: () => void;
  onAddWatch?: (expression: string) => void;
  onRemoveWatch?: (watchId: string) => void;
}

type TabType = 'logging' | 'context' | 'stepMetrics' | 'preview' | 'debug';
type LevelFilter = 'all' | 'info' | 'success' | 'warning' | 'error';
type StatusFilter = 'all' | 'completed' | 'failed' | 'running' | 'skipped';

const LEVEL_FILTERS: { key: LevelFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'info', label: 'Info' },
  { key: 'success', label: 'Success' },
  { key: 'warning', label: 'Warning' },
  { key: 'error', label: 'Error' },
];

const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: 'All steps' },
  { key: 'completed', label: 'Completed' },
  { key: 'failed', label: 'Failed' },
  { key: 'running', label: 'Running' },
  { key: 'skipped', label: 'Skipped' },
];

const TONE_BADGE: Record<UiTone, string> = {
  neutral: 'bg-white/[0.04] text-[#9aa3af] border-white/10',
  info: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  success: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  warning: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  danger: 'bg-red-500/10 text-red-400 border-red-500/20',
};

const PREVIEW_COLUMNS = 8;

/**
 * How many business fields an expanded step shows before "Show all".
 *
 * Eight is two full rows of the two-column grid — enough to cover the readable
 * top-level values of a typical response without the row growing taller than
 * the table it sits in. Everything past it is one click away, never dropped.
 */
const PRIMARY_FIELD_LIMIT = 8;

/**
 * How long the maximize / restore animation runs. The page keeps its drawer in
 * a transform-free shape for slightly longer than this, so the backdrop below
 * is still resolving against the viewport while it fades out.
 */
const MAXIMIZE_ANIM_MS = 260;

/** Treat "within this many pixels of the end" as pinned to the bottom. */
const BOTTOM_THRESHOLD_PX = 24;

/**
 * Keyframes for the maximize transition and the "run finished" attention
 * pulse. Injected as a scoped <style> tag so the component stays drop-in —
 * no Tailwind config or global CSS changes required. Names are prefixed to
 * avoid collisions with app-level animations.
 */
const PANEL_KEYFRAMES = `
@keyframes wfxPanelMaximizeIn {
  from { opacity: 0.55; transform: translateY(10px) scale(0.988); }
  to   { opacity: 1; transform: none; }
}
@keyframes wfxPanelRestoreIn {
  from { opacity: 0.6; }
  to   { opacity: 1; }
}
@keyframes wfxRunCompletePulse {
  0%   { box-shadow: 0 0 0 0 rgba(52, 211, 153, 0.35); }
  70%  { box-shadow: 0 0 0 7px rgba(52, 211, 153, 0); }
  100% { box-shadow: 0 0 0 0 rgba(52, 211, 153, 0); }
}
@keyframes wfxBackdropIn {
  from { opacity: 0; }
  to   { opacity: 1; }
}
@keyframes wfxBackdropOut {
  from { opacity: 1; }
  to   { opacity: 0; }
}
.wfx-run-pulse {
  animation: wfxRunCompletePulse 1.8s ease-out infinite;
}
@media (prefers-reduced-motion: reduce) {
  .wfx-panel-shell,
  .wfx-panel-backdrop,
  .wfx-run-pulse { animation: none !important; }
}
`;

/* -------------------------------------------------------------------------- */
/*                                  CLIPBOARD                                 */
/* -------------------------------------------------------------------------- */

/** One clipboard owner per panel, so only the button just pressed shows a tick. */
function useClipboard() {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  useEffect(() => {
    if (!copiedKey) return;
    const timer = setTimeout(() => setCopiedKey(null), 1500);
    return () => clearTimeout(timer);
  }, [copiedKey]);

  const copy = useCallback((text: string, key: string) => {
    try {
      navigator.clipboard?.writeText(text);
      setCopiedKey(key);
    } catch {
      /* clipboard unavailable */
    }
  }, []);

  return { copy, copiedKey };
}

const safeJson = (value: unknown): string => {
  try {
    return JSON.stringify(value ?? null, null, 2);
  } catch {
    return String(value);
  }
};

/* -------------------------------------------------------------------------- */
/*                                    PANEL                                   */
/* -------------------------------------------------------------------------- */

const ExecutionPanel: React.FC<Props> = ({
  logs = [],
  records = [],
  snapshot = null,
  runId = null,
  isOpen,
  onToggle,
  onClear,
  className = '',
  isMaximized: controlledMaximized,
  defaultMaximized = false,
  onMaximizeChange,
  debug,
  nodeNames = {},
  isRunning = false,
  onToggleDebugMode,
  onDebugResume,
  onDebugStep,
  onDebugPause,
  onDebugStop,
  onDebugRunTo,
  onUpdateBreakpoint,
  onRemoveBreakpoint,
  onClearBreakpoints,
  onAddWatch,
  onRemoveWatch,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  const [activeTab, setActiveTab] = useState<TabType>('logging');
  const [autoScroll, setAutoScroll] = useState(true);
  const [levelFilter, setLevelFilter] = useState<LevelFilter>('all');

  /** Reveals transport detail everywhere at once. Off by default. */
  const [developerMode, setDeveloperMode] = useState(false);

  // Preview Data state
  const [previewSearch, setPreviewSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set());
  const [technicalOpen, setTechnicalOpen] = useState<Set<string>>(new Set());

  const { copy, copiedKey } = useClipboard();

  // ─── Maximize / restore ───────────────────────────────────────────────────
  //
  // The panel is never remounted between docked and full-screen mode: the
  // same element simply switches from in-flow layout to `fixed inset-0`.
  // Because the React subtree and DOM nodes are identical in both modes, the
  // active tab, filters, expanded rows, search text, debugger wiring and even
  // scroll positions all survive maximize/restore untouched.
  //
  // Nothing here may be moved into a conditional branch or below the
  // `if (!isOpen) return null` guard: every hook in this component runs
  // unconditionally, in the same order, on every render.

  const panelRef = useRef<HTMLDivElement>(null);
  const maximizeButtonRef = useRef<HTMLButtonElement>(null);
  const prevRunningRef = useRef(isRunning);

  const [internalMaximized, setInternalMaximized] = useState(defaultMaximized);
  const isMaximizeControlled = controlledMaximized !== undefined;
  const isMaximized = isMaximizeControlled ? controlledMaximized : internalMaximized;

  /** Drives the short enter/exit animation without ever remounting the panel. */
  const [maximizeAnim, setMaximizeAnim] = useState<'enter' | 'exit' | null>(null);

  /** Lights up the Maximize button right after a run finishes. */
  const [runJustFinished, setRunJustFinished] = useState(false);

  const setMaximized = useCallback(
    (next: boolean) => {
      setRunJustFinished(false);
      if (!isMaximizeControlled) setInternalMaximized(next);
      onMaximizeChange?.(next);
      // Every restore path (button, Esc, backdrop) lands focus back on the
      // Maximize control, so keyboard users always know where they are.
      if (!next) maximizeButtonRef.current?.focus();
    },
    [isMaximizeControlled, onMaximizeChange]
  );

  const toggleMaximize = useCallback(
    () => setMaximized(!isMaximized),
    [isMaximized, setMaximized]
  );

  /** Closing while maximized restores the docked layout first, then closes. */
  const handleClose = useCallback(() => {
    if (isMaximized) setMaximized(false);
    onToggle();
  }, [isMaximized, setMaximized, onToggle]);

  // Drive the enter/exit animation from the RESOLVED mode rather than from the
  // click handler. In controlled mode the parent owns the flag, so a maximize
  // triggered from the page has to animate identically to one triggered here —
  // and reading the committed value is the only way to be sure. This is a
  // layout effect so the animation is applied in the same paint as the class
  // change; a passive effect would show one un-animated frame first.
  const prevMaximizedRef = useRef(isMaximized);
  useLayoutEffect(() => {
    if (prevMaximizedRef.current === isMaximized) return;
    prevMaximizedRef.current = isMaximized;
    setMaximizeAnim(isMaximized ? 'enter' : 'exit');
  }, [isMaximized]);

  // ─── Derived data ─────────────────────────────────────────────────────────

  const stats = useMemo(() => {
    const acc = { total: logs.length, info: 0, success: 0, warning: 0, error: 0 };
    for (const log of logs as any[]) {
      const lvl = String(log.level ?? 'info').toLowerCase();
      if (lvl === 'success') acc.success += 1;
      else if (lvl === 'error') acc.error += 1;
      else if (lvl === 'warning' || lvl === 'warn') acc.warning += 1;
      else acc.info += 1;
    }
    return acc;
  }, [logs]);

  const filteredLogs = useMemo(() => {
    if (levelFilter === 'all') return logs;
    return (logs as any[]).filter((log) => {
      const lvl = String(log.level ?? 'info').toLowerCase();
      if (levelFilter === 'warning') return lvl === 'warning' || lvl === 'warn';
      return lvl === levelFilter;
    });
  }, [logs, levelFilter]);

  /**
   * Live records when a run is in memory, otherwise the last persisted
   * snapshot — so closing and reopening the editor still shows the last run.
   */
  const effectiveRecords = useMemo<NodeOutputRecord[]>(
    () => (records.length > 0 ? records : ((snapshot?.outputs ?? []) as NodeOutputRecord[])),
    [records, snapshot]
  );

  /**
   * One row per executed step — the whole run, in order, with each step's
   * business fields already projected out of its transport wrapper.
   */
  const previewRows = useMemo(() => buildStepPreviewRows(effectiveRecords), [effectiveRecords]);

  const previewCounts = useMemo(() => summarizePreviewRows(previewRows), [previewRows]);

  const filteredRows = useMemo(
    () => filterStepPreviewRows(previewRows, { term: previewSearch, status: statusFilter }),
    [previewRows, previewSearch, statusFilter]
  );

  /** Business projection per step for the Data Context inspector. */
  const contextSteps = useMemo(
    () =>
      effectiveRecords.map((record) => ({
        record,
        projection: projectBusinessData(record.output),
      })),
    [effectiveRecords]
  );

  // ─── Effects ──────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!scrollRef.current || !autoScroll) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    // `isMaximized` is a dependency on purpose: when the panel resizes with
    // auto scroll on, "the bottom" is the scroll position being preserved.
  }, [filteredLogs, autoScroll, activeTab, isMaximized]);

  /**
   * Scroll anchoring across maximize / restore.
   *
   * The panel is never remounted, so the browser keeps `scrollTop` as a raw
   * number — but the console's height jumps from a 360px drawer to nearly the
   * whole viewport, which moves the line the reader was actually on. Recording
   * the offset (and whether they were pinned to the end) as they scroll lets
   * the layout effect below put them back before the next paint, so the switch
   * never loses their place. Auto scroll still wins when it is on: "the
   * bottom" is the position being preserved in that case.
   *
   * Only the Logging console needs this. The other tabs keep their scroll
   * position for free — same DOM node, no remount, no code resetting it.
   */
  const logScrollRef = useRef({ top: 0, atBottom: true });

  const handleLogScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    logScrollRef.current = {
      top: el.scrollTop,
      atBottom: el.scrollHeight - el.scrollTop - el.clientHeight < BOTTOM_THRESHOLD_PX,
    };
  }, []);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const { top, atBottom } = logScrollRef.current;
    el.scrollTop = atBottom || autoScroll ? el.scrollHeight : top;
    // Deliberately keyed on the mode switch alone: this must not fire while
    // the user is scrolling normally, or it would fight them for the scrollbar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMaximized]);

  // Clear the maximize enter/exit animation flag once it has played.
  useEffect(() => {
    if (!maximizeAnim) return;
    const timer = setTimeout(() => setMaximizeAnim(null), MAXIMIZE_ANIM_MS);
    return () => clearTimeout(timer);
  }, [maximizeAnim]);

  // Esc while maximized: the first press steps out of a text field, the next
  // one restores the docked layout. `defaultPrevented` is respected so inner
  // widgets (debugger popovers, etc.) can keep their own Esc behavior.
  useEffect(() => {
    if (!isMaximized || !isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      const target = event.target as HTMLElement | null;
      const inTextField =
        !!target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable === true);
      if (inTextField) {
        target.blur();
        return;
      }
      // The console is modal while maximized — keep app-level Esc shortcuts
      // (canvas deselect, global overlays) from reacting to the same press.
      event.stopImmediatePropagation();
      setMaximized(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isMaximized, isOpen, setMaximized]);

  // Minimal focus trap while maximized. `aria-modal` promises assistive tech
  // that focus stays inside the console, so Tab wraps at the edges instead of
  // escaping into the dimmed workspace behind the overlay.
  useEffect(() => {
    if (!isMaximized || !isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const root = panelRef.current;
      if (!root) return;
      const focusables = Array.from(
        root.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (!active || !root.contains(active)) {
        event.preventDefault();
        first.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isMaximized, isOpen]);

  // Lock background scroll while the console covers the viewport, and pad
  // for the vanished scrollbar so the page behind never shifts width.
  useEffect(() => {
    if (!isMaximized || !isOpen || typeof document === 'undefined') return;
    const { style } = document.body;
    const previousOverflow = style.overflow;
    const previousPaddingRight = style.paddingRight;
    const scrollbarGutter = window.innerWidth - document.documentElement.clientWidth;
    style.overflow = 'hidden';
    if (scrollbarGutter > 0) style.paddingRight = `${scrollbarGutter}px`;
    return () => {
      style.overflow = previousOverflow;
      style.paddingRight = previousPaddingRight;
    };
  }, [isMaximized, isOpen]);

  // Move focus into the console on maximize so Esc works immediately.
  useEffect(() => {
    if (isMaximized) panelRef.current?.focus({ preventScroll: true });
  }, [isMaximized]);

  // If the panel is closed, never let it re-open straight into full screen.
  // This covers the uncontrolled case; a controlled parent owns the same rule
  // for its own copy of the flag.
  useEffect(() => {
    if (!isOpen && internalMaximized) setInternalMaximized(false);
  }, [isOpen, internalMaximized]);

  // Highlight the Maximize button the moment a run finishes with results,
  // so inspecting the completed run is one obvious click away.
  useEffect(() => {
    const wasRunning = prevRunningRef.current;
    prevRunningRef.current = isRunning;
    if (wasRunning && !isRunning && effectiveRecords.length > 0 && !isMaximized) {
      setRunJustFinished(true);
    }
  }, [isRunning, effectiveRecords.length, isMaximized]);

  useEffect(() => {
    if (!runJustFinished) return;
    const timer = setTimeout(() => setRunJustFinished(false), 10000);
    return () => clearTimeout(timer);
  }, [runJustFinished]);

  // ─── Handlers ─────────────────────────────────────────────────────────────

  const toggleStep = useCallback((nodeId: string) => {
    setExpandedSteps((previous) => {
      const next = new Set(previous);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  }, []);

  const toggleTechnical = useCallback((nodeId: string) => {
    setTechnicalOpen((previous) => {
      const next = new Set(previous);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  }, []);

  const expandAll = useCallback(() => {
    setExpandedSteps(new Set(filteredRows.map((row) => row.nodeId)));
  }, [filteredRows]);

  const collapseAll = useCallback(() => {
    setExpandedSteps(new Set());
    setTechnicalOpen(new Set());
  }, []);

  const exportCsv = useCallback(() => {
    if (typeof window === 'undefined' || filteredRows.length === 0) return;
    try {
      const blob = new Blob([stepPreviewRowsToCsv(filteredRows)], {
        type: 'text/csv;charset=utf-8;',
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `run-${runId ?? 'latest'}-steps.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch {
      /* download unavailable */
    }
  }, [filteredRows, runId]);

  const getBadge = (level?: string) => {
    switch (String(level ?? '').toLowerCase()) {
      case 'success':
        return TONE_BADGE.success;
      case 'error':
        return TONE_BADGE.danger;
      case 'warning':
      case 'warn':
        return TONE_BADGE.warning;
      default:
        return TONE_BADGE.info;
    }
  };

  // ═════════════════════════════════════════════════════════════════════════
  //  NO HOOKS BELOW THIS LINE.
  // ═════════════════════════════════════════════════════════════════════════

  if (!isOpen) return null;

  /**
   * Same element in both modes — only the shell classes change. Docked, it
   * fills whatever slot the parent gives it (unchanged behavior). Maximized,
   * it lifts out of flow into a fixed console framed above a dimmed backdrop:
   * full-bleed on phones, inset with a border, rounded corners and a deep
   * shadow from `sm:` up — so docked vs full-screen is never ambiguous.
   *
   * The parent `className` is applied in docked mode only. That is deliberate:
   * in full-screen mode the console must own its own surface, and a background
   * or padding utility inherited from a docked slot would either fight this
   * shell's own background with undefined precedence or leave the overlay
   * translucent.
   *
   * The maximized branch depends on one thing from outside: no ancestor may
   * set `transform`, `filter`, `backdrop-filter`, `perspective`, `will-change`
   * or `contain`, because each of those makes that ancestor the containing
   * block for `position: fixed` and would shrink this console back into the
   * slot it came from.
   */
  const shellClass = isMaximized
    ? 'wfx-panel-shell fixed inset-0 sm:inset-4 lg:inset-6 z-[100] flex flex-col bg-[#0b0d11] border-0 sm:border border-[#252a33] rounded-none sm:rounded-xl shadow-2xl shadow-black/60 overflow-hidden focus:outline-none'
    : `wfx-panel-shell w-full h-full flex flex-col bg-[#0b0d11] border-t border-[#1d2128] focus:outline-none ${className}`;

  const shellStyle: React.CSSProperties | undefined =
    maximizeAnim === 'enter' && isMaximized
      ? { animation: 'wfxPanelMaximizeIn 220ms cubic-bezier(0.16, 1, 0.3, 1)' }
      : maximizeAnim === 'exit' && !isMaximized
        ? { animation: 'wfxPanelRestoreIn 160ms ease-out' }
        : undefined;

  return (
    <>
      <style>{PANEL_KEYFRAMES}</style>

      {/*
        Overlay backdrop: dims and blurs the workspace while the console is
        maximized, so docked vs full-screen is never ambiguous. A press that
        STARTS on the backdrop restores the docked layout (mousedown, not
        click, so a text selection released outside the console doesn't
        restore by accident). It stays mounted through the exit animation to
        fade out cleanly, with pointer events off so it never eats clicks.

        This element is `fixed`, so it depends on the same ancestor contract as
        the shell above: the parent must stay transform-free for the whole exit
        animation, not just while `isMaximized` is true. The page holds its
        drawer in a neutral shape slightly longer than MAXIMIZE_ANIM_MS for
        exactly this reason — otherwise the fade would play inside the drawer's
        box and read as a dark rectangle over the bottom of the canvas.
      */}
      <div
        aria-hidden
        title={isMaximized ? 'Restore docked panel' : undefined}
        onMouseDown={isMaximized ? () => setMaximized(false) : undefined}
        className={
          isMaximized
            ? 'wfx-panel-backdrop fixed inset-0 z-[99] bg-black/60 backdrop-blur-[2px] cursor-pointer'
            : maximizeAnim === 'exit'
              ? 'wfx-panel-backdrop pointer-events-none fixed inset-0 z-[99] bg-black/60 backdrop-blur-[2px]'
              : 'hidden'
        }
        style={
          maximizeAnim === 'enter' && isMaximized
            ? { animation: 'wfxBackdropIn 200ms ease-out' }
            : maximizeAnim === 'exit' && !isMaximized
              ? { animation: 'wfxBackdropOut 240ms ease-out forwards' }
              : undefined
        }
      />

      {/*
        Layout ghost: while the panel floats above the workspace, this keeps
        the docked slot's dimensions occupied — invisible rather than
        display:none, and carrying the parent's className so slot sizing that
        depends on it still applies. Parents that collapse their own slot
        (as the workflow editor does) simply render it at zero height, which
        is harmless. The canvas never reflows, and restore lands back in
        exactly the same place with no layout jump.
      */}
      <div
        aria-hidden
        className={isMaximized ? `pointer-events-none invisible w-full h-full ${className}` : 'hidden'}
      />

      <div
        ref={panelRef}
        tabIndex={-1}
        role={isMaximized ? 'dialog' : undefined}
        aria-modal={isMaximized || undefined}
        aria-label="Execution results"
        className={shellClass}
        style={shellStyle}
      >
        {/* HEADER */}
        <div className="h-[58px] shrink-0 border-b border-[#1c2128] bg-[#0f1115] flex items-center justify-between px-5">
          <div
            className="flex items-center gap-3 min-w-0 select-none"
            onDoubleClick={toggleMaximize}
            title={isMaximized ? 'Double-click to restore' : 'Double-click to maximize'}
          >
            <div className="w-7 h-7 rounded bg-[#151922] border border-[#252a33] flex items-center justify-center shrink-0">
              <Icons.TerminalSquare className="w-4 h-4 text-orange-400" />
            </div>

            <div className="min-w-0">
              <div className="text-[15px] font-semibold text-[#e5e7eb] leading-tight truncate">
                Execution Results
              </div>
              <div className="text-[11px] text-[#7d8694] truncate">
                {isMaximized
                  ? `Full-screen execution console${runId ? ` · run ${runId}` : ''}`
                  : 'Live workflow execution monitoring'}
              </div>
            </div>

            {/* Quick stat chips */}
            <div className="hidden md:flex items-center gap-1.5 ml-3 pl-3 border-l border-[#1f242c]">
              <StatChip label="Steps" value={previewCounts.total} tone="neutral" />
              {previewCounts.completed > 0 && (
                <StatChip label="OK" value={previewCounts.completed} tone="success" />
              )}
              {previewCounts.failed > 0 && (
                <StatChip label="Failed" value={previewCounts.failed} tone="error" />
              )}
              {stats.warning > 0 && <StatChip label="Warn" value={stats.warning} tone="warning" />}
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={() => setDeveloperMode((value) => !value)}
              title={
                developerMode
                  ? 'Developer mode is on — technical detail is shown everywhere'
                  : 'Show status codes, headers, wrappers and raw payloads'
              }
              aria-pressed={developerMode}
              className={`h-[34px] px-4 rounded-md border text-[12px] transition-all flex items-center gap-1.5 ${
                developerMode
                  ? 'border-violet-500/30 text-violet-300 bg-violet-500/10'
                  : 'border-[#2a3039] text-[#97a1af] hover:text-white'
              }`}
            >
              <Icons.Wrench className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Developer Mode</span>
            </button>

            <button
              onClick={() => setAutoScroll(!autoScroll)}
              title={autoScroll ? 'Auto scroll is on' : 'Auto scroll is off'}
              aria-pressed={autoScroll}
              className={`h-[34px] px-4 rounded-md border text-[12px] transition-all flex items-center gap-1.5 ${
                autoScroll
                  ? 'border-cyan-500/30 text-cyan-400 bg-cyan-500/10'
                  : 'border-[#2a3039] text-[#97a1af] hover:text-white'
              }`}
            >
              <Icons.ArrowDownToLine className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Auto Scroll</span>
            </button>

            <button
              onClick={onClear}
              title="Clear all logs"
              className="h-[34px] px-4 rounded-md border border-red-500/20 text-red-400 text-[12px] hover:bg-red-500/10 transition-all flex items-center gap-1.5"
            >
              <Icons.Trash2 className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Clear</span>
            </button>

            {/* Window controls: maximize / restore, then close. */}
            <div className="w-px h-5 bg-[#242a33]" aria-hidden />

            {isMaximized && (
              <span className="hidden lg:flex items-center gap-1.5 text-[10.5px] text-[#6b7480]">
                <kbd className="px-1.5 py-0.5 rounded border border-[#2a3039] bg-[#151922] font-mono text-[10px] text-[#9aa3af]">
                  Esc
                </kbd>
                to restore
              </span>
            )}

            <button
              ref={maximizeButtonRef}
              onClick={toggleMaximize}
              title={
                isMaximized
                  ? 'Restore docked panel (Esc)'
                  : runJustFinished
                    ? 'Run complete — maximize to inspect the results'
                    : 'Maximize to a full-screen execution console'
              }
              aria-label={isMaximized ? 'Restore execution panel' : 'Maximize execution panel'}
              aria-pressed={isMaximized}
              className={`h-[34px] px-4 rounded-md border text-[12px] transition-all flex items-center gap-1.5 ${
                runJustFinished && !isMaximized ? 'wfx-run-pulse ' : ''
              }${
                isMaximized
                  ? 'border-cyan-500/30 text-cyan-300 bg-cyan-500/10'
                  : runJustFinished
                    ? 'border-emerald-500/40 text-emerald-300 bg-emerald-500/10'
                    : 'border-[#2a3039] text-[#97a1af] hover:text-white'
              }`}
            >
              {isMaximized ? (
                <Icons.Minimize2 className="w-3.5 h-3.5" />
              ) : (
                <Icons.Maximize2 className="w-3.5 h-3.5" />
              )}
              <span className="hidden md:inline">{isMaximized ? 'Restore' : 'Maximize'}</span>
            </button>

            <button
              onClick={handleClose}
              title="Close panel"
              aria-label="Close execution panel"
              className="w-[34px] h-[34px] rounded-md border border-[#2a3039] flex items-center justify-center text-[#8c96a5] hover:text-white hover:border-[#3a414c] transition-all"
            >
              <Icons.X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* TABS */}
        <div className="h-[54px] shrink-0 border-b border-[#1c2128] bg-[#0c0f14] px-4 flex items-center gap-2">
          {[
            { key: 'logging', label: 'Logging', icon: Icons.ScrollText },
            { key: 'context', label: 'Data Context', icon: Icons.Braces },
            { key: 'stepMetrics', label: 'Step Metrics', icon: Icons.BarChart3 },
            { key: 'preview', label: 'Preview Data', icon: Icons.Database },
            { key: 'debug', label: 'Debug', icon: Icons.Bug },
          ].map((tab: any) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key as TabType)}
                aria-pressed={isActive}
                className={`h-[36px] px-4 flex items-center gap-2 rounded-md border transition-all text-[12px] ${
                  isActive
                    ? 'bg-[#151922] border-[#313844] text-white'
                    : 'border-transparent text-[#8b95a3] hover:text-white hover:bg-white/[0.03]'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
                {tab.key === 'preview' && previewRows.length > 0 && (
                  <span className="ml-0.5 px-1.5 rounded bg-white/[0.06] text-[10px] tabular-nums text-[#9aa3af]">
                    {previewRows.length}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* BODY */}
        <div className="flex-1 overflow-hidden bg-[#0b0d11]">
          {/* LOGGING */}
          {activeTab === 'logging' && (
            <div className="h-full flex flex-col">
              {logs.length > 0 && (
                <div className="shrink-0 h-[44px] border-b border-[#181c22] bg-[#0c0f14] px-4 flex items-center gap-2">
                  <Icons.Filter className="w-3.5 h-3.5 text-[#7d8694]" />
                  {LEVEL_FILTERS.map((filter) => {
                    const isActive = levelFilter === filter.key;
                    const count =
                      filter.key === 'all' ? stats.total : (stats as any)[filter.key] ?? 0;
                    return (
                      <button
                        key={filter.key}
                        onClick={() => setLevelFilter(filter.key)}
                        aria-pressed={isActive}
                        className={`h-[26px] px-2.5 rounded-md text-[11px] font-medium border transition-all flex items-center gap-1.5 ${
                          isActive
                            ? 'bg-[#151922] border-[#313844] text-white'
                            : 'border-transparent text-[#8b95a3] hover:text-white hover:bg-white/[0.03]'
                        }`}
                      >
                        {filter.label}
                        <span className="tabular-nums text-[10px] text-[#6b7480]">{count}</span>
                      </button>
                    );
                  })}
                  <span className="ml-auto text-[11px] text-[#7d8694] tabular-nums">
                    Showing {filteredLogs.length} of {logs.length}
                  </span>
                </div>
              )}

              <div ref={scrollRef} onScroll={handleLogScroll} className="flex-1 overflow-auto">
                {logs.length === 0 ? (
                  <EmptyState
                    icon={Icons.Activity}
                    title="No execution logs yet"
                    subtitle="Run the workflow to stream live logs here."
                  />
                ) : filteredLogs.length === 0 ? (
                  <EmptyState
                    icon={Icons.SearchX}
                    title={`No ${levelFilter} logs`}
                    subtitle="Choose a different level to see more."
                  />
                ) : (
                  <table className="w-full border-collapse">
                    <thead className="sticky top-0 bg-[#11141a] border-b border-[#1f232b] z-10">
                      <tr>
                        {['Timestamp', 'Level', 'Message'].map((head) => (
                          <th
                            key={head}
                            className="text-left px-4 py-3 text-[11px] uppercase tracking-wider text-[#7d8694]"
                          >
                            {head}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredLogs.map((log: any, index: number) => (
                        <tr
                          key={log.id ?? index}
                          className="border-b border-[#181c22] hover:bg-[#12161d]"
                        >
                          <td className="px-4 py-3 text-[12px] text-[#7f8895] font-mono whitespace-nowrap">
                            {log.timestamp ? new Date(log.timestamp).toLocaleTimeString() : '--'}
                          </td>
                          <td className="px-4 py-3">
                            <div
                              className={`inline-flex px-2 py-[3px] border rounded text-[10px] uppercase tracking-wider font-semibold ${getBadge(
                                log.level
                              )}`}
                            >
                              {log.level ?? 'info'}
                            </div>
                          </td>
                          <td className="px-4 py-3 break-words">
                            {(() => {
                              const message = humanizeMessage(log.message, log.level);
                              const node =
                                log.actionName || log.nodeName || log.metadata?.actionName;
                              return (
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-[13px] font-semibold text-[#d6dce7]">
                                      {message.title}
                                    </span>
                                    {node && (
                                      <span className="text-[10px] font-semibold uppercase tracking-wider text-[#7f8895] bg-white/5 border border-white/10 rounded px-1.5 py-0.5">
                                        {node}
                                      </span>
                                    )}
                                  </div>
                                  {message.detail && message.detail !== message.title && (
                                    <p className="mt-0.5 text-[12px] text-[#7f8895] break-words">
                                      {message.detail}
                                    </p>
                                  )}
                                </div>
                              );
                            })()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}

          {/* DATA CONTEXT — the carry-forward inspector */}
          {activeTab === 'context' && (
            <div className="h-full overflow-auto p-4 space-y-4">
              {contextSteps.length === 0 && !snapshot ? (
                <EmptyState
                  icon={Icons.Braces}
                  title="No carry-forward data yet"
                  subtitle="Run the workflow to collect step outputs. Every value here stays available to all later steps for the whole run."
                />
              ) : (
                <>
                  {runId && (
                    <div className="flex items-center gap-2 text-[11px] text-[#7d8694]">
                      <Icons.Fingerprint className="w-3.5 h-3.5" />
                      <span>Run</span>
                      <span className="font-mono text-[#9aa3af]">{runId}</span>
                      {snapshot?.metrics && (
                        <span className="ml-auto font-mono">
                          {snapshot.metrics.completed} ok · {snapshot.metrics.failed} failed ·{' '}
                          {formatDuration(snapshot.metrics.durationMs)}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Workflow variables */}
                  {snapshot && Object.keys(snapshot.variables ?? {}).length > 0 && (
                    <ContextSection
                      icon={Icons.Variable}
                      title="Workflow Variables"
                      subtitle="Global — readable and writable from every step"
                    >
                      <div className="divide-y divide-[#181c22]">
                        {Object.entries(snapshot.variables ?? {}).map(([name, value]) => (
                          <ContextLeaf
                            key={name}
                            token={`{{variables.${name}}}`}
                            label={name}
                            value={value}
                            copiedKey={copiedKey}
                            onCopy={copy}
                          />
                        ))}
                      </div>
                    </ContextSection>
                  )}

                  {/* Per-step business values */}
                  {contextSteps.map(({ record, projection }) => {
                    const tokenName = record.nodeName || record.stepKey || record.nodeId;
                    const meta = statusMeta(record.status);
                    const showTechnical =
                      developerMode || technicalOpen.has(`ctx:${record.nodeId}`);

                    return (
                      <ContextSection
                        key={record.nodeId}
                        icon={meta.tone === 'danger' ? Icons.XCircle : Icons.CheckCircle2}
                        iconClass={meta.tone === 'danger' ? 'text-red-400' : 'text-emerald-400'}
                        title={`${record.sequence}. ${record.nodeName}`}
                        subtitle={`${record.type ?? 'step'} · ${formatDuration(record.durationMs)}`}
                      >
                        {record.error ? (
                          <div className="px-4 py-3 text-[12px] text-red-400 font-mono break-words">
                            {record.error.message}
                          </div>
                        ) : (
                          <div className="divide-y divide-[#181c22]">
                            <ContextLeaf
                              token={stepToken(tokenName, 'output')}
                              label="Entire output"
                              value={record.output}
                              copiedKey={copiedKey}
                              onCopy={copy}
                            />
                            {projection.fields.map((field) => (
                              <ContextLeaf
                                key={field.path}
                                token={stepToken(tokenName, field.path)}
                                label={field.label || field.key}
                                value={field.value}
                                copiedKey={copiedKey}
                                onCopy={copy}
                              />
                            ))}
                            {projection.fields.length === 0 && (
                              <div className="px-4 py-3 text-[12px] text-[#6b7480]">
                                This step produced no business fields. Open Technical Details for
                                the raw payload.
                              </div>
                            )}
                          </div>
                        )}

                        {projection.technical.length > 0 && (
                          <div className="border-t border-[#181c22]">
                            <DisclosureButton
                              open={showTechnical}
                              label={`Technical details (${projection.technical.length})`}
                              onClick={() => toggleTechnical(`ctx:${record.nodeId}`)}
                            />
                            {showTechnical && (
                              <div className="divide-y divide-[#181c22] bg-[#0a0c10]">
                                {projection.technical.map((field) => (
                                  <ContextLeaf
                                    key={field.path}
                                    token={stepToken(tokenName, field.path)}
                                    label={field.label || field.key}
                                    value={field.value}
                                    copiedKey={copiedKey}
                                    onCopy={copy}
                                  />
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </ContextSection>
                    );
                  })}
                </>
              )}
            </div>
          )}

          {/* STEP METRICS */}
          {activeTab === 'stepMetrics' && (
            <div className="h-full overflow-auto p-4">
              {effectiveRecords.length === 0 ? (
                <EmptyState
                  icon={Icons.BarChart3}
                  title="No step metrics yet"
                  subtitle="Per-step status, timing, input and output appear here after a run."
                />
              ) : (
                <div className="border border-[#1f2329] overflow-hidden rounded-lg">
                  <table className="w-full border-collapse">
                    <thead className="bg-[#11141a] border-b border-[#1f2329]">
                      <tr>
                        {['#', 'Step Name', 'Status', 'Duration', 'Input', 'Output'].map((head) => (
                          <th
                            key={head}
                            className="text-left px-4 py-3 text-[11px] uppercase tracking-wider text-[#7d8694]"
                          >
                            {head}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {effectiveRecords.map((record) => {
                        const meta = statusMeta(record.status);
                        return (
                          <tr
                            key={record.nodeId}
                            className="border-b border-[#181c22] hover:bg-[#12161d]"
                          >
                            <td className="px-4 py-3 text-[12px] text-[#7d8694] font-mono">
                              {record.sequence}
                            </td>
                            <td className="px-4 py-3 text-[13px] text-white">{record.nodeName}</td>
                            <td className="px-4 py-3">
                              <StatusPill tone={meta.tone} label={meta.label} />
                            </td>
                            <td className="px-4 py-3 text-[#9aa3af] text-[12px] font-mono">
                              {formatDuration(record.durationMs)}
                            </td>
                            <td
                              className="px-4 py-3 text-[#9aa3af] text-[12px] font-mono max-w-[200px] truncate"
                              title={safeJson(redactSecrets(record.input))}
                            >
                              {summarizeValue(redactSecrets(record.input))}
                            </td>
                            <td
                              className="px-4 py-3 text-[#9aa3af] text-[12px] font-mono max-w-[200px] truncate"
                              title={safeJson(record.output)}
                            >
                              {record.error ? record.error.message : summarizeValue(record.output)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* PREVIEW DATA — every step of the run, in a table */}
          {activeTab === 'preview' && (
            <div className="h-full flex flex-col bg-[#0d0f13]">
              {/* Toolbar */}
              <div className="shrink-0 border-b border-[#1f2329] bg-[#11141a]">
                <div className="h-[46px] px-4 flex items-center gap-3">
                  <div className="relative flex-1 max-w-[420px]">
                    <Icons.Search className="w-3.5 h-3.5 text-[#5b6470] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      value={previewSearch}
                      onChange={(event) => setPreviewSearch(event.target.value)}
                      placeholder="Search steps, plugins, field names or values"
                      aria-label="Search step data"
                      className="w-full h-[30px] pl-8 pr-8 rounded-md bg-[#0d0f13] border border-[#252a33] text-[12px] text-[#d6dce7] placeholder:text-[#5b6470] focus:outline-none focus:border-[#3a414c]"
                    />
                    {previewSearch && (
                      <button
                        onClick={() => setPreviewSearch('')}
                        aria-label="Clear search"
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-[#5b6470] hover:text-white"
                      >
                        <Icons.X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5">
                    {STATUS_FILTERS.map((filter) => {
                      const isActive = statusFilter === filter.key;
                      const count =
                        filter.key === 'all'
                          ? previewCounts.total
                          : (previewCounts as any)[filter.key] ?? 0;
                      if (count === 0 && filter.key !== 'all' && !isActive) return null;
                      return (
                        <button
                          key={filter.key}
                          onClick={() => setStatusFilter(filter.key)}
                          aria-pressed={isActive}
                          className={`h-[26px] px-2.5 rounded-md text-[11px] font-medium border transition-all flex items-center gap-1.5 ${
                            isActive
                              ? 'bg-[#151922] border-[#313844] text-white'
                              : 'border-transparent text-[#8b95a3] hover:text-white hover:bg-white/[0.03]'
                          }`}
                        >
                          {filter.label}
                          <span className="tabular-nums text-[10px] text-[#6b7480]">{count}</span>
                        </button>
                      );
                    })}
                  </div>

                  <div className="ml-auto flex items-center gap-2">
                    <ToolbarButton
                      icon={Icons.ChevronDown}
                      label="Expand all"
                      onClick={expandAll}
                      disabled={filteredRows.length === 0}
                    />
                    <ToolbarButton
                      icon={Icons.ChevronRight}
                      label="Collapse all"
                      onClick={collapseAll}
                      disabled={expandedSteps.size === 0}
                    />
                    <ToolbarButton
                      icon={copiedKey === 'run:json' ? Icons.Check : Icons.Copy}
                      label={copiedKey === 'run:json' ? 'Copied' : 'Copy JSON'}
                      onClick={() =>
                        copy(
                          safeJson(
                            filteredRows.map((row) => ({
                              step: row.sequence,
                              name: row.stepName,
                              plugin: row.pluginName,
                              status: row.statusLabel,
                              durationMs: row.durationMs,
                              output: row.output,
                            }))
                          ),
                          'run:json'
                        )
                      }
                      disabled={filteredRows.length === 0}
                    />
                    <ToolbarButton
                      icon={Icons.Download}
                      label="Export CSV"
                      onClick={exportCsv}
                      disabled={filteredRows.length === 0}
                    />
                  </div>
                </div>
              </div>

              {/* Table */}
              <div className="flex-1 overflow-auto">
                {previewRows.length === 0 ? (
                  <EmptyState
                    icon={Icons.Database}
                    title="No step data yet"
                    subtitle="Run the workflow. Every step that executes appears here with the business data it produced."
                  />
                ) : filteredRows.length === 0 ? (
                  <EmptyState
                    icon={Icons.SearchX}
                    title="No steps match this search"
                    subtitle="Clear the search box or choose a different status to see all steps."
                  />
                ) : (
                  <table className="w-full border-collapse">
                    <thead className="sticky top-0 z-10 bg-[#11141a] border-b border-[#1f232b]">
                      <tr>
                        <th className="w-[70px] text-left px-4 py-3 text-[11px] uppercase tracking-wider text-[#7d8694]">
                          Step
                        </th>
                        <th className="text-left px-4 py-3 text-[11px] uppercase tracking-wider text-[#7d8694]">
                          Name
                        </th>
                        <th className="text-left px-4 py-3 text-[11px] uppercase tracking-wider text-[#7d8694]">
                          Plugin / Action
                        </th>
                        <th className="w-[110px] text-left px-4 py-3 text-[11px] uppercase tracking-wider text-[#7d8694]">
                          Status
                        </th>
                        <th className="w-[100px] text-left px-4 py-3 text-[11px] uppercase tracking-wider text-[#7d8694]">
                          Time
                        </th>
                        <th className="w-[100px] text-left px-4 py-3 text-[11px] uppercase tracking-wider text-[#7d8694]">
                          Duration
                        </th>
                        <th className="text-left px-4 py-3 text-[11px] uppercase tracking-wider text-[#7d8694]">
                          Output Summary
                        </th>
                        <th className="w-[92px] text-right px-4 py-3 text-[11px] uppercase tracking-wider text-[#7d8694]">
                          Copy
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRows.map((row) => (
                        <PreviewRow
                          key={row.nodeId}
                          row={row}
                          isExpanded={expandedSteps.has(row.nodeId)}
                          showTechnical={developerMode || technicalOpen.has(row.nodeId)}
                          developerMode={developerMode}
                          onToggle={() => toggleStep(row.nodeId)}
                          onToggleTechnical={() => toggleTechnical(row.nodeId)}
                          copiedKey={copiedKey}
                          onCopy={copy}
                        />
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Footer summary */}
              {previewRows.length > 0 && (
                <div className="h-[36px] shrink-0 border-t border-[#1f2329] bg-[#11141a] px-4 flex items-center text-[11px] text-[#7d8694]">
                  <span className="tabular-nums">
                    Showing {filteredRows.length} of {previewRows.length} steps
                  </span>
                  <span className="ml-auto tabular-nums">
                    {previewCounts.completed} completed · {previewCounts.failed} failed
                    {runId ? ` · run ${runId}` : ''}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* DEBUG */}
          {activeTab === 'debug' && debug && onToggleDebugMode && (
            <DebuggerPanel
              debug={debug}
              nodeNames={nodeNames}
              isRunning={isRunning}
              onToggleDebugMode={onToggleDebugMode}
              onResume={onDebugResume ?? (() => {})}
              onStep={onDebugStep ?? (() => {})}
              onPause={onDebugPause ?? (() => {})}
              onStop={onDebugStop ?? (() => {})}
              onRunTo={onDebugRunTo ?? (() => {})}
              onUpdateBreakpoint={onUpdateBreakpoint ?? (() => {})}
              onRemoveBreakpoint={onRemoveBreakpoint ?? (() => {})}
              onClearBreakpoints={onClearBreakpoints ?? (() => {})}
              onAddWatch={onAddWatch ?? (() => {})}
              onRemoveWatch={onRemoveWatch ?? (() => {})}
            />
          )}

          {activeTab === 'debug' && !(debug && onToggleDebugMode) && (
            <div className="h-full overflow-auto p-5">
              {logs.length === 0 ? (
                <EmptyState
                  icon={Icons.Bug}
                  title="Debug console is empty"
                  subtitle="Raw log lines stream here during execution."
                />
              ) : (
                <div className="bg-[#11141a] border border-[#20242c] rounded-xl overflow-hidden">
                  <div className="h-[44px] border-b border-[#20242c] flex items-center px-4">
                    <div className="flex items-center gap-2">
                      <Icons.Bug className="w-4 h-4 text-red-400" />
                      <span className="text-[13px] text-white">Debug Console</span>
                    </div>
                    <button
                      onClick={() => copy(safeJson(logs), 'debug:json')}
                      className="ml-auto h-[26px] px-2.5 rounded-md border border-[#2d323b] text-[11px] text-[#9ea7b3] hover:text-white hover:border-[#4b5563] flex items-center gap-1.5"
                    >
                      {copiedKey === 'debug:json' ? (
                        <Icons.Check className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <Icons.Copy className="w-3.5 h-3.5" />
                      )}
                      {copiedKey === 'debug:json' ? 'Copied' : 'Copy log'}
                    </button>
                  </div>
                  <div className="p-4 font-mono text-[12px] text-[#d6dce7] leading-7">
                    {logs.map((log: any, index: number) => (
                      <div
                        key={log.id ?? index}
                        className="border-b border-[#1b1f26] py-2 break-words"
                      >
                        <span className="text-[#5b6470]">
                          {log.timestamp ? new Date(log.timestamp).toLocaleTimeString() : '--'}
                        </span>{' '}
                        [{String(log.level ?? 'info').toUpperCase()}] {log.message}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
};

/* -------------------------------------------------------------------------- */
/*                                PREVIEW ROW                                 */
/* -------------------------------------------------------------------------- */

interface PreviewRowProps {
  row: StepPreviewRow;
  isExpanded: boolean;
  showTechnical: boolean;
  /**
   * The panel-wide Developer Mode switch. Distinct from `showTechnical`, which
   * is already `developerMode || <this row was opened>`: the row needs to know
   * which of the two is true so transport-flavoured affordances (type badges,
   * Copy JSON on the collapsed row) appear for a developer who asked for them
   * globally, and stay out of the way for everyone else.
   */
  developerMode: boolean;
  onToggle: () => void;
  onToggleTechnical: () => void;
  copiedKey: string | null;
  onCopy: (text: string, key: string) => void;
}

/**
 * One workflow step, in three deliberate layers of disclosure.
 *
 *   Collapsed   the row itself: status, timing and a one-line summary.
 *   Expanded    what the step produced, in business terms — a readable summary
 *               line and the top-level fields, nothing else.
 *   On request  every remaining field ("Show all"), then transport detail,
 *               metadata and raw payloads ("Technical details").
 *
 * The middle layer is the one that matters. A step can project up to 30 fields;
 * rendering all of them alongside a raw JSON dump the instant a row opens is
 * what made this read as a debug console rather than a result. Only the
 * top-level scalars are shown by default — see `splitBusinessFields` — and
 * every other value stays one click away rather than gone.
 */
const PreviewRow: React.FC<PreviewRowProps> = ({
  row,
  isExpanded,
  showTechnical,
  developerMode,
  onToggle,
  onToggleTechnical,
  copiedKey,
  onCopy,
}) => {
  const Chevron = isExpanded ? Icons.ChevronDown : Icons.ChevronRight;

  /** Ephemeral, per-row: "I want the nested paths too." */
  const [showAllFields, setShowAllFields] = useState(false);

  const { primary, secondary } = useMemo(
    () => splitBusinessFields<PreviewField>(row.fields, PRIMARY_FIELD_LIMIT),
    [row.fields]
  );

  const visibleFields = showAllFields ? [...primary, ...secondary] : primary;

  return (
    <>
      <tr
        onClick={onToggle}
        className={`border-b border-[#181c22] cursor-pointer transition-colors ${
          isExpanded ? 'bg-[#12161d]' : 'hover:bg-[#12161d]'
        }`}
      >
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            <Chevron className="w-3.5 h-3.5 text-[#5b6470] shrink-0" />
            <span className="text-[12px] text-[#7d8694] font-mono tabular-nums">{row.sequence}</span>
          </div>
        </td>

        <td className="px-4 py-3">
          <div className="text-[13px] text-white truncate max-w-[220px]">{row.stepName}</div>
          <div className="text-[10.5px] font-mono text-[#5b6470] truncate max-w-[220px]">
            {row.outputToken}
          </div>
        </td>

        <td className="px-4 py-3 text-[12px] text-[#9aa3af] truncate max-w-[160px]">
          {row.pluginName}
        </td>

        <td className="px-4 py-3">
          <StatusPill tone={row.tone} label={row.statusLabel} />
        </td>

        <td className="px-4 py-3 text-[12px] text-[#7f8895] font-mono whitespace-nowrap">
          {row.timeLabel}
        </td>

        <td className="px-4 py-3 text-[12px] text-[#9aa3af] font-mono whitespace-nowrap tabular-nums">
          {row.durationLabel}
        </td>

        <td className="px-4 py-3">
          <div
            className={`text-[12.5px] truncate max-w-[420px] ${
              row.error ? 'text-red-400' : 'text-[#d6dce7]'
            }`}
            title={row.outputSummary}
          >
            {row.outputSummary || '—'}
          </div>
          {row.keyFields.length > 0 && !row.error && (
            <div className="mt-1 flex items-center gap-1.5 flex-wrap">
              {row.keyFields.map((field) => (
                <span
                  key={field.path}
                  className="px-1.5 py-px rounded border border-[#252a33] bg-[#0d0f13] text-[10px] text-[#8b95a3]"
                >
                  {field.label}
                </span>
              ))}
            </div>
          )}
        </td>

        {/* Copying the step's binding token is a business action — it is how a
            value gets wired into the next step — so it stays on the row. Copying
            the raw JSON is a developer action, and lives in Technical Details
            unless Developer Mode is on. */}
        <td className="px-4 py-3" onClick={(event) => event.stopPropagation()}>
          <div className="flex items-center justify-end gap-1">
            <IconButton
              title={`Copy binding token  ${row.outputToken}`}
              icon={copiedKey === `${row.nodeId}:token` ? Icons.Check : Icons.Braces}
              onClick={() => onCopy(row.outputToken, `${row.nodeId}:token`)}
            />
            {developerMode && (
              <IconButton
                title="Copy output JSON"
                icon={copiedKey === `${row.nodeId}:json` ? Icons.Check : Icons.Copy}
                onClick={() => onCopy(safeJson(row.output), `${row.nodeId}:json`)}
              />
            )}
          </div>
        </td>
      </tr>

      {isExpanded && (
        <tr className="border-b border-[#181c22] bg-[#0a0c10]">
          <td colSpan={PREVIEW_COLUMNS} className="px-6 py-3">
            <div className="space-y-2.5">
              {/* 1 — What happened, in one line. */}
              {row.error ? (
                <div className="rounded-md border-l-2 border-red-500/50 bg-red-500/[0.05] py-2 pl-3 pr-3">
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-red-400">
                    <Icons.AlertTriangle className="w-3 h-3" />
                    Step failed
                  </div>
                  <p className="mt-1 text-[12px] leading-5 text-[#d6b0b0] break-words">
                    {row.error.message}
                  </p>
                </div>
              ) : (
                <p className="rounded-md border-l-2 border-cyan-500/40 bg-[#0d0f13] py-2 pl-3 pr-3 text-[12.5px] leading-5 text-[#c7cedb] break-words">
                  {row.outputSummary || 'This step completed without returning any data.'}
                </p>
              )}

              {/* 1b — How the step split its rows.
                  Placed before the field grid because on a branching step this
                  is the answer to the first question anyone asks: how many were
                  rejected, and did anything get dropped. */}
              {(row.branches?.length ?? 0) > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {row.branches!.map((branch) => {
                    const isException = branch.tone === 'exception';
                    const empty = branch.recordCount === 0;
                    return (
                      <div
                        key={branch.id}
                        title={branch.description}
                        className={
                          'flex items-baseline gap-1.5 rounded-md border px-2.5 py-1.5 ' +
                          (isException && !empty
                            ? 'border-amber-500/30 bg-amber-500/[0.07]'
                            : 'border-white/[0.07] bg-white/[0.02]')
                        }
                      >
                        <span
                          className={
                            'text-[13px] font-semibold tabular-nums ' +
                            (isException && !empty ? 'text-amber-300' : 'text-slate-200')
                          }
                        >
                          {branch.absent ? '—' : (branch.recordCount ?? '—')}
                        </span>
                        <span className="text-[11px] font-medium uppercase tracking-wider text-[#7b8494]">
                          {branch.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* 2 — The values, as a compact two-column record. */}
              {row.fields.length > 0 && (
                <BusinessFieldGrid
                  fields={visibleFields}
                  totalCount={row.fields.length}
                  hiddenCount={secondary.length}
                  showingAll={showAllFields || secondary.length === 0}
                  onToggleAll={() => setShowAllFields((value) => !value)}
                  rowKey={row.nodeId}
                  developerMode={developerMode}
                  copiedKey={copiedKey}
                  onCopy={onCopy}
                />
              )}

              {row.fields.length === 0 && !row.error && (
                <p className="px-1 text-[12px] text-[#6b7480]">
                  No business fields in this response. The full payload is under Technical
                  details.
                </p>
              )}

              {/* 3 — Everything a developer might need, closed until asked for. */}
              <div className="rounded-md border border-[#1a1e25] bg-[#0d0f13] overflow-hidden">
                <DisclosureButton
                  open={showTechnical}
                  label={`Technical details${
                    row.technical.length > 0 ? ` · ${row.technical.length} fields` : ''
                  }`}
                  onClick={onToggleTechnical}
                />
                {showTechnical && (
                  <div className="border-t border-[#1a1e25] p-2.5 space-y-2.5">
                    <MetaGrid row={row} copiedKey={copiedKey} onCopy={onCopy} />

                    {row.technical.length > 0 && (
                      <TechnicalTable
                        fields={row.technical}
                        rowKey={row.nodeId}
                        copiedKey={copiedKey}
                        onCopy={onCopy}
                      />
                    )}

                    <JsonBlock
                      title="Raw output"
                      value={row.output}
                      copyKey={`${row.nodeId}:raw`}
                      copiedKey={copiedKey}
                      onCopy={onCopy}
                    />
                    {row.input !== undefined && (
                      <JsonBlock
                        title="Input sent"
                        value={redactSecrets(row.input)}
                        copyKey={`${row.nodeId}:input`}
                        copiedKey={copiedKey}
                        onCopy={onCopy}
                      />
                    )}
                  </div>
                )}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
};

/* -------------------------------------------------------------------------- */
/*                             PRESENTATIONAL PARTS                           */
/* -------------------------------------------------------------------------- */

const StatChip: React.FC<{
  label: string;
  value: number;
  tone: 'neutral' | 'success' | 'warning' | 'error';
}> = ({ label, value, tone }) => {
  const tones: Record<string, string> = {
    neutral: 'text-[#9aa3af] border-[#2a3039]',
    success: 'text-emerald-400 border-emerald-500/20',
    warning: 'text-amber-400 border-amber-500/20',
    error: 'text-red-400 border-red-500/20',
  };
  return (
    <div
      className={`h-[24px] px-2 rounded border bg-[#11141a] flex items-center gap-1.5 ${tones[tone]}`}
    >
      <span className="text-[10px] uppercase tracking-wider opacity-80">{label}</span>
      <span className="text-[11px] font-semibold tabular-nums">{value}</span>
    </div>
  );
};

const StatusPill: React.FC<{ tone: UiTone; label: string }> = ({ tone, label }) => (
  <div
    className={`inline-flex px-2 py-[3px] border rounded text-[10px] uppercase tracking-wider font-semibold ${TONE_BADGE[tone]}`}
  >
    {label}
  </div>
);

const ToolbarButton: React.FC<{
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}> = ({ icon: Icon, label, onClick, disabled }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className={`h-[28px] px-2.5 rounded-md text-[11px] border transition-all flex items-center gap-1.5 ${
      disabled
        ? 'border-[#1f242c] text-[#4b525c] cursor-not-allowed'
        : 'border-[#2d323b] text-[#9ea7b3] hover:text-white hover:border-[#4b5563]'
    }`}
  >
    <Icon className="w-3.5 h-3.5" />
    {label}
  </button>
);

const IconButton: React.FC<{
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  onClick: () => void;
}> = ({ icon: Icon, title, onClick }) => (
  <button
    type="button"
    title={title}
    aria-label={title}
    onClick={onClick}
    className="w-[26px] h-[26px] rounded border border-transparent hover:border-[#2d323b] flex items-center justify-center text-[#5b6470] hover:text-white transition-colors"
  >
    <Icon className="w-3.5 h-3.5" />
  </button>
);

const DisclosureButton: React.FC<{
  open: boolean;
  label: string;
  onClick: () => void;
}> = ({ open, label, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    aria-expanded={open}
    className="w-full h-[32px] px-3 flex items-center gap-2 text-[11.5px] text-[#7d8694] hover:text-white hover:bg-white/[0.02] transition-colors"
  >
    {open ? (
      <Icons.ChevronDown className="w-3.5 h-3.5" />
    ) : (
      <Icons.ChevronRight className="w-3.5 h-3.5" />
    )}
    <Icons.Wrench className="w-3.5 h-3.5" />
    {label}
  </button>
);

const EmptyState: React.FC<{
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  subtitle?: string;
}> = ({ icon: Icon, title, subtitle }) => (
  <div className="h-full min-h-[180px] flex flex-col items-center justify-center text-center px-6 py-10">
    <Icon className="w-11 h-11 text-[#47505d] mb-4" />
    <div className="text-[14px] text-[#d7dde8] mb-1.5">{title}</div>
    {subtitle && (
      <div className="text-[12px] text-[#758090] max-w-[420px] leading-6">{subtitle}</div>
    )}
  </div>
);

/** Collapsible-looking section wrapper for one context group. */
const ContextSection: React.FC<{
  icon: React.ComponentType<{ className?: string }>;
  iconClass?: string;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}> = ({ icon: Icon, iconClass = 'text-cyan-400', title, subtitle, children }) => (
  <div className="border border-[#1f2329] rounded-lg overflow-hidden bg-[#0d0f13]">
    <div className="h-[42px] px-4 border-b border-[#1f2329] flex items-center gap-2.5 bg-[#11141a]">
      <Icon className={`w-4 h-4 ${iconClass}`} />
      <span className="text-[12.5px] font-medium text-[#d6dce7]">{title}</span>
      {subtitle && <span className="text-[10.5px] text-[#5b6470] ml-auto">{subtitle}</span>}
    </div>
    {children}
  </div>
);

/**
 * One bindable value. Clicking copies the token, so a user can lift
 * `{{steps.Read Employee Excel.employeeId}}` straight out of a run and paste
 * it into any field of any later step.
 */
const ContextLeaf: React.FC<{
  token: string;
  label: string;
  value: unknown;
  copiedKey: string | null;
  onCopy: (text: string, key: string) => void;
}> = ({ token, label, value, copiedKey, onCopy }) => {
  const isCopied = copiedKey === token;

  return (
    <button
      type="button"
      onClick={() => onCopy(token, token)}
      title={`Copy ${token}`}
      className="w-full flex items-center gap-3 px-4 py-2 text-left hover:bg-[#12161d] transition-colors group"
    >
      <span className="text-[12px] text-[#d6dce7] font-medium min-w-0 truncate max-w-[180px]">
        {label}
      </span>
      <span className="text-[10.5px] font-mono text-[#5b6470] truncate flex-1 min-w-0">{token}</span>
      <span className="text-[11px] font-mono text-[#9aa3af] truncate max-w-[220px]">
        {summarizeValue(value, 60)}
      </span>
      <span className="px-1.5 py-px rounded border border-[#2a3039] text-[9px] uppercase tracking-wide text-[#7d8694] shrink-0">
        {describeType(value)}
      </span>
      {isCopied ? (
        <Icons.Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
      ) : (
        <Icons.Copy className="w-3.5 h-3.5 text-[#3f4753] group-hover:text-[#7d8694] shrink-0 transition-colors" />
      )}
    </button>
  );
};

/**
 * One label/value pair from a step's output.
 *
 * The copy controls are the reason this is a component rather than a table row.
 * Both actions have to stay available — a token to bind the value into a later
 * step, the value itself to paste elsewhere — but two buttons times a dozen
 * fields is a wall of chrome. They are held at zero opacity until the cell is
 * hovered or something inside it takes focus, so the default state reads as a
 * record and the controls are still keyboard-reachable in tab order. The slot
 * keeps its width either way, so nothing shifts when they appear.
 */
const FieldCell: React.FC<{
  field: PreviewField;
  rowKey: string;
  developerMode: boolean;
  copiedKey: string | null;
  onCopy: (text: string, key: string) => void;
}> = ({ field, rowKey, developerMode, copiedKey, onCopy }) => {
  const parentPath = field.path.includes('.')
    ? field.path.slice(0, field.path.lastIndexOf('.'))
    : '';

  const valueText =
    typeof field.value === 'object' && field.value !== null
      ? safeJson(field.value)
      : String(field.value ?? '');

  return (
    <div className="group flex items-center gap-2.5 rounded-md border border-transparent px-2.5 py-1.5 transition-colors hover:border-[#20252d] hover:bg-[#101319] focus-within:border-[#20252d] focus-within:bg-[#101319]">
      <span
        className="w-[38%] shrink-0 truncate text-[11.5px] text-[#8b95a3]"
        title={field.path}
      >
        {parentPath && <span className="text-[#4f5763]">{parentPath}.</span>}
        {field.label}
      </span>

      <span
        className="min-w-0 flex-1 truncate text-[12.5px] text-[#d6dce7]"
        title={field.preview}
      >
        {field.preview}
      </span>

      {developerMode && (
        <span className="shrink-0 rounded border border-[#2a3039] px-1.5 py-px text-[9px] uppercase tracking-wide text-[#7d8694]">
          {field.valueType}
        </span>
      )}

      <span className="flex w-[52px] shrink-0 items-center justify-end gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
        <IconButton
          title={`Copy binding token  ${field.token}`}
          icon={copiedKey === `${rowKey}:${field.path}:t` ? Icons.Check : Icons.Braces}
          onClick={() => onCopy(field.token, `${rowKey}:${field.path}:t`)}
        />
        <IconButton
          title="Copy value"
          icon={copiedKey === `${rowKey}:${field.path}:v` ? Icons.Check : Icons.Copy}
          onClick={() => onCopy(valueText, `${rowKey}:${field.path}:v`)}
        />
      </span>
    </div>
  );
};

/**
 * The business values a step produced, as a two-column record.
 *
 * Two columns rather than one is most of the height saving: eight fields read
 * as four lines instead of eight, and label/value pairs are what a person is
 * scanning for anyway. The header carries the only control in the default
 * expanded state — "Show all" — and the count next to it is what tells the
 * reader nothing has been hidden from them.
 */
const BusinessFieldGrid: React.FC<{
  fields: PreviewField[];
  totalCount: number;
  hiddenCount: number;
  showingAll: boolean;
  onToggleAll: () => void;
  rowKey: string;
  developerMode: boolean;
  copiedKey: string | null;
  onCopy: (text: string, key: string) => void;
}> = ({
  fields,
  totalCount,
  hiddenCount,
  showingAll,
  onToggleAll,
  rowKey,
  developerMode,
  copiedKey,
  onCopy,
}) => (
  <div className="rounded-md border border-[#1a1e25] bg-[#0d0f13] overflow-hidden">
    <div className="flex h-[30px] items-center gap-2 border-b border-[#1a1e25] bg-[#11141a] px-3">
      <Icons.Layers className="w-3 h-3 text-cyan-400" />
      <span className="text-[11px] font-medium uppercase tracking-wider text-[#8b95a3]">
        Business data
      </span>
      <span className="text-[10.5px] tabular-nums text-[#5b6470]">
        {showingAll
          ? `${totalCount} field${totalCount === 1 ? '' : 's'}`
          : `${fields.length} of ${totalCount}`}
      </span>

      {hiddenCount > 0 && (
        <button
          type="button"
          onClick={onToggleAll}
          aria-expanded={showingAll}
          className="ml-auto flex items-center gap-1 rounded px-1.5 py-0.5 text-[10.5px] text-[#7d8694] transition-colors hover:text-white"
        >
          {showingAll ? (
            <>
              <Icons.ChevronUp className="w-3 h-3" />
              Show less
            </>
          ) : (
            <>
              <Icons.ChevronDown className="w-3 h-3" />
              Show all {totalCount}
            </>
          )}
        </button>
      )}
    </div>

    <div className="grid grid-cols-1 gap-x-2 gap-y-px p-1.5 lg:grid-cols-2">
      {fields.map((field) => (
        <FieldCell
          key={field.path}
          field={field}
          rowKey={rowKey}
          developerMode={developerMode}
          copiedKey={copiedKey}
          onCopy={onCopy}
        />
      ))}
    </div>
  </div>
);

/**
 * Where the step ran and what it is called — the identifiers needed to trace a
 * run or debug a binding, none of which a business reader ever wants on screen.
 * Lives inside Technical Details for exactly that reason.
 */
const MetaGrid: React.FC<{
  row: StepPreviewRow;
  copiedKey: string | null;
  onCopy: (text: string, key: string) => void;
}> = ({ row, copiedKey, onCopy }) => {
  const entries: { label: string; value: string; copy?: string }[] = [
    { label: 'Step token', value: row.outputToken, copy: row.outputToken },
    { label: 'Step key', value: row.stepKey || '—' },
    { label: 'Node ID', value: row.nodeId, copy: row.nodeId },
    { label: 'Plugin type', value: row.type || '—' },
    { label: 'Category', value: row.category || '—' },
    { label: 'Context bucket', value: row.bucket || '—' },
    { label: 'Started at', value: row.startedAt || '—' },
    { label: 'Duration', value: row.durationLabel },
    { label: 'Status', value: `${row.statusLabel} (${row.status})` },
    { label: 'Sequence', value: String(row.sequence) },
  ];

  return (
    <div className="rounded-md border border-[#1a1e25] overflow-hidden">
      <div className="flex h-[28px] items-center gap-2 border-b border-[#1a1e25] bg-[#11141a] px-3">
        <Icons.Fingerprint className="w-3 h-3 text-[#7d8694]" />
        <span className="text-[10.5px] font-medium uppercase tracking-wider text-[#7d8694]">
          Step metadata
        </span>
      </div>
      <div className="grid grid-cols-1 gap-x-2 gap-y-px p-1.5 lg:grid-cols-2">
        {entries.map((entry) => (
          <div
            key={entry.label}
            className="group flex items-center gap-2.5 rounded px-2.5 py-1 hover:bg-[#101319]"
          >
            <span className="w-[38%] shrink-0 truncate text-[11px] text-[#6b7480]">
              {entry.label}
            </span>
            <span
              className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-[#8b95a3]"
              title={entry.value}
            >
              {entry.value}
            </span>
            <span className="flex w-[26px] shrink-0 justify-end opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
              {entry.copy && (
                <IconButton
                  title={`Copy ${entry.label.toLowerCase()}`}
                  icon={copiedKey === `${row.nodeId}:meta:${entry.label}` ? Icons.Check : Icons.Copy}
                  onClick={() => onCopy(entry.copy!, `${row.nodeId}:meta:${entry.label}`)}
                />
              )}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

/**
 * Transport fields of one step — status codes, headers, wrappers. Same compact
 * record shape as the business grid, deliberately quieter, and only ever
 * rendered inside Technical Details.
 */
const TechnicalTable: React.FC<{
  fields: PreviewTechnicalField[];
  rowKey: string;
  copiedKey: string | null;
  onCopy: (text: string, key: string) => void;
}> = ({ fields, rowKey, copiedKey, onCopy }) => (
  <div className="rounded-md border border-[#1a1e25] overflow-hidden">
    <div className="flex h-[28px] items-center gap-2 border-b border-[#1a1e25] bg-[#11141a] px-3">
      <Icons.Wrench className="w-3 h-3 text-[#7d8694]" />
      <span className="text-[10.5px] font-medium uppercase tracking-wider text-[#7d8694]">
        Transport fields
      </span>
      <span className="text-[10.5px] tabular-nums text-[#5b6470]">{fields.length}</span>
    </div>
    <div className="grid grid-cols-1 gap-x-2 gap-y-px p-1.5 lg:grid-cols-2">
      {fields.map((field) => (
        <div
          key={field.path}
          className="group flex items-center gap-2.5 rounded px-2.5 py-1 hover:bg-[#101319]"
        >
          <span className="w-[38%] shrink-0 truncate text-[11px] text-[#6b7480]" title={field.path}>
            {field.label}
          </span>
          <span
            className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-[#8b95a3]"
            title={field.preview}
          >
            {field.preview}
          </span>
          <span className="flex w-[26px] shrink-0 justify-end opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
            <IconButton
              title={`Copy binding token  ${field.token}`}
              icon={copiedKey === `${rowKey}:tech:${field.path}` ? Icons.Check : Icons.Braces}
              onClick={() => onCopy(field.token, `${rowKey}:tech:${field.path}`)}
            />
          </span>
        </div>
      ))}
    </div>
  </div>
);

/** Raw JSON, collapsed inside Technical Details and capped in height. */
const JsonBlock: React.FC<{
  title: string;
  value: unknown;
  copyKey: string;
  copiedKey: string | null;
  onCopy: (text: string, key: string) => void;
}> = ({ title, value, copyKey, copiedKey, onCopy }) => {
  const text = safeJson(value);
  return (
    <div className="rounded-md border border-[#1a1e25] overflow-hidden bg-[#0b0d11]">
      <div className="h-[28px] px-3 flex items-center gap-2 border-b border-[#1a1e25] bg-[#11141a]">
        <Icons.Code2 className="w-3 h-3 text-orange-400" />
        <span className="text-[10.5px] font-medium uppercase tracking-wider text-[#7d8694]">
          {title}
        </span>
        <button
          onClick={() => onCopy(text, copyKey)}
          className="ml-auto h-[22px] px-2 rounded border border-[#2d323b] text-[10.5px] text-[#9ea7b3] hover:text-white hover:border-[#4b5563] flex items-center gap-1"
        >
          {copiedKey === copyKey ? (
            <Icons.Check className="w-3 h-3 text-emerald-400" />
          ) : (
            <Icons.Copy className="w-3 h-3" />
          )}
          {copiedKey === copyKey ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="max-h-[220px] overflow-auto p-3 text-[11.5px] leading-5 text-[#9aa3af] font-mono whitespace-pre-wrap break-words">
        {text}
      </pre>
    </div>
  );
};

export default ExecutionPanel;