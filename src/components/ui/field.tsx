'use client';

import { Slot } from 'radix-ui';
import { useId, type ReactElement, type ReactNode } from 'react';

/** Props Field wires onto the control. */
export interface FieldControlProps {
  id: string;
  'aria-describedby'?: string;
  'aria-invalid'?: true;
  'aria-required'?: true;
}
import { cn } from '@/lib/utils';
import { Label } from './label';

/**
 * Wires a label, optional hint and error message to one form control:
 * id/htmlFor, aria-describedby and aria-invalid are set for you.
 * Pass the control as the child, or a render function for composite controls
 * whose focusable part is nested (e.g. `{(control) => <Select><SelectTrigger {...control} />…`).
 */
export function Field({
  label,
  hint,
  error,
  required,
  className,
  children,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  className?: string;
  children: ReactElement | ((control: FieldControlProps) => ReactNode);
}) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const control: FieldControlProps = {
    id,
    'aria-describedby': [hintId, errorId].filter(Boolean).join(' ') || undefined,
    'aria-invalid': error ? true : undefined,
    'aria-required': required || undefined,
  };

  return (
    <div data-slot="field" className={cn('grid gap-2', className)}>
      <Label htmlFor={id}>
        {label}
        {required && (
          <span className="text-danger" aria-hidden="true">
            {' '}
            *
          </span>
        )}
      </Label>
      {typeof children === 'function' ? (
        children(control)
      ) : (
        <Slot.Root {...control}>{children}</Slot.Root>
      )}
      {hint && (
        <p id={hintId} className="text-body-sm text-muted-foreground">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-body-sm font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
