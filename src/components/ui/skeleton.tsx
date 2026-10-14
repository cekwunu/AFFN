import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

/** Loading placeholder. Decorative: wrap loading regions in aria-busy and give them a label. */
export function Skeleton({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden="true"
      className={cn('animate-pulse rounded-md bg-muted motion-reduce:animate-none', className)}
      {...props}
    />
  );
}
