/**
 * Workflow debugger — breakpoints, pause/resume, step-through and watches.
 *
 * The run loop is a plain `while` over a queue, so the only thing needed to
 * make it debuggable is a place for it to *await* between nodes. That is what
 * this module provides: `shouldPauseAt()` decides whether to stop before a
 * node, and `waitWhilePaused()` returns a promise the loop can await until the
 * user presses Resume or Step.
 *
 *   const gate = await session.beforeNode(action, scope);
 *   if (gate === 'abort') break;
 *
 * Because pausing is just an unresolved promise, an in-flight run holds its
 * entire execution context while parked — every variable, every earlier node's
 * output and every binding stays live and inspectable. Nothing is snapshotted
 * and replayed; the debugger looks at the real run.
 *
 * ── Breakpoint semantics ──────────────────────────────────────────────────
 *   • enabled       switch off without deleting, so a breakpoint survives
 *                   experimentation
 *   • condition     an expression evaluated against the live scope; the run
 *                   only stops when it is truthy ("stop when rowsAffected = 0")
 *   • logOnly       record the hit and keep going — a tracepoint, not a stop
 *   • hitCount      how many times it has been reached this session
 *
 * Conditions reuse `evaluateCondition` from `lib/expression`, which is the
 * same sandboxed evaluator the routing conditions use — no `eval`, no
 * `new Function`.
 */

import type { WorkflowAction } from '../types/workflow';
import { evaluateCondition, resolveString } from './expression';
import { summarizeValue } from './objectUtils';

/* -------------------------------------------------------------------------- */
/*                                   TYPES                                    */
/* -------------------------------------------------------------------------- */

export interface Breakpoint {
  nodeId: string;
  enabled: boolean;
  /** Optional expression; the run pauses only when it evaluates truthy. */
  condition?: string;
  /** Log the hit and continue instead of pausing. */
  logOnly?: boolean;
  /** Times this breakpoint has been reached during the current session. */
  hitCount: number;
}

export type DebugState = 'inactive' | 'running' | 'paused' | 'stepping';

/** What the run loop should do when it returns from the debugger gate. */
export type DebugGate = 'continue' | 'abort';

export interface WatchExpression {
  id: string;
  expression: string;
  /** Last evaluated value, refreshed every time the run pauses. */
  value?: any;
  preview?: string;
  error?: string;
}

export interface DebugPauseInfo {
  nodeId: string;
  nodeName: string;
  /** Why the run stopped. */
  reason: 'breakpoint' | 'step' | 'user' | 'runToCursor';
  sequence: number;
  at: string;
  condition?: string;
}

export interface DebugSessionEvents {
  /** Fired whenever the state or pause target changes, so React can re-render. */
  onChange?: (snapshot: DebugSessionSnapshot) => void;
  /** Fired when a breakpoint or tracepoint is hit. */
  onHit?: (info: DebugPauseInfo) => void;
  /** Fired for tracepoints and condition errors, routed to the run log. */
  onLog?: (message: string, level: 'info' | 'warning') => void;
}

export interface DebugSessionSnapshot {
  state: DebugState;
  enabled: boolean;
  breakpoints: Breakpoint[];
  watches: WatchExpression[];
  pausedAt: DebugPauseInfo | null;
  /** Node the run is stepping toward, when Run-to-here was used. */
  runToNodeId: string | null;
  hitCount: number;
}

/* -------------------------------------------------------------------------- */
/*                                   SESSION                                  */
/* -------------------------------------------------------------------------- */

/**
 * Owns debugger state for one editor. Created once and reused across runs —
 * breakpoints are a property of the *workflow*, not of a single execution, so
 * they survive between runs exactly as they do in an IDE.
 */
export class WorkflowDebugSession {
  private breakpoints = new Map<string, Breakpoint>();
  private watches: WatchExpression[] = [];

  private state: DebugState = 'inactive';
  private pausedAt: DebugPauseInfo | null = null;
  private runToNodeId: string | null = null;

  /** Set while paused; resolving it releases the run loop. */
  private release: ((gate: DebugGate) => void) | null = null;

  /** True when the user asked to stop the run from the debugger. */
  private aborted = false;

  /** Master switch. When off, `beforeNode` is a no-op. */
  private enabled = false;

  private totalHits = 0;
  private events: DebugSessionEvents;

  constructor(events: DebugSessionEvents = {}) {
    this.events = events;
  }

  /* ------------------------------- lifecycle ------------------------------ */

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) this.resume();
    this.emit();
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  /** Called by the run loop when a run starts. Clears per-run state only. */
  beginRun(): void {
    this.aborted = false;
    this.pausedAt = null;
    this.runToNodeId = null;
    this.totalHits = 0;
    this.breakpoints.forEach((bp) => {
      bp.hitCount = 0;
    });
    this.state = this.enabled ? 'running' : 'inactive';
    this.emit();
  }

  /** Called when a run ends, however it ended. Never drops breakpoints. */
  endRun(): void {
    this.releaseGate('continue');
    this.state = 'inactive';
    this.pausedAt = null;
    this.runToNodeId = null;
    this.emit();
  }

  /* ------------------------------ breakpoints ----------------------------- */

  toggleBreakpoint(nodeId: string): boolean {
    if (!nodeId) return false;
    const existing = this.breakpoints.get(nodeId);
    if (existing) {
      this.breakpoints.delete(nodeId);
      this.emit();
      return false;
    }
    this.breakpoints.set(nodeId, { nodeId, enabled: true, hitCount: 0 });
    this.emit();
    return true;
  }

  setBreakpoint(nodeId: string, patch: Partial<Omit<Breakpoint, 'nodeId'>> = {}): void {
    if (!nodeId) return;
    const existing = this.breakpoints.get(nodeId) ?? { nodeId, enabled: true, hitCount: 0 };
    this.breakpoints.set(nodeId, { ...existing, ...patch, nodeId });
    this.emit();
  }

  removeBreakpoint(nodeId: string): void {
    if (this.breakpoints.delete(nodeId)) this.emit();
  }

  clearBreakpoints(): void {
    if (this.breakpoints.size === 0) return;
    this.breakpoints.clear();
    this.emit();
  }

  hasBreakpoint(nodeId: string): boolean {
    return this.breakpoints.has(nodeId);
  }

  getBreakpoint(nodeId: string): Breakpoint | undefined {
    return this.breakpoints.get(nodeId);
  }

  getBreakpoints(): Breakpoint[] {
    return [...this.breakpoints.values()];
  }

  /** Node ids with an active breakpoint, for the canvas gutter markers. */
  activeBreakpointIds(): Set<string> {
    const ids = new Set<string>();
    this.breakpoints.forEach((bp) => {
      if (bp.enabled) ids.add(bp.nodeId);
    });
    return ids;
  }

  /* -------------------------------- watches ------------------------------- */

  addWatch(expression: string): WatchExpression | null {
    const trimmed = String(expression ?? '').trim();
    if (!trimmed) return null;
    if (this.watches.some((watch) => watch.expression === trimmed)) return null;

    const watch: WatchExpression = {
      id: `watch-${Date.now()}-${this.watches.length}`,
      expression: trimmed,
    };
    this.watches.push(watch);
    this.emit();
    return watch;
  }

  removeWatch(id: string): void {
    const next = this.watches.filter((watch) => watch.id !== id);
    if (next.length !== this.watches.length) {
      this.watches = next;
      this.emit();
    }
  }

  clearWatches(): void {
    if (this.watches.length === 0) return;
    this.watches = [];
    this.emit();
  }

  getWatches(): WatchExpression[] {
    return this.watches.map((watch) => ({ ...watch }));
  }

  /**
   * Re-evaluate every watch against the live scope. Called on each pause so the
   * inspector shows current values rather than values from the last stop.
   *
   * A bare path (`previous.employeeId`) is wrapped into a token so users can
   * type either form — the same leniency the binding picker offers.
   */
  evaluateWatches(scope: Record<string, any>): WatchExpression[] {
    this.watches = this.watches.map((watch) => {
      try {
        const template = watch.expression.includes('{{')
          ? watch.expression
          : `{{${watch.expression}}}`;
        // Collect unresolved tokens so a watch on a path that does not exist
        // yet reads as "not available", not as a silent `undefined`.
        const missing: string[] = [];
        const value = resolveString(template, scope, { onMissing: 'undefined', missing });

        if (missing.length > 0) {
          return {
            ...watch,
            value: undefined,
            preview: undefined,
            error: 'Not available in the current scope yet.',
          };
        }

        return {
          ...watch,
          value,
          preview: summarizeValue(value, 160),
          error: undefined,
        };
      } catch (error: any) {
        return {
          ...watch,
          value: undefined,
          preview: undefined,
          error: String(error?.message ?? error ?? 'Could not evaluate'),
        };
      }
    });
    this.emit();
    return this.getWatches();
  }

  /* ------------------------------- the gate ------------------------------- */

  /**
   * The single integration point for the run loop. Call before executing each
   * node; await the result.
   *
   * Returns `'abort'` when the user stopped the run from the debugger, so the
   * loop can break cleanly with the context intact.
   */
  async beforeNode(
    action: WorkflowAction,
    scope: Record<string, any>,
    sequence: number
  ): Promise<DebugGate> {
    if (!this.enabled || this.aborted) return this.aborted ? 'abort' : 'continue';

    const decision = this.shouldPauseAt(action, scope);

    if (decision.trace) {
      this.events.onLog?.(
        `Tracepoint — "${action.name}"${decision.condition ? ` (${decision.condition})` : ''}`,
        'info'
      );
      return 'continue';
    }

    if (!decision.pause) return 'continue';

    const info: DebugPauseInfo = {
      nodeId: action.id,
      nodeName: action.name ?? action.id,
      reason: decision.reason,
      sequence,
      at: new Date().toISOString(),
      condition: decision.condition,
    };

    this.totalHits += 1;
    this.pausedAt = info;
    this.state = 'paused';
    this.runToNodeId = null;
    this.evaluateWatches(scope);
    this.events.onHit?.(info);
    this.emit();

    return this.waitWhilePaused();
  }

  /**
   * Decide whether to stop before a node.
   *
   * Order matters: an explicit Run-to-here target and a pending step both beat
   * breakpoint evaluation, so pressing Step always advances exactly one node
   * even if the next node has a condition that happens to be false.
   */
  private shouldPauseAt(
    action: WorkflowAction,
    scope: Record<string, any>
  ): { pause: boolean; trace: boolean; reason: DebugPauseInfo['reason']; condition?: string } {
    if (this.state === 'stepping') {
      return { pause: true, trace: false, reason: 'step' };
    }

    if (this.runToNodeId && this.runToNodeId === action.id) {
      return { pause: true, trace: false, reason: 'runToCursor' };
    }

    const breakpoint = this.breakpoints.get(action.id);
    if (!breakpoint || !breakpoint.enabled) {
      return { pause: false, trace: false, reason: 'breakpoint' };
    }

    breakpoint.hitCount += 1;

    const condition = breakpoint.condition?.trim();
    if (condition) {
      let matched = false;
      try {
        matched = evaluateCondition(condition, scope);
      } catch (error: any) {
        this.events.onLog?.(
          `Breakpoint condition on "${action.name}" could not be evaluated (${String(
            error?.message ?? error
          )}) — pausing so it can be inspected.`,
          'warning'
        );
        matched = true;
      }
      if (!matched) return { pause: false, trace: false, reason: 'breakpoint', condition };
    }

    return {
      pause: !breakpoint.logOnly,
      trace: Boolean(breakpoint.logOnly),
      reason: 'breakpoint',
      condition,
    };
  }

  /** Park until Resume / Step / Stop. Resolves with the loop's next move. */
  private waitWhilePaused(): Promise<DebugGate> {
    return new Promise<DebugGate>((resolve) => {
      this.release = resolve;
    });
  }

  private releaseGate(gate: DebugGate): void {
    const release = this.release;
    this.release = null;
    release?.(gate);
  }

  /* ------------------------------- controls ------------------------------- */

  /** Stop before the next node, without a breakpoint. */
  pause(): void {
    if (!this.enabled || this.state === 'paused') return;
    this.state = 'stepping';
    this.emit();
  }

  resume(): void {
    if (this.state !== 'paused' && this.state !== 'stepping') return;
    this.state = this.enabled ? 'running' : 'inactive';
    this.pausedAt = null;
    this.releaseGate('continue');
    this.emit();
  }

  /** Run exactly one node, then stop again. */
  stepOver(): void {
    if (!this.enabled) return;
    this.state = 'stepping';
    this.pausedAt = null;
    this.releaseGate('continue');
    this.emit();
  }

  /** Continue until a specific node is reached, ignoring other breakpoints. */
  runTo(nodeId: string): void {
    if (!this.enabled || !nodeId) return;
    this.runToNodeId = nodeId;
    this.state = 'running';
    this.pausedAt = null;
    this.releaseGate('continue');
    this.emit();
  }

  /** Abandon the run from the debugger; the loop breaks on the next gate. */
  abort(): void {
    this.aborted = true;
    this.state = 'inactive';
    this.pausedAt = null;
    this.releaseGate('abort');
    this.emit();
  }

  isPaused(): boolean {
    return this.state === 'paused';
  }

  getState(): DebugState {
    return this.state;
  }

  getPausedAt(): DebugPauseInfo | null {
    return this.pausedAt ? { ...this.pausedAt } : null;
  }

  /* -------------------------------- output -------------------------------- */

  snapshot(): DebugSessionSnapshot {
    return {
      state: this.state,
      enabled: this.enabled,
      breakpoints: this.getBreakpoints(),
      watches: this.getWatches(),
      pausedAt: this.getPausedAt(),
      runToNodeId: this.runToNodeId,
      hitCount: this.totalHits,
    };
  }

  private emit(): void {
    this.events.onChange?.(this.snapshot());
  }

  /** Replace the event handlers, e.g. after a React remount. */
  setEvents(events: DebugSessionEvents): void {
    this.events = events;
  }

  /** Release any parked run so a unmounting editor cannot leak a promise. */
  dispose(): void {
    this.releaseGate('abort');
    this.events = {};
  }
}

/* -------------------------------------------------------------------------- */
/*                                 PERSISTENCE                                */
/* -------------------------------------------------------------------------- */

const storageKey = (workflowId: string) => `autoflow:breakpoints:${workflowId}`;

/** Breakpoints belong to the workflow, so they survive a page reload. */
export function saveBreakpoints(workflowId: string, breakpoints: Breakpoint[]): void {
  if (!workflowId || typeof localStorage === 'undefined') return;
  try {
    const persistable = breakpoints.map(({ nodeId, enabled, condition, logOnly }) => ({
      nodeId,
      enabled,
      condition,
      logOnly,
      hitCount: 0,
    }));
    localStorage.setItem(storageKey(workflowId), JSON.stringify(persistable));
  } catch {
    /* storage unavailable or full — breakpoints simply do not persist */
  }
}

export function loadBreakpoints(workflowId: string): Breakpoint[] {
  if (!workflowId || typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(storageKey(workflowId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item: any) => item && typeof item.nodeId === 'string')
      .map((item: any) => ({
        nodeId: item.nodeId,
        enabled: item.enabled !== false,
        condition: typeof item.condition === 'string' ? item.condition : undefined,
        logOnly: Boolean(item.logOnly),
        hitCount: 0,
      }));
  } catch {
    return [];
  }
}

export function createDebugSession(events: DebugSessionEvents = {}): WorkflowDebugSession {
  return new WorkflowDebugSession(events);
}
