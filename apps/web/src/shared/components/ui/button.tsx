import React from 'react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'outline' | 'ghost' | 'destructive';
  size?: 'default' | 'sm' | 'lg' | 'icon';
}

const variantStyles = {
  default: [
    'rounded-xl bg-primary text-primary-foreground',
    'shadow-md shadow-primary/25 dark:shadow-primary/30',
    'hover:-translate-y-px hover:bg-primary/88 hover:shadow-lg hover:shadow-primary/35 dark:hover:shadow-primary/40',
    'active:translate-y-0 active:bg-primary/95 active:shadow-md'
  ].join(' '),
  outline: [
    'rounded-xl border-2 border-input bg-background',
    'hover:border-primary/40 hover:bg-accent/60 hover:text-accent-foreground',
    'active:translate-y-px'
  ].join(' '),
  ghost: [
    'rounded-lg',
    'hover:bg-accent hover:text-accent-foreground',
    'active:bg-accent/80'
  ].join(' '),
  destructive: [
    'rounded-xl bg-destructive text-destructive-foreground',
    'shadow-md shadow-destructive/25 dark:shadow-destructive/35',
    'hover:-translate-y-px hover:bg-destructive/90 hover:shadow-lg hover:shadow-destructive/35',
    'active:translate-y-0 active:shadow-md'
  ].join(' ')
};

const sizeStyles = {
  default: 'h-11 min-h-11 px-6 py-2',
  sm: 'h-9 px-4 text-xs',
  lg: 'h-12 px-8 text-base',
  icon: 'h-10 w-10 shrink-0 rounded-xl p-0'
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className = '', variant = 'default', size = 'default', children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={`
          inline-flex items-center justify-center whitespace-nowrap text-sm font-semibold tracking-wide
          ring-offset-background transition-all duration-200 ease-out focus-visible:outline-none focus-visible:ring-2
          focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50
          ${variantStyles[variant]}
          ${sizeStyles[size]}
          ${className}
        `}
        {...props}
      >
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';
