import React, { useState } from 'react';
import * as Icons from 'lucide-react';
import { WorkflowVariable } from '../types/workflow';
import { v4 as uuidv4 } from 'uuid';

interface Props {
  variables: WorkflowVariable[];
  isOpen: boolean;
  onToggle: () => void;
  onAdd: (v: WorkflowVariable) => void;
  onUpdate: (v: WorkflowVariable) => void;
  onDelete: (id: string) => void;
  className?: string;
}

const VariablePanel: React.FC<Props> = ({ variables, isOpen, onToggle, onAdd, onUpdate, onDelete, className = "" }) => {
  const [formOpen, setFormOpen] = useState(false);
  const [editingVar, setEditingVar] = useState<WorkflowVariable | null>(null);
  const [newVar, setNewVar] = useState<{
    name: string;
    type: WorkflowVariable['type'];
    value: string;
    description: string;
    isSecret: boolean;
  }>({ 
    name: '', 
    type: 'string', 
    value: '', 
    description: '', 
    isSecret: false 
  });
  const [nameError, setNameError] = useState<string | null>(null);
  const [dictionaryEntries, setDictionaryEntries] = useState<{ key: string; value: string; subtype: 'string' | 'number' | 'boolean' }[]>([{ key: '', value: '', subtype: 'string' }]);

  const handleAdd = () => {
    if (!newVar.name) return;

    // Check for duplicate variable name and type (case-insensitive)
    const nameExists = variables.some(
      (v) => 
        v.name.toLowerCase() === newVar.name.toLowerCase() && 
        v.type === newVar.type && 
        (!editingVar || v.id !== editingVar.id)
    );
    if (nameExists) {
      setNameError('A variable with this name already exists.');
      return;
    }
    
    setNameError(null);
    
    let val: any = newVar.value;
    if (newVar.type === 'number') {
      val = Number(newVar.value);
    } else if (newVar.type === 'boolean') {
      val = newVar.value === 'true';
    } else if (newVar.type === 'object' || newVar.type === 'array') {
      try {
        val = JSON.parse(newVar.value);
      } catch {
        val = newVar.value;
      }
    } else if (newVar.type === 'dictionary') {
      const dict = dictionaryEntries.reduce((acc, entry) => {
        if (entry.key) {
          let formattedValue: any = entry.value;
          if (entry.subtype === 'number') {
            formattedValue = Number(entry.value);
          } else if (entry.subtype === 'boolean') {
            formattedValue = entry.value === 'true';
          }
          acc[entry.key] = formattedValue;
        }
        return acc;
      }, {} as Record<string, any>);
      val = dict;
    }
    
    if (editingVar) {
      onUpdate({ ...editingVar, ...newVar, value: val });
    } else {
      onAdd({ id: uuidv4(), ...newVar, value: val });
    }
    
    resetForm();
  };

  const handleEdit = (variable: WorkflowVariable) => {
    setEditingVar(variable);
    setNewVar({
      name: variable.name,
      type: variable.type,
      value: typeof variable.value === 'object' && variable.type !== 'dictionary' 
        ? JSON.stringify(variable.value, null, 2) 
        : String(variable.value),
      description: variable.description || '',
      isSecret: variable.isSecret || false
    });
    if (variable.type === 'dictionary' && typeof variable.value === 'object') {
      const entries = Object.entries(variable.value);
      if (entries.length > 0) {
        setDictionaryEntries(
          entries.map(([key, value]) => ({
            key,
            value: String(value),
            subtype: typeof value === 'number' ? 'number' : typeof value === 'boolean' ? 'boolean' : 'string'
          }))
        );
      } else {
        setDictionaryEntries([{ key: '', value: '', subtype: 'string' }]);
      }
    } else {
      setDictionaryEntries([{ key: '', value: '', subtype: 'string' }]);
    }
    setFormOpen(true);
    setNameError(null);
  };

  const handleDictionaryEntryChange = (index: number, field: 'key' | 'value' | 'subtype', value: string) => {
    const updatedEntries = [...dictionaryEntries];
    if (field === 'subtype') {
      updatedEntries[index].subtype = value as 'string' | 'number' | 'boolean';
      if (value === 'boolean') {
        updatedEntries[index].value = 'true';
      }
    } else {
      updatedEntries[index][field] = value;
    }
    setDictionaryEntries(updatedEntries);
  };

  const addDictionaryEntry = () => {
    setDictionaryEntries([...dictionaryEntries, { key: '', value: '', subtype: 'string' }]);
  };

  const removeDictionaryEntry = (index: number) => {
    setDictionaryEntries(dictionaryEntries.filter((_, i) => i !== index));
  };

  const resetForm = () => {
    setFormOpen(false);
    setEditingVar(null);
    setNewVar({ name: '', type: 'string', value: '', description: '', isSecret: false });
    setDictionaryEntries([{ key: '', value: '', subtype: 'string' }]);
    setNameError(null);
  };

  const getTypeStyle = (type: string) => {
    switch (type) {
      case 'string': return { icon: <Icons.Type size={14} />, color: 'text-emerald-400', bg: 'bg-emerald-400/10' };
      case 'number': return { icon: <Icons.Hash size={14} />, color: 'text-blue-400', bg: 'bg-blue-400/10' };
      case 'boolean': return { icon: <Icons.ToggleLeft size={14} />, color: 'text-purple-400', bg: 'bg-purple-400/10' };
      case 'object': return { icon: <Icons.Braces size={14} />, color: 'text-orange-400', bg: 'bg-orange-400/10' };
      case 'array': return { icon: <Icons.List size={14} />, color: 'text-amber-400', bg: 'bg-amber-400/10' };
      case 'dictionary': return { icon: <Icons.BookOpen size={14} />, color: 'text-teal-400', bg: 'bg-teal-400/10' };
      default: return { icon: <Icons.Variable size={14} />, color: 'text-slate-400', bg: 'bg-slate-400/10' };
    }
  };

  // Reusable input class for forms
  const inputClass = "w-full bg-[#050816]/50 text-slate-200 text-[13px] px-3.5 py-2.5 rounded-xl border border-white/[0.08] focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 focus:outline-none transition-all shadow-inner placeholder:text-slate-600";

  return (
    <div className={`flex flex-col h-full bg-[#0B0F19]/80 backdrop-blur-3xl shadow-[[-10px_0_30px_rgba(0,0,0,0.5)]] transition-all duration-400 ease-[cubic-bezier(0.16,1,0.3,1)] ${isOpen ? 'w-[340px] opacity-100 translate-x-0' : 'w-0 opacity-0 translate-x-8 overflow-hidden'} ${className}`}>
      {isOpen && (
        <>
          {/* Header Section */}
          <div className="flex flex-col pt-5 pb-4 px-5 relative shrink-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 border border-white/[0.08] flex items-center justify-center shadow-inner">
                  <Icons.Variable className="w-4 h-4 text-indigo-400 drop-shadow-sm" />
                </div>
                <div>
                  <h3 className="text-[15px] font-bold text-slate-100 tracking-wide">Variables</h3>
                  <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest mt-0.5">{variables.length} Configured</p>
                </div>
              </div>
              <button 
                onClick={onToggle} 
                className="p-1.5 text-slate-500 hover:text-slate-200 hover:bg-white/10 rounded-lg transition-all"
                title="Close Panel"
              >
                <Icons.X size={18} />
              </button>
            </div>
            
            {/* Subtle Gradient Separator */}
            <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/[0.08] to-transparent" />
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5 custom-scrollbar">
            
            {/* Main CTA */}
            {!formOpen && (
              <button 
                onClick={() => setFormOpen(true)} 
                className="w-full py-3 px-4 flex items-center justify-center gap-2 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white rounded-xl font-semibold text-[13px] tracking-wide transition-all duration-300 shadow-[0_4px_15px_rgba(79,70,229,0.25)] hover:shadow-[0_6px_25px_rgba(79,70,229,0.4)] hover:scale-[1.01] active:scale-[0.99]"
              >
                <Icons.Plus size={16} /> Create Variable
              </button>
            )}
            
            {/* Add / Edit Form */}
            {formOpen && (
              <div className="bg-white/[0.02] border border-white/[0.08] rounded-2xl p-4.5 space-y-4.5 shadow-xl animate-in fade-in slide-in-from-top-4 duration-300">
                <div className="flex items-center justify-between mb-1">
                  <h4 className="text-[13px] font-bold text-slate-200 tracking-wide flex items-center gap-2">
                    {editingVar ? <Icons.Edit3 size={14} className="text-indigo-400" /> : <Icons.PlusSquare size={14} className="text-indigo-400" />}
                    {editingVar ? 'Edit Variable' : 'New Variable'}
                  </h4>
                </div>

                {/* Name Input */}
                <div className="space-y-2">
                  <label className="text-[11px] font-bold tracking-wider uppercase text-slate-400 flex items-center justify-between">
                    <span>Name <span className="text-red-400/80">*</span></span>
                    {nameError && <span className="text-[10px] text-red-400 normal-case tracking-normal">{nameError}</span>}
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. API_KEY"
                    value={newVar.name}
                    onChange={e => {
                      setNewVar(prev => ({ ...prev, name: e.target.value.toUpperCase().replace(/\s+/g, '_') }));
                      setNameError(null);
                    }}
                    className={`${inputClass} ${nameError ? '!border-red-500/50 focus:!border-red-500/80 focus:!ring-red-500/20' : ''}`}
                    autoFocus
                  />
                </div>
                
                {/* Type Selection */}
                <div className="space-y-2">
                  <label className="text-[11px] font-bold tracking-wider uppercase text-slate-400">Data Type</label>
                  <div className="relative group">
                    <select
                      value={newVar.type}
                      onChange={e => {
                        const newType = e.target.value as any;
                        setNewVar(prev => ({ ...prev, type: newType, value: newType === 'boolean' ? 'true' : '' }));
                        setNameError(null);
                        if (newType !== 'dictionary') {
                          setDictionaryEntries([{ key: '', value: '', subtype: 'string' }]);
                        }
                      }}
                      className={`${inputClass} appearance-none cursor-pointer pr-10`}
                    >
                      <option value="string">String (Text)</option>
                      <option value="number">Number</option>
                      <option value="boolean">Boolean (True/False)</option>
                      <option value="object">JSON Object</option>
                      <option value="array">JSON Array</option>
                      <option value="dictionary">Dictionary (Key-Value)</option>
                    </select>
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500 group-hover:text-indigo-400 transition-colors">
                      <Icons.ChevronDown size={14} />
                    </div>
                  </div>
                </div>
                
                {/* Value Input Area */}
                <div className="space-y-2">
                  <div className="flex flex-col gap-1.5 mb-2">
                    <label className="text-[11px] font-bold tracking-wider uppercase text-slate-400">Default Value</label>
                  </div>

                  {newVar.type === 'boolean' ? (
                     <div className="relative group">
                       <select
                         value={newVar.value}
                         onChange={e => setNewVar(prev => ({ ...prev, value: e.target.value }))}
                         className={`${inputClass} appearance-none cursor-pointer pr-10`}
                       >
                         <option value="true">True</option>
                         <option value="false">False</option>
                       </select>
                       <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500 group-hover:text-indigo-400 transition-colors">
                         <Icons.ChevronDown size={14} />
                       </div>
                     </div>
                  ) : newVar.type === 'dictionary' ? (
                    <div className="space-y-2.5 max-h-56 overflow-y-auto pr-1 custom-scrollbar -mx-1 px-1">
                      {dictionaryEntries.map((entry, index) => (
                        <div key={index} className="bg-white/[0.03] rounded-xl border border-white/[0.06] p-2.5 relative group hover:bg-white/[0.05] transition-colors shadow-sm">
                          {dictionaryEntries.length > 1 && (
                            <button 
                              onClick={() => removeDictionaryEntry(index)} 
                              className="absolute -top-2 -right-2 w-5 h-5 bg-[#0B0F19] text-slate-500 hover:text-red-400 hover:bg-red-500/10 border border-white/10 hover:border-red-500/30 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all z-10"
                              title="Remove Entry"
                            >
                              <Icons.X size={10} />
                            </button>
                          )}
                          <div className="flex gap-2 mb-2">
                            <div className="flex-1">
                              <input
                                type="text"
                                placeholder="Key"
                                value={entry.key}
                                onChange={e => handleDictionaryEntryChange(index, 'key', e.target.value)}
                                className="w-full bg-[#050816]/70 text-slate-200 text-[12px] px-2.5 py-1.5 rounded-lg border border-white/10 focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 focus:outline-none transition-colors"
                              />
                            </div>
                            <div className="relative w-[100px]">
                              <select
                                value={entry.subtype}
                                onChange={e => handleDictionaryEntryChange(index, 'subtype', e.target.value)}
                                className="w-full bg-[#050816]/70 text-slate-300 text-[12px] px-2.5 py-1.5 rounded-lg border border-white/10 focus:border-indigo-500/50 focus:outline-none appearance-none pr-6 cursor-pointer"
                              >
                                <option value="string">String</option>
                                <option value="number">Number</option>
                                <option value="boolean">Bool</option>
                              </select>
                              <Icons.ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
                            </div>
                          </div>
                          
                          {entry.subtype === 'boolean' ? (
                            <div className="relative">
                              <select
                                value={entry.value}
                                onChange={e => handleDictionaryEntryChange(index, 'value', e.target.value)}
                                className="w-full bg-[#050816]/70 text-indigo-200 text-[12px] px-2.5 py-1.5 rounded-lg border border-white/10 focus:border-indigo-500/50 focus:outline-none appearance-none pr-6 cursor-pointer"
                              >
                                <option value="true">True</option>
                                <option value="false">False</option>
                              </select>
                              <Icons.ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
                            </div>
                          ) : (
                            <input
                              type={newVar.isSecret && entry.subtype !== 'number' ? 'password' : (entry.subtype === 'number' ? 'number' : 'text')}
                              placeholder="Value"
                              value={entry.value}
                              onChange={e => handleDictionaryEntryChange(index, 'value', e.target.value)}
                              className="w-full bg-[#050816]/70 text-indigo-200 text-[12px] px-2.5 py-1.5 rounded-lg border border-white/10 focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 focus:outline-none transition-colors font-mono placeholder:font-sans"
                            />
                          )}
                        </div>
                      ))}
                      <button 
                        onClick={addDictionaryEntry} 
                        className="w-full flex items-center justify-center gap-1.5 text-indigo-400 hover:text-indigo-300 bg-indigo-500/10 hover:bg-indigo-500/20 text-xs font-semibold py-2 rounded-xl transition-colors border border-indigo-500/20 border-dashed"
                      >
                        <Icons.Plus size={12} /> Add Key-Value Pair
                      </button>
                    </div>
                  ) : (
                    <textarea
                      placeholder={newVar.type === 'object' ? '{"key": "value"}' : newVar.type === 'array' ? '["item1", "item2"]' : 'Enter value...'}
                      value={newVar.value}
                      onChange={e => setNewVar(prev => ({ ...prev, value: e.target.value }))}
                      rows={newVar.type === 'object' || newVar.type === 'array' ? 4 : 2}
                      className={`${inputClass} font-mono text-[12px] text-indigo-200 resize-none leading-relaxed placeholder:font-sans placeholder:text-[13px]`}
                    />
                  )}
                </div>

                {/* Secret Toggle */}
                <div className="pt-1 pb-2">
                  <div 
                    className="flex items-center gap-3 cursor-pointer group w-max"
                    onClick={() => setNewVar(prev => ({ ...prev, isSecret: !prev.isSecret }))}
                  >
                    <div className={`relative flex items-center justify-center w-8 h-4.5 rounded-full transition-colors duration-300 border ${newVar.isSecret ? 'bg-indigo-500/30 border-indigo-500/50' : 'bg-slate-800/50 border-white/10 group-hover:border-white/20'}`}>
                      <div className={`absolute w-3.5 h-3.5 rounded-full transition-all duration-300 transform shadow-sm ${newVar.isSecret ? 'translate-x-[7px] bg-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.6)]' : '-translate-x-[7px] bg-slate-400'}`} />
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[12px] font-bold text-slate-200 flex items-center gap-1.5">
                        <Icons.Lock size={12} className={newVar.isSecret ? "text-amber-400" : "text-slate-500"}/>
                        Secret Variable
                      </span>
                    </div>
                  </div>
                  <p className="text-[10px] text-slate-500 mt-1 pl-[44px]">Values are masked in the UI and hidden from logs.</p>
                </div>
                
                {/* Description Input */}
                <div className="space-y-2">
                  <label className="text-[11px] font-bold tracking-wider uppercase text-slate-400">
                    Description <span className="text-slate-500 font-medium normal-case tracking-normal ml-1">(Optional)</span>
                  </label>
                  <input
                    type="text"
                    placeholder="What is this used for?"
                    value={newVar.description}
                    onChange={e => setNewVar(prev => ({ ...prev, description: e.target.value }))}
                    className={inputClass}
                  />
                </div>
                
                {/* Actions */}
                <div className="flex gap-3 pt-3">
                  <button 
                    onClick={resetForm} 
                    className="flex-1 bg-white/[0.03] hover:bg-white/[0.08] text-slate-300 px-4 py-2.5 rounded-xl text-[13px] font-semibold transition-all border border-white/[0.05]"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={handleAdd} 
                    className="flex-[2] bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2.5 rounded-xl text-[13px] font-semibold transition-all shadow-[0_0_15px_rgba(79,70,229,0.3)] hover:shadow-[0_0_20px_rgba(79,70,229,0.5)] active:scale-[0.98]"
                  >
                    {editingVar ? 'Save Changes' : 'Create Variable'}
                  </button>
                </div>
              </div>
            )}
            
            {/* Empty State */}
            {!formOpen && variables.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 px-6 text-center border border-dashed border-white/[0.08] rounded-2xl bg-white/[0.01] mt-4">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500/10 to-slate-800/50 flex items-center justify-center mb-4 border border-white/[0.05] shadow-[inset_0_0_20px_rgba(0,0,0,0.5)] relative overflow-hidden">
                  <div className="absolute inset-0 bg-indigo-500/20 blur-xl rounded-full" />
                  <Icons.Code2 className="w-7 h-7 text-indigo-300 relative z-10" />
                </div>
                <h4 className="text-[15px] font-bold text-slate-200 mb-1.5 tracking-wide">No Variables Yet</h4>
                <p className="text-[12px] text-slate-400 leading-relaxed font-medium">
                  Create variables to securely store API keys, configuration, or share data across nodes.
                </p>
              </div>
            )}

            {/* Variable List */}
            {!formOpen && variables.length > 0 && (
              <div className="space-y-3.5 pb-8 mt-2">
                {variables.map(v => {
                  const style = getTypeStyle(v.type);
                  return (
                    <div 
                      key={v.id} 
                      className={`group bg-white/[0.02] border border-white/[0.06] p-3.5 rounded-2xl hover:bg-white/[0.04] hover:border-white/[0.12] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl relative overflow-hidden ${v.isSecret ? 'shadow-[0_0_15px_rgba(245,158,11,0.03)] hover:shadow-[0_4px_20px_rgba(245,158,11,0.08)]' : ''}`}
                    >
                      {/* Subtly colored background hint based on type */}
                      <div className={`absolute inset-0 bg-gradient-to-br from-transparent to-${style.color.split('-')[1]}-500/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none`} />

                      <div className="flex items-start justify-between relative z-10">
                        <div className="flex items-center gap-3 overflow-hidden">
                          <div className={`flex-shrink-0 w-8 h-8 rounded-xl ${style.bg} ${style.color} flex items-center justify-center border border-white/5 shadow-inner`}>
                            {style.icon}
                          </div>
                          <div className="min-w-0 flex flex-col justify-center">
                            <div className="flex items-center gap-2">
                              <h4 className="text-[13px] font-bold text-slate-100 truncate tracking-wide">{v.name}</h4>
                            </div>
                            <div className="flex items-center gap-2 mt-0.5">
                              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{v.type}</p>
                              {v.isSecret && (
                                <>
                                  <span className="w-1 h-1 rounded-full bg-slate-700" />
                                  <span className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-amber-400/90 flex-shrink-0">
                                    <Icons.Lock size={8} className="text-amber-500" /> Secret
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200 bg-[#0B0F19]/80 backdrop-blur-sm rounded-lg p-0.5 border border-white/5">
                          <button onClick={() => handleEdit(v)} className="p-1.5 text-slate-400 hover:text-indigo-300 hover:bg-indigo-500/20 rounded-md transition-colors" title="Edit">
                            <Icons.Edit2 size={13} />
                          </button>
                          <button onClick={() => onDelete(v.id)} className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-500/20 rounded-md transition-colors" title="Delete">
                            <Icons.Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                      
                      <div className="mt-3 bg-[#050816]/60 rounded-xl p-2.5 border border-white/[0.04] shadow-inner relative z-10">
                        <div className="text-[11px] font-mono text-indigo-200/80 truncate leading-relaxed">
                          {v.isSecret ? (
                            <span className="tracking-[0.2em] text-slate-500 flex items-center mt-0.5">••••••••••••••••</span>
                          ) : (
                            <span className="truncate block">
                              {typeof v.value === 'object' ? JSON.stringify(v.value) : String(v.value)}
                            </span>
                          )}
                        </div>
                      </div>
                      
                      {v.description && (
                        <p className="text-[11px] text-slate-400 mt-2.5 line-clamp-2 leading-relaxed font-medium relative z-10">
                          {v.description}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            
          </div>
        </>
      )}
    </div>
  );
};

export default VariablePanel;