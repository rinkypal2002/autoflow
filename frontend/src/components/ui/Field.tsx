import React from 'react';
import { cn } from './cn';

const baseField =
  'w-full bg-surface-3 border rounded-md text-[13px] text-ink-primary placeholder-ink-muted transition-colors duration-150 ' +
  'focus:outline-none focus:border-brand-cyan-500/50 focus:ring-1 focus:ring-brand-cyan-500/40 disabled:opacity-50';

function fieldBorder(error?: boolean) {
  return error ? 'border-danger-500/50' : 'border-white/10';
}

interface FieldWrapProps {
  label?: string;
  required?: boolean;
  error?: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}

export function Field({ label, required, error, hint, children, className }: FieldWrapProps) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {label ? (
        <label className="text-[12px] font-semibold text-ink-secondary">
          {label}
          {required ? <span className="text-danger-400 ml-0.5">*</span> : null}
        </label>
      ) : null}
      {children}
      {error ? (
        <span className="text-[11px] text-danger-400">{error}</span>
      ) : hint ? (
        <span className="text-[11px] text-ink-tertiary">{hint}</span>
      ) : null}
    </div>
  );
}

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
  leftIcon?: React.ReactNode;
}
export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ error, leftIcon, className, ...rest }, ref) => {
    if (leftIcon) {
      return (
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted pointer-events-none">{leftIcon}</span>
          <input ref={ref} className={cn(baseField, fieldBorder(error), 'h-9 pl-9 pr-3', className)} {...rest} />
        </div>
      );
    }
    return <input ref={ref} className={cn(baseField, fieldBorder(error), 'h-9 px-3', className)} {...rest} />;
  }
);
Input.displayName = 'Input';

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  error?: boolean;
}
export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ error, className, children, ...rest }, ref) => (
    <select ref={ref} className={cn(baseField, fieldBorder(error), 'h-9 px-3 appearance-none cursor-pointer', className)} {...rest}>
      {children}
    </select>
  )
);
Select.displayName = 'Select';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: boolean;
}
export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ error, className, ...rest }, ref) => (
    <textarea ref={ref} className={cn(baseField, fieldBorder(error), 'px-3 py-2 min-h-[80px] resize-y font-mono', className)} {...rest} />
  )
);
Textarea.displayName = 'Textarea';
