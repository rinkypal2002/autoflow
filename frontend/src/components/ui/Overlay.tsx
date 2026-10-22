import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import { cn } from './cn';

function useEscape(open: boolean, onClose?: () => void) {
  useEffect(() => {
    if (!open || !onClose) return;
    const handler = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);
}

/* ── Modal ───────────────────────────────────────────────────────────── */
export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const MODAL_SIZE = { sm: 'max-w-md', md: 'max-w-lg', lg: 'max-w-2xl' };

export function Modal({ open, onClose, title, footer, children, size = 'md', className }: ModalProps) {
  useEscape(open, onClose);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          'relative w-full bg-surface-2 border border-white/10 rounded-xl shadow-e3 animate-scale-in',
          MODAL_SIZE[size],
          className
        )}
      >
        {title ? (
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
            <h2 className="text-[15px] font-bold text-ink-primary">{title}</h2>
            <button onClick={onClose} className="p-1 rounded-md text-ink-tertiary hover:text-ink-primary hover:bg-white/5" aria-label="Close">
              <X className="w-4 h-4" />
            </button>
          </div>
        ) : null}
        <div className="px-5 py-4 max-h-[70vh] overflow-y-auto custom-scrollbar">{children}</div>
        {footer ? <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-white/[0.06]">{footer}</div> : null}
      </div>
    </div>
  );
}

/* ── Drawer (right side) ─────────────────────────────────────────────── */
export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  headerAccessory?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
  width?: number;
}

export function Drawer({ open, onClose, title, subtitle, headerAccessory, footer, children, width = 440 }: DrawerProps) {
  useEscape(open, onClose);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-fade-in" onClick={onClose} />
      <aside
        role="dialog"
        aria-modal="true"
        style={{ width }}
        className="absolute top-0 right-0 h-full bg-surface-2 border-l border-white/10 shadow-e3 flex flex-col animate-slide-in-right max-w-[92vw]"
      >
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-white/[0.06]">
          <div className="flex items-center gap-3 min-w-0">
            {headerAccessory}
            <div className="min-w-0">
              {title ? <h2 className="text-[15px] font-bold text-ink-primary truncate">{title}</h2> : null}
              {subtitle ? <p className="text-[12px] text-ink-tertiary truncate">{subtitle}</p> : null}
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-md text-ink-tertiary hover:text-ink-primary hover:bg-white/5 shrink-0" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto custom-scrollbar px-5 py-4">{children}</div>
        {footer ? <div className="px-5 py-3 border-t border-white/[0.06]">{footer}</div> : null}
      </aside>
    </div>
  );
}

/* ── Tooltip (CSS hover) ─────────────────────────────────────────────── */
export interface TooltipProps {
  label: string;
  side?: 'top' | 'bottom' | 'left' | 'right';
  children: React.ReactNode;
}

const SIDE: Record<NonNullable<TooltipProps['side']>, string> = {
  top: 'bottom-full left-1/2 -translate-x-1/2 mb-1.5',
  bottom: 'top-full left-1/2 -translate-x-1/2 mt-1.5',
  left: 'right-full top-1/2 -translate-y-1/2 mr-1.5',
  right: 'left-full top-1/2 -translate-y-1/2 ml-1.5',
};

export function Tooltip({ label, side = 'top', children }: TooltipProps) {
  return (
    <span className="relative inline-flex group/tt">
      {children}
      <span
        role="tooltip"
        className={cn(
          'pointer-events-none absolute z-50 whitespace-nowrap rounded-md bg-surface-4 border border-white/10 px-2 py-1 text-[11px] font-medium text-ink-primary shadow-e2',
          'opacity-0 group-hover/tt:opacity-100 transition-opacity duration-150',
          SIDE[side]
        )}
      >
        {label}
      </span>
    </span>
  );
}
