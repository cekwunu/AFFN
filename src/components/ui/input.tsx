import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

export const fieldControlClasses =
  'w-full min-w-0 rounded-md border border-input bg-card text-body text-foreground shadow-xs transition-colors duration-fast placeholder:text-muted-foreground focus-visible:outline-offset-1 disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-60 aria-invalid:border-danger';

export function Input({ className, type = 'text', ...props }: ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(fieldControlClasses, 'h-11 px-3.5', className)}
      {...props}
    />
  );
}
