import React from 'react';
import { cn } from './cn';

export type Tone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info';

const TONES: Record<Tone, string> = {
  neutral: 'bg-white/5 text-ink-secondary border-white/10',
  brand: 'bg-brand-cyan-500/10 text-brand-cyan-400 border-brand-cyan-500/20',
  success: 'bg-success-500/10 text-success-400 border-success-500/20',
  warning: 'bg-warning-500/10 text-warning-400 border-warning-500/20',
  danger: 'bg-danger-500/10 text-danger-400 border-danger-500/20',
  info: 'bg-info-500/10 text-info-400 border-info-500/20',
};

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
  /** Pill = fully rounded (counts); default = rounded-md (status). */
  pill?: boolean;
}

export function Badge({ tone = 'neutral', pill, className, children, ...rest }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider',
        pill ? 'rounded-full' : 'rounded-md',
        TONES[tone],
        className
      )}
      {...rest}
    >
      {children}
    </span>
  );
}

export interface StatusPillProps {
  tone?: Tone;
  label: string;
  /** Show a leading status dot. */
  dot?: boolean;
  pulse?: boolean;
  className?: string;
}

const DOT: Record<Tone, string> = {
  neutral: 'bg-ink-tertiary',
  brand: 'bg-brand-cyan-400',
  success: 'bg-success-400',
  warning: 'bg-warning-400',
  danger: 'bg-danger-400',
  info: 'bg-info-400',
};

export function StatusPill({ tone = 'neutral', label, dot = true, pulse, className }: StatusPillProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 border rounded-full px-2.5 py-1 text-[11px] font-semibold',
        TONES[tone],
        className
      )}
    >
      {dot ? <span className={cn('w-1.5 h-1.5 rounded-full', DOT[tone], pulse && 'animate-pulse')} /> : null}
      {label}
    </span>
  );
}
