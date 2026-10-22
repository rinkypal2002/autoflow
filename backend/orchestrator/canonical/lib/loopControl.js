"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LOOP_DONE_PORT = exports.LOOP_BODY_PORT = void 0;
exports.normaliseActionType = normaliseActionType;
exports.loopKindOf = loopKindOf;
exports.isLoopControllerNode = isLoopControllerNode;
exports.isLoopBreakNode = isLoopBreakNode;
exports.isLoopContinueNode = isLoopContinueNode;
exports.isLoopSignalNode = isLoopSignalNode;
exports.isStructuredWorkflowControlNode = isStructuredWorkflowControlNode;
exports.normaliseLoopLimit = normaliseLoopLimit;
exports.normaliseLoopCollection = normaliseLoopCollection;
exports.createLoopFrame = createLoopFrame;
exports.replaceTopLoopFrame = replaceTopLoopFrame;
exports.pushLoopFrame = pushLoopFrame;
exports.popLoopFrame = popLoopFrame;
exports.activeLoopFrame = activeLoopFrame;
exports.captureLoopBodyOutput = captureLoopBodyOutput;
exports.finaliseCurrentLoopIteration = finaliseCurrentLoopIteration;
exports.loopExecutionKey = loopExecutionKey;
exports.buildLoopRuntimeView = buildLoopRuntimeView;
exports.loopRuntimeAliases = loopRuntimeAliases;
exports.loopScope = loopScope;
exports.makeLoopBodyOutput = makeLoopBodyOutput;
exports.makeLoopDoneOutput = makeLoopDoneOutput;
exports.advanceLoopState = advanceLoopState;
const LOOP_TYPE_TO_KIND = {
    'workflow-for-each': 'for-each',
    'workflow-while': 'while',
    'workflow-repeat-until': 'repeat-until',
};
exports.LOOP_BODY_PORT = 'body';
exports.LOOP_DONE_PORT = 'done';
function normaliseActionType(action) {
    return String(action?.type ?? '').trim().toLowerCase();
}
function loopKindOf(action) {
    return LOOP_TYPE_TO_KIND[normaliseActionType(action)] ?? null;
}
function isLoopControllerNode(action) {
    return loopKindOf(action) !== null;
}
function isLoopBreakNode(action) {
    return normaliseActionType(action) === 'workflow-break';
}
function isLoopContinueNode(action) {
    return normaliseActionType(action) === 'workflow-continue';
}
function isLoopSignalNode(action) {
    return isLoopBreakNode(action) || isLoopContinueNode(action);
}
function isStructuredWorkflowControlNode(action) {
    return isLoopControllerNode(action) || isLoopSignalNode(action);
}
/** Clamp user-provided guards so a malformed workflow cannot freeze the UI. */
function normaliseLoopLimit(value, fallback) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0)
        return fallback;
    return Math.min(10000, Math.max(1, Math.trunc(parsed)));
}
/**
 * Accept arrays directly, dataset-like { rows: [] } / { data: [] }, JSON arrays
 * and plain objects. Object collections iterate values while preserving the key
 * as `currentKey`.
 */
function normaliseLoopCollection(value) {
    let source = value;
    if (typeof source === 'string') {
        const text = source.trim();
        if (!text)
            return [];
        if (/\{\{[^}]+\}\}/.test(text)) {
            throw new Error(`For Each collection binding did not resolve: ${text}`);
        }
        if (text.startsWith('[') || text.startsWith('{')) {
            try {
                source = JSON.parse(text);
            }
            catch (error) {
                throw new Error(`For Each collection is not valid JSON: ${error?.message ?? error}`);
            }
        }
        else if (text.includes('\n')) {
            source = text.split(/\r?\n/).map((part) => part.trim()).filter(Boolean);
        }
        else {
            source = [source];
        }
    }
    if (Array.isArray(source)) {
        return source.map((item, index) => ({ key: index, value: item }));
    }
    if (source && typeof source === 'object') {
        if (Array.isArray(source.rows)) {
            return source.rows.map((item, index) => ({ key: index, value: item }));
        }
        if (Array.isArray(source.data)) {
            return source.data.map((item, index) => ({ key: index, value: item }));
        }
        return Object.entries(source).map(([key, item]) => ({ key, value: item }));
    }
    if (source === undefined || source === null)
        return [];
    return [{ key: 0, value: source }];
}
function createLoopFrame(input) {
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
function replaceTopLoopFrame(frames, frame) {
    if (frames.length === 0)
        return [frame];
    return [...frames.slice(0, -1), frame];
}
function pushLoopFrame(frames, frame) {
    return [...frames, frame];
}
function popLoopFrame(frames) {
    return frames.length > 0 ? frames.slice(0, -1) : [];
}
function activeLoopFrame(frames) {
    return frames[frames.length - 1];
}
function captureLoopBodyOutput(frames, output) {
    const active = activeLoopFrame(frames);
    if (!active)
        return frames;
    return replaceTopLoopFrame(frames, { ...active, currentResult: output });
}
function finaliseCurrentLoopIteration(frame) {
    const alreadyCaptured = frame.results.some((result) => result.iteration === frame.iteration);
    if (alreadyCaptured)
        return frame;
    const result = {
        iteration: frame.iteration,
        index: frame.currentIndex,
        key: frame.currentKey,
        item: frame.currentItem,
        output: frame.currentResult,
    };
    return { ...frame, results: [...frame.results, result], currentResult: undefined };
}
/** Stable execution identity: the same canvas node may legitimately run once per loop iteration. */
function loopExecutionKey(nodeId, frames) {
    if (frames.length === 0)
        return nodeId;
    const suffix = frames
        .map((frame) => `${frame.loopNodeId}:${frame.iteration}`)
        .join('>');
    return `${nodeId}@@${suffix}`;
}
function buildLoopRuntimeView(frames) {
    let parent;
    for (const frame of frames) {
        const view = {
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
function loopRuntimeAliases(frames) {
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
function loopScope(base, frames) {
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
function makeLoopBodyOutput(frame, body) {
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
function makeLoopDoneOutput(frame, options = {}) {
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
/**
 * Pure loop state machine used by the workspace scheduler. It does not know
 * about React, HTTP, logging, or the execution context; that separation makes
 * loop semantics deterministic and directly unit-testable.
 */
function advanceLoopState(input) {
    const { action } = input;
    const kind = loopKindOf(action);
    if (!kind)
        throw new Error(`Unsupported loop controller: ${action.type}`);
    const active = activeLoopFrame(input.frames);
    const sameLoopActive = active?.loopNodeId === action.id;
    const sameLoopElsewhere = input.frames.some((frame) => frame.loopNodeId === action.id);
    if (sameLoopElsewhere && !sameLoopActive) {
        throw new Error(`Loop "${action.name}" cannot be re-entered while a nested loop is still active. ` +
            'Break/Continue always target the innermost loop.');
    }
    const defaultLimit = kind === 'for-each' ? 10000 : 1000;
    const maxIterations = normaliseLoopLimit(input.maxIterationsValue, defaultLimit);
    if (kind === 'for-each') {
        if (!sameLoopActive) {
            const items = normaliseLoopCollection(input.collectionValue);
            if (items.length > maxIterations) {
                throw new Error(`For Each "${action.name}" received ${items.length} items, above its ` +
                    `Maximum Iterations guard (${maxIterations}).`);
            }
            if (items.length === 0) {
                const output = makeLoopDoneOutput(undefined, { kind, empty: true });
                return {
                    route: exports.LOOP_DONE_PORT,
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
                route: exports.LOOP_BODY_PORT,
                frames: pushLoopFrame(input.frames, frame),
                output: makeLoopBodyOutput(frame, first.value),
            };
        }
        const finished = finaliseCurrentLoopIteration(active);
        const nextIndex = finished.currentIndex + 1;
        if (nextIndex >= (finished.items?.length ?? 0)) {
            const output = makeLoopDoneOutput(finished);
            return {
                route: exports.LOOP_DONE_PORT,
                frames: captureLoopBodyOutput(popLoopFrame(input.frames), output),
                output,
            };
        }
        const nextIteration = finished.iteration + 1;
        if (nextIteration > finished.maxIterations) {
            throw new Error(`For Each "${action.name}" reached Maximum Iterations (${finished.maxIterations}).`);
        }
        const nextItem = finished.items[nextIndex];
        const nextFrame = {
            ...finished,
            iteration: nextIteration,
            currentIndex: nextIndex,
            currentKey: nextItem.key,
            currentItem: nextItem.value,
            currentResult: undefined,
        };
        return {
            route: exports.LOOP_BODY_PORT,
            frames: replaceTopLoopFrame(input.frames, nextFrame),
            output: makeLoopBodyOutput(nextFrame, nextItem.value),
        };
    }
    const condition = String(input.condition ?? '').trim();
    if (!condition) {
        throw new Error(`${kind === 'while' ? 'While' : 'Repeat Until'} "${action.name}" requires a condition.`);
    }
    if (kind === 'while') {
        const previousResult = sameLoopActive ? active.currentResult : input.inputData;
        const finished = sameLoopActive ? finaliseCurrentLoopIteration(active) : undefined;
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
                route: exports.LOOP_DONE_PORT,
                frames: captureLoopBodyOutput(sameLoopActive ? popLoopFrame(input.frames) : input.frames, output),
                output,
            };
        }
        if (nextIteration > candidate.maxIterations) {
            throw new Error(`While "${action.name}" exceeded Maximum Iterations (${candidate.maxIterations}). ` +
                'The condition was still true.');
        }
        return {
            route: exports.LOOP_BODY_PORT,
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
            route: exports.LOOP_BODY_PORT,
            frames: pushLoopFrame(input.frames, frame),
            output: makeLoopBodyOutput(frame, input.inputData),
        };
    }
    const previousResult = active.currentResult;
    const finished = finaliseCurrentLoopIteration(active);
    const finishedFrames = replaceTopLoopFrame(input.frames, finished);
    const shouldStop = input.evaluate(condition, finishedFrames);
    if (shouldStop) {
        const output = makeLoopDoneOutput(finished);
        return {
            route: exports.LOOP_DONE_PORT,
            frames: captureLoopBodyOutput(popLoopFrame(input.frames), output),
            output,
        };
    }
    const nextIteration = finished.iteration + 1;
    if (nextIteration > finished.maxIterations) {
        throw new Error(`Repeat Until "${action.name}" exceeded Maximum Iterations (${finished.maxIterations}). ` +
            'The Until condition was still false.');
    }
    const nextFrame = {
        ...finished,
        iteration: nextIteration,
        currentIndex: nextIteration - 1,
        currentKey: nextIteration - 1,
        currentItem: previousResult ?? input.inputData,
        currentResult: undefined,
    };
    return {
        route: exports.LOOP_BODY_PORT,
        frames: replaceTopLoopFrame(input.frames, nextFrame),
        output: makeLoopBodyOutput(nextFrame, nextFrame.currentItem),
    };
}
