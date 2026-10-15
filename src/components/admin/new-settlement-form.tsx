'use client';

import { useTranslations } from 'next-intl';
import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import type { NewSettlementState } from '@/app/[locale]/(admin)/admin/settlements/actions';
import { buttonVariants } from '@/components/ui/button-variants';
import { fieldControlClasses } from '@/components/ui/field-classes';

function Submit() {
  const t = useTranslations('Settlements.new');
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} aria-disabled={pending} className={buttonVariants()}>
      {pending ? t('creating') : t('create')}
    </button>
  );
}

/** New batch (SET-02): all vendors or a selection, and the cut-off time. */
export function NewSettlementForm({
  action,
  vendors,
}: {
  action: (state: NewSettlementState, formData: FormData) => Promise<NewSettlementState>;
  vendors: { vendorId: string; name: string; payoutsEnabled: boolean }[];
}) {
  const t = useTranslations('Settlements.new');
  const [state, formAction] = useActionState(action, {});
  const [scope, setScope] = useState<'all' | 'some'>('all');
  const control = `${fieldControlClasses} h-11 px-3`;

  return (
    <form action={formAction} className="grid gap-5">
      <fieldset className="grid gap-2">
        <legend className="mb-1 text-body-sm font-medium">{t('vendors')}</legend>
        <div className="flex flex-wrap gap-2">
          {(['all', 'some'] as const).map((s) => (
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
              {t(`scope.${s}`)}
            </label>
          ))}
        </div>
        {scope === 'some' && (
          <ul className="mt-2 grid gap-1 sm:grid-cols-2">
            {vendors.map((v) => (
              <li key={v.vendorId}>
                <label className="flex min-h-11 items-center gap-3 rounded-md px-2 text-body-sm hover:bg-accent">
                  <input type="checkbox" name="vendor" value={v.vendorId} className="size-4" />
                  <span>{v.name}</span>
                  {!v.payoutsEnabled && (
                    <span className="text-caption text-warning-subtle-foreground">
                      {t('payoutsNotEnabled')}
                    </span>
                  )}
                </label>
              </li>
            ))}
          </ul>
        )}
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-1.5 text-body-sm font-medium">
          {t('cutoff')}
          <input
            type="datetime-local"
            name="cutoff"
            aria-describedby="cutoff-hint"
            className={control}
          />
          <span id="cutoff-hint" className="text-caption font-normal text-muted-foreground">
            {t('cutoffHint')}
          </span>
        </label>
        <label className="grid gap-1.5 text-body-sm font-medium">
          {t('notes')}
          <input name="notes" maxLength={500} className={control} />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <Submit />
        {state.error && (
          <p role="alert" className="text-body-sm font-medium text-danger">
            {t(`errors.${state.error}`)}
          </p>
        )}
      </div>
    </form>
  );
}
