import React from 'react';
import { cn } from './cn';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Adds hover elevation + accent border (use for clickable cards). */
  interactive?: boolean;
  padded?: boolean;
}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ interactive, padded = true, className, children, ...rest }, ref) => (
    <div
      ref={ref}
      className={cn(
        'bg-surface-2 border border-white/[0.06] rounded-lg shadow-e1',
        padded && 'p-5',
        interactive &&
          'transition-all duration-150 ease-std cursor-pointer hover:border-brand-cyan-500/30 hover:shadow-e2 hover:-translate-y-0.5',
        className
      )}
      {...rest}
    >
      {children}
    </div>
  )
);
Card.displayName = 'Card';

export function CardHeader({ className, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('flex items-center justify-between gap-3 mb-4', className)} {...rest}>
      {children}
    </div>
  );
}

export interface MetricCardProps {
  label: string;
  value: React.ReactNode;
  icon?: React.ReactNode;
  /** Small delta / hint line under the value. */
  hint?: React.ReactNode;
  tone?: 'neutral' | 'success' | 'warning' | 'danger';
  className?: string;
}

const TONE: Record<NonNullable<MetricCardProps['tone']>, string> = {
  neutral: 'text-ink-tertiary',
  success: 'text-success-400',
  warning: 'text-warning-400',
  danger: 'text-danger-400',
};

export function MetricCard({ label, value, icon, hint, tone = 'neutral', className }: MetricCardProps) {
  return (
    <div className={cn('bg-surface-2 border border-white/[0.06] rounded-lg p-4 shadow-e1', className)}>
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold uppercase tracking-wider text-ink-tertiary">{label}</span>
        {icon ? <span className="text-ink-tertiary">{icon}</span> : null}
      </div>
      <div className="mt-2 text-[28px] leading-none font-bold font-mono text-ink-primary">{value}</div>
      {hint ? <div className={cn('mt-2 text-[12px] font-medium', TONE[tone])}>{hint}</div> : null}
    </div>
  );
}
