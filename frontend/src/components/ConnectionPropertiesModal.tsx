import React, { useState, useEffect, useCallback, useRef } from 'react';
import * as Icons from 'lucide-react';
import { Connection, WorkflowAction } from '../types/workflow';
import { getOutputPorts } from '../lib/ports';

interface Props {
  connection: Connection | null;
  actions: WorkflowAction[];
  isOpen: boolean;
  onClose: () => void;
  onSave: (connection: Connection) => void;
}

const ConnectionPropertiesModal: React.FC<Props> = ({
  connection,
  actions,
  isOpen,
  onClose,
  onSave
}) => {
  const [formData, setFormData] = useState({
    label: '',
    condition: '',
    sourcePort: '',
    targetPort: '',
    priority: 1,
    description: '',
    color: '#6366f1',
    style: 'straight'
  });
  const [activeTab, setActiveTab] = useState<'basic' | 'condition' | 'style'>('basic');

  // The outputs this connection's SOURCE step actually declares.
  //
  // This list used to be three hardcoded strings — "Success Stream", "Error
  // Stream", "Timeout Flow" — that no step ever produced and the executor never
  // read. Choosing one changed nothing. Deriving it from the source step means
  // the choices are always the real branches of the step in front of the user,
  // and a step with a single output correctly offers nothing to choose.

  const [conditionError, setConditionError] = useState<string | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (connection) {
      setFormData({
        label: connection.label || '',
        condition: connection.condition || '',
        sourcePort: connection.sourcePort || '',
        targetPort: connection.targetPort || '',
        priority: (connection as any).priority || 1,
        description: (connection as any).description || '',
        color: (connection as any).color || '#6366f1',
        style: (connection as any).style || 'straight'
      });
      setHasUnsavedChanges(false);
      setConditionError(null);
    }
  }, [connection]);

  // Handle ESC to close and outside click
  useEffect(() => {
    const handleEscapeKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    const handleClickOutside = (event: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscapeKey);
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('keydown', handleEscapeKey);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose]);

  const handleChange = useCallback((field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setHasUnsavedChanges(true);

    if (field === 'condition') {
      setConditionError(null);
    }
  }, []);

  const validateCondition = useCallback((condition: string) => {
    if (!condition.trim()) return true;

    try {
      // Basic syntax validation
      new Function('data', `return ${condition}`);
      return true;
    } catch (error: any) {
      setConditionError(`Invalid syntax: ${error.message}`);
      return false;
    }
  }, []);

  const handleSave = useCallback(() => {
    if (!connection) return;

    if (formData.condition && !validateCondition(formData.condition)) {
      return;
    }

    // NOTE: spread `formData` FIRST so the trimmed/normalized fields below
    // override the raw values (previously `...formData` came last and silently
    // undid the trimming + the `condition -> undefined` normalization).
    const updatedConnection: Connection = {
      ...connection,
      ...formData,
      label: formData.label.trim(),
      condition: formData.condition.trim() || undefined,
      sourcePort: formData.sourcePort.trim(),
      targetPort: formData.targetPort.trim(),
    };

    onSave(updatedConnection);
  }, [connection, formData, onSave, validateCondition]);

  const sourceAction = actions.find(a => a.id === connection?.sourceId);
  const targetAction = actions.find(a => a.id === connection?.targetId);
  const availablePorts = getOutputPorts(sourceAction as any);

  if (!isOpen || !connection) return null;

  return (
    <div className="fixed inset-0 bg-[#020617]/90 backdrop-blur-xl flex items-center justify-center z-[100] p-4">
      <div
        ref={modalRef}
        className="bg-[#0A0D14] border border-white/[0.08] rounded-[24px] shadow-[0_20px_60px_rgba(0,0,0,0.8)] w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] relative"
      >
        {/* Decorative background glow */}
        <div className="absolute top-0 right-1/4 w-96 h-32 bg-indigo-500/10 blur-[80px] pointer-events-none rounded-full" />

        {/* Premium Header */}
        <div className="flex flex-col pt-6 pb-5 px-7 border-b border-white/[0.06] bg-white/[0.01] shrink-0 relative z-10">
          <div className="flex items-start justify-between mb-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-[14px] bg-gradient-to-br from-indigo-500/20 to-purple-500/20 border border-white/10 flex items-center justify-center shadow-[inset_0_1px_1px_rgba(255,255,255,0.1),0_4px_10px_rgba(0,0,0,0.2)]">
                <Icons.GitMerge className="w-6 h-6 text-indigo-400 drop-shadow-md" />
              </div>
              <div>
                <h2 className="text-[17px] font-bold text-slate-100 leading-tight tracking-wide">Connection Rules</h2>
                <p className="text-[12px] font-medium text-slate-400 mt-1 uppercase tracking-widest">Routing & Appearance</p>
              </div>
            </div>
            <button onClick={onClose} className="p-2.5 text-slate-500 hover:text-slate-200 hover:bg-white/[0.08] rounded-xl transition-all hover:shadow-sm">
              <Icons.X className="w-5 h-5" />
            </button>
          </div>

          {/* Connection Visualizer - Polished */}
          <div className="flex items-center justify-between bg-[#050816]/80 rounded-2xl border border-white/[0.06] p-4 shadow-inner relative overflow-hidden">
            {/* Subtle grid background for the visualizer */}
            <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'radial-gradient(white 1px, transparent 1px)', backgroundSize: '16px 16px' }} />

            <div className="flex items-center gap-3 w-[35%] relative z-10">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0 border border-emerald-500/20 shadow-[inset_0_1px_1px_rgba(255,255,255,0.05)]">
                <Icons.Play className="w-4 h-4 text-emerald-400 ml-0.5" />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-0.5">Source</span>
                <span className="font-bold text-[13px] text-slate-200 truncate tracking-wide" title={sourceAction?.name}>
                  {sourceAction?.name || 'Unknown Source'}
                </span>
              </div>
            </div>

            <div className="flex-1 flex flex-col items-center justify-center px-4 relative z-10">
              <div className="w-full h-[2px] bg-white/[0.08] relative rounded-full">
                <div className="absolute top-0 left-0 h-full w-2/3 bg-gradient-to-r from-emerald-500/0 via-indigo-500/80 to-indigo-500/0 blur-[3px]"></div>
                <div className="absolute top-0 left-0 h-full w-1/2 bg-gradient-to-r from-transparent via-indigo-400 to-transparent animate-[pulse_2s_ease-in-out_infinite]"></div>
              </div>
            </div>

            <div className="flex items-center gap-3 justify-end w-[35%] relative z-10">
              <div className="flex flex-col items-end min-w-0 text-right">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-0.5">Target</span>
                <span className="font-bold text-[13px] text-slate-200 truncate tracking-wide" title={targetAction?.name}>
                  {targetAction?.name || 'Unknown Target'}
                </span>
              </div>
              <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center shrink-0 border border-indigo-500/20 shadow-[inset_0_1px_1px_rgba(255,255,255,0.05)]">
                <Icons.Target className="w-4 h-4 text-indigo-400" />
              </div>
            </div>
          </div>
        </div>

        {/* Tab Navigation - Modern Minimalist */}
        <div className="flex border-b border-white/[0.06] bg-black/10 px-5 pt-1 shrink-0 relative z-10">
          {[
            { id: 'basic', label: 'Routing', icon: Icons.Waypoints },
            { id: 'condition', label: 'Condition logic', icon: Icons.Code2 },
            { id: 'style', label: 'Appearance', icon: Icons.Palette }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`
                flex items-center justify-center gap-2 px-6 pb-3.5 pt-2 text-[12px] font-bold tracking-wide transition-all duration-300 relative
                ${activeTab === tab.id
                  ? 'text-indigo-400'
                  : 'text-slate-500 hover:text-slate-300'
                }
              `}
            >
              <tab.icon className={`w-4 h-4 ${activeTab === tab.id ? 'drop-shadow-sm' : ''}`} />
              {tab.label}
              {activeTab === tab.id && (
                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-3/4 h-[3px] bg-indigo-500 rounded-t-full shadow-[0_-2px_10px_rgba(99,102,241,0.6)]" />
              )}
            </button>
          ))}
        </div>

        {/* Content Area */}
        <div className="p-7 overflow-y-auto flex-1 custom-scrollbar relative z-10 bg-white/[0.01]">

          {/* Routing Tab */}
          {activeTab === 'basic' && (
            <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-300">

              {/* Properties Section */}
              <div className="space-y-5">
                <div className="flex items-center gap-2 px-1">
                   <Icons.Settings2 className="w-4 h-4 text-slate-400" />
                   <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Connection Settings</h3>
                </div>

                <div className="grid grid-cols-2 gap-6 bg-white/[0.02] p-5 rounded-[20px] border border-white/[0.04] shadow-sm">
                  <div className="space-y-2">
                    <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest flex justify-between">
                      Label Text
                      <span className="text-slate-500 font-medium normal-case tracking-normal">Visible on canvas</span>
                    </label>
                    <input
                      type="text"
                      value={formData.label}
                      onChange={(e) => handleChange('label', e.target.value)}
                      placeholder="e.g. Success Path"
                      className="w-full px-4 py-2.5 bg-[#050816]/60 text-slate-200 rounded-xl border border-white/[0.08] focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 focus:outline-none text-[13px] font-medium transition-all shadow-inner placeholder:text-slate-600"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest flex justify-between">
                      Execution Priority
                      <span className="text-slate-500 font-medium normal-case tracking-normal">1 is highest</span>
                    </label>
                    <div className="relative group">
                      <input
                        type="number"
                        value={formData.priority}
                        onChange={(e) => handleChange('priority', Number(e.target.value))}
                        min="1" max="10"
                        className="w-full pl-4 pr-10 py-2.5 bg-[#050816]/60 text-slate-200 rounded-xl border border-white/[0.08] focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 focus:outline-none text-[13px] font-medium transition-all shadow-inner"
                      />
                      <Icons.ListOrdered className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 group-focus-within:text-indigo-400 transition-colors pointer-events-none" />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">
                      {availablePorts.length > 0 ? 'Which Output Feeds This Step' : 'Source Port'}
                    </label>
                    <div className="relative group">
                      <select
                        value={formData.sourcePort}
                        onChange={(e) => handleChange('sourcePort', e.target.value)}
                        disabled={availablePorts.length === 0}
                        className="w-full pl-4 pr-10 py-2.5 bg-[#050816]/60 text-slate-200 rounded-xl border border-white/[0.08] focus:border-indigo-500/50 focus:outline-none text-[13px] font-medium transition-all appearance-none shadow-inner cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <option value="">
                          {availablePorts.length > 0 ? 'Entire result (all branches)' : 'Default Output'}
                        </option>
                        {availablePorts.map((port) => (
                          <option key={port.id} value={port.id}>
                            {port.label}
                          </option>
                        ))}
                      </select>
                      <Icons.ChevronDown className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 group-hover:text-indigo-400 transition-colors pointer-events-none" />
                    </div>
                    <p className="text-[11px] text-slate-500 leading-relaxed">
                      {availablePorts.length === 0
                        ? 'This step has a single output, so the whole result is passed on.'
                        : (availablePorts.find((port) => port.id === formData.sourcePort)?.description
                            ?? 'Leave on "Entire result" to pass the complete output, exactly as saved workflows do today.')}
                    </p>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Target Port</label>
                    <div className="relative group">
                      <select
                        value={formData.targetPort}
                        onChange={(e) => handleChange('targetPort', e.target.value)}
                        className="w-full pl-4 pr-10 py-2.5 bg-[#050816]/60 text-slate-200 rounded-xl border border-white/[0.08] focus:border-indigo-500/50 focus:outline-none text-[13px] font-medium transition-all appearance-none shadow-inner cursor-pointer"
                      >
                        <option value="">Default Input</option>
                        <option value="trigger">Trigger Event</option>
                        <option value="data">Data Payload</option>
                        <option value="config">Configuration</option>
                      </select>
                      <Icons.ChevronDown className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 group-hover:text-indigo-400 transition-colors pointer-events-none" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Metadata Section */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 px-1">
                   <Icons.FileText className="w-4 h-4 text-slate-400" />
                   <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Documentation</h3>
                </div>
                <div className="space-y-2 bg-white/[0.02] p-5 rounded-[20px] border border-white/[0.04] shadow-sm">
                  <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Internal Notes</label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => handleChange('description', e.target.value)}
                    placeholder="Explain the purpose of this routing path for your team..."
                    rows={3}
                    className="w-full px-4 py-3 bg-[#050816]/60 text-slate-200 rounded-xl border border-white/[0.08] focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 focus:outline-none text-[13px] transition-all resize-none shadow-inner placeholder:text-slate-600 leading-relaxed"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Condition Tab */}
          {activeTab === 'condition' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300 flex flex-col h-full">

              <div className="p-4 bg-gradient-to-r from-indigo-500/10 to-transparent border-l-4 border-indigo-500 rounded-r-xl shadow-sm">
                <div className="flex items-start gap-3.5">
                  <Icons.TerminalSquare className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-[14px] font-bold text-indigo-100 tracking-wide">JavaScript Condition Engine</h4>
                    <p className="text-[12px] font-medium text-indigo-200/60 mt-1.5 leading-relaxed">
                      Write an expression that evaluates to <code className="bg-black/40 px-1.5 py-0.5 rounded text-indigo-300 font-mono text-[11px] border border-white/5">true</code> to allow data flow.
                      The source node's output is available via the <code className="bg-black/40 px-1.5 py-0.5 rounded text-indigo-300 font-mono text-[11px] border border-white/5">data</code> object.
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-2 flex-1 flex flex-col min-h-[200px]">
                <div className="flex items-center justify-between px-1">
                  <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Expression Rule</label>
                  {conditionError && (
                    <span className="text-[10px] font-bold text-rose-400 flex items-center gap-1.5 bg-rose-500/10 px-2 py-0.5 rounded-md border border-rose-500/20 uppercase tracking-wider">
                      <Icons.AlertTriangle className="w-3 h-3" /> Syntax Error
                    </span>
                  )}
                </div>
                <div className="relative flex-1 bg-[#050816]/90 rounded-2xl border border-white/[0.08] overflow-hidden shadow-inner flex flex-col focus-within:border-indigo-500/50 focus-within:ring-1 focus-within:ring-indigo-500/50 transition-all">
                  {/* Line Numbers Gutter */}
                  <div className="absolute top-0 left-0 bottom-0 w-10 bg-black/40 border-r border-white/5 flex flex-col items-center pt-4 text-[12px] font-mono text-slate-600 select-none pointer-events-none">
                    <span>1</span><span>2</span><span>3</span><span>4</span><span>5</span>
                  </div>
                  <textarea
                    value={formData.condition}
                    onChange={(e) => handleChange('condition', e.target.value)}
                    onBlur={() => formData.condition && validateCondition(formData.condition)}
                    placeholder={"// Example:\ndata.status === 'success' && data.count > 0"}
                    spellCheck="false"
                    className={`
                      w-full h-full min-h-[160px] pl-14 pr-4 py-4 bg-transparent text-emerald-400 font-mono text-[13px] leading-relaxed resize-none focus:outline-none placeholder:text-slate-600 placeholder:italic
                      ${conditionError ? 'bg-rose-950/10' : ''}
                    `}
                  />
                </div>
                {conditionError && (
                  <p className="text-[11px] font-medium text-rose-400 mt-1.5 px-1 flex items-center gap-1.5">
                    <Icons.XCircle className="w-3.5 h-3.5" />
                    {conditionError}
                  </p>
                )}
              </div>

              <div className="space-y-4 pt-2">
                <div className="flex items-center gap-2 px-1">
                   <Icons.Code className="w-4 h-4 text-slate-400" />
                   <h5 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Quick Snippets</h5>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  {[
                    { label: 'Success Only', code: 'data.status === "success"' },
                    { label: 'Array Not Empty', code: 'data && data.length > 0' },
                    { label: 'Specific Value', code: 'data.result === "completed"' },
                    { label: 'Numeric Range', code: 'data.count >= 5 && data.count <= 100' }
                  ].map((example, index) => (
                    <button
                      key={index}
                      onClick={() => handleChange('condition', example.code)}
                      className="text-left p-4 bg-white/[0.02] hover:bg-indigo-500/10 border border-white/[0.04] hover:border-indigo-500/30 rounded-2xl transition-all duration-300 ease-out group flex flex-col gap-2 shadow-sm hover:shadow-md"
                    >
                      <div className="text-[12px] font-bold tracking-wide text-slate-300 group-hover:text-indigo-300 transition-colors flex items-center justify-between">
                        {example.label}
                        <div className="w-5 h-5 rounded-md bg-indigo-500/10 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                          <Icons.Plus className="w-3 h-3 text-indigo-400" />
                        </div>
                      </div>
                      <code className="text-[11px] font-medium text-slate-500 group-hover:text-indigo-200/80 font-mono truncate w-full block transition-colors">{example.code}</code>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Style Tab */}
          {activeTab === 'style' && (
            <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-300">

              {/* Live Preview */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 px-1">
                   <Icons.Eye className="w-4 h-4 text-slate-400" />
                   <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Live Preview</h3>
                </div>
                <div className="p-8 bg-[#050816]/90 rounded-2xl border border-white/[0.06] shadow-inner relative overflow-hidden flex items-center justify-center min-h-[160px]">
                  {/* Premium Grid background */}
                  <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'radial-gradient(white 1px, transparent 1px)', backgroundSize: '24px 24px' }}></div>

                  <svg width="100%" height="100" viewBox="0 0 340 100" className="relative z-10 overflow-visible">
                    <defs>
                      <marker id="preview-arrow-styled" markerWidth="12" markerHeight="12" refX="10" refY="6" orient="auto" markerUnits="strokeWidth">
                        <path d="M0,2 L0,10 L10,6 z" fill={formData.color} />
                      </marker>
                      <filter id="glow-preview-strong" x="-20%" y="-20%" width="140%" height="140%">
                        <feGaussianBlur stdDeviation="4" result="blur" />
                        <feMerge>
                          <feMergeNode in="blur" />
                          <feMergeNode in="SourceGraphic" />
                        </feMerge>
                      </filter>
                    </defs>

                    {/* Dummy Nodes - Styled like Canvas */}
                    <rect x="10" y="30" width="40" height="40" rx="10" fill="#0B0F19" stroke="rgba(255,255,255,0.1)" strokeWidth="1" className="shadow-lg" />
                    <circle cx="30" cy="50" r="8" fill="rgba(255,255,255,0.05)" />

                    <rect x="290" y="30" width="40" height="40" rx="10" fill="#0B0F19" stroke="rgba(255,255,255,0.1)" strokeWidth="1" className="shadow-lg" />
                    <circle cx="310" cy="50" r="8" fill="rgba(255,255,255,0.05)" />

                    {/* The Line */}
                    <path
                      d={formData.style === 'straight'
                        ? 'M 50 50 L 290 50'
                        : formData.style === 'step'
                        ? 'M 50 50 H 170 V 50 H 290'
                        : 'M 50 50 C 130 50, 210 50, 290 50'
                      }
                      stroke={formData.color}
                      strokeWidth="3"
                      fill="none"
                      markerEnd="url(#preview-arrow-styled)"
                      filter="url(#glow-preview-strong)"
                      className="animate-[dash_3s_linear_infinite]"
                      strokeDasharray="8,6"
                    />
                    {/* Inner core for brightness */}
                    <path
                      d={formData.style === 'straight'
                        ? 'M 50 50 L 290 50'
                        : formData.style === 'step'
                        ? 'M 50 50 H 170 V 50 H 290'
                        : 'M 50 50 C 130 50, 210 50, 290 50'
                      }
                      stroke="#ffffff"
                      strokeWidth="1"
                      fill="none"
                      opacity="0.3"
                      className="animate-[dash_3s_linear_infinite]"
                      strokeDasharray="8,6"
                    />

                    {formData.label && (
                      <g transform="translate(170, 35)">
                        <rect x="-45" y="-14" width="90" height="24" rx="6" fill="#0B0F19" fillOpacity="0.9" stroke="rgba(255,255,255,0.1)" />
                        <text x="0" y="1" textAnchor="middle" dominantBaseline="middle" className="text-[11px] font-bold tracking-wide" fill="#e2e8f0">
                          {formData.label.length > 12 ? formData.label.slice(0, 10) + '..' : formData.label}
                        </text>
                      </g>
                    )}
                  </svg>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-8 bg-white/[0.02] p-5 rounded-[20px] border border-white/[0.04] shadow-sm">

                {/* Routing Style Selection */}
                <div className="space-y-4">
                  <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Routing Path</label>
                  <div className="space-y-2.5">
                    {[
                      { id: 'straight', name: 'Straight Line', desc: 'Direct A to B connection', icon: Icons.ArrowRight },
                      { id: 'curved', name: 'Bezier Curve', desc: 'Smooth flowing organic path', icon: Icons.Activity },
                      { id: 'step', name: 'Orthogonal Step', desc: 'Right angles only', icon: Icons.CornerDownRight }
                    ].map(styleOption => (
                      <button
                        key={styleOption.id}
                        onClick={() => handleChange('style', styleOption.id)}
                        className={`w-full flex items-center justify-between p-3.5 rounded-xl border transition-all duration-300 ease-out group ${
                          formData.style === styleOption.id
                            ? 'bg-indigo-500/10 border-indigo-500/40 shadow-[inset_0_1px_1px_rgba(255,255,255,0.1),0_0_15px_rgba(99,102,241,0.15)]'
                            : 'bg-[#050816]/50 border-white/[0.06] hover:border-white/[0.15] hover:bg-white/[0.02]'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center border transition-colors ${formData.style === styleOption.id ? 'bg-indigo-500/20 border-indigo-500/30' : 'bg-white/5 border-transparent group-hover:bg-white/10'}`}>
                            <styleOption.icon className={`w-4 h-4 ${formData.style === styleOption.id ? 'text-indigo-400' : 'text-slate-400 group-hover:text-slate-300'}`} />
                          </div>
                          <div className="text-left">
                            <div className={`text-[13px] font-bold tracking-wide leading-tight transition-colors ${formData.style === styleOption.id ? 'text-indigo-200' : 'text-slate-200'}`}>{styleOption.name}</div>
                            <div className="text-[10px] font-medium text-slate-500 mt-0.5">{styleOption.desc}</div>
                          </div>
                        </div>
                        <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors ${formData.style === styleOption.id ? 'border-indigo-500' : 'border-slate-600 group-hover:border-slate-400'}`}>
                          {formData.style === styleOption.id && <div className="w-2 h-2 rounded-full bg-indigo-500" />}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Color Selection */}
                <div className="space-y-4">
                  <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Line Accent Color</label>
                  <div className="space-y-5">

                    <div className="flex items-center gap-3 bg-[#050816]/50 p-2 rounded-xl border border-white/[0.06]">
                      <div className="relative overflow-hidden rounded-lg w-10 h-10 border border-white/10 shrink-0 shadow-inner group cursor-pointer">
                        <input
                          type="color"
                          value={formData.color}
                          onChange={(e) => handleChange('color', e.target.value)}
                          className="absolute -inset-2 w-14 h-14 cursor-pointer"
                        />
                      </div>
                      <input
                        type="text"
                        value={formData.color}
                        onChange={(e) => handleChange('color', e.target.value)}
                        className="flex-1 px-3 py-2 bg-transparent text-slate-200 focus:outline-none font-mono text-[13px] font-bold uppercase"
                      />
                    </div>

                    <div className="pt-1">
                      <div className="text-[10px] font-bold text-slate-500 mb-3 uppercase tracking-widest px-1">Brand Presets</div>
                      <div className="grid grid-cols-4 gap-3 px-1">
                        {[
                          '#6366f1', // Indigo
                          '#8b5cf6', // Violet
                          '#d946ef', // Fuchsia
                          '#f43f5e', // Rose
                          '#f59e0b', // Amber
                          '#10b981', // Emerald
                          '#06b6d4', // Cyan
                          '#64748b'  // Slate
                        ].map(color => (
                          <button
                            key={color}
                            onClick={() => handleChange('color', color)}
                            className={`
                              w-full aspect-square rounded-xl border transition-all duration-300 ease-out shadow-inner relative
                              hover:scale-110 focus:outline-none
                              ${formData.color.toLowerCase() === color.toLowerCase()
                                ? 'border-white scale-110 shadow-[0_0_15px_rgba(255,255,255,0.4)] z-10'
                                : 'border-white/10 hover:border-white/50'
                              }
                            `}
                            style={{ backgroundColor: color }}
                            title={color}
                          >
                            {formData.color.toLowerCase() === color.toLowerCase() && (
                              <div className="absolute inset-0 flex items-center justify-center">
                                <Icons.Check className="w-4 h-4 text-white drop-shadow-md" />
                              </div>
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between p-6 border-t border-white/[0.06] bg-black/20 shrink-0 relative z-10">
          <div className="flex items-center gap-2 h-6 pl-2">
            {hasUnsavedChanges ? (
              <div className="flex items-center gap-2 text-amber-400 bg-amber-500/10 px-3 py-1.5 rounded-lg border border-amber-500/20 animate-in fade-in shadow-sm">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                </span>
                <span className="text-[10px] font-bold uppercase tracking-widest">Unsaved Changes</span>
              </div>
            ) : (
              <span className="text-[11px] font-bold text-slate-500 tracking-wide">All changes applied</span>
            )}
          </div>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-6 py-2.5 text-[13px] font-bold text-slate-300 hover:text-white bg-white/[0.03] hover:bg-white/[0.08] border border-white/[0.08] rounded-xl transition-all shadow-sm"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!!conditionError}
              className="px-6 py-2.5 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 disabled:from-slate-800 disabled:to-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed text-white text-[13px] font-bold tracking-wide rounded-xl transition-all duration-300 ease-out flex items-center gap-2 shadow-[0_4px_15px_rgba(79,70,229,0.3)] hover:shadow-[0_6px_20px_rgba(79,70,229,0.4)] disabled:shadow-none border border-transparent disabled:border-white/5 active:scale-[0.98]"
            >
              <Icons.CheckCircle2 className="w-4 h-4 drop-shadow-sm" />
              Save Settings
            </button>
          </div>
        </div>

      </div>

      {/* Internal Custom Scrollbar Styles and Animations */}
      <style dangerouslySetInnerHTML={{__html: `
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.15); }

        @keyframes dash {
          to {
            stroke-dashoffset: -14;
          }
        }
      `}} />
    </div>
  );
};

export default ConnectionPropertiesModal;