import React from 'react';
import { cn } from './cn';

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center px-6 py-12 rounded-lg border border-dashed border-white/10 bg-surface-2/40',
        className
      )}
    >
      {icon ? (
        <div className="w-12 h-12 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-ink-tertiary mb-3">
          {icon}
        </div>
      ) : null}
      <h3 className="text-[14px] font-bold text-ink-primary">{title}</h3>
      {description ? <p className="mt-1 text-[12px] text-ink-tertiary max-w-sm">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  rounded?: 'md' | 'lg' | 'full';
}

export function Skeleton({ rounded = 'md', className, ...rest }: SkeletonProps) {
  const r = rounded === 'full' ? 'rounded-full' : rounded === 'lg' ? 'rounded-lg' : 'rounded-md';
  return (
    <div
      className={cn('relative overflow-hidden bg-white/5', r, className)}
      {...rest}
    >
      <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/10 to-transparent" />
    </div>
  );
}

/** Convenience: a card-shaped skeleton block. */
export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div className={cn('bg-surface-2 border border-white/[0.06] rounded-lg p-4', className)}>
      <Skeleton className="h-3 w-1/3 mb-3" />
      <Skeleton className="h-7 w-1/2 mb-2" />
      <Skeleton className="h-3 w-2/3" />
    </div>
  );
}
