import React, { useEffect } from 'react';
import { useDrag } from 'react-dnd';
import { WorkflowAction } from '../types/workflow';
import * as Icons from 'lucide-react';

interface Props {
  action: Omit<WorkflowAction, 'id' | 'x' | 'y'>;
}

const getColorStyles = (colorStr?: string) => {
  const baseColor = colorStr?.includes('-') ? colorStr.split('-')[1] : colorStr;
  
  const colorMap: Record<string, { bg: string; border: string; icon: string; gradient: string }> = {
    blue: { bg: 'bg-blue-500/10', border: 'border-blue-500/30', icon: 'text-blue-400', gradient: 'from-blue-500/20 to-blue-600/5' },
    indigo: { bg: 'bg-indigo-500/10', border: 'border-indigo-500/30', icon: 'text-indigo-400', gradient: 'from-indigo-500/20 to-indigo-600/5' },
    purple: { bg: 'bg-purple-500/10', border: 'border-purple-500/30', icon: 'text-purple-400', gradient: 'from-purple-500/20 to-purple-600/5' },
    emerald: { bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', icon: 'text-emerald-400', gradient: 'from-emerald-500/20 to-emerald-600/5' },
    amber: { bg: 'bg-amber-500/10', border: 'border-amber-500/30', icon: 'text-amber-400', gradient: 'from-amber-500/20 to-amber-600/5' },
    sky: { bg: 'bg-sky-500/10', border: 'border-sky-500/30', icon: 'text-sky-400', gradient: 'from-sky-500/20 to-sky-600/5' },
    teal: { bg: 'bg-teal-500/10', border: 'border-teal-500/30', icon: 'text-teal-400', gradient: 'from-teal-500/20 to-teal-600/5' },
    orange: { bg: 'bg-orange-500/10', border: 'border-orange-500/30', icon: 'text-orange-400', gradient: 'from-orange-500/20 to-orange-600/5' },
    rose: { bg: 'bg-rose-500/10', border: 'border-rose-500/30', icon: 'text-rose-400', gradient: 'from-rose-500/20 to-rose-600/5' },
    pink: { bg: 'bg-pink-500/10', border: 'border-pink-500/30', icon: 'text-pink-400', gradient: 'from-pink-500/20 to-pink-600/5' },
    cyan: { bg: 'bg-cyan-500/10', border: 'border-cyan-500/30', icon: 'text-cyan-400', gradient: 'from-cyan-500/20 to-cyan-600/5' },
    green: { bg: 'bg-green-500/10', border: 'border-green-500/30', icon: 'text-green-400', gradient: 'from-green-500/20 to-green-600/5' },
    red: { bg: 'bg-red-500/10', border: 'border-red-500/30', icon: 'text-red-400', gradient: 'from-red-500/20 to-red-600/5' },
    slate: { bg: 'bg-slate-500/10', border: 'border-slate-500/30', icon: 'text-slate-400', gradient: 'from-slate-500/20 to-slate-600/5' },
  };

  return colorMap[baseColor || ''] || colorMap.indigo;
};

const DraggableAction: React.FC<Props> = ({ action }) => {
  const [{ isDragging }, drag, preview] = useDrag(() => ({
    type: 'action',
    item: action,
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  }), [action]);

  // Use an empty image for the drag preview so we can style the dragged element natively or hide the default ghost
  useEffect(() => {
    preview(null);
  }, [preview]);

  const Icon = (Icons[action.icon as keyof typeof Icons] || Icons.Box) as React.ComponentType<any>;
  const colors = getColorStyles(action.color);

  const handleDragStart = (e: React.DragEvent) => {
    // We let react-dnd handle the drag, but we prevent default html5 dragging 
    // to avoid conflicts if it's applied on the same element inappropriately.
    // However, react-dnd requires the element to be draggable. 
    // So we don't preventDefault here, we just stop propagation.
    e.stopPropagation();
  };

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <div
      ref={drag}
      role="button"
      tabIndex={0}
      onDragStart={handleDragStart}
      onClick={handleClick}
      className={`
        group relative flex items-center gap-3.5 p-3 w-full rounded-2xl select-none transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]
        bg-[#0B0F19]/40 backdrop-blur-2xl border border-transparent
        ${isDragging 
          ? 'opacity-40 scale-95 border-indigo-500/40 bg-indigo-500/5 shadow-[0_0_20px_rgba(99,102,241,0.15)] z-50 cursor-grabbing' 
          : 'hover:border-white/[0.08] hover:bg-white/[0.03] hover:shadow-[0_8px_20px_rgba(0,0,0,0.3)] cursor-grab hover:-translate-y-0.5'
        }
      `}
    >
      {/* Premium Gradient Background Accent on Hover */}
      <div className={`absolute inset-0 rounded-2xl bg-gradient-to-r ${colors.gradient} opacity-0 group-hover:opacity-30 transition-opacity duration-300 pointer-events-none`} />

      {/* Icon Container */}
      <div className={`
        relative flex items-center justify-center w-10 h-10 rounded-xl shrink-0 overflow-hidden shadow-inner 
        bg-gradient-to-br ${colors.gradient} border ${colors.border}
        group-hover:shadow-[0_0_15px_rgba(0,0,0,0.2)] transition-shadow duration-300
      `}>
        <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent opacity-60"></div>
        <Icon className={`w-5 h-5 ${colors.icon} drop-shadow-md relative z-10`} />
      </div>

      {/* Text Content */}
      <div className="flex-1 min-w-0 pr-1 relative z-10">
        <div className="flex items-center gap-2 mb-0.5">
          <h4 className="text-[13.5px] font-bold text-slate-200 tracking-wide truncate group-hover:text-white transition-colors">
            {action.name}
          </h4>
          {action.badge === 'new' && (
            <span className="px-1.5 py-[2px] text-[9px] font-extrabold uppercase tracking-widest bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded shadow-sm shrink-0">
              New
            </span>
          )}
        </div>
        <p className="text-[11px] font-medium text-slate-500 line-clamp-2 leading-relaxed group-hover:text-slate-400 transition-colors">
          {action.description}
        </p>
      </div>

      {/* Drag Handle Indicator */}
      <div className="shrink-0 text-slate-600 group-hover:text-slate-400 opacity-0 group-hover:opacity-100 transition-all duration-300 transform translate-x-2 group-hover:translate-x-0 relative z-10 pr-1">
        <Icons.GripVertical className="w-4 h-4 hover:text-slate-300 transition-colors" />
      </div>

      {/* Modern Tooltip */}
      <div className="absolute top-1/2 -translate-y-1/2 right-[calc(100%+12px)] px-3 py-1.5 bg-[#0A0D14]/95 backdrop-blur-xl text-slate-200 text-[11px] font-bold tracking-wide rounded-lg border border-white/10 shadow-[0_10px_30px_rgba(0,0,0,0.5)] whitespace-nowrap opacity-0 group-hover:opacity-100 transition-all duration-200 pointer-events-none z-50 translate-x-2 group-hover:translate-x-0">
        Drag to Canvas
        <div className="absolute top-1/2 -translate-y-1/2 -right-1 w-2 h-2 bg-[#0A0D14]/95 border-t border-r border-white/10 rotate-45"></div>
      </div>

      {/* Inner Highlight for Glass Effect */}
      <div className="absolute inset-0 rounded-2xl shadow-[inset_0_1px_1px_rgba(255,255,255,0.05)] pointer-events-none" />
    </div>
  );
};

export default DraggableAction;