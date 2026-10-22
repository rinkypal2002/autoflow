/**
 * Binding controls — the visual half of workflow-wide data carry-forward.
 *
 * Three related controls live here:
 *
 *   • <BindingPicker>      grouped, searchable popover listing every value the
 *                          node can bind to (variables, previous step output,
 *                          any earlier step, runtime/run metadata), each with a
 *                          live preview of its last known value.
 *   • <ExpressionEditor>   a focused editor for hand-written bindings with
 *                          per-token resolution feedback, so a user can see
 *                          exactly what each `{{…}}` will become before running.
 *   • <BindingPreview>     inline "what will actually be sent" readout shown
 *                          under any field that contains a binding.
 *
 * All three resolve through the same `src/lib/expression` engine the executor
 * uses, so the preview is never a separate approximation of runtime behaviour.
 *
 * ── Business first ────────────────────────────────────────────────────────
 * Groups flagged `defaultCollapsed` (in practice: Technical Details — status
 * codes, headers, transport wrappers, timings) are kept out of the tab strip
 * until the user asks for them, so the default picker offers only values a
 * business user would recognise. They stay one click away, and a search that
 * only matches inside them says so rather than reporting "no results".
 */

import React, { useCallback, useMemo, useState } from 'react';
import * as Icons from 'lucide-react';
import { motion } from 'framer-motion';
import type { BindingSource, BindingSourceGroup } from '../types/workflow';
import { describeResolution } from '../lib/expression';
import { summarizeValue } from '../lib/objectUtils';
import { filterCatalogue } from '../lib/bindingSources';

/* -------------------------------------------------------------------------- */
/*                                  HELPERS                                   */
/* -------------------------------------------------------------------------- */

const typeTone: Record<string, string> = {
  string: 'text-sky-300/80 bg-sky-500/[0.07] border-sky-500/[0.15]',
  number: 'text-amber-300/80 bg-amber-500/[0.07] border-amber-500/[0.15]',
  boolean: 'text-violet-300/80 bg-violet-500/[0.07] border-violet-500/[0.15]',
  object: 'text-emerald-300/80 bg-emerald-500/[0.07] border-emerald-500/[0.15]',
  array: 'text-emerald-300/80 bg-emerald-500/[0.07] border-emerald-500/[0.15]',
  file: 'text-rose-300/80 bg-rose-500/[0.07] border-rose-500/[0.15]',
};

const toneFor = (valueType: string): string =>
  typeTone[valueType] ?? 'text-slate-400 bg-white/[0.04] border-white/[0.08]';

const iconFor = (name?: string): React.ComponentType<any> =>
  (name ? (Icons[name as keyof typeof Icons] as React.ComponentType<any>) : undefined) ||
  Icons.Braces;

/** Groups the picker keeps folded away until the user opens them. */
const isCollapsedByDefault = (group: BindingSourceGroup): boolean =>
  Boolean(group.defaultCollapsed) || Boolean(group.isTechnical) || group.id === 'technical';

const countSources = (groups: BindingSourceGroup[]): number =>
  groups.reduce((total, group) => total + group.sources.length, 0);

/* -------------------------------------------------------------------------- */
/*                                BINDING ROW                                 */
/* -------------------------------------------------------------------------- */

const BindingRow: React.FC<{
  source: BindingSource;
  muted?: boolean;
  onPick: (source: BindingSource) => void;
}> = ({ source, muted = false, onPick }) => (
  <button
    type="button"
    onClick={() => onPick(source)}
    title={source.description ? `${source.token} — ${source.description}` : source.token}
    className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-left hover:bg-white/[0.05] transition-colors duration-150 group"
  >
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-1.5">
        <span
          className={`font-mono text-[11.5px] font-medium truncate transition-colors ${
            muted ? 'text-slate-400 group-hover:text-slate-200' : 'text-slate-300 group-hover:text-slate-100'
          }`}
        >
          {source.label}
        </span>
        {source.isSecret && (
          <span className="flex items-center gap-0.5 px-1.5 py-px rounded-md bg-amber-500/[0.07] border border-amber-500/[0.12] shrink-0">
            <Icons.Lock className="w-2 h-2 text-amber-500/80" />
            <span className="text-[8px] text-amber-500/80 font-semibold uppercase tracking-wide">
              secret
            </span>
          </span>
        )}
      </div>
      <p className="font-mono text-[9.5px] text-slate-600 truncate mt-px">{source.token}</p>
    </div>

    {source.preview !== undefined && (
      <span
        className="text-[9.5px] text-slate-500 font-mono truncate max-w-[92px] shrink-0"
        title={source.preview}
      >
        {source.preview}
      </span>
    )}

    <span
      className={`px-1.5 py-px rounded border text-[8.5px] font-semibold uppercase tracking-wide shrink-0 ${toneFor(
        source.valueType
      )}`}
    >
      {source.valueType}
    </span>
  </button>
);

/* -------------------------------------------------------------------------- */
/*                               BINDING PICKER                               */
/* -------------------------------------------------------------------------- */

export interface BindingPickerProps {
  groups: BindingSourceGroup[];
  /** Current field value, used to seed the expression editor. */
  value: string;
  /** Scope used to resolve the live preview. */
  previewScope: Record<string, any>;
  onInsert: (token: string) => void;
  onReplace: (expression: string) => void;
  onClose: () => void;
}

export const BindingPicker: React.FC<BindingPickerProps> = ({
  groups,
  value,
  previewScope,
  onInsert,
  onReplace,
  onClose,
}) => {
  const [search, setSearch] = useState('');
  const [activeGroupId, setActiveGroupId] = useState<string>(groups[0]?.id ?? 'variables');
  const [mode, setMode] = useState<'browse' | 'expression'>('browse');
  const [expression, setExpression] = useState(value ?? '');
  /** Technical Details stays folded away until asked for. */
  const [showTechnical, setShowTechnical] = useState(false);

  const filtered = useMemo(() => filterCatalogue(groups, search), [groups, search]);

  const businessGroups = useMemo(
    () => filtered.filter((group) => !isCollapsedByDefault(group)),
    [filtered]
  );
  const technicalGroups = useMemo(() => filtered.filter(isCollapsedByDefault), [filtered]);
  const technicalCount = useMemo(() => countSources(technicalGroups), [technicalGroups]);

  /** Only the technical group carries its own tab when there is more than one. */
  const technicalTabbed = technicalGroups.length > 1;
  const visibleGroups = useMemo(
    () => (showTechnical ? [...businessGroups, ...technicalGroups] : businessGroups),
    [showTechnical, businessGroups, technicalGroups]
  );

  const activeGroup =
    visibleGroups.find((group) => group.id === activeGroupId) ?? visibleGroups[0] ?? null;
  const activeIsTechnical = activeGroup ? isCollapsedByDefault(activeGroup) : false;

  const toggleTechnical = useCallback(() => {
    const opening = !showTechnical;
    setShowTechnical(opening);
    setActiveGroupId(
      opening
        ? technicalGroups[0]?.id ?? 'technical'
        : businessGroups[0]?.id ?? groups[0]?.id ?? 'variables'
    );
  }, [showTechnical, technicalGroups, businessGroups, groups]);

  const resolutions = useMemo(
    () => describeResolution(expression, previewScope),
    [expression, previewScope]
  );

  const hasTabs = businessGroups.length > 1 || technicalCount > 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: -4, scale: 0.99 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -4, scale: 0.99 }}
      transition={{ duration: 0.14, ease: [0.16, 1, 0.3, 1] }}
      className="absolute z-50 left-0 right-0 top-full mt-1.5 bg-[#080D1A]/[0.98] backdrop-blur-2xl border border-white/[0.09] rounded-xl shadow-[0_20px_60px_rgba(0,0,0,0.55),0_0_0_0.5px_rgba(255,255,255,0.04)] overflow-hidden"
    >
      {/* Mode switch */}
      <div className="flex items-center gap-1 p-1.5 border-b border-white/[0.05]">
        {(['browse', 'expression'] as const).map((candidate) => (
          <button
            key={candidate}
            type="button"
            onClick={() => setMode(candidate)}
            className={`h-[24px] px-2.5 rounded-md text-[10.5px] font-medium transition-colors ${
              mode === candidate
                ? 'bg-white/[0.07] text-slate-200'
                : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            {candidate === 'browse' ? 'Browse values' : 'Expression'}
          </button>
        ))}
        <div className="flex-1" />
        <button
          type="button"
          onClick={onClose}
          aria-label="Close binding picker"
          className="w-[22px] h-[22px] rounded-md flex items-center justify-center text-slate-600 hover:text-slate-300 hover:bg-white/[0.05] transition-colors"
        >
          <Icons.X className="w-3 h-3" />
        </button>
      </div>

      {mode === 'browse' ? (
        <>
          <div className="p-1.5 border-b border-white/[0.05]">
            <div className="relative flex items-center">
              <Icons.Search className="absolute left-2.5 w-3 h-3 text-slate-600 pointer-events-none" />
              <input
                type="text"
                autoFocus
                placeholder="Search variables, step outputs, expressions…"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="w-full pl-7 pr-3 py-1.5 text-[11.5px] bg-transparent text-slate-300 placeholder-slate-600 focus:outline-none"
              />
            </div>
          </div>

          {/* Group tabs — business first, technical folded behind its own chip */}
          {hasTabs && (
            <div className="flex items-center gap-1 px-1.5 py-1.5 border-b border-white/[0.05] overflow-x-auto">
              {businessGroups.map((group) => {
                const GroupIcon = iconFor(group.icon);
                const isActive = activeGroup?.id === group.id;
                return (
                  <button
                    key={group.id}
                    type="button"
                    onClick={() => setActiveGroupId(group.id)}
                    title={group.description}
                    className={`h-[24px] shrink-0 px-2 rounded-md flex items-center gap-1.5 text-[10.5px] font-medium transition-colors ${
                      isActive
                        ? 'bg-white/[0.07] text-slate-200'
                        : 'text-slate-500 hover:text-slate-300'
                    }`}
                  >
                    <GroupIcon className="w-3 h-3" />
                    {group.label}
                    <span className="text-[9px] text-slate-600">{group.sources.length}</span>
                  </button>
                );
              })}

              {technicalCount > 0 && (
                <>
                  <div className="w-px h-3.5 bg-white/[0.07] mx-0.5 shrink-0" />
                  <button
                    type="button"
                    onClick={toggleTechnical}
                    aria-expanded={showTechnical}
                    title="Status codes, headers, wrappers and timings. Still bindable."
                    className={`h-[24px] shrink-0 px-2 rounded-md flex items-center gap-1.5 text-[10.5px] font-medium transition-colors ${
                      showTechnical && activeIsTechnical
                        ? 'bg-white/[0.07] text-slate-300'
                        : 'text-slate-600 hover:text-slate-400'
                    }`}
                  >
                    {showTechnical ? (
                      <Icons.ChevronDown className="w-3 h-3" />
                    ) : (
                      <Icons.ChevronRight className="w-3 h-3" />
                    )}
                    <Icons.Wrench className="w-3 h-3" />
                    Technical
                    <span className="text-[9px] text-slate-600">{technicalCount}</span>
                  </button>

                  {/* Only needed if a build ever emits more than one folded group. */}
                  {showTechnical &&
                    technicalTabbed &&
                    technicalGroups.map((group) => {
                      const GroupIcon = iconFor(group.icon);
                      const isActive = activeGroup?.id === group.id;
                      return (
                        <button
                          key={group.id}
                          type="button"
                          onClick={() => setActiveGroupId(group.id)}
                          title={group.description}
                          className={`h-[24px] shrink-0 px-2 rounded-md flex items-center gap-1.5 text-[10.5px] font-medium transition-colors ${
                            isActive
                              ? 'bg-white/[0.07] text-slate-300'
                              : 'text-slate-600 hover:text-slate-400'
                          }`}
                        >
                          <GroupIcon className="w-3 h-3" />
                          {group.label}
                          <span className="text-[9px] text-slate-600">{group.sources.length}</span>
                        </button>
                      );
                    })}
                </>
              )}
            </div>
          )}

          <div className="max-h-56 overflow-y-auto panel-scroll p-1">
            {!activeGroup || activeGroup.sources.length === 0 ? (
              <div className="p-6 text-center">
                <Icons.SearchX className="w-4 h-4 text-slate-600 mx-auto mb-2" />
                <p className="text-[11px] text-slate-500">No matching values</p>
                <p className="text-[10px] text-slate-600 mt-1">
                  Run the workflow once to capture live outputs from every step.
                </p>
              </div>
            ) : (
              activeGroup.sources.map((source, index) => (
                <BindingRow
                  key={`${source.token}-${index}`}
                  source={source}
                  muted={activeIsTechnical}
                  onPick={(picked) => onInsert(picked.token)}
                />
              ))
            )}
          </div>

          {/* A search that only matches technical values says so, rather than
              reporting "no results" for values that are right there. */}
          {search.trim().length > 0 && !showTechnical && technicalCount > 0 && (
            <button
              type="button"
              onClick={toggleTechnical}
              className="w-full flex items-center gap-1.5 px-3 py-2 border-t border-white/[0.05] bg-white/[0.012] text-left text-slate-500 hover:text-slate-300 transition-colors"
            >
              <Icons.Wrench className="w-3 h-3 shrink-0" />
              <span className="text-[10px]">
                {technicalCount} more {technicalCount === 1 ? 'match' : 'matches'} in Technical
                Details
              </span>
              <Icons.ChevronRight className="w-3 h-3 ml-auto shrink-0" />
            </button>
          )}

          {activeGroup?.description && (
            <div className="px-3 py-2 border-t border-white/[0.05] bg-white/[0.012]">
              <p className="text-[9.5px] text-slate-600 leading-snug">{activeGroup.description}</p>
            </div>
          )}
        </>
      ) : (
        <div className="p-2.5 space-y-2.5">
          <div>
            <label className="text-[10px] font-medium text-slate-500 uppercase tracking-wide">
              Expression
            </label>
            <textarea
              autoFocus
              value={expression}
              onChange={(event) => setExpression(event.target.value)}
              rows={3}
              spellCheck={false}
              placeholder="{{steps.Read Employee Excel.employeeId}} — {{previous.department | upper}}"
              className="mt-1 w-full rounded-lg bg-[#05070D] border border-white/[0.08] px-2.5 py-2 font-mono text-[11.5px] text-slate-200 placeholder-slate-600 focus:outline-none focus:border-white/[0.15] resize-y"
            />
          </div>

          {/* Per-token resolution feedback */}
          {resolutions.length > 0 && (
            <div className="rounded-lg border border-white/[0.06] overflow-hidden">
              <div className="px-2.5 py-1.5 bg-white/[0.02] border-b border-white/[0.05]">
                <span className="text-[9.5px] font-semibold text-slate-500 uppercase tracking-wide">
                  Resolves to
                </span>
              </div>
              <div className="max-h-32 overflow-y-auto panel-scroll divide-y divide-white/[0.03]">
                {resolutions.map((resolution, index) => (
                  <div
                    key={`${resolution.token}-${index}`}
                    className="flex items-center gap-2 px-2.5 py-1.5"
                  >
                    {resolution.found ? (
                      <Icons.CheckCircle2 className="w-3 h-3 text-emerald-400/80 shrink-0" />
                    ) : (
                      <Icons.AlertCircle className="w-3 h-3 text-amber-400/80 shrink-0" />
                    )}
                    <span
                      className="font-mono text-[10px] text-slate-400 truncate flex-1"
                      title={resolution.token}
                    >
                      {resolution.token}
                    </span>
                    <span
                      className={`font-mono text-[10px] truncate max-w-[130px] ${
                        resolution.found ? 'text-slate-300' : 'text-amber-400/70'
                      }`}
                      title={
                        resolution.found ? summarizeValue(resolution.value, 200) : 'Not available yet'
                      }
                    >
                      {resolution.found ? summarizeValue(resolution.value) : 'not available yet'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                onReplace(expression);
                onClose();
              }}
              className="flex-1 h-[28px] rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-semibold transition-colors"
            >
              Apply expression
            </button>
            <button
              type="button"
              onClick={onClose}
              className="h-[28px] px-3 rounded-lg border border-white/[0.08] text-slate-400 hover:text-slate-200 text-[11px] transition-colors"
            >
              Cancel
            </button>
          </div>

          <p className="text-[9.5px] text-slate-600 leading-relaxed">
            Supports <span className="font-mono text-slate-500">{'{{key}}'}</span>,{' '}
            <span className="font-mono text-slate-500">{'{{previous.field}}'}</span>,{' '}
            <span className="font-mono text-slate-500">{'{{steps.Step Name.field}}'}</span>,{' '}
            <span className="font-mono text-slate-500">{'{{variables.Name}}'}</span>, fallbacks with{' '}
            <span className="font-mono text-slate-500">||</span>, and filters such as{' '}
            <span className="font-mono text-slate-500">| upper</span>,{' '}
            <span className="font-mono text-slate-500">| json</span>,{' '}
            <span className="font-mono text-slate-500">{"| default:'n/a'"}</span>.
          </p>
        </div>
      )}
    </motion.div>
  );
};

/* -------------------------------------------------------------------------- */
/*                              BINDING PREVIEW                               */
/* -------------------------------------------------------------------------- */

/**
 * Inline readout shown beneath a bound field: what the value will actually be
 * once resolved. Removes the "hidden mapping" problem — the user never has to
 * guess what the backend will receive.
 */
export const BindingPreview: React.FC<{
  value: unknown;
  scope: Record<string, any>;
}> = ({ value, scope }) => {
  const resolutions = useMemo(
    () => (typeof value === 'string' ? describeResolution(value, scope) : []),
    [value, scope]
  );

  if (resolutions.length === 0) return null;

  const unresolved = resolutions.filter((resolution) => !resolution.found);

  return (
    <div className="mt-1 flex items-start gap-1.5 rounded-md border border-white/[0.05] bg-white/[0.012] px-2 py-1.5">
      {unresolved.length > 0 ? (
        <Icons.AlertCircle className="w-3 h-3 text-amber-400/70 shrink-0 mt-px" />
      ) : (
        <Icons.CornerDownRight className="w-3 h-3 text-slate-600 shrink-0 mt-px" />
      )}
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-mono text-slate-400 break-all leading-snug">
          {resolutions
            .map((resolution) =>
              resolution.found ? summarizeValue(resolution.value, 40) : resolution.raw
            )
            .join(' ')}
        </p>
        {unresolved.length > 0 && (
          <p className="text-[9px] text-amber-400/60 mt-0.5">
            {unresolved.length} binding{unresolved.length === 1 ? '' : 's'} will resolve at run time
          </p>
        )}
      </div>
    </div>
  );
};

export default BindingPicker;
