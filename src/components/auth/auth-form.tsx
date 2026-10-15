'use client';

import { clsx } from 'clsx';
import { useActionState, useId } from 'react';
import { useFormStatus } from 'react-dom';
import { buttonVariants } from '@/components/ui/button-variants';
import { fieldControlClasses } from '@/components/ui/field-classes';

export interface FormState {
  error?: string;
  ok?: string;
  /** Values to show again after an error (never passwords). */
  values?: Record<string, string>;
}

export interface FieldSpec {
  name: string;
  label: string;
  type: 'email' | 'password' | 'text' | 'checkbox' | 'select' | 'code';
  autoComplete?: string;
  hint?: string;
  required?: boolean;
  defaultValue?: string;
  readOnly?: boolean;
  options?: { value: string; label: string }[];
}

/**
 * A small form island for auth and admin forms. All text arrives as props (translated on the
 * server) and it uses no next-intl, tailwind-merge or Radix code, so pages stay light (NFR-01).
 */
export function AuthForm({
  action,
  fields,
  hidden = {},
  submitLabel,
  workingLabel,
  messages,
  initialError,
  className,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  fields: FieldSpec[];
  hidden?: Record<string, string>;
  submitLabel: string;
  workingLabel: string;
  /** Error and success codes → text. `unknown` is the fallback. */
  messages: Record<string, string>;
  initialError?: string;
  className?: string;
}) {
  const [state, formAction] = useActionState(action, initialError ? { error: initialError } : {});
  const id = useId();
  const alertId = `${id}-alert`;

  return (
    <form action={formAction} className={clsx('grid gap-5', className)} noValidate={false}>
      {Object.entries(hidden).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}

      {state.error && (
        <p
          id={alertId}
          role="alert"
          className="rounded-md border border-danger bg-danger-subtle px-4 py-3 text-body-sm text-danger-subtle-foreground"
        >
          {messages[state.error] ?? messages.unknown}
        </p>
      )}
      {state.ok && (
        <p
          role="status"
          className="rounded-md border border-success bg-success-subtle px-4 py-3 text-body-sm text-success-subtle-foreground"
        >
          {messages[state.ok] ?? state.ok}
        </p>
      )}

      {fields.map((field) => {
        const fieldId = `${id}-${field.name}`;
        const hintId = field.hint ? `${fieldId}-hint` : undefined;
        const describedBy =
          [hintId, state.error ? alertId : undefined].filter(Boolean).join(' ') || undefined;
        const value = state.values?.[field.name] ?? field.defaultValue;

        if (field.type === 'checkbox') {
          return (
            <div key={field.name} className="flex items-start gap-3">
              <input
                id={fieldId}
                name={field.name}
                type="checkbox"
                required={field.required}
                aria-describedby={describedBy}
                className="mt-0.5 size-5 shrink-0 cursor-pointer rounded-sm border border-input accent-primary"
              />
              <label htmlFor={fieldId} className="text-body-sm">
                {field.label}
              </label>
            </div>
          );
        }

        return (
          <div key={field.name} className="grid gap-2">
            <label htmlFor={fieldId} className="text-body-sm font-medium">
              {field.label}
            </label>
            {field.type === 'select' ? (
              <select
                id={fieldId}
                name={field.name}
                defaultValue={value}
                required={field.required}
                aria-describedby={describedBy}
                className={clsx(fieldControlClasses, 'h-11 px-3')}
              >
                {field.options?.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            ) : (
              <input
                // Re-mount with the returned value after an error.
                key={value}
                id={fieldId}
                name={field.name}
                type={field.type === 'code' ? 'text' : field.type}
                inputMode={field.type === 'code' ? 'numeric' : undefined}
                pattern={field.type === 'code' ? '[0-9]{6}' : undefined}
                maxLength={field.type === 'code' ? 6 : undefined}
                autoComplete={field.autoComplete}
                defaultValue={field.type === 'password' ? undefined : value}
                readOnly={field.readOnly}
                required={field.required}
                aria-describedby={describedBy}
                aria-invalid={state.error ? true : undefined}
                className={clsx(
                  fieldControlClasses,
                  'h-11 px-3.5',
                  field.type === 'code' && 'tracking-[0.4em]',
                )}
              />
            )}
            {field.hint && (
              <p id={hintId} className="text-body-sm text-muted-foreground">
                {field.hint}
              </p>
            )}
          </div>
        );
      })}

      <SubmitButton label={submitLabel} workingLabel={workingLabel} />
    </form>
  );
}

function SubmitButton({ label, workingLabel }: { label: string; workingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      aria-disabled={pending}
      onClick={(event) => pending && event.preventDefault()}
      className={clsx(buttonVariants({ variant: 'primary', size: 'lg' }), 'w-full')}
    >
      {pending ? workingLabel : label}
    </button>
  );
}
