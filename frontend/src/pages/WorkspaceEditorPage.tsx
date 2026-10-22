// src/pages/WorkspaceEditorPage.tsx

import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { v4 as uuidv4 } from 'uuid';
import * as Icons from 'lucide-react';

import Header from '../components/Header';
import Sidebar from '../components/Sidebar';
import WorkflowCanvas from '../components/WorkflowCanvas';
import PropertiesPanel from '../components/PropertiesPanel';
import VariablePanel from '../components/VariablePanel';
import ExecutionPanel from '../components/ExecutionPanel';
import VersionHistoryModal from '../components/VersionHistoryModal';
import TriggersPanel from '../components/TriggersPanel';
import ChatsPanel from '../components/ChatsPanel';
import {
  WorkflowAction,
  Connection,
  WorkflowVariable,
  ExecutionLog,
  ExecutionSnapshot,
  NodeOutputRecord,
  BindingSourceGroup,
} from '../types/workflow';
import { validateWorkflow } from '../lib/executionStatus';
import { automationCategories } from '../data/automationCategories';
import {
  findUnavailableWorkflowActions,
  getWorkflowActionAvailability,
} from '../lib/actionAvailability';
import { getPrimaryPort, routeConnection, summarisePorts, validatePortWiring } from '../lib/ports';
import {
  useWorkspaceStore,
  readWorkflowDraft,
  writeWorkflowDraft,
  removeWorkflowDraft,
  isDraftNewerThan,
} from '../store/useWorkspaceStore';

// ─── Workflow runtime (shared, single implementation) ─────────────────────────
//
// The interpolation, flattening and merge helpers that used to live inline in
// this file now live in `src/lib` so the executor, the Properties Panel preview
// and any future plugin all resolve bindings identically.
import {
  WorkflowExecutionContext,
  createExecutionContext,
} from '../lib/executionContext';
import {
  resolveDeep,
  resolveString,
  stripUnresolvedPlaceholders,
  evaluateCondition,
  extractTokens,
} from '../lib/expression';
import {
  deepMerge,
  flattenObject,
  isPlainObject,
} from '../lib/objectUtils';
import { WorkflowLogger, createWorkflowLogger } from '../lib/workflowLogger';
import { persistSnapshot, loadLatestLocalSnapshot } from '../lib/executionSnapshot';
import { buildBindingCatalogue, collectUpstreamNodeIds } from '../lib/bindingSources';
import { buildDeclaredCatalogue, mergeCatalogues } from '../lib/outputSchema';
import {
  loadOutputSourceCatalogue,
  type OutputSourceCoverage,
} from '../lib/outputSourceApi';
import {
  compareOutputSourceCatalogues,
  createOutputSourceShadowFailure,
  persistOutputSourceShadowReport,
} from '../lib/outputSourceParity';
import { OUTPUT_SOURCE_MODE } from '../lib/outputSourceMode';
import { resolveVisibleOutputSourceCatalogue } from '../lib/outputSourceCutover';
import { loadWorkflowVersionHistory } from '../lib/workflowVersionHistoryApi';
import {
  compareWorkflowVersionHistories,
  createWorkflowVersionHistoryShadowFailure,
  persistWorkflowVersionHistoryShadowReport,
} from '../lib/workflowVersionHistoryParity';
import { WORKFLOW_VERSION_HISTORY_MODE } from '../lib/workflowVersionHistoryMode';
import {
  createDebugSession,
  loadBreakpoints,
  saveBreakpoints,
  type Breakpoint,
  type DebugSessionSnapshot,
  type WorkflowDebugSession,
} from '../lib/workflowDebugger';
import {
  describeRetryOutcome,
  normalizeRetryPolicy,
  policyHasRetries,
  resolveErrorStrategy,
  runWithRetry,
} from '../lib/retryPolicy';
import {
  captureVersion,
  diffVersions,
  listVersions,
  nextVersionNumber,
  restoreVersion,
  saveVersion,
  type WorkflowVersion,
} from '../lib/workflowVersioning';
import { validateVariables } from '../lib/variableTypes';
import {
  coerceToContract,
  deepParseWithContract,
  describeCoercion,
  validateAgainstContract,
  type PropertyContract,
} from '../lib/payloadContract';
import { toEngineProxyUrl } from '../lib/engineProxyUrl';
import { buildPassthroughOutput, resolveExecutionMode } from '../lib/executionMode';
import {
  LOOP_BODY_PORT,
  advanceLoopState,
  LOOP_DONE_PORT,
  activeLoopFrame,
  captureLoopBodyOutput,
  finaliseCurrentLoopIteration,
  isLoopContinueNode,
  isLoopControllerNode,
  isLoopSignalNode,
  isStructuredWorkflowControlNode,
  loopExecutionKey,
  loopKindOf,
  loopRuntimeAliases,
  loopScope,
  makeLoopDoneOutput,
  popLoopFrame,
  type WorkflowLoopFrame,
} from '../lib/loopControl';
import type { LocalFileHandle } from '../types/fileSystem';

// Draft persistence (readWorkflowDraft / writeWorkflowDraft / removeWorkflowDraft /
// isDraftNewerThan) now lives in the store as the single source of truth, and is
// imported above. The editor no longer keeps a divergent copy — that duplication
// was what allowed a stale draft to shadow freshly-saved backend data.

/**
 * Serialize the *editable* shape of a workflow for dirty-state detection.
 * Runtime-only fields (execution status / timing) are stripped so that running
 * the workflow never counts as an unsaved change — only real structural,
 * property, position, name, connection, or variable edits do.
 */
function serializeForDirty(state: {
  name: string;
  actions: WorkflowAction[];
  connections: Connection[];
  variables: WorkflowVariable[];
}): string {
  const actions = state.actions.map((action) => {
    const clone: Record<string, unknown> = { ...(action as unknown as Record<string, unknown>) };
    delete clone.status;
    delete clone.executionTime;
    return clone;
  });
  return JSON.stringify({
    name: state.name,
    actions,
    connections: state.connections,
    variables: state.variables,
  });
}

// ─── Error formatting ─────────────────────────────────────────────────────────

/**
 * Turn a backend response (parsed object or raw text) into a human-readable
 * message. Previously failures were thrown as
 *   `API error: 400 - ${result || rawText}`
 * which rendered a parsed object as the useless string "[object Object]",
 * hiding the actual validation message the server sent back. This pulls the
 * common message-bearing fields, and falls back to the full JSON / raw body so
 * nothing is ever silently swallowed.
 */
function describeApiError(result: any, rawText: string): string {
  if (result && typeof result === 'object') {
    return (
      result.message ||
      result.error ||
      result.Error ||
      result.detail ||
      result.title ||
      result.errorMessage ||
      JSON.stringify(result)
    );
  }
  const text = String(result ?? '').trim();
  return text || rawText || 'Unknown error';
}

// ─── Interpolation ────────────────────────────────────────────────────────────
//
// `interpolate` is now a thin adapter over the shared resolver in
// `src/lib/expression.ts`. The old implementation could only do a flat
// `context[key]` lookup, which is precisely why `{{previous.employeeId}}` and
// `{{steps.ReadEmployeeExcel.employeeId}}` never resolved. The adapter keeps
// the original call signature (and the "leave an unresolved token verbatim"
// behaviour that `stripUnresolvedPlaceholders` depends on) so every existing
// call site keeps working unchanged.
function interpolate(value: any, context: Record<string, any>): any {
  return resolveDeep(value, context, { onMissing: 'keep' });
}

function normalizeExecutionAliases<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map(normalizeExecutionAliases) as T;
  }

  if (value && typeof value === 'object') {
    const normalized: Record<string, any> = Object.fromEntries(
      Object.entries(value as Record<string, any>).map(([key, val]) => [
        key,
        normalizeExecutionAliases(val),
      ])
    );

    if ('talentId' in normalized && !('tenantId' in normalized)) {
      normalized.tenantId = normalized.talentId;
    }

    return normalized as T;
  }

  return value;
}

// ─── Engine URL → dev-proxy rewrite ───────────────────────────────────────────
//
// `toEngineProxyUrl` now lives in `src/lib/engineProxyUrl.ts` and is imported
// above. It was moved out of this file unchanged in behaviour so the test suite
// can exercise the real expression rather than a copy of it, and so the list of
// proxied prefixes ("engine", "VulnerabilityScanner") sits next to the comment
// explaining that it must mirror `server.proxy` in `vite.config.ts`.
//
// There is still exactly one rewrite implementation and this file is still its
// only caller.

// ─── Time normalization (24h "HH:mm" → 12h "h:mm AM/PM") ──────────────────────
//
// Some backends (e.g. the Teams engine) parse times with a 12-hour pattern and
// reject 24-hour values: "7:55 PM" succeeds, "19:55" throws. The time picker is
// supposed to store the 12-hour form, but a node saved by an older build — or
// one not yet re-touched after the picker change — can still hold "HH:mm".
// `normalizeTimeFieldsForExecution` converts those at request time, driven by
// the action's own propertyConfig so only fields actually declared as `time`
// are touched (no guessing by key name, no effect on any other field). Already-
// 12h values and ISO timestamps are left as-is.
function toTwelveHourClock(value: string): string {
  const m = String(value).match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return value;
  let hour = parseInt(m[1], 10);
  const minute = m[2];
  if (Number.isNaN(hour) || hour > 23 || Number(minute) > 59) return value;
  const meridiem = hour >= 12 ? 'PM' : 'AM';
  hour = hour % 12;
  if (hour === 0) hour = 12;
  return `${hour}:${minute} ${meridiem}`;
}

function normalizeTimeFieldsForExecution(
  properties: Record<string, any>,
  propertyConfig: any
): Record<string, any> {
  if (
    !properties ||
    typeof properties !== 'object' ||
    !propertyConfig ||
    typeof propertyConfig !== 'object'
  ) {
    return properties;
  }

  let changed = false;
  const next: Record<string, any> = { ...properties };

  Object.entries(propertyConfig as Record<string, any>).forEach(([key, node]) => {
    const isTime =
      node &&
      typeof node === 'object' &&
      ((node as any).type === 'time' || (node as any).uiType === 'time');
    if (!isTime) return;
    const v = next[key];
    if (typeof v === 'string' && /^\d{1,2}:\d{2}$/.test(v.trim())) {
      const converted = toTwelveHourClock(v.trim());
      if (converted !== v) {
        next[key] = converted;
        changed = true;
      }
    }
  });

  return changed ? next : properties;
}

// ─── Property merge + placeholder sanitation ──────────────────────────────────
//
// `deepMergeProperties` merges a service's CURRENT default properties UNDER the
// properties already saved on a node (saved values always win). Pulled to module
// scope so execution and hydration share one implementation, and so a default
// added to a service after a workflow was saved — e.g. Email Read's new
// `batch.limit` — is filled into older saved nodes without any manual re-editing.
function deepMergeProperties(base: any, override: any): any {
  return deepMerge(base, override);
}

/**
 * Honour a node's optional explicit output capture.
 *
 *   • `outputKey`      publishes the whole result as a named workflow variable.
 *   • `outputMapping`  lifts individual fields out of the result into variables.
 *
 * Both were previously written inline in the API path only, which meant any
 * future non-API completion would silently not support them. Pulled out so
 * every mode publishes identically from one implementation.
 */
function publishNodeOutputs(
  action: WorkflowAction,
  result: any,
  context: WorkflowExecutionContext
): void {
  const outputKey = (action as any).outputKey;
  if (typeof outputKey === 'string' && outputKey.trim()) {
    context.setVariable(outputKey.trim(), result);
  }
  if (isPlainObject(action.outputMapping)) {
    const producedScope = context.buildScope({ currentAction: action });
    Object.entries(action.outputMapping).forEach(([variableName, sourcePath]) => {
      if (!variableName || typeof sourcePath !== 'string') return;
      const lifted = resolveString(
        sourcePath.includes('{{') ? sourcePath : `{{${sourcePath}}}`,
        producedScope,
        { onMissing: 'undefined' }
      );
      if (lifted !== undefined) context.setVariable(variableName, lifted);
    });
  }
}

const multipartKey = (actionId: string, fieldPath: string) => `${actionId}::${fieldPath}`;

// Minimal structural typing for the Chromium File System Access API (Chrome /
// Edge). A handle lets the executor re-read a picked file's CURRENT bytes
// before each node (so chained writes accumulate) and write updated workbooks
// back to the original file on disk instead of downloading a copy.
// `LocalFileHandle` is imported from `src/types/fileSystem` (single declaration).

function appendFormData(formData: FormData, key: string, value: any): void {
  if (value === undefined || value === null) return;

  if (value instanceof File) {
    formData.append(key, value, value.name);
    return;
  }

  if (value instanceof Blob) {
    formData.append(key, value);
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      if (item && typeof item === 'object' && !Array.isArray(item)) {
        Object.entries(item).forEach(([childKey, childValue]) => {
          appendFormData(formData, `${key}[${index}].${childKey}`, childValue);
        });
      } else {
        formData.append(`${key}[${index}]`, String(item));
      }
    });
    return;
  }

  if (typeof value === 'object') {
    Object.entries(value).forEach(([childKey, childValue]) => {
      appendFormData(formData, `${key}.${childKey}`, childValue);
    });
    return;
  }

  formData.append(key, String(value));
}

// `stripUnresolvedPlaceholders` (the final safety net that stops a literal
// "{{limit}}" ever reaching the engine) now lives in `src/lib/expression.ts`
// alongside the resolver that produces those leftovers, and is imported above.

// ─── Workflow control nodes (Start / End / Loops) ────────────────────────────

const WORKFLOW_CONTROL_NODE_TYPES = new Set([
  'workflow-start',
  'workflow-end',
  'workflow-for-each',
  'workflow-while',
  'workflow-repeat-until',
  'workflow-break',
  'workflow-continue',
]);

const isWorkflowControlNode = (action?: WorkflowAction | null) => {
  if (!action?.type) return false;
  return WORKFLOW_CONTROL_NODE_TYPES.has(String(action.type).trim().toLowerCase());
};

type LoopControllerRoute = typeof LOOP_BODY_PORT | typeof LOOP_DONE_PORT;

interface LoopControllerTransition {
  route: LoopControllerRoute;
  frames: WorkflowLoopFrame[];
  output: Record<string, any>;
}

/** Keep binding aliases in the shared execution context aligned with the queue entry. */
const syncLoopRuntime = (context: WorkflowExecutionContext, frames: WorkflowLoopFrame[]) => {
  const keys = [
    'loop',
    'loops',
    'loopStack',
    'currentItem',
    'currentIndex',
    'currentKey',
    'iteration',
  ];
  if (frames.length === 0) {
    keys.forEach((key) => context.clearRuntimeValue(key));
    return;
  }
  context.setRuntimeValues(loopRuntimeAliases(frames));
};

/**
 * Advance one loop controller. The scheduler calls this both on the initial
 * entry and when a body path connects back to the controller (or Continue
 * schedules it). No plugin endpoint is involved.
 */
const transitionLoopController = (input: {
  action: WorkflowAction;
  context: WorkflowExecutionContext;
  frames: WorkflowLoopFrame[];
  inputData?: any;
  fromNodeId?: string | null;
  portId?: string | null;
}): LoopControllerTransition => {
  const { action, context, inputData, fromNodeId, portId } = input;
  const kind = loopKindOf(action);
  if (!kind) throw new Error(`Unsupported loop controller: ${action.type}`);

  const baseScope = context.buildScope({
    input: inputData,
    currentAction: action,
    previousNodeId: fromNodeId ?? undefined,
    previousPortId: portId ?? undefined,
    previousPortPayload: portId ? inputData : undefined,
  });
  const rawProps = action.properties ?? {};

  return advanceLoopState({
    action,
    frames: input.frames,
    inputData,
    collectionValue:
      kind === 'for-each' ? resolveDeep(rawProps.collection, baseScope) : undefined,
    condition: kind === 'for-each' ? undefined : String(rawProps.condition ?? ''),
    maxIterationsValue: resolveDeep(rawProps.maxIterations, baseScope),
    evaluate: (condition, frames) =>
      evaluateCondition(condition, loopScope(baseScope, frames)),
  });
};

// ─── Editor state ─────────────────────────────────────────────────────────────

type EditorLoadState = 'loading' | 'loaded' | 'notFound' | 'error';

// ─── Shared UI styles (visual only — no behavior) ────────────────────────────
// One consistent button language across the editor's full-screen states, with
// proper hover / active / keyboard-focus treatment.

const BTN_PRIMARY =
  'inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white ' +
  'shadow-[0_8px_24px_-8px_rgba(99,102,241,0.55)] transition-all duration-200 ' +
  'hover:bg-indigo-500 hover:shadow-[0_10px_28px_-8px_rgba(99,102,241,0.7)] active:scale-[0.98] ' +
  'outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#05070D]';

const BTN_SECONDARY =
  'inline-flex items-center justify-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-2.5 text-sm font-medium text-slate-300 ' +
  'transition-all duration-200 hover:border-white/[0.14] hover:bg-white/[0.07] hover:text-slate-100 active:scale-[0.98] ' +
  'outline-none focus-visible:ring-2 focus-visible:ring-slate-400/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[#05070D]';

// Shared ambient backdrop for the full-screen load / not-found / error states,
// so they feel like part of the same room as the editor itself.
const StateBackdrop: React.FC = () => (
  <div aria-hidden="true" className="absolute inset-0 pointer-events-none">
    <div className="absolute inset-x-0 top-0 h-64 bg-[linear-gradient(180deg,rgba(99,102,241,0.06)_0%,transparent_100%)]" />
    <div className="absolute top-[-20%] left-[2%] h-[42%] w-[42%] rounded-full bg-indigo-600/[0.08] blur-[150px]" />
    <div className="absolute bottom-[-20%] right-[-2%] h-[38%] w-[38%] rounded-full bg-violet-600/[0.06] blur-[130px]" />
    <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,rgba(3,5,11,0.5)_100%)]" />
  </div>
);

// ─── Execution drawer chrome ──────────────────────────────────────────────────
//
// The drawer has THREE layouts, and which CSS properties each one is allowed to
// set is load-bearing rather than cosmetic.
//
// A `transform`, a `filter` and a `backdrop-filter` EACH make an element the
// containing block for `position: fixed` descendants, and a `z-index` on a
// positioned element opens a stacking context. The maximized console is a
// `fixed inset-0` layer at `z-[100]` with its own `fixed inset-0` backdrop at
// `z-[99]`. If any of those properties is present on this drawer, both layers
// resolve against a 360px box at the bottom of the canvas instead of against
// the viewport, and end up trapped beneath the header (`z-40`) and the
// right-hand panels (`z-30`) — which reads to the user as "Maximize does
// nothing".
//
//   DOCKED     Full chrome: translate + z-index. Safe, because nothing inside
//              the panel is `fixed` while it is docked.
//   MAXIMIZED  A zero-height, unstyled, un-transformed anchor. Out of flow so
//              the canvas is untouched; no transform or filter, so `fixed`
//              reaches the viewport; no z-index, so the console's own layering
//              wins.
//   RESTORING  A brief in-between phase that gives the height back so the
//              docked panel is visible again, but still WITHOUT a transform,
//              because the backdrop is still on screen fading out. Skipping
//              this phase is what made restore show a dark rectangle over the
//              drawer instead of a full-viewport fade.
//
// The background/blur that used to live here was also removed: the panel paints
// its own opaque `#0b0d11`, so the blur had nothing to blur, and a stray
// `backdrop-blur` on this element is the single easiest way to break full-screen
// mode again. The drawer now contributes only its top border and lift shadow.
//
// The <ExecutionPanel> element itself never moves in the React tree and is
// never remounted, which is what preserves its tab, filters, search text,
// expanded rows, technical sections and scroll positions across every switch.
const EXECUTION_DRAWER_DOCKED =
  'absolute bottom-0 left-0 right-0 z-20 h-[360px] flex-shrink-0 border-t border-white/[0.08] ' +
  'shadow-[0_-16px_48px_-8px_rgba(0,0,0,0.6)] ' +
  'transition-[transform,opacity] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]';

const EXECUTION_DRAWER_RESTORING =
  'absolute bottom-0 left-0 right-0 h-[360px] flex-shrink-0 border-t border-white/[0.08] ' +
  'shadow-[0_-16px_48px_-8px_rgba(0,0,0,0.6)]';

const EXECUTION_DRAWER_MAXIMIZED = 'absolute bottom-0 left-0 right-0 h-0 overflow-visible';

/** Must outlast the panel's own 260ms restore animation. */
const EXECUTION_RESTORE_MS = 320;

type ExecutionDrawerPhase = 'docked' | 'maximized' | 'restoring';

// ─── Component ────────────────────────────────────────────────────────────────
//
// ⚠️ RULES OF HOOKS — read before editing this component.
//
// Every hook in this file (useState / useRef / useEffect / useCallback /
// useMemo, plus useNavigate, useParams and useWorkspaceStore) MUST be called
// unconditionally, at the top level, on every render, in the same order.
//
// This component has three early returns for the loading / notFound / error
// states. They live in ONE place, immediately before the main `return`, and
// **no hook may be declared below them**. A hook placed after an early return
// is skipped on the renders that take that branch, so React sees a different
// number of hooks between renders and throws:
//
//     "Rendered more hooks than during the previous render."
//
// …which unmounts the subtree and leaves the editor blank. That is exactly the
// bug that `bindingGroups` / `previewScope` caused: they were declared after
// the early returns, so they were skipped while `loadState === 'loading'` and
// appeared once it flipped to `'loaded'`.
//
// Rule of thumb for this file: all hooks go above the
// "── Loading / not found / error states ──" divider. Nothing hook-shaped goes
// below it.

const WorkspaceEditorPage: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();

  const {
    getWorkflow,
    saveWorkflowState,
    hasActiveWorkspace,
    isLoadingWorkspace,
    refreshWorkspace,
  } = useWorkspaceStore();

  // ── Core workflow state ──────────────────────────────────────────────────────
  const [workflowName, setWorkflowName] = useState('');
  const [actions, setActions] = useState<WorkflowAction[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [variables, setVariables] = useState<WorkflowVariable[]>([]);
  const [executionLogs, setExecutionLogs] = useState<ExecutionLog[]>([]);

  // ── Execution state ──────────────────────────────────────────────────────────
  const [activeConnections, setActiveConnections] = useState<Set<string>>(new Set());
  // Per-node outputs recorded by the current (or most recent) run. This is the
  // read side of workflow-wide carry-forward: the Properties Panel builds its
  // binding catalogue from it and the Execution Panel renders it as a live
  // context inspector. It replaces the old `executionData` Map, whose value was
  // discarded at the destructure (`const [, setExecutionData]`) and could
  // therefore never be read by anything.
  const [executionRecords, setExecutionRecords] = useState<NodeOutputRecord[]>([]);
  const [contextSnapshot, setContextSnapshot] = useState<ExecutionSnapshot | null>(null);
  const [currentRunId, setCurrentRunId] = useState<string | null>(null);
  const [indexedOutputCatalogue, setIndexedOutputCatalogue] = useState<{
    runId: string;
    targetNodeId: string | null;
    groups: BindingSourceGroup[];
    coverage: OutputSourceCoverage;
  } | null>(null);
  const [indexedOutputCatalogueLoading, setIndexedOutputCatalogueLoading] = useState(false);
  const [indexedOutputCatalogueError, setIndexedOutputCatalogueError] = useState<string | null>(null);

  // ── UI state ──────────────────────────────────────────────────────────────────
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(100);
  const [loadState, setLoadState] = useState<EditorLoadState>('loading');
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // ── Connection dragging state ─────────────────────────────────────────────────
  // `portId` is the named output the drag began from, or null when the user
  // dragged from a single-output node. It becomes `Connection.sourcePort`,
  // which is what makes the new edge carry only that branch's slice.
  const [connectionStart, setConnectionStart] = useState<
    { nodeId: string; port: 'output'; portId?: string | null } | null
  >(null);
  const [tempConnection, setTempConnection] = useState<{ x: number; y: number } | null>(null);

  // ── Panel states ──────────────────────────────────────────────────────────────
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [propertiesPanelOpen, setPropertiesPanelOpen] = useState(true);
  const [variablePanelOpen, setVariablePanelOpen] = useState(false);
  const [executionPanelOpen, setExecutionPanelOpen] = useState(false);
  // Full-screen execution console. The PAGE owns this rather than the panel,
  // because the page has to stand its own bottom-drawer chrome down while the
  // console is up (see EXECUTION_DRAWER_MAXIMIZED). The panel is mounted in
  // controlled mode and reports every maximize/restore back here.
  const [executionMaximized, setExecutionMaximized] = useState(false);
  const [triggersPanelOpen, setTriggersPanelOpen] = useState(false);
  const [ChatsPanelOpen, setChatsPanelOpen] = useState(false);

  // "Maximized" only ever means open AND maximized. Deriving it makes the
  // invalid combination unrepresentable: the console can never be left in
  // full-screen mode behind a closed panel, and the drawer below can key its
  // entire layout off this single flag. Plain derived value — not a hook.
  const isExecutionMaximized = executionPanelOpen && executionMaximized;

  // Drawer layout phase. This is deliberately NOT the same thing as
  // `isExecutionMaximized`: the drawer has to stay transform-free for a moment
  // *after* the console starts restoring, while the panel's backdrop is still
  // fading out over the viewport. See the EXECUTION_DRAWER_* constants.
  const [drawerPhase, setDrawerPhase] = useState<ExecutionDrawerPhase>('docked');

  useEffect(() => {
    if (isExecutionMaximized) {
      setDrawerPhase('maximized');
      return;
    }
    setDrawerPhase((phase) => (phase === 'maximized' ? 'restoring' : phase));
  }, [isExecutionMaximized]);

  useEffect(() => {
    if (drawerPhase !== 'restoring') return;
    const timer = setTimeout(() => setDrawerPhase('docked'), EXECUTION_RESTORE_MS);
    return () => clearTimeout(timer);
  }, [drawerPhase]);

  // Closing the console can never leave full-screen mode armed. Without this,
  // closing while maximized and then reopening — from the toolbar, or
  // implicitly when a run starts — would slam a full-screen console over the
  // canvas with no warning.
  useEffect(() => {
    if (!executionPanelOpen && executionMaximized) setExecutionMaximized(false);
  }, [executionPanelOpen, executionMaximized]);

  // ── Validation (presentation only; never blocks execution) ─────────────────
  const validation = useMemo(() => validateWorkflow(actions), [actions]);

  // Branch wiring is checked separately from required fields because the two
  // mean different things to an author. A missing required field is "this step
  // cannot run"; a badly wired port is "this step will run and quietly do the
  // wrong thing". The second is the more expensive mistake and the one nothing
  // caught before, so it is surfaced even though it never blocks a run.
  const portIssues = useMemo(
    () => validatePortWiring(actions, connections),
    [actions, connections]
  );
  const portErrorNodeIds = useMemo(
    () => new Set(portIssues.filter((i) => i.severity === 'error').map((i) => i.nodeId)),
    [portIssues]
  );

  const invalidNodeIds = useMemo(
    () => new Set([...validation.issues.map((i) => i.nodeId), ...portErrorNodeIds]),
    [validation, portErrorNodeIds]
  );
  const focusFirstInvalid = useCallback(() => {
    const first = validation.issues[0];
    if (!first) return;
    setSelectedNode(first.nodeId);
    setPropertiesPanelOpen(true);
  }, [validation]);

  const canvasRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const isMountedRef = useRef(true);
  // Holds the initialized ServiceRegistry so newly-added actions can be hydrated
  // synchronously with their service defaults (propertyConfig / api / properties).
  const registryRef = useRef<any>(null);
  // Re-render trigger: true once the registry has finished initializing.
  const [registryReady, setRegistryReady] = useState(false);
  // Serialized snapshot of the last saved (or freshly loaded) workflow. The
  // editor is "dirty" exactly when the current editable state differs from this.
  const baselineRef = useRef<string>('');
  // Selected File objects for multipart actions. The panel only shows the
  // filename, but the executor needs the real File for FormData.
  const multipartFileCacheRef = useRef<Map<string, File>>(new Map());
  // File System Access handles for files picked via showOpenFilePicker
  // (Chrome/Edge). Keyed identically to multipartFileCacheRef. A handle lets
  // the executor re-read fresh bytes per node and save updated workbooks back
  // to the original file on disk.
  const fileHandleCacheRef = useRef<Map<string, LocalFileHandle>>(new Map());

  // ── Execution runtime refs ────────────────────────────────────────────────
  // The live execution context for the current run. Held in a ref (not state)
  // so the run loop always reads the *current* object rather than a value
  // captured when the callback was created — the stale-closure class of bug
  // that made carry-forward unreliable even where it was attempted.
  const executionContextRef = useRef<WorkflowExecutionContext | null>(null);
  const loggerRef = useRef<WorkflowLogger | null>(null);
  // Mirrors of editable state, so long-running loops never read a stale copy.
  const actionsRef = useRef<WorkflowAction[]>([]);
  const variablesRef = useRef<WorkflowVariable[]>([]);
  const connectionsRef = useRef<Connection[]>([]);
  // Cooperative cancellation for Stop.
  const stopRequestedRef = useRef(false);

  // ── Debugger ──────────────────────────────────────────────────────────────
  // The session outlives individual runs: breakpoints belong to the workflow,
  // exactly as they do in an IDE, so they survive Run → Stop → Run and a page
  // reload. `debugState` is the React mirror the panels render from.
  const debugSessionRef = useRef<WorkflowDebugSession | null>(null);
  const [debugState, setDebugState] = useState<DebugSessionSnapshot>({
    state: 'inactive',
    enabled: false,
    breakpoints: [],
    watches: [],
    pausedAt: null,
    runToNodeId: null,
    hitCount: 0,
  });

  // ── Versioning ────────────────────────────────────────────────────────────
  const [versions, setVersions] = useState<WorkflowVersion[]>([]);
  const [versionPanelOpen, setVersionPanelOpen] = useState(false);
  const versionHistoryShadowReportKeyRef = useRef<string | null>(null);

  useEffect(() => { actionsRef.current = actions; }, [actions]);
  useEffect(() => { variablesRef.current = variables; }, [variables]);
  useEffect(() => { connectionsRef.current = connections; }, [connections]);

  /**
   * Push the live context into React state so the panels re-render, and mirror
   * it to persistent storage for debugging / recovery. Persistence is fire and
   * forget: a snapshot write can never fail or slow down a run.
   */
  const publishContext = useCallback(
    (status: 'running' | 'completed' | 'failed' | 'idle', options: { persist?: boolean } = {}) => {
      const context = executionContextRef.current;
      if (!context) return;

      const snapshot = context.snapshot({
        status: status === 'failed' ? 'error' : status === 'idle' ? 'idle' : status,
        finishedAt: status === 'running' ? undefined : new Date().toISOString(),
      });

      if (!isMountedRef.current) return;
      setExecutionRecords(context.getRecords());
      setContextSnapshot(snapshot);

      if (options.persist !== false) {
        void persistSnapshot(snapshot).catch(() => {
          /* persistence is best-effort by design */
        });
      }
    },
    []
  );

  /* ------------------------------- DEBUGGER ------------------------------- */

  /**
   * Lazily create the debug session. It is deliberately NOT recreated per run:
   * breakpoints and watches are properties of the workflow, so they persist
   * across runs and across reloads.
   */
  const getDebugSession = useCallback((): WorkflowDebugSession => {
    if (!debugSessionRef.current) {
      debugSessionRef.current = createDebugSession({
        onChange: (snapshot) => {
          if (isMountedRef.current) setDebugState(snapshot);
        },
        onHit: (info) => {
          loggerRef.current?.warn(
            `Paused at "${info.nodeName}"` +
              (info.reason === 'breakpoint'
                ? ' (breakpoint)'
                : info.reason === 'step'
                  ? ' (step)'
                  : info.reason === 'runToCursor'
                    ? ' (run to here)'
                    : ''),
            { phase: 'run' }
          );
          // Surface the live context the moment the run parks, so the
          // inspector shows current values rather than the last publish.
          publishContext('running', { persist: false });
        },
        onLog: (message, level) => {
          if (level === 'warning') loggerRef.current?.warn(message, { phase: 'run' });
          else loggerRef.current?.info(message, { phase: 'run' });
        },
      });
    }
    return debugSessionRef.current;
  }, [publishContext]);

  /** Persist breakpoints whenever they change, keyed by workflow. */
  useEffect(() => {
    if (!id) return;
    saveBreakpoints(id, debugState.breakpoints);
  }, [id, debugState.breakpoints]);

  /** Restore breakpoints and version history when a workflow is opened. */
  useEffect(() => {
    if (!id) return;
    const session = getDebugSession();
    loadBreakpoints(id).forEach((breakpoint: Breakpoint) => {
      session.setBreakpoint(breakpoint.nodeId, {
        enabled: breakpoint.enabled,
        condition: breakpoint.condition,
        logOnly: breakpoint.logOnly,
      });
    });
    setVersions(listVersions(id));
  }, [id, getDebugSession]);


  /**
   * Step 7B.6B — load PostgreSQL version history only when History is opened.
   * The visible modal remains backed by localStorage; this effect only records
   * a preview-free parity report for certification.
   */
  useEffect(() => {
    if (
      !id ||
      !versionPanelOpen ||
      WORKFLOW_VERSION_HISTORY_MODE.effective === 'legacy'
    ) {
      return;
    }

    let cancelled = false;
    loadWorkflowVersionHistory({
      mode: WORKFLOW_VERSION_HISTORY_MODE.effective,
      workflowId: id,
      includeDefinition: false,
    })
      .then((result) => {
        if (cancelled || result.status !== 'loaded') return;
        const localVersions = listVersions(id);
        const reportKey = [
          id,
          localVersions.length,
          localVersions[0]?.id ?? 'none',
          result.response.currentVersionNumber,
          result.response.coverage.returnedVersions,
        ].join('|');
        if (versionHistoryShadowReportKeyRef.current === reportKey) return;
        versionHistoryShadowReportKeyRef.current = reportKey;

        const report = compareWorkflowVersionHistories({
          workflowId: id,
          mode: WORKFLOW_VERSION_HISTORY_MODE,
          localVersions,
          postgresVersions: result.response.versions,
        });
        persistWorkflowVersionHistoryShadowReport(report);
        console.info('[AutoFlow workflow-version shadow]', {
          workflowId: id,
          cacheHit: result.cacheHit,
          pages: result.pages,
          summary: report.summary,
          verdict: report.verdict,
          visibleHistorySource: report.visibleHistorySource,
          restoreEnabled: report.restoreEnabled,
        });
      })
      .catch((error) => {
        if (cancelled) return;
        const report = createWorkflowVersionHistoryShadowFailure({
          workflowId: id,
          mode: WORKFLOW_VERSION_HISTORY_MODE,
          error,
        });
        persistWorkflowVersionHistoryShadowReport(report);
        console.warn('[AutoFlow workflow-version shadow]', report);
      });

    return () => {
      cancelled = true;
    };
  }, [id, versionPanelOpen, versions]);

  const handleToggleBreakpoint = useCallback(
    (nodeId: string) => {
      const session = getDebugSession();
      const added = session.toggleBreakpoint(nodeId);
      // Setting a breakpoint implies wanting the debugger on — otherwise the
      // marker appears on the canvas and nothing ever stops, which reads as a
      // bug rather than as a setting.
      if (added && !session.isEnabled()) session.setEnabled(true);
    },
    [getDebugSession]
  );

  const handleUpdateBreakpoint = useCallback(
    (nodeId: string, patch: Partial<Omit<Breakpoint, 'nodeId'>>) => {
      getDebugSession().setBreakpoint(nodeId, patch);
    },
    [getDebugSession]
  );

  const handleRemoveBreakpoint = useCallback(
    (nodeId: string) => getDebugSession().removeBreakpoint(nodeId),
    [getDebugSession]
  );

  const handleClearBreakpoints = useCallback(() => {
    getDebugSession().clearBreakpoints();
  }, [getDebugSession]);

  const handleToggleDebugMode = useCallback(() => {
    const session = getDebugSession();
    session.setEnabled(!session.isEnabled());
  }, [getDebugSession]);

  const handleDebugResume = useCallback(() => getDebugSession().resume(), [getDebugSession]);
  const handleDebugStep = useCallback(() => getDebugSession().stepOver(), [getDebugSession]);
  const handleDebugPause = useCallback(() => getDebugSession().pause(), [getDebugSession]);
  const handleDebugRunTo = useCallback(
    (nodeId: string) => getDebugSession().runTo(nodeId),
    [getDebugSession]
  );
  const handleDebugStop = useCallback(() => {
    stopRequestedRef.current = true;
    getDebugSession().abort();
  }, [getDebugSession]);

  const handleAddWatch = useCallback(
    (expression: string) => {
      const session = getDebugSession();
      session.addWatch(expression);
      const context = executionContextRef.current;
      if (context) session.evaluateWatches(context.buildScope({}));
    },
    [getDebugSession]
  );

  const handleRemoveWatch = useCallback(
    (watchId: string) => getDebugSession().removeWatch(watchId),
    [getDebugSession]
  );

  /** Enabled / disabled breakpoint ids, for the canvas gutter markers. */
  const breakpointNodeIds = useMemo(
    () => new Set(debugState.breakpoints.filter(bp => bp.enabled).map(bp => bp.nodeId)),
    [debugState.breakpoints]
  );
  const disabledBreakpointNodeIds = useMemo(
    () => new Set(debugState.breakpoints.filter(bp => !bp.enabled).map(bp => bp.nodeId)),
    [debugState.breakpoints]
  );

  /** Node id -> display name, so the debugger can label breakpoints. */
  const nodeNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    actions.forEach(action => { map[action.id] = action.name ?? action.id; });
    return map;
  }, [actions]);

  /* ------------------------------ VERSIONING ------------------------------ */

  /**
   * Freeze the current canvas as an immutable version.
   *
   * Called explicitly from the toolbar and automatically before a rollback, so
   * restoring an old version can itself always be undone.
   */
  const handleCaptureVersion = useCallback(
    (options: { label?: string; description?: string; auto?: boolean } = {}) => {
      if (!id) return null;
      const history = listVersions(id);
      const version = captureVersion(
        {
          name: workflowName,
          actions: actionsRef.current,
          connections: connectionsRef.current,
          variables: variablesRef.current,
        },
        {
          workflowId: id,
          version: nextVersionNumber(history[0]?.version),
          label: options.label,
          description: options.description,
          auto: options.auto,
        }
      );
      setVersions(saveVersion(version));
      loggerRef.current?.info(`Version ${version.version} saved.`, { phase: 'run' });
      return version;
    },
    [id, workflowName]
  );

  /**
   * Roll the canvas back to a stored version.
   *
   * An automatic version of the *current* state is cut first, so a rollback is
   * never destructive — the state being replaced remains recoverable.
   */
  const handleRestoreVersion = useCallback(
    (versionId: string) => {
      if (!id) return;
      const target = listVersions(id).find((version) => version.id === versionId);
      if (!target) return;

      handleCaptureVersion({
        label: 'Auto-save before rollback',
        auto: true,
      });

      const state = restoreVersion(target, {
        name: target.state.name,
        actions: actionsRef.current,
        connections: connectionsRef.current,
        variables: variablesRef.current,
      });
      setActions(state.actions ?? []);
      setConnections(state.connections ?? []);
      setVariables(state.variables ?? []);
      if (state.name) setWorkflowName(state.name);
      setSelectedNode(null);
      setVersions(listVersions(id));
      setVersionPanelOpen(false);
    },
    [id, handleCaptureVersion]
  );

  // Lets the PropertiesPanel ask whether a real File is currently cached for a
  // file field (fieldPath uses the panel's "a::b" path convention). Saved
  // workflows only persist the file *name*, so the panel uses this to warn
  // when a file must be re-selected before running. Reading the ref is safe:
  // selection updates the draft immediately after the cache, so consumers
  // re-render with the fresh answer.
  const hasSelectedFile = useCallback(
    (actionId: string, fieldPath: string) =>
      multipartFileCacheRef.current.has(multipartKey(actionId, fieldPath)),
    []
  );

  // Companion query: is the field backed by a writable disk handle? The panel
  // uses this to tell the user their changes will be saved back to the file.
  const hasWritableHandle = useCallback(
    (actionId: string, fieldPath: string) =>
      fileHandleCacheRef.current.has(multipartKey(actionId, fieldPath)),
    []
  );

  // ── Cleanup on unmount ───────────────────────────────────────────────────────
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      abortControllerRef.current?.abort();
    };
  }, []);

  // ── Robust workflow loading with fallback and store readiness ────────────────
  const loadWorkflow = useCallback(async () => {
    if (!id) {
      // No workflow selected — the Builder nav lands here. Send the user to the
      // Builder hub (recent workflows + create) instead of a dead-end error.
      navigate('/workspace/editor', { replace: true });
      return;
    }

    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setLoadState('loading');
    setSaveError(null);

    try {
      if (!hasActiveWorkspace || isLoadingWorkspace) {
        if (!controller.signal.aborted && isMountedRef.current) {
          setLoadState('loading');
        }
        return;
      }

      let workflow = await getWorkflow(id);
      if (controller.signal.aborted || !isMountedRef.current) return;

      if (!workflow) {
        await refreshWorkspace();
        if (controller.signal.aborted || !isMountedRef.current) return;
        workflow = await getWorkflow(id);
      }

      if (controller.signal.aborted || !isMountedRef.current) return;

      if (!workflow) {
        setLoadState('notFound');
        return;
      }

      // Backend response is the source of truth. A locally-stored draft is only
      // applied when it is strictly newer than the backend copy (i.e. genuine
      // unsaved work, e.g. after a crash/reload). Otherwise it's a stale leftover
      // and is discarded so it can never shadow saved data.
      const draft = readWorkflowDraft(id);
      const recoverDraft = isDraftNewerThan(draft, workflow.updatedAt);
      const hydrated = recoverDraft && draft
        ? {
            ...workflow,
            name: draft.name ?? workflow.name,
            actions: draft.actions,
            connections: draft.connections,
            variables: draft.variables,
            description: draft.description ?? workflow.description,
          }
        : workflow;

      if (!recoverDraft && draft) {
        removeWorkflowDraft(id);
      }

      // Baseline always reflects the *backend* (saved) state, so a recovered
      // draft correctly shows as unsaved until the user saves it.
      baselineRef.current = serializeForDirty({
        name: workflow.name,
        actions: workflow.actions ?? [],
        connections: workflow.connections ?? [],
        variables: workflow.variables ?? [],
      });

      setWorkflowName(hydrated.name);
      setActions(hydrated.actions ?? []);
      setConnections(hydrated.connections ?? []);
      setVariables(hydrated.variables ?? []);
      setExecutionLogs([]);
      setSelectedNode(null);
      setActiveConnections(new Set());
      // Rehydrate the most recent run's context (if one was persisted) so the
      // binding picker and field previews show real captured values the moment
      // the workflow opens, without having to re-run it first.
      const lastRun = loadLatestLocalSnapshot(id);
      setExecutionRecords(lastRun?.outputs ?? []);
      setContextSnapshot(lastRun);
      setCurrentRunId(lastRun?.runId ?? null);
      executionContextRef.current = null;
      setHasUnsavedChanges(recoverDraft);
      setSaveError(null);
      setLoadState('loaded');
    } catch (error) {
      if (controller.signal.aborted || !isMountedRef.current) return;
      console.error('Failed to load workflow:', error);
      setLoadState('error');
    }
  }, [id, navigate, getWorkflow, refreshWorkspace, hasActiveWorkspace, isLoadingWorkspace]);

  useEffect(() => {
    loadWorkflow();
  }, [loadWorkflow]);

  // Authoritative dirty detection: compare current editable state to the saved
  // baseline. This makes the unsaved-changes warning accurate — reverting an
  // edit back to its saved value clears the flag, and identical no-op updates
  // (or execution status changes) never mark the workflow dirty.
  useEffect(() => {
    if (loadState !== 'loaded') return;
    const current = serializeForDirty({ name: workflowName, actions, connections, variables });
    setHasUnsavedChanges(current !== baselineRef.current);
  }, [loadState, workflowName, actions, connections, variables]);

  // Persist a draft (unsaved-work backup) only while there are real unsaved
  // changes; clear it as soon as the editor is back in sync with the backend.
  useEffect(() => {
    if (!id || loadState !== 'loaded') return;
    if (hasUnsavedChanges) {
      writeWorkflowDraft(id, { name: workflowName, actions, connections, variables });
    } else {
      removeWorkflowDraft(id);
    }
  }, [id, loadState, hasUnsavedChanges, workflowName, actions, connections, variables]);

  // ── Service registry init ─────────────────────────────────────────────────────
  useEffect(() => {
    const initializeServices = async () => {
      try {
        const { ServiceRegistry } = await import('../services/serviceRegistry');
        const registry = ServiceRegistry.getInstance();
        if (registry.initialize) await registry.initialize();
        registryRef.current = registry;
        // Flip a state flag so memoized values that depend on the registry
        // (e.g. the hydrated selected action) recompute once it is ready.
        if (isMountedRef.current) setRegistryReady(true);
      } catch (error) {
        console.error('Failed to initialize service registry:', error);
      }
    };
    initializeServices();
  }, []);

  // ── Service resolution (collision-safe) ───────────────────────────────────────
  // The ServiceRegistry is keyed by `type` alone, but several categories declare
  // the SAME `type` — e.g. both Microsoft Teams (`microsoft-teams-010`) and Asana
  // (`asana-033`) define `"create-team"`, and `get-folder` / `upload` / `download`
  // / `search` / `share` / `copy` / `move` / `rename` / `test-connection` /
  // `upload-file` collide across Drive / OneDrive / SharePoint / S3 / SFTP / etc.
  // A type-keyed lookup returns whichever was registered last, so
  // `getService("create-team")` hands back Asana's service even for a Teams node —
  // dragging Asana's accessToken / apiBaseUrl / resourceId into the panel and
  // pointing execution at Asana's URL.
  //
  // `resolveService` closes that hole without needing changes to the registry:
  // if the resolved service's `category` doesn't match the node's own
  // `category`, it's a mis-resolution from a colliding type, so we ignore it and
  // let the node's baked-in `api` / `propertyConfig` stand. Nodes without a
  // category (older data) behave exactly as before.
  const resolveService = useCallback((action: WorkflowAction | null): any => {
    if (!action) return null;
    const svc = registryRef.current?.getService?.((action as any).type);
    if (!svc) return null;

    const actionCategory = (action as any).category;
    if (actionCategory && svc.category && svc.category !== actionCategory) {
      return null;
    }
    return svc;
  }, []);

  // ── Navigation guard: warn on unsaved changes ─────────────────────────────────
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!hasUnsavedChanges) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges]);

  /**
   * Reflect variables written *during* a run (via `outputKey` / `outputMapping`
   * or a plugin calling `setVariable`) back into the editor's variable list, so
   * the Variables panel shows live values and a subsequent save persists them.
   * Existing definitions keep their type/description; genuinely new names are
   * appended as runtime-scoped variables.
   */
  const syncContextVariablesToPanel = useCallback((context: WorkflowExecutionContext) => {
    const live = context.getVariables();
    if (!isMountedRef.current) return;

    setVariables(prev => {
      let changed = false;
      const next = prev.map(variable => {
        if (!(variable.name in live)) return variable;
        const value = live[variable.name];
        if (Object.is(value, variable.value)) return variable;
        changed = true;
        return { ...variable, value, lastUpdated: new Date().toISOString() };
      });

      const known = new Set(prev.map(variable => variable.name));
      Object.entries(live).forEach(([name, value]) => {
        if (known.has(name)) return;
        changed = true;
        next.push({
          id: uuidv4(),
          name,
          type: Array.isArray(value)
            ? 'array'
            : value !== null && typeof value === 'object'
              ? 'object'
              : (typeof value as WorkflowVariable['type']),
          value,
          description: 'Captured from node output during execution',
          scope: 'global',
          lastUpdated: new Date().toISOString(),
        });
      });

      return changed ? next : prev;
    });
  }, []);

  // ── Action execution logic ────────────────────────────────────────────────────

  /**
   * Execute one node against the shared workflow execution context.
   *
   * The context is the mechanism that makes workflow-wide carry-forward real:
   *
   *   1. BEFORE the node runs, its payload is resolved from `ctx.buildScope()`,
   *      which exposes workflow variables, every earlier node's output (by name
   *      and by id), the previous node's output, and the runtime buckets.
   *   2. AFTER the node completes, its output is written back into the context
   *      via `ctx.recordNodeOutput`, making it available to *every* later node
   *      for the rest of the run — not just the next one.
   *
   * `ctx` is optional so single-node "run this action" paths and any future
   * caller keep working; when omitted a throwaway context is created so the
   * resolution rules are identical either way.
   */
  const executeAction = useCallback(async (
    action: WorkflowAction,
    ctx?: WorkflowExecutionContext | null,
    inputData?: any,
    /**
     * Which edge delivered `inputData`. Optional throughout: every existing
     * caller omits it and gets the previous global-`previous` behaviour, while
     * the run loop supplies it so a branch resolves `{{previous.*}}` against
     * its own upstream step and its own port slice.
     */
    branch?: { fromNodeId?: string | null; portId?: string | null; executionKey?: string | null } | null
  ): Promise<any> => {
    const startTime = Date.now();
    const startedAt = new Date().toISOString();

    /** Scope options describing the inbound edge; spread into every buildScope. */
    const branchScope = {
      previousNodeId: branch?.fromNodeId ?? undefined,
      previousPortId: branch?.portId ?? undefined,
      previousPortPayload: branch?.portId ? inputData : undefined,
    };

    const context =
      ctx ??
      createExecutionContext({
        runId: uuidv4(),
        workflowId: id ?? 'unsaved',
        workflowName: workflowName,
        variables: variablesRef.current,
      });

    const log =
      loggerRef.current?.forNode(action.id, action.name) ??
      createWorkflowLogger({
        runId: context.runId,
        workflowId: context.workflowId,
        sink: (entry) => setExecutionLogs(prev => [...prev, entry]),
        secretKeys: context.secretVariableNames(),
        actionId: action.id,
        actionName: action.name,
      });

    context.recordNodeStart(action, inputData, { executionInstanceKey: branch?.executionKey ?? undefined });
    log.info(`Executing node: ${action.name}`, {
      phase: 'run',
      metadata: { nodeType: action.type, category: action.category },
    });
    setActions(prev => prev.map(a => a.id === action.id ? { ...a, status: 'running' as const } : a));

    try {
      if (isWorkflowControlNode(action)) {
        const executionTime = Date.now() - startTime;
        setActions(prev =>
          prev.map(a =>
            a.id === action.id
              ? { ...a, status: 'completed' as const, executionTime }
              : a
          )
        );
        log.info(
          action.type === 'workflow-start'
            ? 'Workflow start node processed (control node).'
            : action.type === 'workflow-end'
              ? 'Workflow end node processed (control node).'
              : `Control node processed: ${action.name}`,
          { phase: 'run', durationMs: executionTime }
        );
        const controlOutput = {
          success: true,
          controlNode: true,
          nodeType: action.type,
          actionName: action.name,
          inputData: inputData ?? null,
        };
        // Control nodes are recorded too, so `{{steps.Start.status}}` and the
        // context inspector show a complete picture of the run.
        context.recordNodeOutput(action, controlOutput, {
          input: inputData,
          startedAt,
          durationMs: executionTime,
        });
        return controlOutput;
      }

      // Refresh the action's `api` (and `propertyConfig`) from the service
      // registry by type before executing. Workflows saved before a service
      // definition changed keep a stale `api.body` baked into the saved node
      // (e.g. Send Email's old `attachments: [{ fileName: "{{fileName}}" }]`
      // template). Rebuilding from the registry guarantees the request body
      // matches the current definition while preserving the user's entered
      // `properties`. Falls back to the node's own `api` if the registry isn't
      // ready or doesn't know this type.
      //
      // Uses `resolveService` (not raw `getService`) so a colliding type from a
      // different category — e.g. Asana's `create-team` for a Teams node — is
      // NOT allowed to swap in the wrong URL / propertyConfig. On a collision
      // the node keeps its own (correct) `api`.
      const liveSvc = resolveService(action);
      if (liveSvc) {
        action = {
          ...action,
          api: liveSvc.api ?? action.api,
          propertyConfig: action.propertyConfig ?? liveSvc.propertyConfig,
          // Merge the service's current default properties UNDER the saved ones
          // (saved values win). Fills fields added to the service after the
          // workflow was saved — e.g. Email Read's `batch.limit` — so older saved
          // nodes send the complete, current payload shape with no manual edits.
          properties: liveSvc.properties
            ? deepMergeProperties(liveSvc.properties, (action as any).properties ?? {})
            : ((action as any).properties ?? {}),
        };
      }

      // ── Execution mode ───────────────────────────────────────────────────
      // Declared as data on the action (see `types/pluginContract.ts`), so the
      // executor keeps two shapes no matter how many plugins are added. An
      // action that does not declare a mode is `'api'` — i.e. every action that
      // existed before this field keeps the exact guard it always had, in the
      // exact position it always had it.
      const executionMode = resolveExecutionMode(action);

      if (executionMode === 'api' && !action.api?.url) {
        throw new Error('No API defined for this action');
      }

      const isRestClientAction =
        action.type === 'advance-rest-client' ||
        action.category === 'rest-integration-025' ||
        String(action.name || '').toLowerCase().includes('rest');

      const toBool = (value: any, fallback = false) => {
        if (typeof value === 'boolean') return value;
        if (typeof value === 'number') return value !== 0;
        if (typeof value === 'string') {
          const normalized = value.trim().toLowerCase();
          if (['true', '1', 'yes', 'y', 'on'].includes(normalized)) return true;
          if (['false', '0', 'no', 'n', 'off'].includes(normalized)) return false;
        }
        return fallback;
      };

      const toNumber = (value: any, fallback = 0) => {
        if (typeof value === 'number' && !Number.isNaN(value)) return value;
        if (typeof value === 'string' && value.trim() !== '') {
          const n = Number(value);
          return Number.isNaN(n) ? fallback : n;
        }
        return fallback;
      };

      // ── Resolve this node's payload from the shared execution context ────
      //
      // Two passes, deliberately:
      //
      //  Pass 1 resolves the node's own `properties` against the *carry-forward
      //  scope* — workflow variables plus every earlier node's output. This is
      //  what lets a field hold `{{steps.ReadEmployeeExcel.employeeId}}`,
      //  `{{previous.department}}` or a bare `{{employeeId}}` and get a real
      //  value at run time.
      //
      //  Pass 2 folds those *resolved* properties back into the scope so the
      //  URL, headers and `api.body` template can reference the node's own
      //  fields by name (`{{tenantId}}`), exactly as they always have. Because
      //  properties are layered last they still win over carry-forward, so no
      //  existing plugin changes behaviour — carry-forward only fills keys the
      //  node did not define for itself.
      const carryForwardScope = context.buildScope({
        input: inputData,
        currentAction: action,
        ...branchScope,
      });

      // The plugin's declared field types. This is the contract every value
      // below is reconciled against before it goes on the wire.
      const contract: PropertyContract | undefined = (action as any).propertyConfig;

      // `deepParseWithContract` replaces the previous bare `deepParse`. The old
      // call turned ANY string starting with `{` or `[` into a real object —
      // including a Teams message that legitimately quotes JSON, or an email
      // body containing a JSON report. Those became structure and the backend
      // answered 400. Fields the contract declares as text are now left as text;
      // fields it declares as object/array are still parsed, and fields it does
      // not mention keep the original permissive behaviour.
      const parsedProperties = normalizeTimeFieldsForExecution(
        normalizeExecutionAliases(
          deepParseWithContract(
            resolveDeep(action.properties ?? {}, carryForwardScope, { onMissing: 'keep' }),
            contract
          )
        ),
        contract
      );

      // ── Transformation layer ─────────────────────────────────────────────
      // A whole-token binding (`{{previous.rows}}`) correctly resolves to a real
      // array — that is what lets a node carry a container forward. But the
      // plugin field may be declared `string`, and the Java DTO behind it is
      // `private String`, so Jackson rejects the request with:
      //   400  Cannot deserialize value of type `java.lang.String` from Array value
      // This is the reconciliation step that was missing: values are converted
      // to the declared type, and every adjustment is reported to the log.
      const coercion = coerceToContract(parsedProperties, contract);
      const resolvedProperties = coercion.payload;

      const coercionNote = describeCoercion(coercion);
      if (coercionNote) {
        log.debug(coercionNote, {
          phase: 'resolve',
          data: { adjustments: coercion.issues },
        });
      }

      // ── Pre-flight validation ────────────────────────────────────────────
      // Fail with a readable message instead of letting the backend answer with
      // a bare 400. Most plugin modules have no @ControllerAdvice and Spring's
      // default error body carries no `message`, so an un-caught contract
      // violation surfaces to the user as an unexplained failure.
      const preflight = validateAgainstContract(resolvedProperties, contract);
      const blocking = preflight.filter((issue) => issue.severity === 'error');
      if (blocking.length > 0) {
        throw new Error(
          `"${action.name}" cannot run — ${blocking.map((issue) => issue.message).join(' ')}`
        );
      }
      preflight
        .filter((issue) => issue.severity === 'warning')
        .forEach((issue) => log.warn(issue.message, { phase: 'resolve', data: issue }));

      const propertyContext = context.buildScope({
        input: inputData,
        currentAction: action,
        selfValues: flattenObject(resolvedProperties),
        ...branchScope,
      });

      // Kept under the original name so the (unchanged) REST-client branch and
      // body builder below continue to read the same variable.
      const interpolatedProperties = resolvedProperties;

      const boundTokens = extractTokens(action.properties ?? {});
      if (boundTokens.length > 0) {
        log.debug(`Resolved ${boundTokens.length} binding(s) from the execution context`, {
          phase: 'resolve',
          data: {
            tokens: boundTokens,
            resolved: resolvedProperties,
          },
        });
      }

      // ── Pass-through completion ──────────────────────────────────────────
      //
      // Everything above this line ran for BOTH modes: the node's properties
      // were resolved against the carry-forward scope, parsed under its
      // contract, coerced to its declared types, pre-flight validated, and the
      // adjustments logged. A pass-through step is therefore held to exactly
      // the same contract as an API step — a missing required field still
      // blocks it, and a bound value still lands as its declared type.
      //
      // The only thing it skips is the request. One branch, whatever the
      // plugin: there is nothing scanner-specific here, and adding another
      // collector plugin needs no change to this file at all.
      if (executionMode === 'passthrough') {
        const passthroughOutput = buildPassthroughOutput(inputData, resolvedProperties);
        const executionTime = Date.now() - startTime;

        setActions(prev =>
          prev.map(a =>
            a.id === action.id ? { ...a, status: 'completed' as const, executionTime } : a
          )
        );

        // The same carry-forward write the API path makes: the collected values
        // are now bindable from every later node as {{steps.<NodeName>.…}},
        // {{previous.…}} and bare {{key}}.
        context.recordNodeOutput(action, passthroughOutput, {
          input: inputData,
          startedAt,
          durationMs: executionTime,
        });
        publishNodeOutputs(action, passthroughOutput, context);
        syncContextVariablesToPanel(context);

        log.success(
          `Node completed in ${executionTime}ms — pass-through, no request sent ` +
          `(${Object.keys(passthroughOutput).length} value(s) carried forward)`,
          { phase: 'response', durationMs: executionTime, data: passthroughOutput }
        );
        return passthroughOutput;
      }

      // Re-assert the URL for the API path. The guard above is mode-aware and
      // therefore no longer narrows `action.api` for the compiler; a
      // pass-through node has already returned, so anything reaching this line
      // is an API action and must have a URL. Same error text, same behaviour,
      // no `any` cast and no disabled check.
      if (!action.api?.url) throw new Error('No API defined for this action');

      // `interpolatedProperties` / `propertyContext` were resolved above from
      // the execution context, so the URL, method and headers already see both
      // the node's own fields and every earlier node's output.
      const interpolatedUrl = toEngineProxyUrl(interpolate(action.api.url, propertyContext));
      const method = String(interpolate(action.api.method || 'POST', propertyContext)).toUpperCase();
      const interpolatedHeaders = interpolate(action.api.headers || {}, propertyContext);

      if (isRestClientAction) {
        const normalizedUrl = String(
          interpolatedProperties.url ?? action.api.body?.url ?? interpolatedUrl ?? ''
        ).trim();

        const normalizedHttpMethod = String(
          interpolatedProperties.httpMethod ?? action.api.body?.httpMethod ?? method ?? 'POST'
        ).trim().toUpperCase() || 'POST';

        const normalizedAuthorizationRaw =
          interpolatedProperties.authorization ?? action.api.body?.authorization ?? {};

        const normalizedRequestBodyRaw =
          interpolatedProperties.requestBody ?? action.api.body?.requestBody ?? {};

        const normalizedHeadersRaw =
          interpolatedProperties.headers ?? action.api.body?.headers ?? [];

        const normalizedSettingsRaw =
          interpolatedProperties.settings ?? action.api.body?.settings ?? {};

        const normalizedResponseFieldsRaw =
          interpolatedProperties.responseFields ?? action.api.body?.responseFields ?? {};

        const normalizedRowDataRaw =
          interpolatedProperties.rowData ?? action.api.body?.rowData ?? {};


        const normalizedAuthorization = (() => {
          const auth = normalizedAuthorizationRaw;
          if (typeof auth === 'string') {
            return {
              type: auth || 'None',
              token: '',
              username: '',
              password: '',
            };
          }
          if (auth && typeof auth === 'object') {
            return {
              type: String(auth.type || 'None'),
              token: String(auth.token || ''),
              username: String(auth.username || ''),
              password: String(auth.password || ''),
            };
          }
          return {
            type: 'None',
            token: '',
            username: '',
            password: '',
          };
        })();

        const normalizedRequestBody = (() => {
          const body = normalizedRequestBodyRaw;
          if (body && typeof body === 'object' && !Array.isArray(body)) {
            return normalizeExecutionAliases({
              bodyFormat: String(body.bodyFormat || 'JSON'),
              rawContent:
                typeof body.rawContent === 'string'
                  ? body.rawContent
                  : JSON.stringify(body.rawContent ?? {}, null, 2),
              bodyType: body.bodyType ? String(body.bodyType) : undefined,
              formData: body.formData ?? undefined,
              graphQlQuery: body.graphQlQuery ?? undefined,
              graphQlVariables: body.graphQlVariables ?? undefined,
              urlEncoded: body.urlEncoded ?? undefined,
            });
          }

          if (typeof body === 'string') {
            return {
              bodyFormat: 'JSON',
              rawContent: body,
            };
          }

          return {
            bodyFormat: 'JSON',
            rawContent: '',
          };
        })();

        const normalizedHeaders = (() => {
          const headers = normalizedHeadersRaw;
          if (Array.isArray(headers)) {
            return headers
              .filter(Boolean)
              .map((h: any) => ({
                headerKey: String(h?.headerKey ?? ''),
                headerValue: String(h?.headerValue ?? ''),
              }))
              .filter((h: any) => h.headerKey);
          }
          if (headers && typeof headers === 'object') {
            if ('headerKey' in headers || 'headerValue' in headers) {
              return [{
                headerKey: String((headers as any).headerKey ?? ''),
                headerValue: String((headers as any).headerValue ?? ''),
              }].filter((h: any) => h.headerKey);
            }
            return Object.entries(headers).map(([headerKey, headerValue]) => ({
              headerKey: String(headerKey),
              headerValue: String(headerValue),
            }));
          }
          return [];
        })();

        const normalizedSettings = (() => {
          const settings = normalizedSettingsRaw;
          if (typeof settings === 'boolean') {
            return {
              ignoreSslVerification: settings,
              timeoutInSeconds: 60,
            };
          }
          if (typeof settings === 'string') {
            const normalized = settings.trim().toLowerCase();
            if (['true', 'false', '1', '0', 'yes', 'no', 'on', 'off'].includes(normalized)) {
              return {
                ignoreSslVerification: toBool(settings, false),
                timeoutInSeconds: 60,
              };
            }
            try {
              const parsed = JSON.parse(settings);
              return {
                ignoreSslVerification: toBool(parsed?.ignoreSslVerification, false),
                timeoutInSeconds: toNumber(parsed?.timeoutInSeconds, 60),
              };
            } catch {
              return {
                ignoreSslVerification: false,
                timeoutInSeconds: 60,
              };
            }
          }
          if (settings && typeof settings === 'object') {
            return {
              ignoreSslVerification: toBool((settings as any).ignoreSslVerification, false),
              timeoutInSeconds: toNumber((settings as any).timeoutInSeconds, 60),
            };
          }
          return {
            ignoreSslVerification: false,
            timeoutInSeconds: 60,
          };
        })();

        const normalizedResponseFields = (() => {
          const fields = normalizedResponseFieldsRaw;
          if (fields && typeof fields === 'object' && !Array.isArray(fields)) {
            return {
              responseStatus: String((fields as any).responseStatus || 'api_status_code'),
              responseTime: String((fields as any).responseTime || 'api_execution_time'),
              getResponseBody: String((fields as any).getResponseBody || 'api_response_data'),
            };
          }
          return {
            responseStatus: 'api_status_code',
            responseTime: 'api_execution_time',
            getResponseBody: 'api_response_data',
          };
        })();

        const normalizedRowData = (() => {
          const row = normalizedRowDataRaw;
          if (row && typeof row === 'object' && !Array.isArray(row)) {
            return normalizeExecutionAliases({
              test_case_id: String((row as any).test_case_id || 'TC_001'),
              environment: String((row as any).environment || 'Localhost'),
            });
          }
          if (typeof row === 'string') {
            return {
              test_case_id: row,
              environment: 'Localhost',
            };
          }
          return {
            test_case_id: 'TC_001',
            environment: 'Localhost',
          };
        })();

        const restPayload = {
          url: normalizedUrl,
          httpMethod: normalizedHttpMethod,
          authorization: normalizedAuthorization,
          headers: [
            ...normalizedHeaders,
            {
              headerKey: 'Content-Type',
              headerValue: 'application/json',
            },
            {
              headerKey: 'Accept',
              headerValue: 'application/json',
            },
          ].reduce((acc: any[], item) => {
            const exists = acc.some(
              h => String(h.headerKey).toLowerCase() === String(item.headerKey).toLowerCase()
            );
            if (!exists) acc.push(item);
            return acc;
          }, []),
          requestBody: normalizedRequestBody,
          settings: normalizedSettings,
          responseFields: normalizedResponseFields,
          rowData: normalizedRowData,
        };

        const headers = new Headers();
        headers.set('Content-Type', 'application/json');
        headers.set('Accept', 'application/json, text/plain');

        const response = await fetch(toEngineProxyUrl(action.api.url), {
          method: 'POST',
          headers,
          body: JSON.stringify(restPayload),
        });

        const rawText = await response.text();
        const respCT = (response.headers.get('content-type') || '').toLowerCase();

        let result: any;
        let parseError = false;
        if (respCT.includes('application/json') ||
          rawText.trim().startsWith('{') ||
          rawText.trim().startsWith('[')) {
          try { result = JSON.parse(rawText); }
          catch { parseError = true; result = rawText; }
        } else {
          result = rawText;
        }

        if (!parseError && result && typeof result === 'object') {
          if (result.Error || result.error || result.message?.includes('No Method Found')) {
            const msg = result.Error || result.error || result.message;
            const st = result.StackTrace ? `\nStackTrace: ${result.StackTrace}` : '';
            throw new Error(`API returned error: ${msg}${st}`);
          }
          if (result.success === false) {
            throw new Error(`API returned failure: ${result.message || 'Unknown error'}${result.errorCode ? ` [${result.errorCode}]` : ''}`);
          }
        }
        if (!response.ok) throw new Error(`API error: ${response.status} - ${describeApiError(result, rawText)}`);

        const executionTime = Date.now() - startTime;
        setActions(prev => prev.map(a =>
          a.id === action.id ? { ...a, status: 'completed' as const, executionTime } : a
        ));
        // Carry-forward write: the REST response is now bindable from every
        // later node as {{steps.<NodeName>.…}} / {{previous.…}} / {{key}}.
        context.recordNodeOutput(action, result, {
          input: restPayload,
          startedAt,
          durationMs: executionTime,
        });
        log.success(`Node completed in ${executionTime}ms`, {
          phase: 'response',
          durationMs: executionTime,
          data: result,
        });
        return result;
      }

      // Body templates resolve against the same scope as the URL/headers, so an
      // `api.body` entry may reference this node's own fields (`{{tenantId}}`)
      // OR any earlier node's output (`{{steps.ReadEmployeeExcel.employeeId}}`).
      // An `api.body` template resolves tokens too, so it needs the same
      // contract-aware parse and the same type reconciliation as the properties
      // above — otherwise a body template referencing `{{previous.rows}}` puts
      // an array back into a declared string field and the 400 returns.
      const bodySource = action.api.body
        ? deepParseWithContract(interpolate(action.api.body, propertyContext), contract)
        : deepParseWithContract(interpolatedProperties, contract);

      const bodyCoercion = coerceToContract(
        normalizeExecutionAliases(bodySource) as Record<string, any>,
        contract
      );
      const interpolatedBody: any = bodyCoercion.payload;

      const bodyCoercionNote = describeCoercion(bodyCoercion);
      if (bodyCoercionNote) {
        log.debug(`Request body — ${bodyCoercionNote}`, {
          phase: 'request',
          data: { adjustments: bodyCoercion.issues },
        });
      }

      // Normalize file/attachment arrays. Each attachment is sent in one of two
      // shapes the backend understands:
      //   • embedded upload → { fileName, contentBase64, contentType }
      //   • server path     → { fileName, filePath }
      // Rows that are blank (no embedded bytes and no path) are dropped so a
      // half-filled attachment can't make the backend reject the request. This
      // also overrides any stale/template-shaped `api.body.attachments`
      // (e.g. `[{ fileName: "{{fileName}}" }]`) baked into an old saved node.
      if (
        interpolatedBody &&
        typeof interpolatedBody === 'object' &&
        Array.isArray((interpolatedProperties as any).attachments)
      ) {
        const cleanedAttachments = (interpolatedProperties as any).attachments
          .map((row: any) => {
            if (!row || typeof row !== 'object') return null;
            const fileName = String(row.fileName ?? '').trim();
            const filePath = String(row.filePath ?? '').trim();
            const contentBase64 =
              typeof row.contentBase64 === 'string' ? row.contentBase64 : '';

            if (contentBase64) {
              return {
                fileName: fileName || 'attachment',
                contentBase64,
                contentType:
                  typeof row.contentType === 'string' && row.contentType
                    ? row.contentType
                    : 'application/octet-stream',
              };
            }
            if (filePath) {
              return { fileName: fileName || filePath, filePath };
            }
            return null;
          })
          .filter(Boolean);

        if (cleanedAttachments.length > 0) {
          interpolatedBody.attachments = cleanedAttachments;
        } else {
          delete interpolatedBody.attachments;
        }
      }

      // Final safety net: never let an unresolved "{{placeholder}}" reach the
      // engine as literal text (e.g. a field a saved node never had). This is the
      // class of bug that turned a missing Email Read field into a backend 500.
      const sanitizedBody =
        interpolatedBody && typeof interpolatedBody === 'object'
          ? stripUnresolvedPlaceholders(interpolatedBody)
          : interpolatedBody;

      const headers = new Headers(interpolatedHeaders);
      headers.set('Accept', 'application/json, text/plain');

      const fetchOptions: RequestInit = { method, headers };
      const bodyType = String(action.api?.bodyType || '').toLowerCase();
      const isMultipart = bodyType === 'form-data';

      // When the uploaded workbook was picked via the File System Access API,
      // this holds its handle so a file-returning response can be written back
      // to the original file on disk after the request completes.
      let writeBackHandle: LocalFileHandle | null = null;

      if (!['GET', 'HEAD'].includes(method)) {
        if (isMultipart) {
          const payload =
            sanitizedBody && typeof sanitizedBody === 'object'
              ? (sanitizedBody as Record<string, any>)
              : {};

          // Re-read handle-backed files from disk so each node in a chain sees
          // the bytes the previous node saved back — not a stale snapshot from
          // pick time. Also remembers the handle for the write-back below.
          for (const key of Object.keys(payload)) {
            const fileKey = multipartKey(action.id, key);
            const handle = fileHandleCacheRef.current.get(fileKey);
            if (!handle) continue;
            try {
              const freshFile = await handle.getFile();
              multipartFileCacheRef.current.set(fileKey, freshFile);
              if (!writeBackHandle) writeBackHandle = handle;
            } catch (readErr: any) {
              throw new Error(
                `"${action.name}": could not read "${key}" from disk (${readErr?.message ?? readErr}). ` +
                'The file may have been moved, renamed, or deleted — re-select it.'
              );
            }
          }

          // Saved workflows can't persist real File objects — only the filename
          // string survives a reload. Fail with a clear message instead of
          // POSTing the filename as text (which the backend rejects with a
          // confusing "empty file" / type error).
          const fileFields = Object.entries((action as any).propertyConfig ?? {})
            .filter(([, cfg]: [string, any]) =>
              (cfg?.type === 'file' || cfg?.uiType === 'file') && cfg?.required !== false)
            .map(([key]) => key);
          for (const fieldKey of fileFields) {
            if (!multipartFileCacheRef.current.get(multipartKey(action.id, fieldKey))) {
              throw new Error(
                `"${action.name}": please re-select the "${fieldKey}" file — file uploads aren't stored with saved workflows.`
              );
            }
          }

          const formData = new FormData();
          Object.entries(payload).forEach(([key, value]) => {
            const fileKey = multipartKey(action.id, key);
            const cachedFile = multipartFileCacheRef.current.get(fileKey);

            if (cachedFile) {
              appendFormData(formData, key, cachedFile);
              return;
            }

            appendFormData(formData, key, value);
          });

          headers.delete('Content-Type');
          fetchOptions.body = formData;
        } else {
          if (!headers.has('Content-Type')) {
            headers.set('Content-Type', 'application/json');
          }
          const ct = (headers.get('Content-Type') || '').toLowerCase();
          fetchOptions.body = ct.includes('application/json')
            ? JSON.stringify(sanitizedBody ?? {})
            : (sanitizedBody as any);
        }
      }

      const response = await fetch(interpolatedUrl, fetchOptions);

      // ── Binary (file) responses ──────────────────────────────────────────
      // Endpoints like /excel/create-sheet, /rename-sheet, /delete-sheet return
      // the updated workbook as a download (Content-Disposition: attachment,
      // application/octet-stream), not JSON. Reading those with response.text()
      // mangles the bytes and silently loses the file. Detect them, hand the
      // file to the user via a download, and return a small JSON summary so
      // logs and connection conditions still have structured data to work with.
      const contentDisposition = response.headers.get('content-disposition') || '';
      const respContentType = (response.headers.get('content-type') || '').toLowerCase();
      const isFileResponse =
        response.ok &&
        (contentDisposition.toLowerCase().includes('attachment') ||
          respContentType.includes('application/octet-stream') ||
          respContentType.includes('spreadsheetml'));

      if (isFileResponse) {
        const blob = await response.blob();
        const nameMatch = contentDisposition.match(/filename\*?=(?:UTF-8''|")?([^";]+)/i);
        const fileName = (nameMatch?.[1] || 'updated.xlsx').replace(/"/g, '').trim();

        // First choice: write the updated workbook straight back to the file
        // the user picked (File System Access API). This is what makes writes
        // land in the actual file on disk — and lets the next node read them.
        let savedToDisk = false;
        if (writeBackHandle) {
          try {
            if (writeBackHandle.queryPermission) {
              let permission = await writeBackHandle.queryPermission({ mode: 'readwrite' });
              if (permission === 'prompt' && writeBackHandle.requestPermission) {
                permission = await writeBackHandle.requestPermission({ mode: 'readwrite' });
              }
              if (permission !== 'granted') {
                throw new Error('write permission was not granted');
              }
            }
            if (!writeBackHandle.createWritable) {
              throw new Error('this browser cannot write back to the picked file');
            }
            const writable = await writeBackHandle.createWritable();
            await writable.write(blob);
            await writable.close();
            savedToDisk = true;
          } catch (writeErr: any) {
            setExecutionLogs(prev => [...prev, {
              id: uuidv4(),
              timestamp: new Date().toISOString(),
              level: 'warning',
              message:
                `Could not save back to "${writeBackHandle?.name}" (${writeErr?.message ?? writeErr}). ` +
                'If the file is open in Excel, close it and run again. Falling back to a download.',
              actionId: action.id,
            }]);
          }
        }

        if (!savedToDisk) {
          const objectUrl = URL.createObjectURL(blob);
          const anchor = document.createElement('a');
          anchor.href = objectUrl;
          anchor.download = fileName;
          document.body.appendChild(anchor);
          anchor.click();
          anchor.remove();
          setTimeout(() => URL.revokeObjectURL(objectUrl), 10_000);
        }

        const executionTime = Date.now() - startTime;
        setActions(prev => prev.map(a =>
          a.id === action.id ? { ...a, status: 'completed' as const, executionTime } : a
        ));
        setExecutionLogs(prev => [...prev, {
          id: uuidv4(),
          timestamp: new Date().toISOString(),
          level: 'success',
          message: savedToDisk
            ? `Action completed in ${executionTime}ms — saved changes back to "${writeBackHandle?.name}" (${blob.size} bytes)`
            : `Action completed in ${executionTime}ms — file "${fileName}" downloaded (${blob.size} bytes)`,
          actionId: action.id,
        }]);
        const fileOutput = {
          success: true,
          file: savedToDisk ? (writeBackHandle?.name ?? fileName) : fileName,
          fileName: savedToDisk ? (writeBackHandle?.name ?? fileName) : fileName,
          size: blob.size,
          savedToDisk,
          contentType: respContentType,
        };
        // File-producing nodes land in the context's `files` bucket, so a later
        // node can bind {{files.<NodeName>.fileName}} as well as the usual
        // {{steps.<NodeName>.fileName}}.
        context.recordNodeOutput(action, fileOutput, {
          input: sanitizedBody,
          startedAt,
          durationMs: executionTime,
        });
        return fileOutput;
      }

      const rawText = await response.text();
      const respCT = (response.headers.get('content-type') || '').toLowerCase();

      let result: any;
      let parseError = false;
      if (respCT.includes('application/json') ||
        rawText.trim().startsWith('{') ||
        rawText.trim().startsWith('[')) {
        try { result = JSON.parse(rawText); }
        catch { parseError = true; result = rawText; }
      } else {
        result = rawText;
      }

      if (!parseError && result && typeof result === 'object') {
        if (result.Error || result.error || result.message?.includes('No Method Found')) {
          const msg = result.Error || result.error || result.message;
          const st = result.StackTrace ? `\nStackTrace: ${result.StackTrace}` : '';
          throw new Error(`API returned error: ${msg}${st}`);
        }
        if (result.success === false) {
          throw new Error(`API returned failure: ${result.message || 'Unknown error'}${result.errorCode ? ` [${result.errorCode}]` : ''}`);
        }
      }
      if (!response.ok) throw new Error(`API error: ${response.status} - ${describeApiError(result, rawText)}`);

      const executionTime = Date.now() - startTime;
      setActions(prev => prev.map(a =>
        a.id === action.id ? { ...a, status: 'completed' as const, executionTime } : a
      ));

      // ── Carry-forward write ──────────────────────────────────────────────
      // This single call is what makes the node's result reusable ANYWHERE
      // later in the workflow. The context indexes it by node id and by a
      // binding-safe step key, refreshes `previous`, and files it into the
      // matching bucket (apiResponse / databaseResult / file / text / computed).
      context.recordNodeOutput(action, result, {
        input: sanitizedBody,
        startedAt,
        durationMs: executionTime,
      });

      // Optional explicit capture: a node can declare `outputKey` to publish its
      // whole result as a named workflow variable, and `outputMapping` to lift
      // individual fields out of the response into variables. Both are then
      // visible to every node AND to the Variables panel. Shared with the
      // pass-through path so the two modes can never drift apart.
      publishNodeOutputs(action, result, context);
      syncContextVariablesToPanel(context);

      log.success(`Node completed in ${executionTime}ms`, {
        phase: 'response',
        durationMs: executionTime,
        data: result,
      });
      return result;

    } catch (error: any) {
      const executionTime = Date.now() - startTime;
      setActions(prev => prev.map(a =>
        a.id === action.id ? { ...a, status: 'error' as const, executionTime } : a
      ));
      // Failures are recorded too, so `{{steps.<NodeName>.error}}` is bindable
      // and the context inspector shows exactly where the run broke.
      context.recordNodeError(action, error, { startedAt, durationMs: executionTime });
      log.error(`Node failed: ${error?.message ?? error}`, {
        phase: 'run',
        durationMs: executionTime,
        error,
      });
      throw error;
    }
  }, [id, workflowName, resolveService, syncContextVariablesToPanel]);

  /**
   * Run one node under its configured retry policy.
   *
   * `WorkflowAction` has carried `retries`, `retryDelay` and `timeout` since the
   * first schema, but nothing ever read them — a node set to "3 retries" ran
   * once. This wrapper is the missing half.
   *
   * It deliberately wraps `executeAction` from the OUTSIDE rather than
   * restructuring it. `executeAction` already records a start, an output and an
   * error into the execution context, and those calls are idempotent per node:
   * a retry overwrites the previous attempt's record in place, so the context
   * always reflects the FINAL attempt while `record.attempt` reports how many
   * there were. Nothing inside the 700-line plugin path had to change, which is
   * what keeps every currently-working plugin working.
   *
   * A node with no retry configured resolves to `maxAttempts: 1`, i.e. exactly
   * today's behaviour — this cannot regress an existing workflow.
   */
  const executeActionWithPolicy = useCallback(async (
    action: WorkflowAction,
    context: WorkflowExecutionContext,
    inputData?: any,
    branch?: { fromNodeId?: string | null; portId?: string | null; executionKey?: string | null } | null
  ): Promise<any> => {
    const policy = normalizeRetryPolicy(action);
    const log = loggerRef.current?.forNode(action.id, action.name) ?? loggerRef.current;

    if (policyHasRetries(policy) || policy.timeoutMs > 0) {
      log?.info(
        `Resilience: up to ${policy.maxAttempts} attempt(s)` +
          (policy.timeoutMs > 0 ? `, ${policy.timeoutMs} ms timeout` : '') +
          (policyHasRetries(policy) ? `, ${policy.strategy} backoff` : ''),
        { phase: 'run' }
      );
    }

    const outcome = await runWithRetry(
      () => executeAction(action, context, inputData, branch),
      policy,
      {
        // Stop retrying the moment the user presses Stop, so a node with a long
        // backoff cannot keep a cancelled run alive.
        shouldAbort: () => stopRequestedRef.current,
        onRetry: ({ attempt, maxAttempts, error, delayMs }) => {
          log?.warn(
            `Attempt ${attempt}/${maxAttempts} failed (${error.message}). ` +
              `Retrying in ${delayMs} ms.`,
            { phase: 'run', error }
          );
          setActions(prev => prev.map(a =>
            a.id === action.id ? { ...a, status: 'waiting' as const } : a
          ));
        },
      },
      action.name || action.id
    );

    if (outcome.ok) {
      if (outcome.attempts > 1) {
        log?.success(
          `Recovered after ${describeRetryOutcome(outcome)}.`,
          { phase: 'run', durationMs: outcome.totalMs }
        );
      }
      return outcome.value;
    }

    log?.error(
      `Node failed after ${describeRetryOutcome(outcome)}` +
        (outcome.timedOut ? ' (timed out)' : '') + '.',
      { phase: 'run', durationMs: outcome.totalMs, error: outcome.error }
    );
    throw outcome.error ?? new Error(`"${action.name}" failed.`);
  }, [executeAction]);

  // ── Workflow execution ────────────────────────────────────────────────────────
  /**
   * Run the workflow.
   *
   * One `WorkflowExecutionContext` is created per run and threaded through
   * every node. That single object is what upgrades the engine from
   * "previous node → next node" hand-off to true workflow-wide carry-forward:
   * each node resolves its payload from the context and writes its output back
   * into it, so a value produced by the first node is still addressable by the
   * last one, on any branch.
   *
   * A snapshot is persisted after every node so an interrupted run can be
   * inspected — or its collected values reused — afterwards.
   */
  const handleRunWorkflow = useCallback(async () => {
    const currentActions = actionsRef.current;
    const currentConnections = connectionsRef.current;
    const currentVariables = variablesRef.current;

    if (currentActions.length === 0) {
      alert('No actions to run. Please add some actions first.');
      return;
    }

    // Package-availability gate. Saved workflows may contain nodes created
    // before a connector was quarantined, so catalogue drag guards alone are
    // not enough. Block the run before creating context or sending requests.
    const unavailableNodes = findUnavailableWorkflowActions(
      currentActions,
      automationCategories
    );
    if (unavailableNodes.length > 0) {
      const first = unavailableNodes[0];
      if (first.nodeId) setSelectedNode(first.nodeId);
      setPropertiesPanelOpen(true);
      const detail = unavailableNodes
        .map((issue) => `  • ${issue.nodeName}: ${issue.reason}`)
        .join('\n');
      alert(
        `Cannot run: ${unavailableNodes.length} node(s) use unavailable connector packages.\n\n` +
        `${detail}\n\nNo execution request was sent.`
      );
      return;
    }

    // Fail fast before any request is sent. Runtime validation still runs per
    // node after bindings resolve, but obvious empty required fields should not
    // produce a half-executed workflow and an avoidable backend error.
    const nodeCheck = validateWorkflow(currentActions);
    if (nodeCheck.count > 0) {
      const first = nodeCheck.issues[0];
      setSelectedNode(first.nodeId);
      setPropertiesPanelOpen(true);
      const detail = nodeCheck.issues
        .map((issue) => `  • ${issue.nodeName}: ${issue.missing.join(', ')}`)
        .join('\n');
      alert(`Cannot run: ${nodeCheck.count} node(s) have missing required fields.\n\n${detail}`);
      return;
    }

    if (currentActions.length === 1 && isStructuredWorkflowControlNode(currentActions[0])) {
      alert(
        `Cannot run ${currentActions[0].name} by itself. Loop controls require a connected Body path ` +
        'inside a workflow.'
      );
      return;
    }

    // Typed-variable gate. `WorkflowVariable` has always declared `type`,
    // `required` and `validationRules`, but nothing enforced them, so a bad
    // value surfaced as a confusing failure deep inside a plugin instead of
    // here, where it can still be fixed cheaply.
    const variableCheck = validateVariables(currentVariables);
    if (!variableCheck.valid) {
      const detail = variableCheck.errors.map(issue => `  • ${issue.message}`).join('\n');
      alert(`Cannot run: ${variableCheck.errors.length} variable problem(s).\n\n${detail}`);
      return;
    }

    // ── Create the run-scoped context + logger ────────────────────────────
    const runId = uuidv4();
    const context = createExecutionContext({
      runId,
      workflowId: id ?? 'unsaved',
      workflowName,
      variables: currentVariables,
      triggeredBy: 'manual',
    });
    executionContextRef.current = context;

    const logger = createWorkflowLogger({
      runId,
      workflowId: id ?? 'unsaved',
      sink: (entry) => {
        if (isMountedRef.current) setExecutionLogs(prev => [...prev, entry]);
      },
      secretKeys: context.secretVariableNames(),
    });
    loggerRef.current = logger;

    // Reset per-run debugger state. Breakpoints themselves are NOT cleared:
    // they belong to the workflow and survive across runs, as in any IDE.
    const debugSession = getDebugSession();
    debugSession.beginRun();

    stopRequestedRef.current = false;
    setCurrentRunId(runId);
    setIsRunning(true);
    setExecutionLogs([]);
    setActiveConnections(new Set());
    setExecutionRecords([]);
    setContextSnapshot(null);
    setActions(prev => prev.map(a => ({ ...a, status: 'idle' as const, executionTime: undefined })));
    // Show the console for the run. Note this does NOT force full-screen mode:
    // if the user already maximized it, it stays maximized; if they had it
    // docked (or closed), it comes back docked. Never surprise-fullscreen.
    setExecutionPanelOpen(true);

    const finish = (status: 'completed' | 'failed') => {
      debugSession.endRun();
      publishContext(status);
      setIsRunning(false);
      setTimeout(() => {
        if (isMountedRef.current) setActiveConnections(new Set());
      }, 1000);
    };

    // ── Single-node workflows ─────────────────────────────────────────────
    if (currentActions.length === 1) {
      logger.info(`Run started — single node: ${currentActions[0].name}`, {
        phase: 'run',
        metadata: { runId, nodes: 1 },
      });
      try {
        await executeActionWithPolicy(currentActions[0], context);
        logger.success('Run completed successfully.', { phase: 'run' });
        finish('completed');
      } catch (error: any) {
        logger.error(`Run failed: ${error?.message ?? error}`, { phase: 'run', error });
        finish('failed');
      }
      return;
    }

    if (currentConnections.length === 0) {
      alert('No connections found. Please connect your actions to define the workflow flow.');
      debugSession.endRun();
      setIsRunning(false);
      return;
    }

    // ── Build the execution graph ─────────────────────────────────────────
    const connectionGraph = new Map<string, Connection[]>();
    const incomingConnections = new Map<string, Connection[]>();
    currentConnections.forEach(conn => {
      if (!connectionGraph.has(conn.sourceId)) connectionGraph.set(conn.sourceId, []);
      if (!incomingConnections.has(conn.targetId)) incomingConnections.set(conn.targetId, []);
      connectionGraph.get(conn.sourceId)!.push(conn);
      incomingConnections.get(conn.targetId)!.push(conn);
    });

    const connectedActionIds = new Set([
      ...currentConnections.map(c => c.sourceId),
      ...currentConnections.map(c => c.targetId),
    ]);

    // Every loop needs a Body edge. Done is intentionally optional: a loop may
    // be the terminal operation, but without Body there is nothing to repeat.
    const loopsWithoutBody = currentActions.filter((action) => {
      if (!isLoopControllerNode(action)) return false;
      return !(connectionGraph.get(action.id) ?? []).some((connection) => {
        if (connection.isDisabled) return false;
        const effectivePort = connection.sourcePort ?? getPrimaryPort(action)?.id ?? null;
        return effectivePort === LOOP_BODY_PORT;
      });
    });
    if (loopsWithoutBody.length > 0) {
      const names = loopsWithoutBody.map(action => action.name).join(', ');
      alert(`Cannot run: loop Body path is not connected for ${names}.`);
      logger.error(`Run blocked: loop Body path missing for ${names}.`, { phase: 'validation' });
      debugSession.endRun();
      setIsRunning(false);
      return;
    }

    const isolatedActions = currentActions.filter(a => !connectedActionIds.has(a.id));
    if (isolatedActions.length > 0) {
      const names = isolatedActions.map(a => a.name).join(', ');
      alert(`Cannot run workflow: Found ${isolatedActions.length} isolated action(s).\n\nIsolated: ${names}\n\nPlease connect all actions or remove isolated ones.`);
      logger.error(`Run blocked: ${isolatedActions.length} isolated action(s): ${names}`, {
        phase: 'validation',
      });
      debugSession.endRun();
      setIsRunning(false);
      return;
    }

    const startingNodes = currentActions.filter(a =>
      connectedActionIds.has(a.id) && !incomingConnections.has(a.id)
    );
    if (startingNodes.length === 0) {
      alert('No starting nodes found. Workflow appears to have circular dependencies.');
      logger.error('Run blocked: no starting node (circular dependency).', { phase: 'validation' });
      debugSession.endRun();
      setIsRunning(false);
      return;
    }

    logger.info(
      `Run started — ${connectedActionIds.size} connected node(s), ${startingNodes.length} entry point(s).`,
      { phase: 'run', metadata: { runId, nodes: connectedActionIds.size } }
    );
    publishContext('running', { persist: false });

    try {
      const executedNodes = new Set<string>();
      const executedExecutionKeys = new Set<string>();

      // Every queued execution carries its loop stack. That is the key V1
      // difference from the old node-id-only scheduler: the same canvas node is
      // allowed to execute once per loop iteration while remaining de-duplicated
      // inside that specific iteration.
      type QueueEntry = {
        nodeId: string;
        inputData?: any;
        fromNodeId?: string | null;
        portId?: string | null;
        loopFrames: WorkflowLoopFrame[];
        executionKey: string;
      };

      const executionQueue: QueueEntry[] = startingNodes.map((node) => ({
        nodeId: node.id,
        loopFrames: [],
        executionKey: node.id,
      }));

      const completeLocalControlNode = (
        controlAction: WorkflowAction,
        output: Record<string, any>,
        inputData: any,
        executionKey: string
      ) => {
        const startedAt = new Date().toISOString();
        const startedMs = Date.now();
        context.recordNodeStart(controlAction, inputData, { executionInstanceKey: executionKey });
        const durationMs = Math.max(0, Date.now() - startedMs);
        context.recordNodeOutput(controlAction, output, {
          input: inputData,
          startedAt,
          durationMs,
        });
        setActions(prev =>
          prev.map(item =>
            item.id === controlAction.id
              ? { ...item, status: 'completed' as const, executionTime: durationMs }
              : item
          )
        );
      };

      const routeFromAction = async (
        sourceAction: WorkflowAction,
        sourceOutput: any,
        loopFrames: WorkflowLoopFrame[],
        onlyPort?: LoopControllerRoute
      ) => {
        syncLoopRuntime(context, loopFrames);

        for (const connection of (connectionGraph.get(sourceAction.id) || [])) {
          if (connection.isDisabled) continue;

          // Loop controllers expose two explicit handles. An old/unported edge
          // is treated as the primary Body edge; Done must be wired from Done.
          if (onlyPort) {
            const effectivePort =
              connection.sourcePort ?? getPrimaryPort(sourceAction)?.id ?? null;
            if (effectivePort !== onlyPort) continue;
          }

          const targetAction = actionsRef.current.find(a => a.id === connection.targetId);
          const targetName = targetAction?.name || connection.targetId;
          const routing = routeConnection(sourceAction, connection, sourceOutput);

          if (routing.skipped) {
            logger.info(
              `Branch not taken: ${sourceAction.name} → ${targetName}. ${routing.reason}.`,
              { phase: 'routing', metadata: { port: routing.port?.id } }
            );
            continue;
          }

          let shouldProceed = true;
          if (connection.condition?.trim()) {
            const conditionScope = context.buildScope({
              input: routing.payload,
              currentAction: sourceAction,
              previousNodeId: sourceAction.id,
              previousPortId: routing.port?.id ?? null,
              previousPortPayload: routing.port ? routing.payload : undefined,
            });
            try {
              shouldProceed = evaluateCondition(connection.condition, conditionScope);
            } catch {
              shouldProceed = false;
            }
          }

          const targetExecutionKey = loopExecutionKey(connection.targetId, loopFrames);
          if (shouldProceed && !executedExecutionKeys.has(targetExecutionKey)) {
            setActiveConnections(prev => new Set(prev).add(connection.id));
            executionQueue.push({
              nodeId: connection.targetId,
              inputData: routing.payload,
              fromNodeId: sourceAction.id,
              portId: routing.port?.id ?? null,
              loopFrames,
              executionKey: targetExecutionKey,
            });
            logger.info(
              `Routing: ${sourceAction.name}` +
                (routing.port ? ` [${routing.port.label}]` : '') +
                ` → ${targetName}` +
                (routing.port ? ` — ${routing.reason}` : ''),
              {
                phase: 'routing',
                metadata: {
                  port: routing.port?.id ?? null,
                  loopDepth: loopFrames.length,
                  iteration: activeLoopFrame(loopFrames)?.iteration,
                },
              }
            );
            await new Promise(r => setTimeout(r, 40));
          } else if (!shouldProceed) {
            logger.warn(
              `Branch skipped — condition "${connection.condition}" evaluated false ` +
              `(${sourceAction.name} → ${targetName}).`,
              { phase: 'routing' }
            );
          }
        }
      };

      let schedulerSteps = 0;
      // The old `connectedNodes * 4` guard treated every legitimate repeat as a
      // cycle. Loop nodes now have their own per-loop guards, while this larger
      // cap remains as a final scheduler fail-safe for malformed graph cycles.
      const maxSchedulerSteps = 250_000;

      while (executionQueue.length > 0 && schedulerSteps < maxSchedulerSteps) {
        if (stopRequestedRef.current) {
          logger.warn('Run stopped by user — context preserved for inspection.', { phase: 'run' });
          break;
        }

        schedulerSteps++;
        const entry = executionQueue.shift()!;
        const { nodeId, inputData, fromNodeId, portId, loopFrames, executionKey } = entry;
        if (executedExecutionKeys.has(executionKey)) continue;

        const action = actionsRef.current.find(a => a.id === nodeId);
        if (!action) continue;

        syncLoopRuntime(context, loopFrames);

        // Preserve the existing multi-inbound wait outside loops. Inside a loop
        // the queue itself is the execution order and a node-id-only dependency
        // test would incorrectly wait on the previous/next iteration of a
        // back-edge. This keeps non-loop workflows byte-for-byte in their old
        // scheduling model while allowing explicit loop cycles.
        if (loopFrames.length === 0 && !isLoopControllerNode(action)) {
          const pending = (incomingConnections.get(nodeId) ?? []).filter(
            conn =>
              !conn.isDisabled &&
              !executedNodes.has(conn.sourceId) &&
              connectedActionIds.has(conn.sourceId)
          );
          const reachablePending = pending.filter(conn =>
            executionQueue.some(queued => queued.nodeId === conn.sourceId)
          );
          if (reachablePending.length > 0) {
            executionQueue.push(entry);
            continue;
          }
        }

        const gate = await debugSession.beforeNode(
          action,
          context.buildScope({
            input: inputData,
            currentAction: action,
            previousNodeId: fromNodeId ?? undefined,
            previousPortId: portId ?? undefined,
            previousPortPayload: portId ? inputData : undefined,
          }),
          executedExecutionKeys.size + 1
        );
        if (gate === 'abort') {
          logger.warn('Run aborted from the debugger — context preserved.', { phase: 'run' });
          break;
        }
        if (stopRequestedRef.current) {
          logger.warn('Run stopped by user — context preserved for inspection.', { phase: 'run' });
          break;
        }

        // ── Loop controller ────────────────────────────────────────────────
        if (isLoopControllerNode(action)) {
          // A back-edge may arrive before a sibling branch has drained because
          // the scheduler is breadth-first. Do not advance the loop until every
          // queued task belonging to this exact iteration (including nested
          // work) has completed. Duplicate controller entries do not count.
          const activeControllerFrame = activeLoopFrame(loopFrames);
          if (activeControllerFrame?.loopNodeId === action.id) {
            const sameIterationWorkPending = executionQueue.some((queued) =>
              queued.nodeId !== action.id &&
              queued.loopFrames.some((frame) =>
                frame.loopNodeId === activeControllerFrame.loopNodeId &&
                frame.iteration === activeControllerFrame.iteration
              )
            );
            if (sameIterationWorkPending) {
              executionQueue.push(entry);
              continue;
            }
          }

          try {
            const transition = transitionLoopController({
              action,
              context,
              frames: loopFrames,
              inputData,
              fromNodeId,
              portId,
            });
            syncLoopRuntime(context, transition.frames);
            completeLocalControlNode(action, transition.output, inputData, executionKey);
            executedExecutionKeys.add(executionKey);
            executedNodes.add(nodeId);
            publishContext('running');

            const active = activeLoopFrame(transition.frames);
            logger.info(
              transition.route === LOOP_BODY_PORT
                ? `${action.name}: iteration ${active?.iteration ?? transition.output.iteration}` +
                    (transition.output.total ? `/${transition.output.total}` : '')
                : `${action.name}: loop completed after ${transition.output.iteration ?? 0} iteration(s).`,
              {
                phase: 'routing',
                metadata: {
                  loop: true,
                  kind: loopKindOf(action),
                  route: transition.route,
                  iteration: transition.output.iteration,
                  index: transition.output.currentIndex,
                },
              }
            );

            await routeFromAction(action, transition.output, transition.frames, transition.route);
            continue;
          } catch (error: any) {
            const startedAt = new Date().toISOString();
            context.recordNodeStart(action, inputData, { executionInstanceKey: executionKey });
            context.recordNodeError(action, error, { input: inputData, startedAt });
            setActions(prev =>
              prev.map(item => item.id === action.id ? { ...item, status: 'error' as const } : item)
            );
            executedExecutionKeys.add(executionKey);
            executedNodes.add(nodeId);
            publishContext('running');
            logger.error(`Loop failed: ${error?.message ?? error}`, {
              phase: 'run',
              error,
              metadata: { loop: true, nodeId: action.id },
            });
            throw error;
          }
        }

        // ── Break / Continue ───────────────────────────────────────────────
        if (isLoopSignalNode(action)) {
          const active = activeLoopFrame(loopFrames);
          if (!active) {
            const error = new Error(`${action.name} can only execute inside an active loop.`);
            context.recordNodeStart(action, inputData, { executionInstanceKey: executionKey });
            context.recordNodeError(action, error, { input: inputData });
            setActions(prev =>
              prev.map(item => item.id === action.id ? { ...item, status: 'error' as const } : item)
            );
            throw error;
          }

          if (isLoopContinueNode(action)) {
            // Continue discards any sibling work still queued for this current
            // iteration before scheduling the controller again.
            for (let index = executionQueue.length - 1; index >= 0; index--) {
              const queued = executionQueue[index];
              const belongsToCurrentIteration = queued.loopFrames.some((frame) =>
                frame.loopNodeId === active.loopNodeId &&
                frame.iteration === active.iteration
              );
              if (belongsToCurrentIteration) executionQueue.splice(index, 1);
            }

            const signalOutput = {
              success: true,
              controlNode: true,
              signal: 'continue',
              loopNodeId: active.loopNodeId,
              iteration: active.iteration,
            };
            completeLocalControlNode(action, signalOutput, inputData, executionKey);
            executedExecutionKeys.add(executionKey);
            executedNodes.add(nodeId);
            publishContext('running');

            const targetKey = loopExecutionKey(active.loopNodeId, loopFrames);
            if (!executedExecutionKeys.has(targetKey)) {
              executionQueue.push({
                nodeId: active.loopNodeId,
                inputData,
                // Keep the business step before Continue as `previous` for a
                // Repeat Until condition; Continue itself is only a signal.
                fromNodeId: fromNodeId ?? null,
                portId: portId ?? null,
                loopFrames,
                executionKey: targetKey,
              });
            }
            logger.info(
              `Continue: advancing ${active.loopNodeName} after iteration ${active.iteration}.`,
              { phase: 'routing', metadata: { loop: true, signal: 'continue' } }
            );
            continue;
          }

          // Break cancels every not-yet-run task in the innermost loop's
          // current iteration, then routes directly from the loop's Done port.
          for (let index = executionQueue.length - 1; index >= 0; index--) {
            const queued = executionQueue[index];
            const belongsToCurrentIteration = queued.loopFrames.some((frame) =>
              frame.loopNodeId === active.loopNodeId &&
              frame.iteration === active.iteration
            );
            if (belongsToCurrentIteration) executionQueue.splice(index, 1);
          }

          const finishedFrame = finaliseCurrentLoopIteration(active);
          const doneOutput = makeLoopDoneOutput(finishedFrame, { broken: true });
          let parentFrames = popLoopFrame(loopFrames);
          parentFrames = captureLoopBodyOutput(parentFrames, doneOutput);
          syncLoopRuntime(context, parentFrames);

          const signalOutput = {
            success: true,
            controlNode: true,
            signal: 'break',
            loopNodeId: active.loopNodeId,
            iteration: active.iteration,
          };
          completeLocalControlNode(action, signalOutput, inputData, executionKey);
          executedExecutionKeys.add(executionKey);
          executedNodes.add(nodeId);

          const loopAction = actionsRef.current.find(item => item.id === active.loopNodeId);
          if (!loopAction) {
            throw new Error(`Break could not find active loop node ${active.loopNodeId}.`);
          }
          context.recordNodeOutput(loopAction, doneOutput, { input: inputData });
          setActions(prev =>
            prev.map(item =>
              item.id === loopAction.id ? { ...item, status: 'completed' as const } : item
            )
          );
          publishContext('running');
          logger.info(
            `Break: exited ${active.loopNodeName} at iteration ${active.iteration}.`,
            { phase: 'routing', metadata: { loop: true, signal: 'break' } }
          );
          await routeFromAction(loopAction, doneOutput, parentFrames, LOOP_DONE_PORT);
          continue;
        }

        // ── Normal plugin / Start / End action ─────────────────────────────
        let actionOutput: any;
        try {
          actionOutput = await executeActionWithPolicy(action, context, inputData, {
            fromNodeId,
            portId,
            executionKey,
          });
          executedExecutionKeys.add(executionKey);
          executedNodes.add(nodeId);
        } catch {
          executedExecutionKeys.add(executionKey);
          executedNodes.add(nodeId);
          publishContext('running');

          const resolution = resolveErrorStrategy(action, connectedActionIds);
          if (resolution.action === 'stop') {
            logger.error(`Halting run — "${action.name}" failed. ${resolution.reason}`, {
              phase: 'routing',
            });
            break;
          }

          if (resolution.action === 'fallback' && resolution.fallbackActionId) {
            const fallbackAction = actionsRef.current.find(a => a.id === resolution.fallbackActionId);
            logger.warn(
              `"${action.name}" failed — routing to fallback ` +
              `"${fallbackAction?.name ?? resolution.fallbackActionId}".`,
              { phase: 'routing' }
            );
            const fallbackKey = loopExecutionKey(resolution.fallbackActionId, loopFrames);
            if (!executedExecutionKeys.has(fallbackKey)) {
              executionQueue.push({
                nodeId: resolution.fallbackActionId,
                inputData: context.getRecord(action.id)?.error ?? inputData,
                fromNodeId: action.id,
                loopFrames,
                executionKey: fallbackKey,
              });
            }
            continue;
          }

          logger.warn(`Continuing past failed node "${action.name}". ${resolution.reason}`, {
            phase: 'routing',
          });
          continue;
        }

        let routingFrames = captureLoopBodyOutput(loopFrames, actionOutput);
        syncLoopRuntime(context, routingFrames);
        publishContext('running');

        const branchSummaries = summarisePorts(action, actionOutput);
        if (branchSummaries.length > 0) {
          logger.info(
            `"${action.name}" produced ` +
              branchSummaries
                .map(b => `${b.recordCount ?? '—'} ${b.label.toLowerCase()}`)
                .join(', ') + '.',
            { phase: 'routing', metadata: { branches: branchSummaries } }
          );
        }

        await routeFromAction(action, actionOutput, routingFrames);
        await new Promise(r => setTimeout(r, 25));
      }

      if (schedulerSteps >= maxSchedulerSteps && executionQueue.length > 0) {
        throw new Error(
          `Workflow scheduler safety limit (${maxSchedulerSteps}) reached. ` +
          'Check for a graph cycle that is not controlled by For Each, While, or Repeat Until.'
        );
      }

      const records = context.getRecords();
      const failed = records.filter(r => r.status === 'error' || r.status === 'failed').length;

      if (failed > 0) {
        logger.warn(
          `Run finished with ${failed} failed node(s) of ${records.length} executed.`,
          { phase: 'run' }
        );
        finish('failed');
      } else {
        logger.success(
          `Run completed successfully — ${records.length} node(s) executed, ` +
          `${Object.keys(context.getVariables()).length} variable(s) in context.`,
          { phase: 'run' }
        );
        finish('completed');
      }
    } catch (error: any) {
      logger.error(`Run failed: ${error?.message ?? error}`, { phase: 'run', error });
      finish('failed');
    }
  }, [id, workflowName, executeActionWithPolicy, publishContext, getDebugSession]);

  /**
   * Stop the run cooperatively. The loop checks `stopRequestedRef` between
   * nodes, so an in-flight request is allowed to finish and record its output
   * rather than being lost. Node statuses are intentionally NOT reset — the
   * canvas keeps showing which nodes ran, and the execution context stays
   * populated so its values remain inspectable and bindable.
   */
  const handleStopWorkflow = useCallback(() => {
    stopRequestedRef.current = true;
    // Release a parked debugger, or the run loop stays awaiting the gate
    // forever and Stop appears to do nothing.
    debugSessionRef.current?.abort();
    setIsRunning(false);
    setActiveConnections(new Set());
    loggerRef.current?.warn('Stop requested — finishing current node, context preserved.', {
      phase: 'run',
    });
    publishContext('idle');
  }, [publishContext]);

  // ── Action handlers ───────────────────────────────────────────────────────────
  // Thin wrapper around the module-level merge so hydration and execution use one
  // identical implementation. Keeps nested groups (e.g. Email Read's
  // general/batch/filter/output) intact instead of being wiped by a shallow spread.
  const deepMergeProps = useCallback(
    (base: any, override: any): any => deepMergeProperties(base, override),
    []
  );

  // Ensure every action has its service-provided propertyConfig, api, and default
  // properties before it lands on the canvas. Without this, a node dropped from
  // the sidebar (or returned bare from chat) reaches the PropertiesPanel with no
  // schema, so the panel renders no options.
  //
  // Resolves via `resolveService` so a node whose `type` collides with a later
  // category (e.g. Teams `create-team` vs Asana `create-team`) is never hydrated
  // from the wrong service. If the sidebar already provided the correct
  // `propertyConfig` / `api` (it does for catalog actions), those win regardless.
  const hydrateAction = useCallback(
    (action: WorkflowAction): WorkflowAction => {
      const svc = resolveService(action);
      if (!svc) {
        return { ...action, properties: (action as any).properties ?? {} };
      }
      return {
        ...action,
        name: action.name || svc.name,
        description: (action as any).description || svc.description,
        icon: (action as any).icon || svc.icon || 'Settings',
        category: (action as any).category || svc.category,
        api: (action as any).api ?? svc.api,
        propertyConfig:
          (action as any).propertyConfig ?? svc.propertyConfig,
        properties: deepMergeProps(
          svc.properties ?? {},
          (action as any).properties ?? {}
        ),
      } as WorkflowAction;
    },
    [deepMergeProps, resolveService]
  );

  const handleAddAction = useCallback((action: WorkflowAction) => {
    const availability = getWorkflowActionAvailability(action, automationCategories);
    if (availability.state === 'unavailable') {
      alert(
        `Cannot add “${action.name || action.type || 'Untitled node'}”. ` +
        `${availability.reason || 'Backend connector not installed'}.`
      );
      return;
    }

    const hydrated = hydrateAction(action);
    setActions(prev => [...prev, hydrated]);
    setHasUnsavedChanges(true);
  }, [hydrateAction]);

  const handleUpdateAction = useCallback((updated: WorkflowAction) => {
    setActions(prev => prev.map(a => a.id === updated.id ? updated : a));
    setHasUnsavedChanges(true);
  }, []);

  const handleDeleteAction = useCallback((actionId: string) => {
    setActions(prev => prev.filter(a => a.id !== actionId));
    setConnections(prev => prev.filter(c => c.sourceId !== actionId && c.targetId !== actionId));
    if (selectedNode === actionId) setSelectedNode(null);
    setHasUnsavedChanges(true);
  }, [selectedNode]);

  // ── Connection handlers ───────────────────────────────────────────────────────
  const handleAddConnection = useCallback((connection: Connection) => {
    setConnections(prev => [...prev, connection]);
    setHasUnsavedChanges(true);
  }, []);

  const handleUpdateConnection = useCallback((updated: Connection) => {
    setConnections(prev => prev.map(c => c.id === updated.id ? updated : c));
    setHasUnsavedChanges(true);
  }, []);

  const handleDeleteConnection = useCallback((connectionId: string) => {
    setConnections(prev => prev.filter(c => c.id !== connectionId));
    setHasUnsavedChanges(true);
  }, []);

  const handleEditConnection = useCallback((connection: Connection) => {
    const newLabel = prompt('Enter connection label (optional):', connection.label || '');
    if (newLabel === null) return;
    const newCondition = prompt(
      'Enter condition (JavaScript expression, optional):\nExample: data.status === "success"',
      connection.condition || ''
    );
    if (newCondition === null) return;
    handleUpdateConnection({ ...connection, label: newLabel, condition: newCondition || undefined });
  }, [handleUpdateConnection]);

  // ── Connection dragging ────────────────────────────────────────────────────────
  const handleStartConnection = useCallback(
    (nodeId: string, portId?: string | null) =>
      setConnectionStart({ nodeId, port: 'output', portId: portId ?? null }),
    []
  );
  const handleUpdateTempConnection = useCallback((x: number, y: number) => setTempConnection({ x, y }), []);

  const handleCompleteConnection = useCallback((targetNodeId: string) => {
    if (connectionStart && connectionStart.nodeId !== targetNodeId) {
      const exists = connections.some(
        c => c.sourceId === connectionStart.nodeId && c.targetId === targetNodeId
      );
      if (!exists) {
        const sourceAction = actionsRef.current.find(a => a.id === connectionStart.nodeId);
        // A drag from a named handle records that port. A drag from the node
        // body on a multi-output step defaults to its primary path rather than
        // to "everything", because on a step that declares branches the whole
        // envelope is almost never what the author means.
        const portId =
          connectionStart.portId ?? (getPrimaryPort(sourceAction)?.id ?? undefined);
        handleAddConnection({
          id: uuidv4(),
          sourceId: connectionStart.nodeId,
          targetId: targetNodeId,
          label: '',
          ...(portId ? { sourcePort: portId } : {}),
        });
      }
    }
    setConnectionStart(null);
    setTempConnection(null);
  }, [connectionStart, connections, handleAddConnection]);

  const handleCancelConnection = useCallback(() => {
    setConnectionStart(null);
    setTempConnection(null);
  }, []);

  // ── Variable handlers ──────────────────────────────────────────────────────────
  const handleAddVariable = useCallback((v: WorkflowVariable) => {
    setVariables(prev => [...prev, v]);
    setHasUnsavedChanges(true);
  }, []);
  const handleUpdateVariable = useCallback((v: WorkflowVariable) => {
    setVariables(prev => prev.map(x => x.id === v.id ? v : x));
    setHasUnsavedChanges(true);
  }, []);
  const handleDeleteVariable = useCallback((id: string) => {
    setVariables(prev => prev.filter(x => x.id !== id));
    setHasUnsavedChanges(true);
  }, []);
  const handleClearLogs = useCallback(() => setExecutionLogs([]), []);

  /**
   * Open / close the execution panel.
   *
   * Toggling always lands in docked mode. Reopening the panel should never
   * surprise the user with a full-screen console over the canvas, and closing
   * from full screen must not leave the drawer in its collapsed anchor state.
   * This is also what the panel's own close button calls, so both routes agree.
   */
  const handleToggleExecutionPanel = useCallback(() => {
    setExecutionPanelOpen(open => !open);
    setExecutionMaximized(false);
  }, []);

  /**
   * The panel reports every maximize / restore back through here — from its
   * header button, a double-click on its title, Esc, or a click on the
   * backdrop. All four routes therefore agree, and the page always knows which
   * drawer chrome to stand up.
   *
   * Maximizing implies the console should be on screen, so opening is folded
   * in: without it, a maximize arriving while the panel is closed would be
   * silently swallowed by the derived `isExecutionMaximized` and the button
   * would look broken.
   */
  const handleExecutionMaximizeChange = useCallback((next: boolean) => {
    setExecutionMaximized(next);
    if (next) setExecutionPanelOpen(true);
  }, []);

  // ── Save: async update to backend ─────────────────────────────────────────────
  const handleSaveWorkflow = useCallback(async () => {
    if (!id || isSaving) return;

    // Snapshot exactly what we're sending, so the baseline reflects the saved
    // state even if the user keeps editing during the async round-trip.
    const sentSnapshot = serializeForDirty({ name: workflowName, actions, connections, variables });

    setSaveError(null);
    setIsSaving(true);
    try {
      await saveWorkflowState(id, {
        name: workflowName,
        actions,
        connections,
        variables,
      });
      // The store has already reconciled cache/items to the backend response
      // and cleared the draft. Rebase our baseline to what was persisted; the
      // dirty effect will then recompute (clean, unless edited mid-save).
      if (isMountedRef.current) {
        baselineRef.current = sentSnapshot;
        removeWorkflowDraft(id);
        setHasUnsavedChanges(
          serializeForDirty({ name: workflowName, actions, connections, variables }) !== sentSnapshot
        );

        // Cut a version alongside every successful save, but only when the
        // canvas actually differs from the newest stored one. Without that
        // check, repeatedly pressing Save would bury real history under
        // identical entries and make rollback useless.
        const history = listVersions(id);
        const candidate = captureVersion(
          { name: workflowName, actions, connections, variables },
          { workflowId: id, version: nextVersionNumber(history[0]?.version), label: 'Saved', auto: true }
        );
        if (!history[0] || !diffVersions(history[0], candidate).identical) {
          setVersions(saveVersion(candidate));
        }
      }
    } catch (error) {
      console.error('Failed to save workflow:', error);
      if (isMountedRef.current) {
        setSaveError(error instanceof Error ? error.message : 'Failed to save workflow');
      }
    } finally {
      if (isMountedRef.current) {
        setIsSaving(false);
      }
    }
  }, [id, workflowName, actions, connections, variables, saveWorkflowState, isSaving]);

  // ── Load from JSON file (import) ──────────────────────────────────────────────
  const handleLoadWorkflow = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const wf = JSON.parse(ev.target?.result as string);
          setWorkflowName(wf.name || workflowName);
          setActions(wf.actions || []);
          setConnections(wf.connections || []);
          setVariables(wf.variables || []);
          setSelectedNode(null);
          setExecutionLogs([]);
          setHasUnsavedChanges(true);
        } catch {
          alert('Error loading workflow file. Please check the file format.');
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }, [workflowName]);

  // ── Navigate away safely ──────────────────────────────────────────────────────
  const handleNavigateToDirectory = useCallback(() => {
    if (hasUnsavedChanges && !window.confirm('You have unsaved changes. Leave without saving?')) return;
    navigate('/workspace');
  }, [hasUnsavedChanges, navigate]);

  const handleNewWorkflow = useCallback(() => {
    if (hasUnsavedChanges && !window.confirm('You have unsaved changes. Continue?')) return;
    navigate('/workspace');
  }, [hasUnsavedChanges, navigate]);

  // ── Zoom ──────────────────────────────────────────────────────────────────────
  const handleZoomIn = useCallback(() => setZoomLevel(z => Math.min(200, z + 10)), []);
  const handleZoomOut = useCallback(() => setZoomLevel(z => Math.max(25, z - 10)), []);
  const handleResetZoom = useCallback(() => setZoomLevel(100), []);
  const handleFitToScreen = useCallback(() => {
    if (actions.length === 0) return;
    const minX = Math.min(...actions.map(a => a.x || 0));
    const maxX = Math.max(...actions.map(a => (a.x || 0) + 200));
    const minY = Math.min(...actions.map(a => a.y || 0));
    const maxY = Math.max(...actions.map(a => (a.y || 0) + 100));
    const w = maxX - minX + 100;
    const h = maxY - minY + 100;
    if (canvasRef.current) {
      const rect = canvasRef.current.getBoundingClientRect();
      const scale = Math.min(rect.width / w, rect.height / h, 1) * 100;
      setZoomLevel(Math.max(25, Math.min(200, scale)));
    }
  }, [actions]);

  // ── AI workflow generation ─────────────────────────────────────────────────────
  const handleWorkflowGenerated = useCallback((workflow: {
    id: string; name: string; description: string;
    actions: WorkflowAction[]; connections: Connection[];
    variables: WorkflowVariable[]; version: string;
    createdAt: string; updatedAt: string;
  }) => {
    import('../services/serviceRegistry').then(({ ServiceRegistry }) => {
      const registry = ServiceRegistry.getInstance();
      const allServiceTypes = registry.getAllServiceTypes();

      const invalidActions = workflow.actions.filter(a => !allServiceTypes.includes(a.type));
      if (invalidActions.length > 0) {
        const types = invalidActions.map(a => a.type).join(', ');
        setExecutionLogs(prev => [...prev, {
          id: uuidv4(), timestamp: new Date().toISOString(), level: 'error',
          message: `AI workflow generation failed: Invalid service types: ${types}.`,
        }]);
        alert(`Error: Invalid service types: ${types}. Please try again.`);
        return;
      }

      if (!workflow.name || !Array.isArray(workflow.actions)) {
        setExecutionLogs(prev => [...prev, {
          id: uuidv4(), timestamp: new Date().toISOString(), level: 'error',
          message: 'AI workflow generation failed: Invalid workflow structure received.',
        }]);
        alert('Error: Invalid workflow structure. Please try again.');
        return;
      }

      const processedActions: WorkflowAction[] = workflow.actions.map((action, index) => {
        // Resolve by category+type when the incoming action carries a category,
        // so a collided `type` (e.g. "create-team") can't pull the wrong
        // service. Falls back to the type-only lookup for actions with no
        // category hint.
        const actionCategory = (action as any).category;
        const byType = registry.getService(action.type);
        const svc =
          actionCategory && byType?.category && byType.category !== actionCategory
            ? null
            : byType;
        if (!svc) {
          return { ...action, id: action.id || uuidv4(), x: action.x || (100 + index * 250), y: action.y || 100, status: 'idle' as const, properties: action.properties || {} };
        }
        return {
          id: action.id || uuidv4(),
          type: svc.type, category: svc.category, name: svc.name,
          description: svc.description, icon: svc.icon || 'Settings',
          x: action.x || (100 + index * 250), y: action.y || 100,
          status: 'idle' as const,
          properties: deepMergeProperties(svc.properties ?? {}, action.properties ?? {}),
          api: (svc.api || action.api) as WorkflowAction['api'],
          propertyConfig: svc.propertyConfig,
        };
      });

      const processedConnections = workflow.connections.map(c => ({ ...c, id: c.id || uuidv4(), label: c.label || '' }));
      const processedVariables = workflow.variables.map(v => ({ ...v, id: v.id || uuidv4() }));

      setWorkflowName(workflow.name);
      setActions(prev => { const ids = new Set(prev.map(a => a.id)); return [...prev, ...processedActions.filter(a => !ids.has(a.id))]; });
      setConnections(prev => { const ids = new Set(prev.map(c => c.id)); return [...prev, ...processedConnections.filter(c => !ids.has(c.id))]; });
      setVariables(prev => { const ns = new Set(prev.map(v => v.name)); return [...prev, ...processedVariables.filter(v => !ns.has(v.name))]; });
      setHasUnsavedChanges(true);

      setExecutionLogs(prev => [...prev, {
        id: uuidv4(), timestamp: new Date().toISOString(), level: 'success',
        message: `AI generated workflow "${workflow.name}" applied with ${processedActions.length} actions.`,
      }]);

      if (processedActions.length > 0) {
        setSelectedNode(processedActions[0].id);
        setPropertiesPanelOpen(true);
      }
    }).catch(() => {
      setExecutionLogs(prev => [...prev, {
        id: uuidv4(), timestamp: new Date().toISOString(), level: 'error',
        message: 'Failed to validate workflow: Service registry not available.',
      }]);
    });
  }, []);

  // ── Selected action ────────────────────────────────────────────────────────────
  // Refresh the selected node's `propertyConfig`/`api` from the service registry
  // (preserving the user's `properties`) so the panel reflects the *current*
  // service definition even for nodes loaded from a workflow that was saved with
  // an older config baked in — e.g. attachments that used to be `required: true`.
  //
  // Resolution goes through `resolveService`, which refuses a service whose
  // category doesn't match the node's. That's the fix for the Create Team panel:
  // `getService("create-team")` resolves to Asana, but its category
  // (`asana-033`) ≠ the node's (`microsoft-teams-010`), so we keep the node's own
  // Teams `propertyConfig` / `api` instead of overwriting it with Asana's.
  const selectedAction = useMemo(() => {
    if (!selectedNode) return null;
    const found = actions.find((a) => a.id === selectedNode) ?? null;
    if (!found) return null;

    const svc = resolveService(found);
    if (!svc) return found;

    return {
      ...found,
      api: svc.api ?? (found as any).api,
      propertyConfig: svc.propertyConfig ?? (found as any).propertyConfig,
    } as WorkflowAction;
    // registryReady is included so this recomputes once the registry loads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedNode, actions, registryReady, resolveService]);

  // ── Binding catalogue + preview scope ──────────────────────────────────────
  //
  // Both are derived from the SAME context the executor uses, so what the
  // Properties Panel offers and previews is exactly what will be resolved at
  // run time. When the editor is first opened the most recent persisted run is
  // used, so bindings can be wired up without re-running the workflow.
  //
  // ⚠️ These two hooks MUST stay above the loading / notFound / error returns
  // below. They previously lived *after* those returns, which meant they were
  // skipped on every render where `loadState !== 'loaded'` and then appeared
  // once the workflow finished loading. React saw the hook count grow between
  // renders and threw "Rendered more hooks than during the previous render",
  // unmounting the subtree — that is what made the editor render blank.
  //
  // Running them during the loading state is harmless: `buildBindingCatalogue`
  // receives empty arrays and a null action, and `previewScope` falls through
  // to the variables branch (no live context, no snapshot yet). Both are
  // memoized and their consumers aren't mounted yet, so the cost is one
  // trivial pass.
  const legacyBindingGroups = useMemo(() => {
    const observed = buildBindingCatalogue({
      action: (selectedAction as WorkflowAction) ?? null,
      actions,
      connections,
      variables,
      records: executionRecords,
      snapshot: contextSnapshot,
    });

    // Steps that have not run yet contribute the outputs they *declare*, so a
    // workflow can be configured before it is executed. `buildBindingCatalogue`
    // builds only from recorded runs, which is why the picker's empty state
    // reads "Run the workflow once to capture live outputs" — a user had to run
    // a half-built workflow against real files to discover its column names.
    //
    // Observed always wins: `mergeCatalogues` appends only groups with no
    // observed counterpart, so a real recorded value is never shadowed by a
    // promised one.
    const declared = buildDeclaredCatalogue(actions, executionRecords);
    return mergeCatalogues(observed, declared);
  }, [selectedAction, actions, connections, variables, executionRecords, contextSnapshot]);

  const shadowEligibleNodeIds = useMemo(() => {
    if (!selectedAction) return undefined;
    const upstream = collectUpstreamNodeIds(selectedAction.id, connections);
    return upstream.length > 0
      ? upstream
      : actions
          .filter((candidate) => candidate.id !== selectedAction.id)
          .map((candidate) => candidate.id);
  }, [selectedAction?.id, actions, connections]);

  // Phase 3 Step 7B.5B — shadow-only PostgreSQL output-source comparison.
  //
  // The visible Properties Panel still receives `bindingGroups` above. Shadow
  // mode makes one read-only request after a persisted run is idle, compares
  // only `steps.*` tokens, and stores a preview-free report in sessionStorage.
  // API failures never affect workflow editing, execution, or binding inserts.
  useEffect(() => {
    if (
      OUTPUT_SOURCE_MODE.effective === 'legacy' ||
      loadState !== 'loaded' ||
      isRunning ||
      !id ||
      !currentRunId
    ) {
      return;
    }

    const controller = new AbortController();
    const targetNodeId = selectedAction?.id ?? null;
    setIndexedOutputCatalogueLoading(true);
    setIndexedOutputCatalogueError(null);

    void loadOutputSourceCatalogue({
      mode: OUTPUT_SOURCE_MODE.effective,
      workflowId: id,
      runId: currentRunId,
      targetNodeId,
      eligibleNodeIds: shadowEligibleNodeIds,
      includeTechnical: true,
      includeRaw: true,
      signal: controller.signal,
    })
      .then((result) => {
        if (result.status !== 'loaded' || controller.signal.aborted) return;
        setIndexedOutputCatalogue({
          runId: result.response.runId,
          targetNodeId,
          groups: result.response.bindingGroups,
          coverage: result.response.coverage,
        });
        setIndexedOutputCatalogueLoading(false);

        const report = compareOutputSourceCatalogues({
          workflowId: id,
          runId: result.response.runId,
          targetNodeId,
          mode: OUTPUT_SOURCE_MODE,
          coverage: result.response.coverage,
          legacyGroups: legacyBindingGroups,
          postgresGroups: result.response.bindingGroups,
        });
        const isNew = persistOutputSourceShadowReport(report);
        if (isNew && import.meta.env.DEV) {
          console.info('[AutoFlow output-source shadow]', {
            workflowId: report.workflowId,
            runId: report.runId,
            targetNodeId: report.targetNodeId,
            verdict: report.verdict,
            summary: report.summary,
          });
        }
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        setIndexedOutputCatalogueLoading(false);
        setIndexedOutputCatalogueError(
          error instanceof Error ? error.message : String(error)
        );
        const report = createOutputSourceShadowFailure({
          workflowId: id,
          runId: currentRunId,
          targetNodeId,
          mode: OUTPUT_SOURCE_MODE,
          error,
        });
        const isNew = persistOutputSourceShadowReport(report);
        if (isNew && import.meta.env.DEV) {
          console.warn('[AutoFlow output-source shadow] comparison unavailable', report.error);
        }
      });

    return () => controller.abort();
  }, [
    id,
    currentRunId,
    selectedAction?.id,
    shadowEligibleNodeIds,
    legacyBindingGroups,
    loadState,
    isRunning,
  ]);

  const visibleOutputCatalogue = useMemo(() =>
    resolveVisibleOutputSourceCatalogue({
      mode: OUTPUT_SOURCE_MODE,
      legacyGroups: legacyBindingGroups,
      postgresGroups: indexedOutputCatalogue?.groups ?? null,
      coverage: indexedOutputCatalogue?.coverage ?? null,
      runMatches: Boolean(
        indexedOutputCatalogue && currentRunId && indexedOutputCatalogue.runId === currentRunId
      ),
      targetMatches: Boolean(
        indexedOutputCatalogue &&
        indexedOutputCatalogue.targetNodeId === (selectedAction?.id ?? null)
      ),
      loading: isRunning || indexedOutputCatalogueLoading,
      error: indexedOutputCatalogueError,
    }), [
      legacyBindingGroups,
      indexedOutputCatalogue,
      currentRunId,
      selectedAction?.id,
      isRunning,
      indexedOutputCatalogueLoading,
      indexedOutputCatalogueError,
    ]);

  const bindingGroups = visibleOutputCatalogue.groups;

  useEffect(() => {
    if (OUTPUT_SOURCE_MODE.effective !== 'postgres' || import.meta.env.PROD) return;
    console.info('[AutoFlow output-source postgres]', {
      source: visibleOutputCatalogue.source,
      reason: visibleOutputCatalogue.reason,
      metrics: visibleOutputCatalogue.metrics,
      runId: currentRunId,
      targetNodeId: selectedAction?.id ?? null,
    });
  }, [
    visibleOutputCatalogue.source,
    visibleOutputCatalogue.reason,
    visibleOutputCatalogue.metrics.visibleTokens,
    currentRunId,
    selectedAction?.id,
  ]);

  const previewScope = useMemo(() => {
    const context = executionContextRef.current;
    if (context) {
      return context.buildScope({
        currentAction: (selectedAction as WorkflowAction) ?? null,
      });
    }
    // No live run in memory: rebuild a read-only context from the last snapshot
    // so previews still show real values from the previous execution.
    if (contextSnapshot) {
      return WorkflowExecutionContext.restore(contextSnapshot).buildScope({
        currentAction: (selectedAction as WorkflowAction) ?? null,
      });
    }
    return variables.reduce<Record<string, any>>((acc, v) => {
      acc[v.name] = v.value;
      return acc;
    }, {});
    // `executionRecords` is a deliberate cache-buster and must NOT be removed by
    // an exhaustive-deps autofix: the execution context lives in a ref, so
    // `recordNodeOutput` produces no state change that would otherwise
    // invalidate this memo. `executionRecords` is what makes the inline field
    // previews refresh as a run progresses.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAction, contextSnapshot, variables, executionRecords]);

  // ═══════════════════════════════════════════════════════════════════════════
  //  NO HOOKS BELOW THIS LINE — everything past here may return early.
  // ═══════════════════════════════════════════════════════════════════════════

  // ── Loading / not found / error states ────────────────────────────────────────
  if (loadState === 'loading') {
    return (
      <div className="relative h-screen w-full flex items-center justify-center overflow-hidden bg-[#05070D]">
        <StateBackdrop />

        <div role="status" aria-live="polite" className="relative flex flex-col items-center gap-7">
          <div className="relative h-16 w-16">
            <div className="absolute inset-0 rounded-full border border-white/[0.06]" />
            <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-indigo-400 motion-safe:animate-spin" />
            <div className="absolute inset-[7px] rounded-full border border-transparent border-t-violet-400/70 motion-safe:animate-[spin_1.6s_linear_infinite_reverse]" />
            <div className="absolute inset-0 flex items-center justify-center">
              <Icons.Workflow className="h-5 w-5 text-indigo-300/90" />
            </div>
          </div>
          <div className="flex flex-col items-center gap-1.5 text-center">
            <p className="text-sm font-semibold tracking-tight text-slate-200">
              {isLoadingWorkspace ? 'Loading workspace…' : 'Loading workflow…'}
            </p>
            <p className="text-xs text-slate-500">Preparing your canvas</p>
          </div>
        </div>
      </div>
    );
  }

  if (loadState === 'notFound') {
    return (
      <div className="relative h-screen w-full flex items-center justify-center overflow-hidden bg-[#05070D] px-6">
        <StateBackdrop />

        <div
          role="alert"
          className="relative w-full max-w-md rounded-3xl border border-white/[0.07] bg-[#0B0F19]/80 p-8 text-center shadow-[0_24px_64px_-24px_rgba(0,0,0,0.7),inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-2xl"
        >
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-amber-400/20 bg-amber-500/10 shadow-[0_8px_24px_-8px_rgba(245,158,11,0.35)]">
            <Icons.SearchX className="h-7 w-7 text-amber-300" />
          </div>
          <h2 className="text-base font-bold tracking-tight text-slate-100">We couldn't open that workflow</h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-400">
            It may have been renamed, moved, or deleted. Try reloading, or head back to the
            Builder to pick another workflow or start a new one.
          </p>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            <button onClick={() => loadWorkflow()} className={BTN_SECONDARY}>
              <Icons.RefreshCw className="h-4 w-4" />
              Reload
            </button>
            <button onClick={() => navigate('/workspace')} className={BTN_SECONDARY}>
              <Icons.FolderTree className="h-4 w-4" />
              Directory
            </button>
            <button onClick={() => navigate('/workspace/editor')} className={BTN_PRIMARY}>
              <Icons.Workflow className="h-4 w-4" />
              Open Builder
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (loadState === 'error') {
    return (
      <div className="relative h-screen w-full flex items-center justify-center overflow-hidden bg-[#05070D] px-6">
        <StateBackdrop />

        <div
          role="alert"
          className="relative w-full max-w-md rounded-3xl border border-white/[0.07] bg-[#0B0F19]/80 p-8 text-center shadow-[0_24px_64px_-24px_rgba(0,0,0,0.7),inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-2xl"
        >
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-amber-400/20 bg-amber-500/10 shadow-[0_8px_24px_-8px_rgba(245,158,11,0.35)]">
            <Icons.AlertCircle className="h-7 w-7 text-amber-300" />
          </div>
          <h2 className="text-base font-bold tracking-tight text-slate-100">Failed to load workflow</h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-400">
            An error occurred while loading the workflow. Please try again.
          </p>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            <button onClick={() => navigate('/workspace')} className={BTN_SECONDARY}>
              <Icons.ArrowLeft className="h-4 w-4" />
              Back to Directory
            </button>
            <button onClick={() => loadWorkflow()} className={BTN_PRIMARY}>
              <Icons.RefreshCw className="h-4 w-4" />
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────────
  return (
    <DndProvider backend={HTML5Backend}>
      <div className="workspace-editor-root relative h-screen w-full flex flex-col overflow-hidden bg-[#05070D] text-slate-300 font-sans antialiased selection:bg-indigo-500/30 selection:text-indigo-100">

        {/* Scoped UI polish (visual only): refined thin scrollbars for every panel,
            plus prefers-reduced-motion support so all transitions/animations are
            effectively disabled for users who request it. */}
        <style>{`
          .workspace-editor-root ::-webkit-scrollbar { width: 8px; height: 8px; }
          .workspace-editor-root ::-webkit-scrollbar-track { background: transparent; }
          .workspace-editor-root ::-webkit-scrollbar-thumb {
            background-color: rgba(148, 163, 184, 0.18);
            border-radius: 9999px;
            border: 2px solid transparent;
            background-clip: padding-box;
          }
          .workspace-editor-root ::-webkit-scrollbar-thumb:hover { background-color: rgba(148, 163, 184, 0.32); }
          .workspace-editor-root ::-webkit-scrollbar-corner { background: transparent; }
          .workspace-editor-root, .workspace-editor-root * {
            scrollbar-width: thin;
            scrollbar-color: rgba(148, 163, 184, 0.22) transparent;
          }
          @media (prefers-reduced-motion: reduce) {
            .workspace-editor-root *,
            .workspace-editor-root *::before,
            .workspace-editor-root *::after {
              animation-duration: 0.01ms !important;
              animation-iteration-count: 1 !important;
              transition-duration: 0.01ms !important;
            }
          }
        `}</style>

        {/* Background layers — subtle atmosphere. CSS-only (no external image asset,
            per the earlier fix): quiet layered glows + a soft vignette for depth that
            stays out of the way of the canvas content. */}
        <div aria-hidden="true" className="absolute inset-0 z-0 pointer-events-none">
          <div className="absolute inset-x-0 top-0 h-64 bg-[linear-gradient(180deg,rgba(99,102,241,0.06)_0%,transparent_100%)]" />
          <div className="absolute top-[-18%] left-[-12%] h-[46%] w-[46%] rounded-full bg-indigo-600/[0.09] blur-[150px] motion-safe:animate-[pulse_10s_ease-in-out_infinite]" />
          <div className="absolute bottom-[-18%] right-[-8%] h-[42%] w-[42%] rounded-full bg-violet-600/[0.07] blur-[130px]" />
          <div className="absolute top-[22%] right-[18%] h-[28%] w-[28%] rounded-full bg-sky-500/[0.04] blur-[110px]" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,rgba(3,5,11,0.55)_100%)]" />
        </div>

        <div className="relative z-10 flex h-full flex-col">

          <VersionHistoryModal
            open={versionPanelOpen}
            versions={versions}
            onClose={() => setVersionPanelOpen(false)}
            onRestore={handleRestoreVersion}
            onCaptureVersion={handleCaptureVersion}
          />

          <Header
            workflowName={workflowName}
            onSave={handleSaveWorkflow}
            onLoad={handleLoadWorkflow}
            onRun={handleRunWorkflow}
            onStop={handleStopWorkflow}
            onNewWorkflow={handleNewWorkflow}
            onToggleVariables={() => setVariablePanelOpen(v => !v)}
            onToggleExecution={handleToggleExecutionPanel}
            onToggleTriggers={() => setTriggersPanelOpen(v => !v)}
            onToggleChats={() => setChatsPanelOpen(v => !v)}
            onZoomIn={handleZoomIn}
            onZoomOut={handleZoomOut}
            onResetZoom={handleResetZoom}
            onFitToScreen={handleFitToScreen}
            zoomLevel={zoomLevel}
            isRunning={isRunning}
            hasUnsavedChanges={hasUnsavedChanges}
            isSaving={isSaving}
            saveError={saveError}
            className="z-40 h-14 flex-shrink-0 flex items-center border-b border-white/[0.06] bg-[#0B0F19]/75 backdrop-blur-2xl shadow-[0_1px_0_rgba(255,255,255,0.03),0_12px_32px_-20px_rgba(0,0,0,0.9)] transition-colors"
          />

          <div className="flex flex-1 overflow-hidden relative">

            {/* ── Sidebar ── */}
            <div className={`z-30 flex flex-col border-r border-white/[0.06] bg-[#0B0F19]/65 backdrop-blur-2xl shadow-[4px_0_24px_-12px_rgba(0,0,0,0.55)] transition-[width] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${sidebarCollapsed ? 'w-16' : 'w-64 xl:w-72'}`}>
              <Sidebar
                isCollapsed={sidebarCollapsed}
                onToggle={() => setSidebarCollapsed(v => !v)}
                onNavigateToDirectory={handleNavigateToDirectory}
                className="h-full w-full bg-transparent"
              />
            </div>

            {/* ── Canvas area ──
                `relative` + `overflow-hidden` are safe for the full-screen
                console: neither creates a containing block for `position: fixed`
                descendants, and neither clips them. Do NOT add a transform,
                filter, backdrop-filter, `will-change` or `contain` to this
                element or to any ancestor of the execution drawer — any of those
                would capture the maximized console inside this box. */}
            <div
              role="region"
              aria-label="Workflow canvas"
              className="relative min-w-0 flex-1 flex flex-col overflow-hidden bg-transparent"
            >

              {/* Canvas empty state — pointer-transparent so drag-and-drop onto the
                  canvas keeps working exactly as before; purely decorative guidance. */}
              {actions.length === 0 && (
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center p-6"
                >
                  <div className="flex max-w-sm flex-col items-center gap-5 rounded-3xl border border-dashed border-white/[0.1] bg-white/[0.015] px-10 py-12 text-center">
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-indigo-400/20 bg-indigo-500/[0.08] shadow-[0_0_40px_-8px_rgba(99,102,241,0.45)]">
                      <Icons.Workflow className="h-7 w-7 text-indigo-300" />
                    </div>
                    <div className="space-y-1.5">
                      <p className="text-sm font-semibold text-slate-200">Start building your workflow</p>
                      <p className="text-[13px] leading-relaxed text-slate-500">
                        Drag actions from the sidebar onto the canvas, then connect them to
                        define the flow.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Validation summary chip (presentation only; does not block execution) */}
              {actions.length > 0 && (
                <button
                  type="button"
                  onClick={validation.count > 0 ? focusFirstInvalid : undefined}
                  title={validation.count > 0 ? 'Review nodes with missing required fields' : 'All nodes are valid'}
                  className={`absolute top-4 left-4 z-30 inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-[12px] font-semibold backdrop-blur-xl shadow-[0_8px_24px_rgba(0,0,0,0.35)] transition-all outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-[#05070D] ${
                    validation.count > 0
                      ? 'bg-amber-500/10 border-amber-400/25 text-amber-200 hover:bg-amber-500/[0.16] cursor-pointer focus-visible:ring-amber-400/50'
                      : 'bg-emerald-500/10 border-emerald-400/25 text-emerald-200 cursor-default focus-visible:ring-emerald-400/50'
                  }`}
                  aria-live="polite"
                >
                  {validation.count > 0 ? (
                    <>
                      <span aria-hidden="true" className="relative flex h-2 w-2">
                        <span className="absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-60 motion-safe:animate-ping" />
                        <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-400" />
                      </span>
                      {validation.count} {validation.count === 1 ? 'node requires' : 'nodes require'} attention
                    </>
                  ) : (
                    <>
                      <Icons.CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                      All nodes valid
                    </>
                  )}
                </button>
              )}

              {/* Debug / version controls — mirrors the validation chip's
                  placement so the canvas keeps one row of status affordances. */}
              <div className="absolute top-4 right-4 z-30 flex items-center gap-2">
                {debugState.state === 'paused' && (
                  <span className="inline-flex items-center gap-2 rounded-full border border-amber-400/25 bg-amber-500/10 px-3.5 py-1.5 text-[12px] font-semibold text-amber-200 backdrop-blur-xl">
                    <Icons.PauseCircle className="w-3.5 h-3.5" />
                    Paused at {debugState.pausedAt?.nodeName ?? 'a node'}
                  </span>
                )}

                <button
                  type="button"
                  onClick={handleToggleDebugMode}
                  title={debugState.enabled ? 'Turn debugging off' : 'Stop the run at breakpoints'}
                  aria-pressed={debugState.enabled}
                  className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-[12px] font-semibold backdrop-blur-xl transition-all outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-[#05070D] ${
                    debugState.enabled
                      ? 'bg-violet-500/[0.16] border-violet-400/30 text-violet-200 focus-visible:ring-violet-400/50'
                      : 'bg-white/[0.04] border-white/10 text-[#9aa3af] hover:text-white focus-visible:ring-white/30'
                  }`}
                >
                  <Icons.Bug className="w-3.5 h-3.5" />
                  {debugState.enabled ? 'Debugging on' : 'Debug'}
                  {debugState.breakpoints.length > 0 && (
                    <span className="ml-0.5 rounded-full bg-red-500/20 px-1.5 text-[10px] text-red-300">
                      {debugState.breakpoints.length}
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setVersionPanelOpen(true)}
                  title="Browse and restore earlier versions"
                  className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3.5 py-1.5 text-[12px] font-semibold text-[#9aa3af] backdrop-blur-xl transition-all hover:text-white outline-none focus-visible:ring-2 focus-visible:ring-white/30 focus-visible:ring-offset-2 focus-visible:ring-offset-[#05070D]"
                >
                  <Icons.History className="w-3.5 h-3.5" />
                  History
                  {versions.length > 0 && (
                    <span className="ml-0.5 rounded-full bg-white/10 px-1.5 text-[10px] text-[#c7cedb]">
                      {versions.length}
                    </span>
                  )}
                </button>
              </div>

              <WorkflowCanvas
                ref={canvasRef}
                actions={actions}
                connections={connections}
                onAddAction={handleAddAction}
                onUpdateAction={handleUpdateAction}
                onDeleteAction={handleDeleteAction}
                onDeleteConnection={handleDeleteConnection}
                onEditConnection={handleEditConnection}
                onSelectNode={setSelectedNode}
                selectedNode={selectedNode}
                connectionStart={connectionStart}
                tempConnection={tempConnection}
                onStartConnection={handleStartConnection}
                onUpdateTempConnection={handleUpdateTempConnection}
                onCompleteConnection={handleCompleteConnection}
                onCancelConnection={handleCancelConnection}
                zoomLevel={zoomLevel}
                onZoomChange={setZoomLevel}
                isRunning={isRunning}
                activeConnections={activeConnections}
                invalidNodeIds={invalidNodeIds}
                className="flex-1 w-full h-full bg-transparent"
                breakpointNodeIds={breakpointNodeIds}
                disabledBreakpointNodeIds={disabledBreakpointNodeIds}
                pausedNodeId={debugState.pausedAt?.nodeId ?? null}
                onToggleBreakpoint={handleToggleBreakpoint}
              />

              {/* ── Execution drawer ───────────────────────────────────────────
                  Docked, this is the bottom sheet that slides up over the canvas.
                  Maximized, it collapses to a zero-height, un-transformed anchor
                  so the panel's own full-screen layer can reach the viewport, and
                  it holds that neutral shape through a short "restoring" phase
                  while the panel's backdrop fades back out. See the
                  EXECUTION_DRAWER_* constants for exactly which CSS properties
                  were capturing the console and why.

                  The <ExecutionPanel> element itself never moves in the React
                  tree and is never remounted, so its tab, filters, search text,
                  expanded rows, technical sections, debugger wiring and scroll
                  positions all survive the switch in both directions. */}
              <div
                aria-hidden={!executionPanelOpen}
                className={
                  drawerPhase === 'maximized'
                    ? EXECUTION_DRAWER_MAXIMIZED
                    : drawerPhase === 'restoring'
                      ? EXECUTION_DRAWER_RESTORING
                      : `${EXECUTION_DRAWER_DOCKED} ${
                          executionPanelOpen
                            ? 'translate-y-0 opacity-100'
                            : 'translate-y-full opacity-0 pointer-events-none'
                        }`
                }
              >
                {/* Docked-only hairline: it anchors to the drawer's top edge, which
                    doesn't exist once the drawer collapses to its anchor state. */}
                {drawerPhase !== 'maximized' && (
                  <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-indigo-400/40 to-transparent" />
                )}
                <ExecutionPanel
                  logs={executionLogs}
                  records={executionRecords}
                  snapshot={contextSnapshot}
                  runId={currentRunId}
                  isOpen={executionPanelOpen}
                  onToggle={handleToggleExecutionPanel}
                  onClear={handleClearLogs}
                  // Fully controlled full-screen mode. `defaultMaximized` is
                  // deliberately NOT passed: it only applies to the panel's
                  // uncontrolled mode, and supplying both would read as if the
                  // page had two sources of truth for the same state.
                  isMaximized={isExecutionMaximized}
                  onMaximizeChange={handleExecutionMaximizeChange}
                  // The panel paints its own opaque surface in both modes, so the
                  // drawer contributes only its border and shadow. Passing a
                  // background or padding here would fight the panel's own shell
                  // classes with undefined precedence.
                  className="h-full w-full"
                  debug={debugState}
                  nodeNames={nodeNameMap}
                  isRunning={isRunning}
                  onToggleDebugMode={handleToggleDebugMode}
                  onDebugResume={handleDebugResume}
                  onDebugStep={handleDebugStep}
                  onDebugPause={handleDebugPause}
                  onDebugStop={handleDebugStop}
                  onDebugRunTo={handleDebugRunTo}
                  onUpdateBreakpoint={handleUpdateBreakpoint}
                  onRemoveBreakpoint={handleRemoveBreakpoint}
                  onClearBreakpoints={handleClearBreakpoints}
                  onAddWatch={handleAddWatch}
                  onRemoveWatch={handleRemoveWatch}
                />
              </div>
            </div>

            {/* ── Right panels ── */}
            <div
              role="complementary"
              aria-label="Editor panels"
              className="z-30 flex h-full border-l border-white/[0.06] bg-[#0B0F19]/60 backdrop-blur-2xl shadow-[-4px_0_24px_-12px_rgba(0,0,0,0.55)] overflow-x-hidden transition-all duration-300 ease-in-out relative"
            >
              <PropertiesPanel
                action={selectedAction as any}
                onUpdateAction={handleUpdateAction}
                hasSelectedFile={hasSelectedFile}
                hasWritableHandle={hasWritableHandle}
                onFileSelected={(actionId: string, fieldPath: string, file: File | null, fileHandle?: LocalFileHandle | null) => {
                  const key = multipartKey(actionId, fieldPath);
                  if (file) {
                    multipartFileCacheRef.current.set(key, file);
                  } else {
                    multipartFileCacheRef.current.delete(key);
                  }
                  if (fileHandle) {
                    fileHandleCacheRef.current.set(key, fileHandle);
                  } else {
                    fileHandleCacheRef.current.delete(key);
                  }
                }}
                isOpen={propertiesPanelOpen}
                onToggle={() => setPropertiesPanelOpen(v => !v)}
                variables={variables}
                bindingGroups={bindingGroups}
                previewScope={previewScope}
                className="bg-transparent border-r border-white/[0.05] last:border-none"
              />
              <VariablePanel
                variables={variables}
                isOpen={variablePanelOpen}
                onToggle={() => setVariablePanelOpen(v => !v)}
                onAdd={handleAddVariable}
                onUpdate={handleUpdateVariable}
                onDelete={handleDeleteVariable}
                className="bg-transparent border-r border-white/[0.05] last:border-none"
              />
              <TriggersPanel
                isOpen={triggersPanelOpen}
                onToggle={() => setTriggersPanelOpen(v => !v)}
                className="bg-transparent border-r border-white/[0.05] last:border-none"
              />
              <ChatsPanel
                isOpen={ChatsPanelOpen}
                onToggle={() => setChatsPanelOpen(v => !v)}
                actions={actions}
                connections={connections}
                variables={variables}
                selectedNode={selectedNode}
                onWorkflowGenerated={handleWorkflowGenerated as any}
                onUpdateAction={handleUpdateAction}
                onAddAction={handleAddAction}
                onAddConnection={handleAddConnection}
                onAddVariable={handleAddVariable}
                className="bg-transparent border-r border-white/[0.05] last:border-none"
              />
            </div>

          </div>
        </div>
      </div>
    </DndProvider>
  );
};

export default WorkspaceEditorPage;