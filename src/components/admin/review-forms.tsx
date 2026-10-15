'use client';

import { clsx } from 'clsx';
import { useActionState, useEffect, useId, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';
import type { ReviewState } from '@/app/[locale]/(admin)/admin/applications/actions';
import { buttonVariants } from '@/components/ui/button-variants';
import { fieldControlClasses } from '@/components/ui/field-classes';

function Submit({ label, working }: { label: string; working: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-disabled={pending}
      className={buttonVariants({ className: 'w-full sm:w-auto' })}
    >
      {pending ? working : label}
    </button>
  );
}

function Feedback({
  state,
  messages,
  id,
}: {
  state: ReviewState;
  messages: Record<string, string>;
  id: string;
}) {
  const ref = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (state.error) ref.current?.focus();
  }, [state]);
  if (state.error) {
    return (
      <p
        ref={ref}
        id={id}
        role="alert"
        tabIndex={-1}
        className="rounded-md border border-danger bg-danger-subtle px-3 py-2 text-body-sm text-danger-subtle-foreground"
      >
        {messages[state.error] ?? messages.unknown}
      </p>
    );
  }
  if (state.ok) {
    return (
      <p
        role="status"
        className="rounded-md bg-success-subtle px-3 py-2 text-body-sm text-success-subtle-foreground"
      >
        {messages[`done.${state.ok}`] ?? ''}
      </p>
    );
  }
  return null;
}

export interface DecisionFormLabels {
  decision: string;
  note: string;
  noteHint: string;
  submit: string;
  working: string;
  commission: string;
  commissionDefault: string;
  overrideRate: string;
  overrideRateHint: string;
  overrideReason: string;
}

/** Review decision with a required note (REV-02); commission override for Org Admins (COM-03). */
export function DecisionForm(props: {
  action: (state: ReviewState, formData: FormData) => Promise<ReviewState>;
  id: string;
  options: { value: string; label: string }[];
  canOverride: boolean;
  labels: DecisionFormLabels;
  messages: Record<string, string>;
}) {
  const [state, formAction] = useActionState(props.action, {});
  // A new key after each success starts the form fresh.
  return (
    <form key={state.at ?? 'form'} action={formAction} noValidate className="grid gap-4">
      <input type="hidden" name="id" value={props.id} />
      <DecisionFields {...props} state={state} />
    </form>
  );
}

function DecisionFields({
  options,
  canOverride,
  labels,
  messages,
  state,
}: {
  options: { value: string; label: string }[];
  canOverride: boolean;
  labels: DecisionFormLabels;
  messages: Record<string, string>;
  state: ReviewState;
}) {
  const [decision, setDecision] = useState(state.values?.decision ?? '');
  const uid = useId();
  const errors = state.errors ?? {};
  const fieldError = (name: string) =>
    errors[name] ? (
      <p id={`${uid}-${name}-error`} className="text-body-sm font-medium text-danger">
        {messages[errors[name]!] ?? messages.unknown}
      </p>
    ) : null;

  return (
    <>
      <Feedback state={state} messages={messages} id={`${uid}-alert`} />
      <fieldset
        className="grid gap-2"
        aria-describedby={errors.decision ? `${uid}-decision-error` : undefined}
      >
        <legend className="mb-1 text-body font-medium">{labels.decision}</legend>
        {options.map((option) => (
          <label
            key={option.value}
            className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md border border-input bg-card px-3 has-[:checked]:border-primary has-[:checked]:bg-secondary"
          >
            <input
              type="radio"
              name="decision"
              value={option.value}
              defaultChecked={decision === option.value}
              onChange={() => setDecision(option.value)}
              className="size-4 accent-primary"
            />
            <span className="text-body-sm font-medium">{option.label}</span>
          </label>
        ))}
        {fieldError('decision')}
      </fieldset>

      <div className="grid gap-1.5">
        <label htmlFor={`${uid}-note`} className="text-body font-medium">
          {labels.note}
        </label>
        <p id={`${uid}-note-hint`} className="text-body-sm text-muted-foreground">
          {labels.noteHint}
        </p>
        <textarea
          id={`${uid}-note`}
          name="note"
          rows={4}
          maxLength={2000}
          required
          defaultValue={state.values?.note ?? ''}
          aria-invalid={errors.note ? true : undefined}
          aria-describedby={clsx(`${uid}-note-hint`, errors.note && `${uid}-note-error`)}
          className={clsx(fieldControlClasses, 'min-h-28 px-3.5 py-2.5')}
        />
        {fieldError('note')}
      </div>

      {decision === 'approved' && (
        <div className="grid gap-3 rounded-lg border border-border p-4">
          <p className="text-body-sm">
            <span className="font-medium">{labels.commission}:</span> {labels.commissionDefault}
          </p>
          {canOverride && (
            <>
              <div className="grid gap-1.5">
                <label htmlFor={`${uid}-rate`} className="text-body-sm font-medium">
                  {labels.overrideRate}
                </label>
                <p id={`${uid}-rate-hint`} className="text-caption text-muted-foreground">
                  {labels.overrideRateHint}
                </p>
                <input
                  id={`${uid}-rate`}
                  name="rate"
                  inputMode="decimal"
                  defaultValue={state.values?.rate ?? ''}
                  aria-invalid={errors.rate ? true : undefined}
                  aria-describedby={clsx(`${uid}-rate-hint`, errors.rate && `${uid}-rate-error`)}
                  className={clsx(fieldControlClasses, 'h-11 px-3.5 sm:max-w-32')}
                />
                {fieldError('rate')}
              </div>
              <div className="grid gap-1.5">
                <label htmlFor={`${uid}-reason`} className="text-body-sm font-medium">
                  {labels.overrideReason}
                </label>
                <input
                  id={`${uid}-reason`}
                  name="reason"
                  maxLength={500}
                  defaultValue={state.values?.reason ?? ''}
                  aria-invalid={errors.reason ? true : undefined}
                  aria-describedby={errors.reason ? `${uid}-reason-error` : undefined}
                  className={clsx(fieldControlClasses, 'h-11 px-3.5')}
                />
                {fieldError('reason')}
              </div>
            </>
          )}
        </div>
      )}

      <Submit label={labels.submit} working={labels.working} />
    </>
  );
}

/** Internal note (REV-03). */
export function NoteForm({
  action,
  id,
  labels,
  messages,
}: {
  action: (state: ReviewState, formData: FormData) => Promise<ReviewState>;
  id: string;
  labels: { label: string; add: string; working: string };
  messages: Record<string, string>;
}) {
  const [state, formAction] = useActionState(action, {});
  const uid = useId();
  return (
    <form key={state.at ?? 'form'} action={formAction} noValidate className="grid gap-3">
      <input type="hidden" name="id" value={id} />
      {state.error && (
        <p role="alert" className="text-body-sm font-medium text-danger">
          {messages[state.error] ?? messages.unknown}
        </p>
      )}
      <label htmlFor={`${uid}-body`} className="text-body-sm font-medium">
        {labels.label}
      </label>
      <textarea
        id={`${uid}-body`}
        name="body"
        rows={3}
        maxLength={4000}
        aria-invalid={state.errors?.body ? true : undefined}
        aria-describedby={state.errors?.body ? `${uid}-body-error` : undefined}
        className={clsx(fieldControlClasses, 'min-h-20 px-3.5 py-2.5')}
      />
      {state.errors?.body && (
        <p id={`${uid}-body-error`} className="text-body-sm font-medium text-danger">
          {messages[state.errors.body]}
        </p>
      )}
      <div>
        <Submit label={labels.add} working={labels.working} />
      </div>
    </form>
  );
}

export interface ViewerDocument {
  id: string;
  label: string;
  fileName: string;
  meta: string;
  warning?: string | null;
}

/** Side-by-side document viewer (REV-01): choose a document, see it next to the answers. */
export function DocumentViewer({
  documents,
  labels,
}: {
  documents: ViewerDocument[];
  labels: { preview: string; openNewTab: string; previewOf: string };
}) {
  const [selected, setSelected] = useState(documents[0]?.id ?? null);
  const current = documents.find((d) => d.id === selected);
  const isImage = current ? /\.(png|jpe?g|webp)$/i.test(current.fileName) : false;
  const url = current ? `/api/vendor/documents/${current.id}` : null;

  return (
    <div className="grid gap-4">
      <ul className="grid gap-2">
        {documents.map((doc) => (
          <li key={doc.id}>
            <button
              type="button"
              onClick={() => setSelected(doc.id)}
              aria-pressed={doc.id === selected}
              className={clsx(
                'grid w-full cursor-pointer gap-0.5 rounded-md border px-3 py-2 text-left transition-colors',
                doc.id === selected
                  ? 'border-primary bg-secondary'
                  : 'border-border bg-card hover:bg-accent',
              )}
            >
              <span className="text-body-sm font-medium">{doc.label}</span>
              <span className="truncate text-caption text-muted-foreground">
                {doc.fileName} · {doc.meta}
              </span>
              {doc.warning && (
                <span className="text-caption font-semibold text-danger">{doc.warning}</span>
              )}
            </button>
          </li>
        ))}
      </ul>
      {current && url && (
        <div className="grid gap-2">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-body-sm font-semibold">{labels.preview}</h3>
            <a
              href={url}
              target="_blank"
              rel="noopener"
              className="text-body-sm font-medium text-link hover:underline"
            >
              {labels.openNewTab}
            </a>
          </div>
          {isImage ? (
            // eslint-disable-next-line @next/next/no-img-element -- private file via signed URL
            <img
              src={url}
              alt={labels.previewOf.replace('{name}', current.fileName)}
              className="max-h-[70vh] w-full rounded-lg border border-border bg-muted object-contain"
            />
          ) : (
            <iframe
              key={current.id}
              src={url}
              title={labels.previewOf.replace('{name}', current.fileName)}
              className="h-[70vh] w-full rounded-lg border border-border bg-muted"
            />
          )}
        </div>
      )}
    </div>
  );
}
