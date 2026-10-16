'use client';

import { useTranslations } from 'next-intl';
import { startTransition, useActionState } from 'react';
import type { SettingsState } from '@/app/[locale]/(admin)/admin/settings/actions';
import { buttonVariants } from '@/components/ui/button-variants';
import { fieldControlClasses } from '@/components/ui/field-classes';

type Values = Record<
  | 'legalName'
  | 'orgNumber'
  | 'addressLine'
  | 'postalCode'
  | 'city'
  | 'bankAccount'
  | 'invoiceEmail'
  | 'invoiceDueDays'
  | 'stallFeeMva'
  | 'sponsorMva',
  string
> & { vatRegistered: boolean };

const FIELDS: {
  name: Exclude<keyof Values, 'vatRegistered'>;
  type?: string;
  wide?: boolean;
  auto?: string;
}[] = [
  { name: 'legalName', wide: true, auto: 'organization' },
  { name: 'orgNumber', auto: 'off' },
  { name: 'invoiceEmail', type: 'email', auto: 'email' },
  { name: 'addressLine', wide: true, auto: 'street-address' },
  { name: 'postalCode', auto: 'postal-code' },
  { name: 'city', auto: 'address-level2' },
  { name: 'bankAccount', auto: 'off' },
  { name: 'invoiceDueDays', auto: 'off' },
  { name: 'stallFeeMva', auto: 'off' },
  { name: 'sponsorMva', auto: 'off' },
];

/**
 * AFFN's company details for invoices (legal name, org number with MVA, address, bank account)
 * and the stall fee mva rate. Values stay in the fields when a save is refused.
 */
export function SettingsForm({
  action,
  values,
  canEdit,
}: {
  action: (state: SettingsState, formData: FormData) => Promise<SettingsState>;
  values: Values;
  canEdit: boolean;
}) {
  const t = useTranslations('Settings');
  const [state, formAction, pending] = useActionState(action, {});
  const control = `${fieldControlClasses} h-11 px-3`;
  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        startTransition(() => formAction(data));
      }}
      className="grid gap-5 rounded-xl border border-border bg-card p-5 sm:grid-cols-2"
    >
      {state.ok && (
        <p
          role="status"
          className="rounded-lg bg-success-subtle px-4 py-3 text-body-sm font-medium text-success-subtle-foreground sm:col-span-2"
        >
          {t('saved')}
        </p>
      )}
      {state.error && (
        <p
          role="alert"
          className="rounded-lg bg-danger-subtle px-4 py-3 text-body-sm font-medium text-danger-subtle-foreground sm:col-span-2"
        >
          {t(`errors.${state.error}`)}
        </p>
      )}
      {FIELDS.map((f) => {
        const error = state.errors?.[f.name];
        return (
          <div
            key={f.name}
            className={`grid content-start gap-1.5 text-body-sm ${f.wide ? 'sm:col-span-2' : ''}`}
          >
            <label htmlFor={`settings-${f.name}`} className="font-medium">
              {t(`fields.${f.name}.label`)}
            </label>
            <input
              id={`settings-${f.name}`}
              name={f.name}
              type={f.type ?? 'text'}
              defaultValue={values[f.name]}
              autoComplete={f.auto}
              disabled={!canEdit}
              aria-invalid={!!error || undefined}
              aria-describedby={`${f.name}-hint${error ? ` ${f.name}-error` : ''}`}
              className={control}
            />
            <span id={`${f.name}-hint`} className="text-caption text-muted-foreground">
              {t(`fields.${f.name}.hint`)}
            </span>
            {error && (
              <span id={`${f.name}-error`} className="text-caption font-medium text-danger">
                {t(`fields.${f.name}.${error}` as 'fields.orgNumber.invalid')}
              </span>
            )}
          </div>
        );
      })}
      <div className="flex items-start gap-3 text-body-sm sm:col-span-2">
        <input
          id="settings-vatRegistered"
          type="checkbox"
          name="vatRegistered"
          defaultChecked={values.vatRegistered}
          disabled={!canEdit}
          aria-describedby="vatRegistered-hint"
          className="mt-1 size-4 accent-primary"
        />
        <span className="grid gap-0.5">
          <label htmlFor="settings-vatRegistered" className="font-medium">
            {t('fields.vatRegistered.label')}
          </label>
          <span id="vatRegistered-hint" className="text-caption text-muted-foreground">
            {t('fields.vatRegistered.hint')}
          </span>
        </span>
      </div>
      {canEdit && (
        <div className="sm:col-span-2">
          <button
            type="submit"
            disabled={pending}
            aria-disabled={pending}
            className={buttonVariants({ size: 'lg' })}
          >
            {pending ? t('saving') : t('save')}
          </button>
        </div>
      )}
    </form>
  );
}
