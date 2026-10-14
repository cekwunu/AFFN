import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';
import { fieldControlClasses } from './input';

export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(fieldControlClasses, 'min-h-28 px-3.5 py-2.5', className)}
      {...props}
    />
  );
}
