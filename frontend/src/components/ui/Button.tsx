import React from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from './cn';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'subtle';
export type ButtonSize = 'sm' | 'md' | 'lg' | 'icon';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-gradient-to-r from-brand-cyan-500 to-brand-indigo-500 text-white border border-white/10 hover:brightness-110 shadow-e1',
  secondary:
    'bg-surface-3 text-ink-primary border border-white/10 hover:bg-surface-4 hover:border-white/15',
  ghost: 'bg-transparent text-ink-secondary border border-transparent hover:bg-white/5 hover:text-ink-primary',
  subtle: 'bg-white/5 text-ink-secondary border border-white/5 hover:bg-white/10 hover:text-ink-primary',
  danger: 'bg-danger-500/15 text-danger-400 border border-danger-500/30 hover:bg-danger-500/25',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-[12px] gap-1.5 rounded-md',
  md: 'h-9 px-4 text-[13px] gap-2 rounded-md',
  lg: 'h-10 px-5 text-[14px] gap-2 rounded-lg',
  icon: 'h-9 w-9 justify-center rounded-md text-[13px]',
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'secondary', size = 'md', loading, leftIcon, rightIcon, className, children, disabled, ...rest }, ref) => (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center font-semibold transition-all duration-150 ease-std select-none',
        'disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:brightness-100',
        VARIANTS[variant],
        SIZES[size],
        className
      )}
      {...rest}
    >
      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : leftIcon}
      {children}
      {!loading && rightIcon}
    </button>
  )
);
Button.displayName = 'Button';
