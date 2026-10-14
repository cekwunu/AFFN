import { useId } from 'react';
import { cn } from '@/lib/utils';

/**
 * The AFF motif: a thin band of stepped diamonds, drawn in currentColor.
 * Use sparingly — public footer, storefront header edge, /design header. Never as a fill.
 */
export function Motif({ className }: { className?: string }) {
  const id = `motif-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      className={cn('h-3 w-full text-primary', className)}
      preserveAspectRatio="none"
    >
      <defs>
        <pattern id={id} width="24" height="12" patternUnits="userSpaceOnUse">
          <path
            d="M0 6h4M20 6h4M12 1 17 6 12 11 7 6Z M12 4 14 6 12 8 10 6Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.25"
          />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`} />
    </svg>
  );
}

/** Single diamond from the motif, used as the brand mark. */
export function MotifMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      className={cn('size-6 text-primary', className)}
    >
      <path d="M12 2 22 12 12 22 2 12Z" fill="none" stroke="currentColor" strokeWidth="1.75" />
      <path d="M12 7.5 16.5 12 12 16.5 7.5 12Z" fill="currentColor" />
    </svg>
  );
}
