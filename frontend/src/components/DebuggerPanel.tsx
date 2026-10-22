/**
 * Debugger panel — breakpoints, execution controls, watches and call stack.
 *
 * Replaces the raw log dump that used to fill the Debug tab. A dump is not a
 * debugger: it tells you what already happened but gives you no way to stop the
 * run, look at a value, or ask "why did this branch take that path". This panel
 * is the interactive half.
 *
 * It renders entirely from a `DebugSessionSnapshot` and calls back for every
 * action, so it holds no debugger state of its own. That keeps the single
 * source of truth in `lib/workflowDebugger`, where the run loop reads it.
 *
 * Visual language is inherited from ExecutionPanel deliberately — same
 * surfaces, borders and type scale — so the tab feels like part of the panel
 * rather than a bolted-on tool.
 */

import React, { useState } from 'react';
import * as Icons from 'lucide-react';
import type { Breakpoint, DebugSessionSnapshot } from '../lib/workflowDebugger';
import { summarizeValue } from '../lib/objectUtils';

export interface DebuggerPanelProps {
  debug: DebugSessionSnapshot;
  /** Node id -> display name, for labelling breakpoints and the paused banner. */
  nodeNames: Record<string, string>;
  isRunning: boolean;

  onToggleDebugMode: () => void;
  onResume: () => void;
  onStep: () => void;
  onPause: () => void;
  onStop: () => void;

  onRunTo: (nodeId: string) => void;
  onUpdateBreakpoint: (nodeId: string, patch: Partial<Omit<Breakpoint, 'nodeId'>>) => void;
  onRemoveBreakpoint: (nodeId: string) => void;
  onClearBreakpoints: () => void;

  onAddWatch: (expression: string) => void;
  onRemoveWatch: (watchId: string) => void;
}

const CARD = 'bg-[#11141a] border border-[#20242c] rounded-xl overflow-hidden';
const CARD_HEAD = 'h-[44px] border-b border-[#20242c] flex items-center gap-2 px-4';
const CHIP =
  'h-[28px] px-2.5 rounded-md border border-[#2d323b] text-[11px] text-[#9ea7b3] ' +
  'hover:text-white hover:border-[#4b5563] flex items-center gap-1.5 transition-colors ' +
  'disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:text-[#9ea7b3] ' +
  'disabled:hover:border-[#2d323b]';

const STATE_LABEL: Record<DebugSessionSnapshot['state'], string> = {
  inactive: 'Not running',
  running: 'Running',
  paused: 'Paused',
  stepping: 'Stepping',
};

const STATE_TONE: Record<DebugSessionSnapshot['state'], string> = {
  inactive: 'bg-white/[0.04] text-[#9aa3af] border-white/10',
  running: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  paused: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  stepping: 'bg-violet-500/10 text-violet-400 border-violet-500/20',
};

const DebuggerPanel: React.FC<DebuggerPanelProps> = ({
  debug,
  nodeNames,
  isRunning,
  onToggleDebugMode,
  onResume,
  onStep,
  onPause,
  onStop,
  onRunTo,
  onUpdateBreakpoint,
  onRemoveBreakpoint,
  onClearBreakpoints,
  onAddWatch,
  onRemoveWatch,
}) => {
  const [watchDraft, setWatchDraft] = useState('');
  const [conditionFor, setConditionFor] = useState<string | null>(null);
  const [conditionDraft, setConditionDraft] = useState('');

  const nameOf = (nodeId: string) => nodeNames[nodeId] ?? nodeId;
  const paused = debug.state === 'paused';

  const submitWatch = () => {
    const expression = watchDraft.trim();
    if (!expression) return;
    onAddWatch(expression);
    setWatchDraft('');
  };

  const openCondition = (breakpoint: Breakpoint) => {
    setConditionFor(breakpoint.nodeId);
    setConditionDraft(breakpoint.condition ?? '');
  };

  const saveCondition = (nodeId: string) => {
    onUpdateBreakpoint(nodeId, { condition: conditionDraft.trim() || undefined });
    setConditionFor(null);
    setConditionDraft('');
  };

  return (
    <div className="h-full overflow-auto p-5 space-y-4">
      {/* ── Controls ───────────────────────────────────────────────────────── */}
      <div className={CARD}>
        <div className={CARD_HEAD}>
          <Icons.Bug className="w-4 h-4 text-violet-400" />
          <span className="text-[13px] text-white">Debugger</span>
          <span
            className={`ml-2 h-[22px] px-2 rounded-md border text-[11px] flex items-center ${
              STATE_TONE[debug.state]
            }`}
          >
            {STATE_LABEL[debug.state]}
          </span>

          <button
            onClick={onToggleDebugMode}
            aria-pressed={debug.enabled}
            className={`ml-auto h-[28px] px-3 rounded-md border text-[11px] flex items-center gap-1.5 transition-colors ${
              debug.enabled
                ? 'bg-violet-500/10 border-violet-500/30 text-violet-300'
                : 'border-[#2d323b] text-[#9ea7b3] hover:text-white hover:border-[#4b5563]'
            }`}
          >
            {debug.enabled ? <Icons.ToggleRight className="w-4 h-4" /> : <Icons.ToggleLeft className="w-4 h-4" />}
            {debug.enabled ? 'Debugging on' : 'Debugging off'}
          </button>
        </div>

        <div className="p-4 flex flex-wrap items-center gap-2">
          <button onClick={onResume} disabled={!paused} className={CHIP}>
            <Icons.Play className="w-3.5 h-3.5" /> Resume
          </button>
          <button onClick={onStep} disabled={!debug.enabled || !isRunning} className={CHIP}>
            <Icons.SkipForward className="w-3.5 h-3.5" /> Step over
          </button>
          <button
            onClick={onPause}
            disabled={!debug.enabled || !isRunning || paused}
            className={CHIP}
          >
            <Icons.Pause className="w-3.5 h-3.5" /> Pause
          </button>
          <button onClick={onStop} disabled={!isRunning} className={CHIP}>
            <Icons.Square className="w-3.5 h-3.5" /> Stop run
          </button>

          <span className="ml-auto text-[11px] text-[#5b6470]">
            {debug.hitCount} pause{debug.hitCount === 1 ? '' : 's'} this run
          </span>
        </div>

        {paused && debug.pausedAt && (
          <div className="px-4 pb-4">
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/[0.06] px-3 py-2.5">
              <div className="flex items-center gap-2 text-[12px] text-amber-300">
                <Icons.PauseCircle className="w-4 h-4 shrink-0" />
                <span className="text-white">Paused before {debug.pausedAt.nodeName}</span>
              </div>
              <p className="mt-1 text-[11px] text-[#9ea7b3]">
                {debug.pausedAt.reason === 'breakpoint' && 'A breakpoint matched here.'}
                {debug.pausedAt.reason === 'step' && 'Stepped to this node.'}
                {debug.pausedAt.reason === 'runToCursor' && 'Ran to this node.'}
                {debug.pausedAt.reason === 'user' && 'You paused the run.'}
                {debug.pausedAt.condition && ` Condition: ${debug.pausedAt.condition}`}
                {' '}Every variable and earlier step output stays live while paused — open
                Data Context or Preview Data to inspect them.
              </p>
            </div>
          </div>
        )}

        {!debug.enabled && (
          <div className="px-4 pb-4">
            <p className="text-[11px] text-[#5b6470] leading-5">
              Turn debugging on to stop the run at a breakpoint. Breakpoints are set from the
              canvas — hover a node and click its gutter dot — and are saved with the workflow.
            </p>
          </div>
        )}
      </div>

      {/* ── Breakpoints ────────────────────────────────────────────────────── */}
      <div className={CARD}>
        <div className={CARD_HEAD}>
          <Icons.CircleDot className="w-4 h-4 text-red-400" />
          <span className="text-[13px] text-white">Breakpoints</span>
          <span className="text-[11px] text-[#5b6470]">({debug.breakpoints.length})</span>
          {debug.breakpoints.length > 0 && (
            <button onClick={onClearBreakpoints} className={`ml-auto ${CHIP}`}>
              <Icons.Trash2 className="w-3.5 h-3.5" /> Remove all
            </button>
          )}
        </div>

        {debug.breakpoints.length === 0 ? (
          <div className="p-6 text-center">
            <Icons.CircleDot className="w-7 h-7 text-[#2d323b] mx-auto mb-2" />
            <p className="text-[12px] text-[#9ea7b3]">No breakpoints yet</p>
            <p className="text-[11px] text-[#5b6470] mt-1">
              Click the gutter dot on any node to stop the run before it executes.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[#1b1f26]">
            {debug.breakpoints.map((breakpoint) => (
              <div key={breakpoint.nodeId} className="px-4 py-3">
                <div className="flex items-center gap-2.5">
                  <button
                    onClick={() => onUpdateBreakpoint(breakpoint.nodeId, { enabled: !breakpoint.enabled })}
                    title={breakpoint.enabled ? 'Disable this breakpoint' : 'Enable this breakpoint'}
                    className="shrink-0"
                  >
                    <span
                      className={`block w-3 h-3 rounded-full border-2 ${
                        breakpoint.enabled
                          ? 'bg-red-500 border-red-500'
                          : 'bg-transparent border-[#4b5563]'
                      }`}
                    />
                  </button>

                  <span className="text-[12px] text-white truncate">{nameOf(breakpoint.nodeId)}</span>

                  {breakpoint.logOnly && (
                    <span className="h-[20px] px-1.5 rounded border border-blue-500/20 bg-blue-500/10 text-[10px] text-blue-400 flex items-center">
                      Log only
                    </span>
                  )}
                  {breakpoint.hitCount > 0 && (
                    <span className="text-[11px] text-[#5b6470]">
                      hit {breakpoint.hitCount}×
                    </span>
                  )}

                  <div className="ml-auto flex items-center gap-1.5">
                    <button
                      onClick={() => onRunTo(breakpoint.nodeId)}
                      disabled={!paused}
                      className={CHIP}
                      title="Continue until this node, ignoring other breakpoints"
                    >
                      <Icons.FastForward className="w-3.5 h-3.5" /> Run to here
                    </button>
                    <button
                      onClick={() => openCondition(breakpoint)}
                      className={CHIP}
                      title="Only stop when an expression is true"
                    >
                      <Icons.Filter className="w-3.5 h-3.5" />
                      {breakpoint.condition ? 'Edit condition' : 'Add condition'}
                    </button>
                    <button
                      onClick={() => onUpdateBreakpoint(breakpoint.nodeId, { logOnly: !breakpoint.logOnly })}
                      className={CHIP}
                      title="Record the hit and keep going instead of stopping"
                    >
                      <Icons.FileText className="w-3.5 h-3.5" />
                      {breakpoint.logOnly ? 'Make it stop' : 'Log only'}
                    </button>
                    <button
                      onClick={() => onRemoveBreakpoint(breakpoint.nodeId)}
                      className={CHIP}
                      title="Remove this breakpoint"
                    >
                      <Icons.X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {breakpoint.condition && conditionFor !== breakpoint.nodeId && (
                  <p className="mt-2 ml-[22px] font-mono text-[11px] text-[#9ea7b3] break-all">
                    when {breakpoint.condition}
                  </p>
                )}

                {conditionFor === breakpoint.nodeId && (
                  <div className="mt-2.5 ml-[22px] flex items-center gap-2">
                    <input
                      value={conditionDraft}
                      onChange={(event) => setConditionDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') saveCondition(breakpoint.nodeId);
                        if (event.key === 'Escape') setConditionFor(null);
                      }}
                      autoFocus
                      placeholder="previous.rowsAffected === 0"
                      className="flex-1 h-[30px] px-2.5 rounded-md bg-[#0c0f14] border border-[#2d323b] font-mono text-[11px] text-white placeholder-[#4b5563] focus:outline-none focus:border-[#4b5563]"
                    />
                    <button onClick={() => saveCondition(breakpoint.nodeId)} className={CHIP}>
                      <Icons.Check className="w-3.5 h-3.5" /> Save
                    </button>
                    <button onClick={() => setConditionFor(null)} className={CHIP}>
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Watches ────────────────────────────────────────────────────────── */}
      <div className={CARD}>
        <div className={CARD_HEAD}>
          <Icons.Eye className="w-4 h-4 text-emerald-400" />
          <span className="text-[13px] text-white">Watches</span>
          <span className="text-[11px] text-[#5b6470]">({debug.watches.length})</span>
        </div>

        <div className="p-4 border-b border-[#1b1f26] flex items-center gap-2">
          <input
            value={watchDraft}
            onChange={(event) => setWatchDraft(event.target.value)}
            onKeyDown={(event) => event.key === 'Enter' && submitWatch()}
            placeholder="previous.employeeId  ·  variables.EmployeeId  ·  steps.Read Employee Excel.department"
            className="flex-1 h-[32px] px-3 rounded-md bg-[#0c0f14] border border-[#2d323b] font-mono text-[11px] text-white placeholder-[#4b5563] focus:outline-none focus:border-[#4b5563]"
          />
          <button onClick={submitWatch} disabled={!watchDraft.trim()} className={CHIP}>
            <Icons.Plus className="w-3.5 h-3.5" /> Watch
          </button>
        </div>

        {debug.watches.length === 0 ? (
          <div className="p-6 text-center">
            <Icons.Eye className="w-7 h-7 text-[#2d323b] mx-auto mb-2" />
            <p className="text-[12px] text-[#9ea7b3]">Nothing watched yet</p>
            <p className="text-[11px] text-[#5b6470] mt-1">
              Add a path to see its value every time the run pauses. Braces are optional.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[#1b1f26]">
            {debug.watches.map((watch) => (
              <div key={watch.id} className="px-4 py-2.5 flex items-start gap-3">
                <code className="text-[11px] text-[#8ab4f8] shrink-0 max-w-[45%] break-all">
                  {watch.expression}
                </code>
                <span className="text-[11px] flex-1 break-all">
                  {watch.error ? (
                    <span className="text-[#5b6470] italic">{watch.error}</span>
                  ) : (
                    <span className="text-[#d6dce7] font-mono">
                      {watch.preview ?? summarizeValue(watch.value, 160)}
                    </span>
                  )}
                </span>
                <button
                  onClick={() => onRemoveWatch(watch.id)}
                  className="shrink-0 text-[#5b6470] hover:text-white transition-colors"
                  title="Stop watching"
                >
                  <Icons.X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default DebuggerPanel;
