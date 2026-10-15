'use client';

import { clsx } from 'clsx';
import { useActionState, useEffect, useId, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { buttonVariants } from '@/components/ui/button-variants';
import { fieldControlClasses } from '@/components/ui/field-classes';
import type { StepState } from '@/app/[locale]/(vendor)/vendor/apply/actions';

export interface BusinessLookupLabels {
  orgNumber: string;
  orgNumberHint: string;
  lookup: string;
  looking: string;
  found: string;
  confirmIntro: string;
  confirm: string;
  starting: string;
  tryAnother: string;
  name: string;
  form: string;
  address: string;
  orgNumberLabel: string;
}

/**
 * Step 1 (VEN-02): look the org number up in Brønnøysundregistrene, show what the registry says,
 * and create the application once the vendor confirms.
 */
export function BusinessLookup({
  lookup,
  start,
  locale,
  labels,
  messages,
}: {
  lookup: (state: StepState, formData: FormData) => Promise<StepState>;
  start: (state: StepState, formData: FormData) => Promise<StepState>;
  locale: string;
  labels: BusinessLookupLabels;
  messages: Record<string, string>;
}) {
  const [found, lookupAction] = useActionState(lookup, {});
  const [started, startAction] = useActionState(start, {});
  // The lookup result the vendor chose not to use ("try another number").
  const [dismissed, setDismissed] = useState<StepState | null>(null);
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const resultRef = useRef<HTMLHeadingElement>(null);
  const message = (code: string) => messages[code] ?? messages.unknown ?? code;

  const lookupError = found.errors?.orgNumber ?? found.error;
  const startError = started.errors?.orgNumber ?? started.error;
  const entity = found === dismissed ? undefined : found.entity;

  useEffect(() => {
    if (found.errors || found.error) inputRef.current?.focus();
  }, [found]);
  useEffect(() => {
    if (entity) resultRef.current?.focus();
  }, [entity]);

  if (entity) {
    const address = [entity.address, [entity.postalCode, entity.city].filter(Boolean).join(' ')]
      .filter(Boolean)
      .join(', ');
    return (
      <div className="grid gap-6">
        <div className="grid gap-4 rounded-xl border border-border bg-card p-5 sm:p-6">
          <h2 ref={resultRef} tabIndex={-1} className="text-heading-md font-semibold outline-none">
            {labels.found}
          </h2>
          <dl className="grid gap-3 sm:grid-cols-[auto_1fr] sm:gap-x-8">
            <dt className="text-body-sm text-muted-foreground">{labels.name}</dt>
            <dd className="font-medium">{entity.name}</dd>
            <dt className="text-body-sm text-muted-foreground">{labels.orgNumberLabel}</dt>
            <dd className="tabular-nums">{entity.orgNumber}</dd>
            <dt className="text-body-sm text-muted-foreground">{labels.form}</dt>
            <dd>{entity.formDescription ?? entity.formCode}</dd>
            {address && (
              <>
                <dt className="text-body-sm text-muted-foreground">{labels.address}</dt>
                <dd>{address}</dd>
              </>
            )}
          </dl>
        </div>
        <p className="text-body">{labels.confirmIntro}</p>
        {startError && (
          <p
            role="alert"
            className="rounded-md border border-danger bg-danger-subtle px-4 py-3 text-body-sm text-danger-subtle-foreground"
          >
            {message(startError)}
          </p>
        )}
        <form action={startAction} className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="orgNumber" value={entity.orgNumber} />
          <Submit label={labels.confirm} working={labels.starting} />
          <button
            type="button"
            onClick={() => setDismissed(found)}
            className={buttonVariants({ variant: 'ghost', size: 'lg' })}
          >
            {labels.tryAnother}
          </button>
        </form>
      </div>
    );
  }

  return (
    <form action={lookupAction} noValidate className="grid gap-4">
      <input type="hidden" name="locale" value={locale} />
      <div className="grid gap-1.5">
        <label htmlFor={`${id}-org`} className="text-body font-medium">
          {labels.orgNumber}
        </label>
        <p id={`${id}-hint`} className="text-body-sm text-muted-foreground">
          {labels.orgNumberHint}
        </p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            ref={inputRef}
            id={`${id}-org`}
            name="orgNumber"
            required
            inputMode="numeric"
            autoComplete="off"
            maxLength={14}
            defaultValue={found.values?.orgNumber ?? ''}
            aria-invalid={lookupError ? true : undefined}
            aria-describedby={clsx(`${id}-hint`, lookupError && `${id}-error`)}
            className={clsx(
              fieldControlClasses,
              'h-12 px-3.5 text-heading-sm tabular-nums sm:max-w-64',
            )}
          />
          <Submit label={labels.lookup} working={labels.looking} />
        </div>
        {lookupError && (
          <p id={`${id}-error`} role="alert" className="text-body-sm font-medium text-danger">
            {message(lookupError)}
          </p>
        )}
      </div>
    </form>
  );
}

function Submit({ label, working }: { label: string; working: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-disabled={pending}
      className={buttonVariants({ size: 'lg' })}
    >
      {pending ? working : label}
    </button>
  );
}
