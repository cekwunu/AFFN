'use client';

import { clsx } from 'clsx';
import { useActionState, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { useFormStatus } from 'react-dom';
import { buttonVariants } from '@/components/ui/button-variants';
import { fieldControlClasses } from '@/components/ui/field-classes';
import type { StepState } from '@/app/[locale]/(vendor)/vendor/apply/actions';

export interface Option {
  value: string;
  label: string;
  description?: string;
  meta?: string;
}

export type StepField =
  | { kind: 'heading'; label: string; name?: undefined }
  | {
      kind:
        'text' | 'email' | 'tel' | 'url' | 'date' | 'textarea' | 'select' | 'checkbox' | 'cards';
      name: string;
      label: string;
      hint?: string;
      optional?: boolean;
      autoComplete?: string;
      inputMode?: 'numeric' | 'tel' | 'email' | 'url' | 'text';
      placeholder?: string;
      maxLength?: number;
      options?: Option[];
    };

export interface StepFormLabels {
  submit: string;
  working: string;
  optional: string;
  autosave?: { idle: string; saving: string; saved: string; error: string };
}

/**
 * A step of the vendor application. Fields are rendered from a spec; all text arrives
 * translated. With `autosave`, input is saved as a draft while the vendor types (VEN-04).
 */
export function StepForm({
  action,
  autosave,
  fields,
  values = {},
  hidden = {},
  labels,
  messages,
  disabled = false,
  secondary,
  children,
}: {
  action: (state: StepState, formData: FormData) => Promise<StepState>;
  autosave?: (values: Record<string, string>) => Promise<boolean>;
  fields: StepField[];
  values?: Record<string, string>;
  hidden?: Record<string, string>;
  labels: StepFormLabels;
  /** Error codes → text; `unknown` is the fallback. */
  messages: Record<string, string>;
  disabled?: boolean;
  /** Shown next to the submit button (e.g. a back link). */
  secondary?: ReactNode;
  children?: ReactNode;
}) {
  const [state, formAction] = useActionState(action, {});
  const id = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const timer = useRef<number | null>(null);
  // Counts changes, so an older save finishing late does not claim newer input is saved.
  const version = useRef(0);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const shown = { ...values, ...state.values };
  const errors = state.errors ?? {};
  const message = (code: string) => messages[code] ?? messages.unknown ?? code;

  // Move focus to the first problem so keyboard and screen-reader users find it.
  useEffect(() => {
    const first = Object.keys(state.errors ?? {})[0];
    if (first) formRef.current?.querySelector<HTMLElement>(`[name="${first}"]`)?.focus();
    else if (state.error) document.getElementById(`${id}-alert`)?.focus();
  }, [state, id]);

  const save = async () => {
    if (!autosave || !formRef.current) return;
    timer.current = null;
    const data = new FormData(formRef.current);
    const draft: Record<string, string> = {};
    for (const [key, value] of data.entries()) {
      if (typeof value === 'string' && !key.startsWith('$') && !(key in hidden)) draft[key] = value;
    }
    const saving = version.current;
    setSaveState('saving');
    let ok = false;
    try {
      ok = await autosave(draft);
    } catch {
      ok = false;
    }
    if (version.current === saving && !timer.current) setSaveState(ok ? 'saved' : 'error');
  };
  const schedule = () => {
    if (!autosave) return;
    if (timer.current) window.clearTimeout(timer.current);
    // "Saved" only once the latest change is stored.
    version.current += 1;
    setSaveState('saving');
    timer.current = window.setTimeout(save, 800);
  };
  // Leaving a field saves at once, so nothing typed is lost.
  const flush = () => {
    if (timer.current) {
      window.clearTimeout(timer.current);
      void save();
    }
  };

  return (
    <form
      ref={formRef}
      action={formAction}
      onInput={schedule}
      onChange={schedule}
      onBlur={flush}
      // Our own messages (plain language, both languages) instead of the browser's.
      noValidate
      className="grid gap-6"
    >
      {Object.entries(hidden).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      {state.error && (
        <p
          id={`${id}-alert`}
          role="alert"
          tabIndex={-1}
          className="rounded-md border border-danger bg-danger-subtle px-4 py-3 text-body-sm text-danger-subtle-foreground"
        >
          {message(state.error)}
        </p>
      )}

      {fields.map((field, index) =>
        field.kind === 'heading' ? (
          <h2 key={`h-${index}`} className="pt-2 text-heading-md font-semibold">
            {field.label}
          </h2>
        ) : (
          <FieldRow
            key={field.name}
            id={`${id}-${field.name}`}
            field={field}
            value={shown[field.name] ?? ''}
            error={errors[field.name] ? message(errors[field.name]!) : undefined}
            optionalLabel={labels.optional}
            disabled={disabled}
          />
        ),
      )}

      {children}

      <div className="flex flex-col-reverse gap-4 border-t border-border pt-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">{secondary}</div>
        <div className="flex flex-col gap-2 sm:items-end">
          {!disabled && <Submit label={labels.submit} working={labels.working} />}
          {autosave && labels.autosave && (
            <p role="status" className="text-caption text-muted-foreground">
              {labels.autosave[saveState]}
            </p>
          )}
        </div>
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
      className={buttonVariants({ size: 'lg', className: 'w-full sm:w-auto' })}
    >
      {pending ? working : label}
    </button>
  );
}

function FieldRow({
  id,
  field,
  value,
  error,
  optionalLabel,
  disabled,
}: {
  id: string;
  field: Exclude<StepField, { kind: 'heading' }>;
  value: string;
  error?: string;
  optionalLabel: string;
  disabled: boolean;
}) {
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = clsx(field.hint && hintId, error && errorId) || undefined;
  const common = {
    id,
    name: field.name,
    disabled,
    required: !field.optional && field.kind !== 'checkbox',
    'aria-invalid': error ? true : undefined,
    'aria-describedby': describedBy,
  } as const;
  const label = (
    <>
      {field.label}
      {field.optional && (
        <span className="font-normal text-muted-foreground"> ({optionalLabel})</span>
      )}
    </>
  );
  const help = (
    <>
      {field.hint && (
        <p id={hintId} className="text-body-sm text-muted-foreground">
          {field.hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-body-sm font-medium text-danger">
          {error}
        </p>
      )}
    </>
  );

  if (field.kind === 'checkbox') {
    return (
      <div className="grid gap-1.5">
        <label htmlFor={id} className="flex min-h-11 cursor-pointer items-center gap-3 text-body">
          <input
            {...common}
            type="checkbox"
            defaultChecked={value === 'on' || value === 'true'}
            className="size-5 shrink-0 accent-primary"
          />
          <span>{label}</span>
        </label>
        {help}
      </div>
    );
  }

  if (field.kind === 'cards') {
    return (
      <fieldset className="grid gap-3" aria-describedby={describedBy}>
        <legend className="mb-1 text-body font-medium">{label}</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {field.options?.map((option) => (
            <label
              key={option.value}
              className="flex cursor-pointer gap-3 rounded-lg border border-input bg-card p-4 transition-colors has-[:checked]:border-primary has-[:checked]:bg-secondary has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring has-[:focus-visible]:outline-solid"
            >
              <input
                type="radio"
                name={field.name}
                value={option.value}
                defaultChecked={value === option.value}
                required={!field.optional}
                disabled={disabled}
                className="mt-1 size-4 shrink-0 accent-primary"
              />
              <span className="grid gap-1">
                <span className="flex flex-wrap items-baseline gap-x-2 font-semibold">
                  {option.label}
                  {option.meta && (
                    <span className="text-body-sm font-normal text-muted-foreground">
                      {option.meta}
                    </span>
                  )}
                </span>
                {option.description && (
                  <span className="text-body-sm text-muted-foreground">{option.description}</span>
                )}
              </span>
            </label>
          ))}
        </div>
        {help}
      </fieldset>
    );
  }

  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="text-body font-medium">
        {label}
      </label>
      {field.kind === 'textarea' ? (
        <textarea
          {...common}
          defaultValue={value}
          rows={5}
          maxLength={field.maxLength}
          className={clsx(fieldControlClasses, 'min-h-32 px-3.5 py-2.5')}
        />
      ) : field.kind === 'select' ? (
        <select {...common} defaultValue={value} className={clsx(fieldControlClasses, 'h-11 px-3')}>
          <option value="">{field.placeholder ?? ''}</option>
          {field.options?.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ) : (
        <input
          {...common}
          type={field.kind}
          defaultValue={value}
          autoComplete={field.autoComplete}
          inputMode={field.inputMode}
          placeholder={field.placeholder}
          maxLength={field.maxLength}
          className={clsx(fieldControlClasses, 'h-11 px-3.5')}
        />
      )}
      {help}
    </div>
  );
}
