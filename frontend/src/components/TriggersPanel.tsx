import React, { useState, useEffect } from 'react';
import * as Icons from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';

interface Props {
  isOpen: boolean;
  onToggle: () => void;
  className?: string;
}

// --- Types & Mock Data ---
type TriggerType = 'webhook' | 'schedule' | 'email' | 'file' | 'api';

interface TriggerConfig {
  id: string;
  type: TriggerType;
  name: string;
  isActive: boolean;
  lastTriggered?: string;
  settings: Record<string, any>;
}

const TRIGGER_TEMPLATES = [
  { id: 'webhook', name: 'Webhook', icon: Icons.Webhook, desc: 'Trigger on HTTP request', color: 'text-indigo-400', bg: 'bg-indigo-500/10', border: 'border-indigo-500/20' },
  { id: 'schedule', name: 'Schedule', icon: Icons.Clock, desc: 'Run at specific times (Cron)', color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
  { id: 'email', name: 'Email Received', icon: Icons.Mail, desc: 'Trigger on new email in inbox', color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/20' },
  { id: 'file', name: 'File Upload', icon: Icons.FileUp, desc: 'Trigger when file is added', color: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/20' },
  { id: 'api', name: 'App Event', icon: Icons.Zap, desc: 'Trigger from external app', color: 'text-purple-400', bg: 'bg-purple-500/10', border: 'border-purple-500/20' },
];

type ViewState = 'list' | 'select' | 'config';

const TriggersPanel: React.FC<Props> = ({ isOpen, onToggle, className = "" }) => {
  const [view, setView] = useState<ViewState>('list');
  const [triggers, setTriggers] = useState<TriggerConfig[]>([]);
  const [editingTrigger, setEditingTrigger] = useState<TriggerConfig | null>(null);

  // Reset view when panel closes
  useEffect(() => {
    if (!isOpen) {
      setTimeout(() => setView('list'), 300);
    }
  }, [isOpen]);

  // --- Handlers ---
  const handleStartAdd = () => {
    setView('select');
  };

  const handleSelectType = (typeId: string) => {
    const template = TRIGGER_TEMPLATES.find(t => t.id === typeId);
    if (!template) return;

    const newTrigger: TriggerConfig = {
      id: uuidv4(),
      type: typeId as TriggerType,
      name: template.name,
      isActive: true,
      settings: typeId === 'webhook' ? { url: `https://api.automation.app/hook/${uuidv4().substring(0,8)}`, method: 'POST' } 
               : typeId === 'schedule' ? { cron: '0 * * * *', timezone: 'UTC' } 
               : {}
    };

    setEditingTrigger(newTrigger);
    setView('config');
  };

  const handleEdit = (trigger: TriggerConfig) => {
    setEditingTrigger({ ...trigger });
    setView('config');
  };

  const handleDelete = (id: string) => {
    setTriggers(prev => prev.filter(t => t.id !== id));
  };

  const handleToggleActive = (id: string) => {
    setTriggers(prev => prev.map(t => t.id === id ? { ...t, isActive: !t.isActive } : t));
  };

  const handleSave = () => {
    if (!editingTrigger) return;
    
    setTriggers(prev => {
      const exists = prev.find(t => t.id === editingTrigger.id);
      if (exists) {
        return prev.map(t => t.id === editingTrigger.id ? editingTrigger : t);
      }
      return [...prev, editingTrigger];
    });
    
    setView('list');
    setEditingTrigger(null);
  };

  // --- Renderers ---
  const renderHeader = () => {
    if (view === 'list') {
      return (
        <div className="flex items-center justify-between p-4 border-b border-white/[0.08] bg-black/20 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/30 flex items-center justify-center">
              <Icons.Zap className="w-4 h-4 text-amber-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-slate-100">Triggers</h3>
                <span className="bg-white/10 text-slate-300 text-[10px] px-1.5 py-0.5 rounded-full font-medium">
                  {triggers.length}
                </span>
              </div>
              <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">Workflow Starters</p>
            </div>
          </div>
          <button onClick={onToggle} className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-white/10 rounded-md transition-colors">
            <Icons.X size={16} />
          </button>
        </div>
      );
    }

    return (
      <div className="flex items-center justify-between p-4 border-b border-white/[0.08] bg-black/20 shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={() => setView(view === 'config' && !triggers.find(t => t.id === editingTrigger?.id) ? 'select' : 'list')} className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-white/10 rounded-md transition-colors">
            <Icons.ArrowLeft size={16} />
          </button>
          <h3 className="text-sm font-semibold text-slate-100">
            {view === 'select' ? 'Select Trigger' : 'Configure Trigger'}
          </h3>
        </div>
      </div>
    );
  };

  const renderEmptyState = () => (
    <div className="flex-1 flex flex-col items-center justify-center p-6 text-center animate-in fade-in zoom-in-95 duration-300">
      <div className="w-16 h-16 bg-gradient-to-br from-amber-500/20 to-orange-600/20 rounded-full flex items-center justify-center border border-amber-500/30 mb-4 shadow-[0_0_30px_rgba(245,158,11,0.15)]">
        <Icons.Zap className="w-8 h-8 text-amber-400" />
      </div>
      <h4 className="text-base font-semibold text-slate-200 mb-1">No triggers added</h4>
      <p className="text-xs text-slate-400 mb-6 max-w-[200px] leading-relaxed">
        Add a trigger to define exactly when this workflow should start running.
      </p>
      
      <button 
        onClick={handleStartAdd}
        className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white py-2.5 px-4 rounded-lg font-medium text-sm transition-all shadow-[0_0_15px_rgba(79,70,229,0.3)] hover:shadow-[0_0_20px_rgba(79,70,229,0.5)]"
      >
        <Icons.Plus size={16} /> Add First Trigger
      </button>
      
      <button className="w-full mt-3 flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 text-slate-300 py-2.5 px-4 rounded-lg font-medium text-sm transition-colors border border-white/5">
        <Icons.Sparkles size={16} className="text-purple-400" /> Generate with AI
      </button>
    </div>
  );

  const renderList = () => (
    <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar animate-in slide-in-from-left-4 duration-300">
      <button 
        onClick={handleStartAdd}
        className="w-full flex items-center justify-center gap-2 bg-[#0f172a] hover:bg-[#1e293b] text-indigo-400 border border-indigo-500/30 hover:border-indigo-500/50 py-2.5 px-4 rounded-lg font-medium text-sm transition-all shadow-sm"
      >
        <Icons.Plus size={16} /> Add Trigger
      </button>

      <div className="space-y-3">
        {triggers.map(trigger => {
          const template = TRIGGER_TEMPLATES.find(t => t.id === trigger.type) || TRIGGER_TEMPLATES[0];
          const Icon = template.icon;
          
          return (
            <div key={trigger.id} className={`group bg-[#0f172a]/60 border transition-all duration-200 p-3 rounded-xl shadow-sm hover:shadow-md ${trigger.isActive ? 'border-white/10 hover:border-white/20' : 'border-white/5 opacity-70'}`}>
              
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${template.bg} ${template.color} border ${template.border}`}>
                    <Icon size={16} />
                  </div>
                  <div>
                    <h4 className="text-sm font-medium text-slate-200">{trigger.name}</h4>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <div className={`w-1.5 h-1.5 rounded-full ${trigger.isActive ? 'bg-emerald-400 shadow-[0_0_5px_rgba(52,211,153,0.5)]' : 'bg-slate-500'}`} />
                      <span className="text-[10px] text-slate-400 uppercase tracking-wide">
                        {trigger.isActive ? 'Active' : 'Disabled'}
                      </span>
                    </div>
                  </div>
                </div>
                
                {/* Active Toggle Switch */}
                <button 
                  onClick={() => handleToggleActive(trigger.id)}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${trigger.isActive ? 'bg-emerald-500' : 'bg-slate-700'}`}
                >
                  <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${trigger.isActive ? 'translate-x-4.5' : 'translate-x-1'}`} style={{ transform: trigger.isActive ? 'translateX(18px)' : 'translateX(4px)' }} />
                </button>
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-white/5">
                <span className="text-[11px] text-slate-500 flex items-center gap-1">
                  <Icons.Clock size={12} /> 
                  {trigger.lastTriggered ? `Last: ${trigger.lastTriggered}` : 'Never triggered'}
                </span>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => handleEdit(trigger)} className="p-1.5 text-slate-400 hover:text-indigo-400 hover:bg-indigo-500/10 rounded-md transition-colors">
                    <Icons.Settings2 size={14} />
                  </button>
                  <button onClick={() => handleDelete(trigger.id)} className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-md transition-colors">
                    <Icons.Trash2 size={14} />
                  </button>
                </div>
              </div>

            </div>
          );
        })}
      </div>
    </div>
  );

  const renderSelectType = () => (
    <div className="flex-1 overflow-y-auto p-4 custom-scrollbar animate-in slide-in-from-right-4 duration-300">
      <div className="mb-4">
        <input 
          type="text" 
          placeholder="Search triggers..." 
          className="w-full bg-[#020617]/50 text-slate-200 text-sm px-3 py-2 rounded-lg border border-white/10 focus:border-indigo-500 focus:outline-none"
        />
      </div>
      <div className="space-y-2">
        {TRIGGER_TEMPLATES.map(template => (
          <button 
            key={template.id}
            onClick={() => handleSelectType(template.id)}
            className="w-full flex items-center gap-3 p-3 bg-[#0f172a]/40 hover:bg-[#0f172a]/80 border border-white/5 hover:border-white/10 rounded-xl transition-all text-left group"
          >
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${template.bg} ${template.color} border ${template.border} group-hover:scale-105 transition-transform`}>
              <template.icon size={18} />
            </div>
            <div>
              <h4 className="text-sm font-medium text-slate-200">{template.name}</h4>
              <p className="text-xs text-slate-400">{template.desc}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );

  const renderConfig = () => {
    if (!editingTrigger) return null;
    const template = TRIGGER_TEMPLATES.find(t => t.id === editingTrigger.type);
    const Icon = template?.icon || Icons.Zap;

    return (
      <div className="flex-1 flex flex-col overflow-hidden animate-in slide-in-from-right-4 duration-300">
        <div className="flex-1 overflow-y-auto p-4 space-y-5 custom-scrollbar">
          
          {/* Header Info */}
          <div className="flex items-center gap-3 pb-4 border-b border-white/5">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${template?.bg} ${template?.color} border ${template?.border}`}>
              <Icon size={20} />
            </div>
            <div>
              <h4 className="text-base font-medium text-slate-200">{editingTrigger.name}</h4>
              <p className="text-xs text-slate-400">{template?.desc}</p>
            </div>
          </div>

          {/* Configuration Form */}
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-400">Trigger Name</label>
              <input
                type="text"
                value={editingTrigger.name}
                onChange={(e) => setEditingTrigger({ ...editingTrigger, name: e.target.value })}
                className="w-full bg-[#020617]/50 text-slate-200 text-sm px-3 py-2 rounded-lg border border-white/10 focus:border-indigo-500 focus:outline-none"
              />
            </div>

            {/* Type Specific Fields */}
            {editingTrigger.type === 'webhook' && (
              <>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-400">Webhook URL (Ready to receive)</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      readOnly
                      value={editingTrigger.settings.url}
                      className="flex-1 bg-[#020617]/80 text-emerald-400 font-mono text-xs px-3 py-2 rounded-lg border border-white/10 focus:outline-none"
                    />
                    <button className="px-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-slate-300 transition-colors" title="Copy URL">
                      <Icons.Copy size={14} />
                    </button>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-400">HTTP Method</label>
                  <select className="w-full bg-[#020617]/50 text-slate-200 text-sm px-3 py-2 rounded-lg border border-white/10 focus:border-indigo-500 focus:outline-none appearance-none">
                    <option>POST</option>
                    <option>GET</option>
                    <option>PUT</option>
                    <option>ANY</option>
                  </select>
                </div>
              </>
            )}

            {editingTrigger.type === 'schedule' && (
              <>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-400">Cron Expression</label>
                  <input
                    type="text"
                    value={editingTrigger.settings.cron}
                    onChange={(e) => setEditingTrigger({ ...editingTrigger, settings: { ...editingTrigger.settings, cron: e.target.value } })}
                    className="w-full bg-[#020617]/50 text-slate-200 font-mono text-sm px-3 py-2 rounded-lg border border-white/10 focus:border-indigo-500 focus:outline-none"
                  />
                  <p className="text-[10px] text-slate-500 mt-1">Runs every hour on the hour.</p>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-400">Timezone</label>
                  <select className="w-full bg-[#020617]/50 text-slate-200 text-sm px-3 py-2 rounded-lg border border-white/10 focus:border-indigo-500 focus:outline-none appearance-none">
                    <option>UTC</option>
                    <option>America/New_York</option>
                    <option>Europe/London</option>
                  </select>
                </div>
              </>
            )}

            {/* Generic placeholder for others */}
            {['email', 'file', 'api'].includes(editingTrigger.type) && (
              <div className="p-4 border border-dashed border-white/10 rounded-xl bg-white/5 text-center">
                <Icons.Settings className="w-6 h-6 text-slate-500 mx-auto mb-2" />
                <p className="text-xs text-slate-400">Listen for events automatically.</p>
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-white/[0.08] bg-black/10 flex gap-2 shrink-0">
          <button 
            onClick={() => setView('list')}
            className="flex-1 py-2 bg-white/5 hover:bg-white/10 text-slate-300 rounded-lg text-sm font-medium transition-colors border border-white/5"
          >
            Cancel
          </button>
          <button 
            onClick={handleSave}
            className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium transition-colors shadow-lg"
          >
            Save Trigger
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className={`flex flex-col transition-all duration-300 ease-in-out border-l border-white/[0.08] ${isOpen ? 'w-[340px] opacity-100' : 'w-0 opacity-0 overflow-hidden'} ${className}`}>
      {isOpen && (
        <>
          {renderHeader()}
          {view === 'list' && triggers.length === 0 && renderEmptyState()}
          {view === 'list' && triggers.length > 0 && renderList()}
          {view === 'select' && renderSelectType()}
          {view === 'config' && renderConfig()}
        </>
      )}
    </div>
  );
};

export default TriggersPanel;