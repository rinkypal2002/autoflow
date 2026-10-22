import React, { useState, useEffect, useRef } from "react";
import * as Icons from "lucide-react";
import { LucideIcon } from "lucide-react";

interface HeaderProps {
  workflowName: string;
  onSave: () => void;
  onLoad: () => void;
  onRun: () => void;
  onStop: () => void;
  onNewWorkflow: () => void;
  onToggleVariables: () => void;
  onToggleExecution: () => void;
  onToggleTriggers: () => void;
  onToggleChats: () => void;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onResetZoom?: () => void;
  onFitToScreen?: () => void;
  zoomLevel?: number;
  isRunning: boolean;
  hasUnsavedChanges: boolean;
  onToggleGrid?: (show: boolean) => void;
  onToggleSnapToGrid?: (snap: boolean) => void;
  onGridSizeChange?: (size: number) => void;
  onThemeChange?: (theme: 'light' | 'dark') => void;
  onAutoSaveChange?: (autoSave: boolean) => void;
  className?: string;
  isSaving?: boolean;
  saveError?: string | null;
}

// ─── Settings types & defaults ──────────────────────────────────────────────

interface WorkspaceSettings {
  theme: 'light' | 'dark';
  autoSave: boolean;
  showGrid: boolean;
  snapToGrid: boolean;
  gridSize: number;
}

const DEFAULT_SETTINGS: WorkspaceSettings = {
  theme: 'dark',
  autoSave: true,
  showGrid: true,
  snapToGrid: true,
  gridSize: 32,
};

const GRID_MIN = 16;
const GRID_MAX = 64;

const clampGridSize = (value: unknown): number => {
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULT_SETTINGS.gridSize;
  return Math.min(GRID_MAX, Math.max(GRID_MIN, Math.round(n)));
};

/**
 * Merge a (possibly partial / corrupt) persisted blob over the defaults so a
 * bad localStorage entry can never leave the UI with undefined/NaN values.
 */
const normalizeSettings = (raw: unknown): WorkspaceSettings => {
  const p = (raw && typeof raw === 'object' ? raw : {}) as Partial<WorkspaceSettings>;
  return {
    theme: p.theme === 'light' ? 'light' : 'dark',
    autoSave: typeof p.autoSave === 'boolean' ? p.autoSave : DEFAULT_SETTINGS.autoSave,
    showGrid: typeof p.showGrid === 'boolean' ? p.showGrid : DEFAULT_SETTINGS.showGrid,
    snapToGrid: typeof p.snapToGrid === 'boolean' ? p.snapToGrid : DEFAULT_SETTINGS.snapToGrid,
    gridSize: clampGridSize(p.gridSize),
  };
};

const formatTime = (seconds: number) => {
  const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
  const secs = (seconds % 60).toString().padStart(2, '0');
  return `${mins}:${secs}`;
};

const ActionButton: React.FC<{ icon: LucideIcon; label: string; onClick: () => void }> = ({
  icon: Icon,
  label,
  onClick,
}) => (
  <button
    type="button"
    onClick={onClick}
    aria-label={label}
    className="group relative flex items-center gap-2 px-3 py-1.5 text-[12px] font-medium text-slate-300 hover:text-white rounded-md transition-all duration-200 ease-out hover:bg-white/5 active:scale-[0.98]"
  >
    <Icon className="w-[15px] h-[15px] text-slate-400 group-hover:text-cyan-300 transition-colors" />
    <span>{label}</span>
  </button>
);

const SaveButton: React.FC<{
  hasChanges: boolean;
  isSaving?: boolean;
  saveError?: string | null;
  onClick: () => void;
}> = ({ hasChanges, isSaving, saveError, onClick }) => {
  const getTooltip = () => {
    if (isSaving) return "Saving...";
    if (saveError) return `Error: ${saveError}`;
    if (hasChanges) return "Save changes";
    return "All changes saved";
  };

  return (
    <div className="relative" title={getTooltip()}>
      <button
        type="button"
        onClick={onClick}
        disabled={isSaving}
        aria-label={getTooltip()}
        className={`group relative flex items-center gap-2 px-3 py-1.5 text-[12px] font-medium rounded-md transition-all duration-300 ease-out active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed
          ${
            hasChanges
              ? "text-cyan-50 bg-cyan-500/10 hover:bg-cyan-500/20 shadow-[inset_0_0_0_1px_rgba(34,211,238,0.22)] hover:shadow-[inset_0_0_0_1px_rgba(34,211,238,0.34),0_0_12px_rgba(34,211,238,0.16)]"
              : "text-slate-300 hover:text-white hover:bg-white/5"
          }`}
      >
        {isSaving ? (
          <>
            <Icons.Loader2 className="w-[15px] h-[15px] text-cyan-300 animate-spin" />
            <span>Saving...</span>
          </>
        ) : (
          <>
            <Icons.Save
              className={`w-[15px] h-[15px] transition-colors ${
                hasChanges ? "text-cyan-300" : "text-slate-400 group-hover:text-slate-200"
              }`}
            />
            <span>Save</span>
          </>
        )}
        {hasChanges && !isSaving && (
          <span className="absolute top-1.5 right-1.5 flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full rounded-full bg-cyan-300 opacity-75 animate-ping" />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-cyan-400" />
          </span>
        )}
        {saveError && !isSaving && (
          <span className="absolute -top-1 -right-1 flex h-3 w-3">
            <span className="absolute inline-flex h-full w-full rounded-full bg-red-500/30 animate-ping" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500 border border-red-400" />
          </span>
        )}
      </button>
    </div>
  );
};

const ToggleIconButton: React.FC<{
  icon: LucideIcon;
  onClick: () => void;
  isActive?: boolean;
  title: string;
}> = ({ icon: Icon, onClick, isActive = false, title }) => (
  <button
    type="button"
    onClick={onClick}
    title={title}
    aria-label={title}
    aria-pressed={isActive}
    className={`p-2 rounded-md transition-all duration-200 ease-out flex items-center justify-center relative group
      ${
        isActive
          ? "bg-indigo-500/20 text-indigo-300 shadow-[inset_0_0_0_1px_rgba(99,102,241,0.28)]"
          : "text-slate-400 hover:bg-white/5 hover:text-white"
      }`}
  >
    <Icon className="w-[16px] h-[16px] transition-transform group-hover:scale-105" strokeWidth={1.5} />
  </button>
);

// ─── Settings modal ─────────────────────────────────────────────────────────

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onThemeChange: (theme: 'light' | 'dark') => void;
  onAutoSaveChange: (autoSave: boolean) => void;
  onShowGridChange: (show: boolean) => void;
  onSnapToGridChange: (snap: boolean) => void;
  onGridSizeChange: (size: number) => void;
  currentSettings: WorkspaceSettings;
}

// Hoisted out of the modal so it isn't re-created (and remounted) on every render.
const ToggleSwitch: React.FC<{
  label: string;
  description: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}> = ({ label, description, checked, onChange }) => (
  <div className="flex items-center justify-between p-3 rounded-xl hover:bg-white/[0.02] transition-colors border border-transparent hover:border-white/[0.03]">
    <div className="space-y-0.5 pr-4">
      <div className="text-[13px] font-medium text-slate-200">{label}</div>
      <div className="text-[11px] text-slate-500 leading-snug">{description}</div>
    </div>
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors duration-300 focus:outline-none shadow-inner border ${
        checked ? 'bg-indigo-500 border-indigo-400/50' : 'bg-[#090C15] border-white/10'
      }`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
          checked ? 'translate-x-4' : 'translate-x-1'
        }`}
      />
    </button>
  </div>
);

const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  onThemeChange,
  onAutoSaveChange,
  onShowGridChange,
  onSnapToGridChange,
  onGridSizeChange,
  currentSettings,
}) => {
  const [theme, setTheme] = useState<'light' | 'dark'>(currentSettings.theme);
  const [autoSave, setAutoSave] = useState(currentSettings.autoSave);
  const [showGrid, setShowGrid] = useState(currentSettings.showGrid);
  const [snapToGrid, setSnapToGrid] = useState(currentSettings.snapToGrid);
  const [gridSize, setGridSize] = useState(currentSettings.gridSize);
  const modalRef = useRef<HTMLDivElement>(null);

  // Re-sync local draft whenever the modal is (re)opened or the source changes.
  useEffect(() => {
    setTheme(currentSettings.theme);
    setAutoSave(currentSettings.autoSave);
    setShowGrid(currentSettings.showGrid);
    setSnapToGrid(currentSettings.snapToGrid);
    setGridSize(currentSettings.gridSize);
  }, [currentSettings, isOpen]);

  // Close on outside click + Escape, in a single effect.
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(event.target as Node)) onClose();
    };
    const handleEscapeKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscapeKey);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscapeKey);
    };
  }, [isOpen, onClose]);

  // Lock background scroll while the modal is open.
  useEffect(() => {
    if (!isOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [isOpen]);

  const handleSaveSettings = () => {
    onThemeChange(theme);
    onAutoSaveChange(autoSave);
    onShowGridChange(showGrid);
    onSnapToGridChange(snapToGrid);
    onGridSizeChange(gridSize);

    const settings: WorkspaceSettings = { theme, autoSave, showGrid, snapToGrid, gridSize };
    try {
      localStorage.setItem('workflowSettings', JSON.stringify(settings));
    } catch {
      /* storage unavailable (private mode / quota) — settings still apply for the session */
    }
    onClose();
  };

  const handleResetDefaults = () => {
    setTheme(DEFAULT_SETTINGS.theme);
    setAutoSave(DEFAULT_SETTINGS.autoSave);
    setShowGrid(DEFAULT_SETTINGS.showGrid);
    setSnapToGrid(DEFAULT_SETTINGS.snapToGrid);
    setGridSize(DEFAULT_SETTINGS.gridSize);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-[#02040A]/80 backdrop-blur-sm flex items-center justify-center z-[100] p-4 animate-in fade-in duration-200">
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-label="Workspace settings"
        className="bg-[#0D111A] border border-white/[0.08] rounded-2xl w-full max-w-[440px] max-h-[85vh] flex flex-col shadow-[0_0_40px_rgba(0,0,0,0.5),inset_0_1px_1px_rgba(255,255,255,0.05)] overflow-hidden"
      >
        <div className="flex items-center justify-between p-5 border-b border-white/[0.06] bg-[#0A0D14]">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-500/10 rounded-lg border border-indigo-500/20">
              <Icons.Settings2 className="w-4 h-4 text-indigo-400" />
            </div>
            <div>
              <h2 className="text-[14px] font-semibold text-slate-100">Workspace Settings</h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close settings"
            className="p-1.5 text-slate-500 hover:text-slate-300 hover:bg-white/5 rounded-md transition-colors"
          >
            <Icons.X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-6 overflow-y-auto custom-scrollbar">
          <div className="space-y-3">
            <h3 className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider pl-1">
              Appearance
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setTheme('light')}
                aria-pressed={theme === 'light'}
                className={`p-3 rounded-xl border text-left transition-all duration-200 flex items-center gap-3
                  ${
                    theme === 'light'
                      ? 'border-indigo-500/50 bg-indigo-500/10 shadow-[inset_0_0_0_1px_rgba(99,102,241,0.2)]'
                      : 'border-white/5 hover:border-white/10 bg-[#090C15]'
                  }`}
              >
                <Icons.Sun className={`w-4 h-4 ${theme === 'light' ? 'text-indigo-400' : 'text-slate-400'}`} />
                <span className={`text-[12px] font-medium ${theme === 'light' ? 'text-indigo-200' : 'text-slate-300'}`}>
                  Light Mode
                </span>
              </button>

              <button
                type="button"
                onClick={() => setTheme('dark')}
                aria-pressed={theme === 'dark'}
                className={`p-3 rounded-xl border text-left transition-all duration-200 flex items-center gap-3
                  ${
                    theme === 'dark'
                      ? 'border-indigo-500/50 bg-indigo-500/10 shadow-[inset_0_0_0_1px_rgba(99,102,241,0.2)]'
                      : 'border-white/5 hover:border-white/10 bg-[#090C15]'
                  }`}
              >
                <Icons.Moon className={`w-4 h-4 ${theme === 'dark' ? 'text-indigo-400' : 'text-slate-400'}`} />
                <span className={`text-[12px] font-medium ${theme === 'dark' ? 'text-indigo-200' : 'text-slate-300'}`}>
                  Dark Mode
                </span>
              </button>
            </div>
          </div>

          <div className="space-y-3">
            <h3 className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider pl-1">
              Canvas & Engine
            </h3>
            <div className="bg-[#090C15] rounded-xl border border-white/5 p-2 space-y-1">
              <ToggleSwitch
                label="Show Grid Base"
                description="Display dot grid background"
                checked={showGrid}
                onChange={setShowGrid}
              />
              <ToggleSwitch
                label="Snap to Grid"
                description="Auto-align canvas modules"
                checked={snapToGrid}
                onChange={setSnapToGrid}
              />
              <ToggleSwitch
                label="Auto Save"
                description="Continuous cloud sync"
                checked={autoSave}
                onChange={setAutoSave}
              />

              <div className="px-3 pt-4 pb-2 mt-2 border-t border-white/[0.04]">
                <div className="flex justify-between items-center mb-3">
                  <span className="text-[12px] font-medium text-slate-300">Grid Resolution</span>
                  <span className="text-[11px] font-mono text-indigo-300 bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20">
                    {gridSize}px
                  </span>
                </div>
                <input
                  type="range"
                  min={GRID_MIN}
                  max={GRID_MAX}
                  step="8"
                  value={gridSize}
                  aria-label="Grid resolution in pixels"
                  onChange={(e) => setGridSize(clampGridSize(e.target.value))}
                  className="w-full h-1 bg-[#131825] border border-white/5 rounded-full appearance-none cursor-pointer accent-indigo-500"
                />
                <div className="flex justify-between mt-2 text-[9px] font-medium text-slate-500">
                  <span>{GRID_MIN}px</span>
                  <span>{GRID_MAX}px</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-white/[0.06] bg-[#0A0D14] flex justify-between items-center">
          <button
            type="button"
            onClick={handleResetDefaults}
            className="text-[11px] font-medium text-slate-500 hover:text-slate-300 transition-colors px-2"
          >
            Reset
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-[12px] font-medium text-slate-300 hover:bg-white/5 rounded-lg transition-colors border border-transparent"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSaveSettings}
              className="px-5 py-2 text-[12px] font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-500 transition-all shadow-[0_2px_10px_rgba(79,70,229,0.2)] border border-indigo-500/50 active:scale-95 flex items-center gap-1.5"
            >
              <Icons.Check className="w-3.5 h-3.5" /> Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const AppLogo: React.FC = () => {
  return (
    <div className="relative flex items-center justify-center w-10 h-10 rounded-2xl overflow-hidden shrink-0">
      <div className="absolute inset-0 rounded-2xl p-[1.5px] bg-[conic-gradient(from_180deg_at_50%_50%,#6FC962_0deg,#F6A151_72deg,#F4806F_144deg,#EE4A4F_216deg,#3891A3_288deg,#33BDF2_360deg)]">
        <div className="w-full h-full rounded-2xl bg-[#0B1120]" />
      </div>
      <div className="absolute inset-[1.5px] rounded-[14px] bg-[linear-gradient(180deg,#121C2D_0%,#0B1220_100%)] border border-white/[0.04] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]" />
      <img
        src="/logo.png"
        alt="AutoFlow"
        className="relative z-10 w-6 h-6 object-contain select-none pointer-events-none"
        draggable={false}
      />
    </div>
  );
};

// Optional compact zoom cluster — only rendered when the parent supplies zoom props.
const ZoomControls: React.FC<{
  zoomLevel?: number;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onResetZoom?: () => void;
  onFitToScreen?: () => void;
}> = ({ zoomLevel, onZoomIn, onZoomOut, onResetZoom, onFitToScreen }) => {
  if (zoomLevel === undefined && !onZoomIn && !onZoomOut) return null;

  return (
    <div className="flex items-center gap-0.5 p-1 bg-[#131825]/55 backdrop-blur-md rounded-lg border border-white/5 shadow-[inset_0_1px_1px_rgba(255,255,255,0.02)]">
      <button
        type="button"
        onClick={onZoomOut}
        disabled={!onZoomOut}
        title="Zoom out"
        aria-label="Zoom out"
        className="p-1.5 rounded-md text-slate-400 hover:bg-white/5 hover:text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <Icons.Minus className="w-[15px] h-[15px]" strokeWidth={1.75} />
      </button>

      <button
        type="button"
        onClick={onResetZoom ?? onFitToScreen}
        disabled={!onResetZoom && !onFitToScreen}
        title={onResetZoom ? "Reset zoom to 100%" : "Fit to screen"}
        aria-label={onResetZoom ? "Reset zoom to 100%" : "Fit to screen"}
        className="px-2 min-w-[44px] text-[11px] font-semibold tabular-nums text-slate-300 hover:text-white rounded-md hover:bg-white/5 transition-colors disabled:cursor-default"
      >
        {zoomLevel !== undefined ? `${Math.round(zoomLevel)}%` : "100%"}
      </button>

      <button
        type="button"
        onClick={onZoomIn}
        disabled={!onZoomIn}
        title="Zoom in"
        aria-label="Zoom in"
        className="p-1.5 rounded-md text-slate-400 hover:bg-white/5 hover:text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <Icons.Plus className="w-[15px] h-[15px]" strokeWidth={1.75} />
      </button>

      {onFitToScreen && (
        <button
          type="button"
          onClick={onFitToScreen}
          title="Fit to screen"
          aria-label="Fit to screen"
          className="p-1.5 rounded-md text-slate-400 hover:bg-white/5 hover:text-white transition-colors"
        >
          <Icons.Maximize className="w-[15px] h-[15px]" strokeWidth={1.75} />
        </button>
      )}
    </div>
  );
};

const Header: React.FC<HeaderProps> = ({
  workflowName,
  onSave,
  onLoad,
  onRun,
  onStop,
  onNewWorkflow,
  onToggleVariables,
  onToggleExecution,
  onToggleTriggers,
  onToggleChats,
  onZoomIn,
  onZoomOut,
  onResetZoom,
  onFitToScreen,
  zoomLevel,
  isRunning,
  hasUnsavedChanges,
  onToggleGrid,
  onToggleSnapToGrid,
  onGridSizeChange,
  onThemeChange,
  onAutoSaveChange,
  className = "",
  isSaving = false,
  saveError = null,
}) => {
  const [runTime, setRunTime] = useState(0);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<WorkspaceSettings>(DEFAULT_SETTINGS);

  // Load persisted settings once on mount and propagate to the parent.
  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem('workflowSettings');
    } catch {
      saved = null;
    }
    if (!saved) return;

    try {
      const merged = normalizeSettings(JSON.parse(saved));
      setSettings(merged);
      onThemeChange?.(merged.theme);
      onAutoSaveChange?.(merged.autoSave);
      onToggleGrid?.(merged.showGrid);
      onToggleSnapToGrid?.(merged.snapToGrid);
      onGridSizeChange?.(merged.gridSize);
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Run timer.
  useEffect(() => {
    if (!isRunning) {
      setRunTime(0);
      return;
    }
    const interval: ReturnType<typeof setInterval> = setInterval(
      () => setRunTime((prev) => prev + 1),
      1000
    );
    return () => clearInterval(interval);
  }, [isRunning]);

  // Auto-save (debounced) when enabled.
  useEffect(() => {
    if (!(settings.autoSave && hasUnsavedChanges && !isSaving)) return;
    const timer = setTimeout(() => {
      onSave();
    }, 3000);
    return () => clearTimeout(timer);
  }, [hasUnsavedChanges, settings.autoSave, isSaving, onSave]);

  const handleThemeChange = (theme: 'light' | 'dark') => {
    setSettings((prev) => ({ ...prev, theme }));
    onThemeChange?.(theme);
  };

  const handleAutoSaveChange = (autoSave: boolean) => {
    setSettings((prev) => ({ ...prev, autoSave }));
    onAutoSaveChange?.(autoSave);
  };

  const handleShowGridChange = (showGrid: boolean) => {
    setSettings((prev) => ({ ...prev, showGrid }));
    onToggleGrid?.(showGrid);
  };

  const handleSnapToGridChange = (snapToGrid: boolean) => {
    setSettings((prev) => ({ ...prev, snapToGrid }));
    onToggleSnapToGrid?.(snapToGrid);
  };

  const handleGridSizeChange = (gridSize: number) => {
    const next = clampGridSize(gridSize);
    setSettings((prev) => ({ ...prev, gridSize: next }));
    onGridSizeChange?.(next);
  };

  const hasCustomSettings =
    settings.theme !== DEFAULT_SETTINGS.theme ||
    settings.autoSave !== DEFAULT_SETTINGS.autoSave ||
    settings.showGrid !== DEFAULT_SETTINGS.showGrid ||
    settings.snapToGrid !== DEFAULT_SETTINGS.snapToGrid ||
    settings.gridSize !== DEFAULT_SETTINGS.gridSize;

  const showZoom = zoomLevel !== undefined || !!onZoomIn || !!onZoomOut;

  return (
    <>
      <header
        className={`relative z-50 h-[64px] flex items-center justify-between px-5 bg-[rgba(10,15,25,0.82)] supports-[backdrop-filter]:backdrop-blur-xl border-b border-white/[0.04] shadow-sm transition-all duration-300 ease-out ${className}`}
      >
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent pointer-events-none" />
        <div className="absolute inset-x-0 top-0 h-6 bg-gradient-to-b from-white/[0.03] to-transparent pointer-events-none" />

        <div className="flex-1 flex items-center justify-start min-w-0 pr-4">
          <div className="flex items-center gap-3 group cursor-default min-w-0">
            <AppLogo />
            <div className="flex flex-col justify-center min-w-0">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                  AutoFlow
                </span>
                {hasUnsavedChanges && (
                  <span className="flex h-1.5 w-1.5 relative shrink-0" title="Unsaved changes">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-cyan-500" />
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 min-w-0 mt-0.5">
                <h1 className="text-[14px] font-semibold text-slate-100 tracking-[-0.01em] leading-none truncate">
                  {workflowName || "Unnamed Workflow"}
                </h1>
                {isRunning && (
                  <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/15 text-emerald-300 text-[10px] font-medium shrink-0">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(74,222,128,0.6)]" />
                    Live
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="flex-none flex items-center justify-center gap-4">
          <div className="flex items-center p-1 bg-[#131825]/55 backdrop-blur-md rounded-lg border border-white/5 shadow-[inset_0_1px_1px_rgba(255,255,255,0.02)]">
            <ActionButton icon={Icons.FilePlus} label="New" onClick={onNewWorkflow} />
            <div className="w-px h-3.5 bg-white/10 mx-1 rounded-full" />
            <ActionButton icon={Icons.FolderOpen} label="Load" onClick={onLoad} />
            <div className="w-px h-3.5 bg-white/10 mx-1 rounded-full" />
            <SaveButton
              hasChanges={hasUnsavedChanges}
              isSaving={isSaving}
              saveError={saveError}
              onClick={onSave}
            />
          </div>

          <div className="flex items-center">
            {isRunning ? (
              <button
                type="button"
                onClick={onStop}
                aria-label="Stop process"
                className="group relative overflow-hidden px-4 py-1.5 bg-[#1A0B10] border border-rose-500/30 rounded-lg flex items-center gap-2.5 active:scale-95 transition-all duration-200 hover:bg-rose-950/35 hover:border-rose-500/45 shadow-[0_0_14px_rgba(244,63,94,0.12)]"
              >
                <div className="relative flex items-center justify-center w-2 h-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-sm bg-rose-400 opacity-75" />
                  <Icons.Square className="w-2 h-2 fill-rose-500 text-rose-500 relative z-10" />
                </div>
                <span className="text-[12px] font-semibold text-rose-400 tracking-wide">Stop Process</span>
                <div className="w-px h-3 bg-rose-500/30" />
                <span className="font-mono text-[11px] font-medium text-rose-300/80 w-8 text-right tabular-nums">
                  {formatTime(runTime)}
                </span>
              </button>
            ) : (
              <button
                type="button"
                onClick={onRun}
                disabled={isSaving}
                aria-label="Execute workflow"
                className="group relative px-5 py-1.5 bg-gradient-to-r from-cyan-500 to-blue-600 text-white rounded-lg flex items-center gap-2 active:scale-95 transition-all duration-300 border border-cyan-400/25 hover:border-cyan-300/45 shadow-[0_0_14px_rgba(6,182,212,0.18)] hover:shadow-[0_0_18px_rgba(6,182,212,0.28)] overflow-hidden disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-[0_0_14px_rgba(6,182,212,0.18)]"
              >
                <div className="absolute inset-0 bg-white/10 group-hover:translate-x-full transition-transform duration-500 ease-in-out -skew-x-12 -ml-6 w-1/2 opacity-0 group-hover:opacity-100" />
                <Icons.Play className="w-[14px] h-[14px] fill-white drop-shadow-sm relative z-10" />
                <span className="text-[12px] font-semibold tracking-wide drop-shadow-sm relative z-10">
                  Execute Workflow
                </span>
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 flex items-center justify-end gap-3 min-w-0 pl-4">
          {showZoom && (
            <>
              <ZoomControls
                zoomLevel={zoomLevel}
                onZoomIn={onZoomIn}
                onZoomOut={onZoomOut}
                onResetZoom={onResetZoom}
                onFitToScreen={onFitToScreen}
              />
              <div className="h-4 w-px bg-white/10 rounded-full mx-1" />
            </>
          )}

          <div className="flex items-center gap-0.5 p-1 bg-[#131825]/55 backdrop-blur-md rounded-lg border border-white/5 shadow-[inset_0_1px_1px_rgba(255,255,255,0.02)]">
            <ToggleIconButton icon={Icons.Database} onClick={onToggleVariables} title="Variables" />
            <ToggleIconButton icon={Icons.Zap} onClick={onToggleTriggers} title="Triggers" />
            <ToggleIconButton icon={Icons.TerminalSquare} onClick={onToggleExecution} title="Console" />
            <ToggleIconButton icon={Icons.Bot} onClick={onToggleChats} title="AI Assistant" />
          </div>

          <div className="h-4 w-px bg-white/10 rounded-full mx-1" />

          <button
            type="button"
            onClick={() => setIsSettingsOpen(true)}
            className={`relative p-2 rounded-lg border transition-all duration-200 ease-out flex items-center justify-center group
              ${
                hasCustomSettings
                  ? 'text-indigo-300 bg-indigo-500/10 border-indigo-500/30 hover:bg-indigo-500/20'
                  : 'text-slate-400 border-white/5 hover:border-white/10 hover:text-white hover:bg-white/5'
              }`}
            title="Settings"
            aria-label="Open settings"
            aria-haspopup="dialog"
          >
            <Icons.Settings className="w-[16px] h-[16px] group-hover:rotate-45 transition-transform duration-500" strokeWidth={1.5} />
            {hasCustomSettings && (
              <span className="absolute top-1 right-1 w-1.5 h-1.5 bg-indigo-500 rounded-full shadow-[0_0_4px_rgba(99,102,241,0.8)] border border-[#0B0F19]" />
            )}
          </button>
        </div>
      </header>

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onThemeChange={handleThemeChange}
        onAutoSaveChange={handleAutoSaveChange}
        onShowGridChange={handleShowGridChange}
        onSnapToGridChange={handleSnapToGridChange}
        onGridSizeChange={handleGridSizeChange}
        currentSettings={settings}
      />
    </>
  );
};

export default Header;