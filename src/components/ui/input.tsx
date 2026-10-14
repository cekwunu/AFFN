import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

import { fieldControlClasses } from './field-classes';

export { fieldControlClasses };

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
