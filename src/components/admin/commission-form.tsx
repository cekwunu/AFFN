'use client';

import { useTranslations } from 'next-intl';
import { startTransition, useActionState, useEffect, useRef, useState } from 'react';
import type { RuleState } from '@/app/[locale]/(admin)/admin/commission/actions';
import { buttonVariants } from '@/components/ui/button-variants';
import { fieldControlClasses } from '@/components/ui/field-classes';
import { formatOre, kronerToOre, ore } from '@/lib/money';
import { calculateCommission, parsePercent } from '@/lib/money/commission';

type Option = { id: string; name: string };
const SCOPES = ['organization', 'event', 'category', 'vendor'] as const;
const TYPES = ['percentage', 'fixed', 'hybrid'] as const;
const EXAMPLE = ore(50_000);

function Submit({ pending }: { pending: boolean }) {
  const t = useTranslations('Commission.form');
  return (
    <button type="submit" disabled={pending} aria-disabled={pending} className={buttonVariants()}>
      {pending ? t('saving') : t('save')}
    </button>
  );
}

/** The live example: what the vendor keeps of a 500 kr sale under the rule being typed. */
export function commissionExample(type: string, rate: string, fixed: string) {
  const rateBp = type === 'fixed' ? null : parsePercent(rate);
  let fixedOre: number | null = null;
  if (type !== 'percentage') {
    try {
      fixedOre = kronerToOre(fixed.trim() || '0');
    } catch {
      return null;
    }
  }
  if (type !== 'fixed' && rateBp === null) return null;
  try {
    return calculateCommission(EXAMPLE, {
      type: type as 'percentage',
      rateBp,
      fixedOre,
    });
  } catch {
    return null;
  }
}

/** New commission rule (COM-01, COM-03): level, terms, effective-from and a required reason. */
export function CommissionForm({
  action,
  events,
  categories,
  vendors,
  defaultEventId,
}: {
  action: (state: RuleState, formData: FormData) => Promise<RuleState>;
  events: Option[];
  categories: Option[];
  vendors: Option[];
  defaultEventId: string | null;
}) {
  const t = useTranslations('Commission.form');
  const tScope = useTranslations('Commission.scopes');
  const [state, formAction, pending] = useActionState(action, {});
  const form = useRef<HTMLFormElement>(null);
  const [scope, setScope] = useState<(typeof SCOPES)[number]>('vendor');
  const [type, setType] = useState<(typeof TYPES)[number]>('percentage');
  const [rate, setRate] = useState('10');
  const [fixed, setFixed] = useState('');
  // Controlled, so a choice survives a refused submit (React resets uncontrolled fields).
  const [chosen, setChosen] = useState<Record<string, string>>({});
  const example = commissionExample(type, rate, fixed);

  useEffect(() => {
    if (state.ok) {
      form.current?.reset();
      setRate('10');
      setFixed('');
      setChosen({});
    }
  }, [state.ok, state.at]);

  const error = (field: keyof NonNullable<RuleState['errors']>) =>
    state.errors?.[field] ? (
      <span id={`${field}-error`} className="text-body-sm font-medium text-danger">
        {t(`errors.${field}.${state.errors[field]}` as 'errors.reason.required')}
      </span>
    ) : null;
  const control = `${fieldControlClasses} h-11 px-3`;
  const select = (name: string, options: Option[], label: string, required = true) => (
    <label className="grid gap-1.5 text-body-sm font-medium">
      {label}
      <select
        name={name}
        required={required}
        value={chosen[name] ?? (name === 'eventId' ? (defaultEventId ?? '') : '')}
        onChange={(e) => setChosen((c) => ({ ...c, [name]: e.target.value }))}
        aria-invalid={!!state.errors?.target || undefined}
        className={control}
      >
        {!required && <option value="">{t('allEvents')}</option>}
        {required && <option value="">{t('choose')}</option>}
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
      {required && error('target')}
    </label>
  );

  return (
    <form
      ref={form}
      // Submitted by hand rather than with action={…}: React resets a form after an action,
      // which would clear what was entered when the server refuses it.
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        startTransition(() => formAction(data));
      }}
      className="grid gap-5"
      noValidate
    >
      <fieldset className="grid gap-2">
        <legend className="mb-1 text-body-sm font-medium">{t('scope')}</legend>
        <div className="flex flex-wrap gap-2">
          {SCOPES.map((s) => (
            <label
              key={s}
              className="flex h-11 cursor-pointer items-center gap-2 rounded-md border border-input px-3 text-body-sm has-[:checked]:border-primary has-[:checked]:bg-accent"
            >
              <input
                type="radio"
                name="scope"
                value={s}
                checked={scope === s}
                onChange={() => setScope(s)}
              />
              {tScope(s)}
            </label>
          ))}
        </div>
      </fieldset>

      {scope === 'event' && select('eventId', events, t('event'))}
      {scope === 'category' && (
        <div className="grid gap-4 sm:grid-cols-2">
          {select('categoryId', categories, t('category'))}
          {select('categoryEventId', events, t('categoryEvent'), false)}
        </div>
      )}
      {scope === 'vendor' && select('vendorId', vendors, t('vendor'))}

      <div className="grid gap-4 sm:grid-cols-3">
        <label className="grid gap-1.5 text-body-sm font-medium">
          {t('type')}
          <select
            name="type"
            value={type}
            onChange={(e) => setType(e.target.value as (typeof TYPES)[number])}
            className={control}
          >
            {TYPES.map((ty) => (
              <option key={ty} value={ty}>
                {t(`types.${ty}`)}
              </option>
            ))}
          </select>
        </label>
        {type !== 'fixed' && (
          <label className="grid gap-1.5 text-body-sm font-medium">
            {t('rate')}
            <input
              name="rate"
              inputMode="decimal"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              aria-invalid={!!state.errors?.rate || undefined}
              aria-describedby={state.errors?.rate ? 'rate-error' : undefined}
              className={control}
            />
            {error('rate')}
          </label>
        )}
        {type !== 'percentage' && (
          <label className="grid gap-1.5 text-body-sm font-medium">
            {t('fixed')}
            <input
              name="fixed"
              inputMode="decimal"
              value={fixed}
              onChange={(e) => setFixed(e.target.value)}
              aria-invalid={!!state.errors?.fixed || undefined}
              aria-describedby={state.errors?.fixed ? 'fixed-error' : undefined}
              className={control}
            />
            {error('fixed')}
          </label>
        )}
      </div>

      <p
        role="status"
        aria-live="polite"
        data-testid="commission-example"
        className="rounded-lg bg-muted px-4 py-3 text-body"
      >
        {example
          ? t('example', {
              commission: formatOre(example.commission),
              mva: formatOre(example.mva),
              vendor: formatOre(example.vendorPayout),
            })
          : t('exampleInvalid')}
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-1.5 text-body-sm font-medium">
          {t('effectiveFrom')}
          <input
            type="datetime-local"
            name="effectiveFrom"
            defaultValue={state.values?.effectiveFrom ?? ''}
            aria-invalid={!!state.errors?.effectiveFrom || undefined}
            aria-describedby="effective-hint"
            className={control}
          />
          <span id="effective-hint" className="text-caption font-normal text-muted-foreground">
            {t('effectiveHint')}
          </span>
          {error('effectiveFrom')}
        </label>
        <label className="grid gap-1.5 text-body-sm font-medium">
          {t('reason')}
          <textarea
            name="reason"
            defaultValue={state.values?.reason ?? ''}
            required
            rows={3}
            maxLength={500}
            aria-invalid={!!state.errors?.reason || undefined}
            aria-describedby={state.errors?.reason ? 'reason-error' : undefined}
            className={`${fieldControlClasses} px-3 py-2`}
          />
          {error('reason')}
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <Submit pending={pending} />
        {state.ok && (
          <p role="status" className="text-body-sm font-medium text-success-subtle-foreground">
            {t('saved')}
          </p>
        )}
        {state.error && (
          <p role="alert" className="text-body-sm font-medium text-danger">
            {t(`errors.${state.error}`)}
          </p>
        )}
      </div>
    </form>
  );
}
