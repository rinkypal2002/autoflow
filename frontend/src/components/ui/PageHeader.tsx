import React from 'react';
import { cn } from './cn';

export interface PageHeaderProps {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  badge?: React.ReactNode;
  className?: string;
}

export function PageHeader({ title, subtitle, actions, badge, className }: PageHeaderProps) {
  return (
    <div className={cn('flex items-start justify-between gap-4 flex-wrap', className)}>
      <div className="min-w-0">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-[22px] sm:text-[24px] font-extrabold text-ink-primary tracking-tight">{title}</h1>
          {badge}
        </div>
        {subtitle ? <p className="mt-1 text-[13px] font-medium text-ink-secondary">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex items-center gap-2 flex-wrap justify-end">{actions}</div> : null}
    </div>
  );
}
