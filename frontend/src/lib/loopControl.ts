import type { WorkflowAction } from '../types/workflow';

/**
 * V1 workflow-loop runtime primitives.
 *
 * Loops are orchestration controls, not connector calls. The scheduler owns the
 * loop stack and carries it with each queued execution so nested loops remain
 * deterministic and branch-local. `WorkflowExecutionContext` only receives a
 * serialisable projection of the active stack for binding resolution.
 */

export type WorkflowLoopKind = 'for-each' | 'while' | 'repeat-until';

export interface WorkflowLoopItem {
  key: string | number;
  value: any;
}

export interface WorkflowLoopResult {
  iteration: number;
  index: number;
  key?: string | number;
  item?: any;
  output?: any;
}

export interface WorkflowLoopFrame {
  loopNodeId: string;
  loopNodeName: string;
  kind: WorkflowLoopKind;
  iteration: number; // 1-based
  currentIndex: number; // 0-based
  currentKey?: string | number;
  currentItem?: any;
  maxIterations: number;
  total?: number;
  items?: WorkflowLoopItem[];
  results: WorkflowLoopResult[];
  currentResult?: any;
  startedAt: string;
}

export interface LoopRuntimeView {
  id: string;
  name: string;
  kind: WorkflowLoopKind;
  currentItem?: any;
  currentIndex: number;
  currentKey?: string | number;
  iteration: number;
  total?: number;
  maxIterations: number;
  parent?: LoopRuntimeView;
}

const LOOP_TYPE_TO_KIND: Record<string, WorkflowLoopKind> = {
  'workflow-for-each': 'for-each',
  'workflow-while': 'while',
  'workflow-repeat-until': 'repeat-until',
};

export const LOOP_BODY_PORT = 'body';
export const LOOP_DONE_PORT = 'done';

export function normaliseActionType(action?: WorkflowAction | null): string {
  return String(action?.type ?? '').trim().toLowerCase();
}

export function loopKindOf(action?: WorkflowAction | null): WorkflowLoopKind | null {
  return LOOP_TYPE_TO_KIND[normaliseActionType(action)] ?? null;
}

export function isLoopControllerNode(action?: WorkflowAction | null): boolean {
  return loopKindOf(action) !== null;
}

export function isLoopBreakNode(action?: WorkflowAction | null): boolean {
  return normaliseActionType(action) === 'workflow-break';
}

export function isLoopContinueNode(action?: WorkflowAction | null): boolean {
  return normaliseActionType(action) === 'workflow-continue';
}

export function isLoopSignalNode(action?: WorkflowAction | null): boolean {
  return isLoopBreakNode(action) || isLoopContinueNode(action);
}

export function isStructuredWorkflowControlNode(action?: WorkflowAction | null): boolean {
  return isLoopControllerNode(action) || isLoopSignalNode(action);
}

/** Clamp user-provided guards so a malformed workflow cannot freeze the UI. */
export function normaliseLoopLimit(value: any, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(10_000, Math.max(1, Math.trunc(parsed)));
}

/**
 * Accept arrays directly, dataset-like { rows: [] } / { data: [] }, JSON arrays
 * and plain objects. Object collections iterate values while preserving the key
 * as `currentKey`.
 */
export function normaliseLoopCollection(value: any): WorkflowLoopItem[] {
  let source = value;

  if (typeof source === 'string') {
    const text = source.trim();
    if (!text) return [];
    if (/\{\{[^}]+\}\}/.test(text)) {
      throw new Error(`For Each collection binding did not resolve: ${text}`);
    }
    if (text.startsWith('[') || text.startsWith('{')) {
      try {
        source = JSON.parse(text);
      } catch (error: any) {
        throw new Error(`For Each collection is not valid JSON: ${error?.message ?? error}`);
      }
    } else if (text.includes('\n')) {
      source = text.split(/\r?\n/).map((part) => part.trim()).filter(Boolean);
    } else {
      source = [source];
    }
  }

  if (Array.isArray(source)) {
    return source.map((item, index) => ({ key: index, value: item }));
  }

  if (source && typeof source === 'object') {
    if (Array.isArray((source as any).rows)) {
      return (source as any).rows.map((item: any, index: number) => ({ key: index, value: item }));
    }
    if (Array.isArray((source as any).data)) {
      return (source as any).data.map((item: any, index: number) => ({ key: index, value: item }));
    }
    return Object.entries(source).map(([key, item]) => ({ key, value: item }));
  }

  if (source === undefined || source === null) return [];
  return [{ key: 0, value: source }];
}

export function createLoopFrame(input: {
  action: WorkflowAction;
  kind: WorkflowLoopKind;
  iteration: number;
  currentIndex: number;
  currentKey?: string | number;
  currentItem?: any;
  maxIterations: number;
  total?: number;
  items?: WorkflowLoopItem[];
  results?: WorkflowLoopResult[];
}): WorkflowLoopFrame {
  return {
    loopNodeId: input.action.id,
    loopNodeName: input.action.name || input.action.type || input.action.id,
    kind: input.kind,
    iteration: input.iteration,
    currentIndex: input.currentIndex,
    currentKey: input.currentKey,
    currentItem: input.currentItem,
    maxIterations: input.maxIterations,
    total: input.total,
    items: input.items,
    results: input.results ?? [],
    currentResult: undefined,
    startedAt: new Date().toISOString(),
  };
}

export function replaceTopLoopFrame(
  frames: WorkflowLoopFrame[],
  frame: WorkflowLoopFrame
): WorkflowLoopFrame[] {
  if (frames.length === 0) return [frame];
  return [...frames.slice(0, -1), frame];
}

export function pushLoopFrame(
  frames: WorkflowLoopFrame[],
  frame: WorkflowLoopFrame
): WorkflowLoopFrame[] {
  return [...frames, frame];
}

export function popLoopFrame(frames: WorkflowLoopFrame[]): WorkflowLoopFrame[] {
  return frames.length > 0 ? frames.slice(0, -1) : [];
}

export function activeLoopFrame(frames: WorkflowLoopFrame[]): WorkflowLoopFrame | undefined {
  return frames[frames.length - 1];
}

export function captureLoopBodyOutput(
  frames: WorkflowLoopFrame[],
  output: any
): WorkflowLoopFrame[] {
  const active = activeLoopFrame(frames);
  if (!active) return frames;
  return replaceTopLoopFrame(frames, { ...active, currentResult: output });
}

export function finaliseCurrentLoopIteration(frame: WorkflowLoopFrame): WorkflowLoopFrame {
  const alreadyCaptured = frame.results.some((result) => result.iteration === frame.iteration);
  if (alreadyCaptured) return frame;

  const result: WorkflowLoopResult = {
    iteration: frame.iteration,
    index: frame.currentIndex,
    key: frame.currentKey,
    item: frame.currentItem,
    output: frame.currentResult,
  };
  return { ...frame, results: [...frame.results, result], currentResult: undefined };
}

/** Stable execution identity: the same canvas node may legitimately run once per loop iteration. */
export function loopExecutionKey(nodeId: string, frames: WorkflowLoopFrame[]): string {
  if (frames.length === 0) return nodeId;
  const suffix = frames
    .map((frame) => `${frame.loopNodeId}:${frame.iteration}`)
    .join('>');
  return `${nodeId}@@${suffix}`;
}

export function buildLoopRuntimeView(frames: WorkflowLoopFrame[]): LoopRuntimeView | null {
  let parent: LoopRuntimeView | undefined;
  for (const frame of frames) {
    const view: LoopRuntimeView = {
      id: frame.loopNodeId,
      name: frame.loopNodeName,
      kind: frame.kind,
      currentItem: frame.currentItem,
      currentIndex: frame.currentIndex,
      currentKey: frame.currentKey,
      iteration: frame.iteration,
      total: frame.total,
      maxIterations: frame.maxIterations,
      parent,
    };
    parent = view;
  }
  return parent ?? null;
}

export function loopRuntimeAliases(frames: WorkflowLoopFrame[]): Record<string, any> {
  const loop = buildLoopRuntimeView(frames);
  if (!loop) {
    return {
      loop: undefined,
      loops: [],
      loopStack: [],
      currentItem: undefined,
      currentIndex: undefined,
      currentKey: undefined,
      iteration: undefined,
    };
  }

  const loopStack = frames.map((frame) => ({
    id: frame.loopNodeId,
    name: frame.loopNodeName,
    kind: frame.kind,
    currentItem: frame.currentItem,
    currentIndex: frame.currentIndex,
    currentKey: frame.currentKey,
    iteration: frame.iteration,
    total: frame.total,
    maxIterations: frame.maxIterations,
  }));

  return {
    loop,
    loops: loopStack,
    loopStack,
    currentItem: loop.currentItem,
    currentIndex: loop.currentIndex,
    currentKey: loop.currentKey,
    iteration: loop.iteration,
  };
}

export function loopScope(
  base: Record<string, any>,
  frames: WorkflowLoopFrame[]
): Record<string, any> {
  const aliases = loopRuntimeAliases(frames);
  return {
    ...base,
    ...aliases,
    runtime: {
      ...(base.runtime ?? {}),
      ...aliases,
    },
  };
}

export function makeLoopBodyOutput(frame: WorkflowLoopFrame, body: any): Record<string, any> {
  return {
    success: true,
    controlNode: true,
    loop: true,
    kind: frame.kind,
    done: false,
    body,
    currentItem: frame.currentItem,
    currentIndex: frame.currentIndex,
    currentKey: frame.currentKey,
    iteration: frame.iteration,
    total: frame.total,
    maxIterations: frame.maxIterations,
    results: frame.results,
  };
}

export function makeLoopDoneOutput(
  frame: WorkflowLoopFrame | undefined,
  options: { kind?: WorkflowLoopKind; broken?: boolean; empty?: boolean } = {}
): Record<string, any> {
  return {
    success: true,
    controlNode: true,
    loop: true,
    kind: frame?.kind ?? options.kind,
    done: true,
    broken: Boolean(options.broken),
    empty: Boolean(options.empty),
    currentItem: frame?.currentItem,
    currentIndex: frame?.currentIndex ?? -1,
    currentKey: frame?.currentKey,
    iteration: frame?.iteration ?? 0,
    total: frame?.total,
    maxIterations: frame?.maxIterations,
    results: frame?.results ?? [],
    body: undefined,
  };
}

export interface AdvanceLoopStateInput {
  action: WorkflowAction;
  frames: WorkflowLoopFrame[];
  inputData?: any;
  /** Resolved collection value for For Each. Ignored by other loop kinds. */
  collectionValue?: any;
  /** Raw condition text for While / Repeat Until. */
  condition?: string;
  /** Resolved max-iteration value. */
  maxIterationsValue?: any;
  /** Evaluates the condition against the supplied candidate loop stack. */
  evaluate: (condition: string, frames: WorkflowLoopFrame[]) => boolean;
}

export interface AdvanceLoopStateResult {
  route: typeof LOOP_BODY_PORT | typeof LOOP_DONE_PORT;
  frames: WorkflowLoopFrame[];
  output: Record<string, any>;
}

/**
 * Pure loop state machine used by the workspace scheduler. It does not know
 * about React, HTTP, logging, or the execution context; that separation makes
 * loop semantics deterministic and directly unit-testable.
 */
export function advanceLoopState(input: AdvanceLoopStateInput): AdvanceLoopStateResult {
  const { action } = input;
  const kind = loopKindOf(action);
  if (!kind) throw new Error(`Unsupported loop controller: ${action.type}`);

  const active = activeLoopFrame(input.frames);
  const sameLoopActive = active?.loopNodeId === action.id;
  const sameLoopElsewhere = input.frames.some((frame) => frame.loopNodeId === action.id);
  if (sameLoopElsewhere && !sameLoopActive) {
    throw new Error(
      `Loop "${action.name}" cannot be re-entered while a nested loop is still active. ` +
      'Break/Continue always target the innermost loop.'
    );
  }

  const defaultLimit = kind === 'for-each' ? 10_000 : 1_000;
  const maxIterations = normaliseLoopLimit(input.maxIterationsValue, defaultLimit);

  if (kind === 'for-each') {
    if (!sameLoopActive) {
      const items = normaliseLoopCollection(input.collectionValue);
      if (items.length > maxIterations) {
        throw new Error(
          `For Each "${action.name}" received ${items.length} items, above its ` +
          `Maximum Iterations guard (${maxIterations}).`
        );
      }
      if (items.length === 0) {
        const output = makeLoopDoneOutput(undefined, { kind, empty: true });
        return {
          route: LOOP_DONE_PORT,
          frames: captureLoopBodyOutput(input.frames, output),
          output,
        };
      }

      const first = items[0];
      const frame = createLoopFrame({
        action,
        kind,
        iteration: 1,
        currentIndex: 0,
        currentKey: first.key,
        currentItem: first.value,
        maxIterations,
        total: items.length,
        items,
      });
      return {
        route: LOOP_BODY_PORT,
        frames: pushLoopFrame(input.frames, frame),
        output: makeLoopBodyOutput(frame, first.value),
      };
    }

    const finished = finaliseCurrentLoopIteration(active!);
    const nextIndex = finished.currentIndex + 1;
    if (nextIndex >= (finished.items?.length ?? 0)) {
      const output = makeLoopDoneOutput(finished);
      return {
        route: LOOP_DONE_PORT,
        frames: captureLoopBodyOutput(popLoopFrame(input.frames), output),
        output,
      };
    }

    const nextIteration = finished.iteration + 1;
    if (nextIteration > finished.maxIterations) {
      throw new Error(
        `For Each "${action.name}" reached Maximum Iterations (${finished.maxIterations}).`
      );
    }
    const nextItem = finished.items![nextIndex];
    const nextFrame: WorkflowLoopFrame = {
      ...finished,
      iteration: nextIteration,
      currentIndex: nextIndex,
      currentKey: nextItem.key,
      currentItem: nextItem.value,
      currentResult: undefined,
    };
    return {
      route: LOOP_BODY_PORT,
      frames: replaceTopLoopFrame(input.frames, nextFrame),
      output: makeLoopBodyOutput(nextFrame, nextItem.value),
    };
  }

  const condition = String(input.condition ?? '').trim();
  if (!condition) {
    throw new Error(`${kind === 'while' ? 'While' : 'Repeat Until'} "${action.name}" requires a condition.`);
  }

  if (kind === 'while') {
    const previousResult = sameLoopActive ? active!.currentResult : input.inputData;
    const finished = sameLoopActive ? finaliseCurrentLoopIteration(active!) : undefined;
    const nextIteration = finished ? finished.iteration + 1 : 1;
    const bodyCarry = previousResult ?? input.inputData;
    const candidate = createLoopFrame({
      action,
      kind,
      iteration: nextIteration,
      currentIndex: nextIteration - 1,
      currentKey: nextIteration - 1,
      currentItem: bodyCarry,
      maxIterations: finished?.maxIterations ?? maxIterations,
      results: finished?.results ?? [],
    });
    const candidateFrames = sameLoopActive
      ? replaceTopLoopFrame(input.frames, candidate)
      : pushLoopFrame(input.frames, candidate);
    const shouldRun = input.evaluate(condition, candidateFrames);

    if (!shouldRun) {
      const doneFrame = finished ?? { ...candidate, iteration: 0, currentIndex: -1 };
      const output = makeLoopDoneOutput(doneFrame);
      return {
        route: LOOP_DONE_PORT,
        frames: captureLoopBodyOutput(
          sameLoopActive ? popLoopFrame(input.frames) : input.frames,
          output
        ),
        output,
      };
    }

    if (nextIteration > candidate.maxIterations) {
      throw new Error(
        `While "${action.name}" exceeded Maximum Iterations (${candidate.maxIterations}). ` +
        'The condition was still true.'
      );
    }

    return {
      route: LOOP_BODY_PORT,
      frames: candidateFrames,
      output: makeLoopBodyOutput(candidate, bodyCarry),
    };
  }

  if (!sameLoopActive) {
    const frame = createLoopFrame({
      action,
      kind: 'repeat-until',
      iteration: 1,
      currentIndex: 0,
      currentKey: 0,
      currentItem: input.inputData,
      maxIterations,
    });
    return {
      route: LOOP_BODY_PORT,
      frames: pushLoopFrame(input.frames, frame),
      output: makeLoopBodyOutput(frame, input.inputData),
    };
  }

  const previousResult = active!.currentResult;
  const finished = finaliseCurrentLoopIteration(active!);
  const finishedFrames = replaceTopLoopFrame(input.frames, finished);
  const shouldStop = input.evaluate(condition, finishedFrames);
  if (shouldStop) {
    const output = makeLoopDoneOutput(finished);
    return {
      route: LOOP_DONE_PORT,
      frames: captureLoopBodyOutput(popLoopFrame(input.frames), output),
      output,
    };
  }

  const nextIteration = finished.iteration + 1;
  if (nextIteration > finished.maxIterations) {
    throw new Error(
      `Repeat Until "${action.name}" exceeded Maximum Iterations (${finished.maxIterations}). ` +
      'The Until condition was still false.'
    );
  }
  const nextFrame: WorkflowLoopFrame = {
    ...finished,
    iteration: nextIteration,
    currentIndex: nextIteration - 1,
    currentKey: nextIteration - 1,
    currentItem: previousResult ?? input.inputData,
    currentResult: undefined,
  };
  return {
    route: LOOP_BODY_PORT,
    frames: replaceTopLoopFrame(input.frames, nextFrame),
    output: makeLoopBodyOutput(nextFrame, nextFrame.currentItem),
  };
}
