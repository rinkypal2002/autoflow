import React from 'react';
import { cn } from './cn';

export interface TabItem {
  id: string;
  label: React.ReactNode;
  icon?: React.ReactNode;
  count?: number;
}

export interface TabsProps {
  tabs: TabItem[];
  value: string;
  onChange: (id: string) => void;
  className?: string;
  size?: 'sm' | 'md';
}

export function Tabs({ tabs, value, onChange, className, size = 'md' }: TabsProps) {
  const pad = size === 'sm' ? 'px-3 py-1.5 text-[12px]' : 'px-4 py-2 text-[13px]';
  return (
    <div className={cn('flex items-center gap-1 border-b border-white/[0.06]', className)} role="tablist">
      {tabs.map((tab) => {
        const active = tab.id === value;
        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tab.id)}
            className={cn(
              'inline-flex items-center gap-1.5 font-semibold border-b-2 -mb-px transition-colors duration-150',
              pad,
              active
                ? 'border-brand-cyan-500 text-brand-cyan-400'
                : 'border-transparent text-ink-tertiary hover:text-ink-secondary'
            )}
          >
            {tab.icon}
            {tab.label}
            {typeof tab.count === 'number' ? (
              <span
                className={cn(
                  'ml-1 rounded-full px-1.5 text-[10px] font-bold',
                  active ? 'bg-brand-cyan-500/15 text-brand-cyan-400' : 'bg-white/5 text-ink-tertiary'
                )}
              >
                {tab.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
