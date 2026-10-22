/**
 * Version history — browse, compare and roll back.
 *
 * `Workflow.versionHistory` existed in the schema but was never written to, so
 * "version" was a label on a record nobody could return to. This panel is the
 * user-facing half of `lib/workflowVersioning`.
 *
 * Selecting two versions shows a field-level diff. Rollback is deliberately
 * non-destructive: the editor cuts an automatic version of the current canvas
 * first, so restoring an old state can itself be undone.
 */

import React, { useMemo, useState } from 'react';
import * as Icons from 'lucide-react';
import {
  describeDiff,
  diffVersions,
  type VersionDiffEntry,
  type WorkflowVersion,
} from '../lib/workflowVersioning';
import { summarizeValue } from '../lib/objectUtils';

export interface VersionHistoryModalProps {
  open: boolean;
  versions: WorkflowVersion[];
  onClose: () => void;
  onRestore: (versionId: string) => void;
  onCaptureVersion: (options: { label?: string }) => void;
}

const CHANGE_TONE: Record<VersionDiffEntry['change'], string> = {
  added: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  removed: 'bg-red-500/10 text-red-400 border-red-500/20',
  modified: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
};

const KIND_ICON: Record<VersionDiffEntry['kind'], keyof typeof Icons> = {
  action: 'Box',
  connection: 'GitBranch',
  variable: 'Variable',
};

const CHIP =
  'h-[28px] px-2.5 rounded-md border border-[#2d323b] text-[11px] text-[#9ea7b3] ' +
  'hover:text-white hover:border-[#4b5563] flex items-center gap-1.5 transition-colors ' +
  'disabled:opacity-40 disabled:cursor-not-allowed';

const formatWhen = (iso: string): string => {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
};

const VersionHistoryModal: React.FC<VersionHistoryModalProps> = ({
  open,
  versions,
  onClose,
  onRestore,
  onCaptureVersion,
}) => {
  const [compareFrom, setCompareFrom] = useState<string | null>(null);
  const [compareTo, setCompareTo] = useState<string | null>(null);
  const [labelDraft, setLabelDraft] = useState('');

  const diff = useMemo(() => {
    if (!compareFrom || !compareTo || compareFrom === compareTo) return null;
    const from = versions.find((version) => version.id === compareFrom);
    const to = versions.find((version) => version.id === compareTo);
    if (!from || !to) return null;
    return diffVersions(from, to);
  }, [compareFrom, compareTo, versions]);

  if (!open) return null;

  const toggleCompare = (versionId: string) => {
    if (compareFrom === versionId) {
      setCompareFrom(compareTo);
      setCompareTo(null);
      return;
    }
    if (compareTo === versionId) {
      setCompareTo(null);
      return;
    }
    if (!compareFrom) setCompareFrom(versionId);
    else setCompareTo(versionId);
  };

  const saveNamed = () => {
    onCaptureVersion({ label: labelDraft.trim() || undefined });
    setLabelDraft('');
  };

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 backdrop-blur-sm p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Version history"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[880px] max-h-[80vh] flex flex-col bg-[#0c0f14] border border-[#20242c] rounded-2xl overflow-hidden shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        {/* Head */}
        <div className="h-[56px] shrink-0 border-b border-[#1c2128] px-5 flex items-center gap-2.5">
          <Icons.History className="w-4 h-4 text-indigo-400" />
          <span className="text-[14px] text-white">Version history</span>
          <span className="text-[11px] text-[#5b6470]">
            {versions.length} saved
          </span>
          <button
            onClick={onClose}
            className="ml-auto w-8 h-8 rounded-md text-[#8b95a3] hover:text-white hover:bg-white/[0.04] flex items-center justify-center"
            aria-label="Close version history"
          >
            <Icons.X className="w-4 h-4" />
          </button>
        </div>

        {/* Save a named version */}
        <div className="shrink-0 px-5 py-3 border-b border-[#1c2128] flex items-center gap-2">
          <input
            value={labelDraft}
            onChange={(event) => setLabelDraft(event.target.value)}
            onKeyDown={(event) => event.key === 'Enter' && saveNamed()}
            placeholder="Name this version — e.g. Before switching to the new API"
            className="flex-1 h-[32px] px-3 rounded-md bg-[#11141a] border border-[#2d323b] text-[12px] text-white placeholder-[#4b5563] focus:outline-none focus:border-[#4b5563]"
          />
          <button onClick={saveNamed} className={CHIP}>
            <Icons.BookmarkPlus className="w-3.5 h-3.5" /> Save version
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto">
          {versions.length === 0 ? (
            <div className="p-10 text-center">
              <Icons.History className="w-8 h-8 text-[#2d323b] mx-auto mb-3" />
              <p className="text-[13px] text-[#9ea7b3]">No versions yet</p>
              <p className="text-[11px] text-[#5b6470] mt-1.5 max-w-[420px] mx-auto leading-5">
                A version is recorded every time you save the workflow, and you can name one
                yourself above. Rolling back never loses work — the current canvas is stored
                first.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-[#1b1f26]">
              {versions.map((version) => {
                const selected = compareFrom === version.id || compareTo === version.id;
                return (
                  <div key={version.id} className="px-5 py-3.5 flex items-center gap-3">
                    <button
                      onClick={() => toggleCompare(version.id)}
                      title="Select to compare"
                      className={`w-5 h-5 shrink-0 rounded border flex items-center justify-center transition-colors ${
                        selected
                          ? 'bg-indigo-500/20 border-indigo-400 text-indigo-300'
                          : 'border-[#2d323b] text-transparent hover:border-[#4b5563]'
                      }`}
                    >
                      <Icons.Check className="w-3 h-3" />
                    </button>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[12px] text-white truncate">{version.label}</span>
                        <span className="h-[19px] px-1.5 rounded border border-[#2d323b] text-[10px] text-[#9ea7b3] flex items-center shrink-0">
                          v{version.version}
                        </span>
                        {version.auto && (
                          <span className="h-[19px] px-1.5 rounded border border-white/10 bg-white/[0.04] text-[10px] text-[#7d8794] flex items-center shrink-0">
                            Automatic
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-[11px] text-[#5b6470]">
                        {formatWhen(version.savedAt)} · {version.savedBy} · {version.stats.actions} step
                        {version.stats.actions === 1 ? '' : 's'}, {version.stats.connections} connection
                        {version.stats.connections === 1 ? '' : 's'}, {version.stats.variables} variable
                        {version.stats.variables === 1 ? '' : 's'}
                      </p>
                    </div>

                    <button
                      onClick={() => onRestore(version.id)}
                      className={`${CHIP} shrink-0`}
                      title="Replace the canvas with this version"
                    >
                      <Icons.RotateCcw className="w-3.5 h-3.5" /> Restore
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Diff */}
        {diff && (
          <div className="shrink-0 max-h-[38%] overflow-auto border-t border-[#1c2128] bg-[#0a0d12]">
            <div className="sticky top-0 h-[42px] px-5 flex items-center gap-2 bg-[#0a0d12] border-b border-[#1c2128]">
              <Icons.GitCompare className="w-4 h-4 text-indigo-400" />
              <span className="text-[12px] text-white">
                v{diff.from} → v{diff.to}
              </span>
              <span className="text-[11px] text-[#5b6470]">{describeDiff(diff)}</span>
              <button
                onClick={() => {
                  setCompareFrom(null);
                  setCompareTo(null);
                }}
                className="ml-auto text-[11px] text-[#5b6470] hover:text-white"
              >
                Clear
              </button>
            </div>

            {diff.identical ? (
              <p className="px-5 py-4 text-[12px] text-[#5b6470]">
                These two versions describe the same workflow.
              </p>
            ) : (
              <div className="px-5 py-3 space-y-2">
                {diff.entries.map((entry) => {
                  const Icon = Icons[KIND_ICON[entry.kind]] as React.ComponentType<{
                    className?: string;
                  }>;
                  return (
                    <div key={`${entry.kind}:${entry.id}`} className="flex items-start gap-2.5">
                      <span
                        className={`h-[19px] px-1.5 rounded border text-[10px] flex items-center shrink-0 ${
                          CHANGE_TONE[entry.change]
                        }`}
                      >
                        {entry.change}
                      </span>
                      <Icon className="w-3.5 h-3.5 text-[#5b6470] mt-0.5 shrink-0" />
                      <div className="min-w-0">
                        <span className="text-[12px] text-white break-words">{entry.name}</span>
                        {entry.changes.length > 0 && (
                          <ul className="mt-1 space-y-0.5">
                            {entry.changes.map((change) => (
                              <li key={change.field} className="text-[11px] text-[#8b95a3] break-all">
                                <span className="text-[#5b6470]">{change.field}:</span>{' '}
                                <span className="line-through text-[#6b7280]">
                                  {summarizeValue(change.before, 40)}
                                </span>{' '}
                                → <span className="text-[#d6dce7]">{summarizeValue(change.after, 40)}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default VersionHistoryModal;
