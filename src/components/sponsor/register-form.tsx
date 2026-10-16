'use client';

import { useTranslations } from 'next-intl';
import { startTransition, useActionState } from 'react';
import type { RegisterState } from '@/app/[locale]/(sponsor)/sponsor/actions';
import { buttonVariants } from '@/components/ui/button-variants';
import { fieldControlClasses } from '@/components/ui/field-classes';

type Package = { id: string; name: string; price: string; deliverables: string[] };

const FIELDS: {
  name: string;
  type?: string;
  auto?: string;
  required?: boolean;
  group: 'company' | 'contact' | 'invoice';
}[] = [
  { name: 'orgNumber', auto: 'off', required: true, group: 'company' },
  { name: 'name', auto: 'organization', group: 'company' },
  { name: 'websiteUrl', type: 'url', auto: 'url', group: 'company' },
  { name: 'contactName', auto: 'name', required: true, group: 'contact' },
  { name: 'contactEmail', type: 'email', auto: 'email', required: true, group: 'contact' },
  { name: 'contactPhone', type: 'tel', auto: 'tel', group: 'contact' },
  { name: 'invoiceEmail', type: 'email', auto: 'email', required: true, group: 'invoice' },
  { name: 'invoiceAddress', auto: 'street-address', group: 'invoice' },
  { name: 'invoiceReference', auto: 'off', group: 'invoice' },
];

/**
 * Sponsor registration (SPO-01): company (org number checked in Brønnøysundregistrene), contact
 * and invoice details and the package. Values stay in the fields when the submit is refused.
 */
export function SponsorRegisterForm({
  action,
  packages,
  defaults,
}: {
  action: (state: RegisterState, formData: FormData) => Promise<RegisterState>;
  packages: Package[];
  defaults: { contactName: string; contactEmail: string };
}) {
  const t = useTranslations('SponsorPortal.register');
  const [state, formAction, pending] = useActionState(action, {});
  const control = `${fieldControlClasses} h-11 px-3`;
  const field = (f: (typeof FIELDS)[number]) => {
    const error = state.errors?.[f.name];
    const id = `sponsor-${f.name}`;
    return (
      <div key={f.name} className="grid content-start gap-1.5 text-body-sm">
        <label htmlFor={id} className="font-medium">
          {t(`fields.${f.name}.label` as 'fields.orgNumber.label')}
          {!f.required && (
            <span className="font-normal text-muted-foreground"> {t('optional')}</span>
          )}
        </label>
        <input
          id={id}
          name={f.name}
          type={f.type ?? 'text'}
          autoComplete={f.auto}
          required={f.required}
          defaultValue={defaults[f.name as keyof typeof defaults]}
          aria-invalid={!!error || undefined}
          aria-describedby={`${id}-hint${error ? ` ${id}-error` : ''}`}
          className={control}
        />
        <span id={`${id}-hint`} className="text-caption text-muted-foreground">
          {t(`fields.${f.name}.hint` as 'fields.orgNumber.hint')}
        </span>
        {error && (
          <span id={`${id}-error`} className="text-caption font-medium text-danger">
            {t(`errors.${error}` as 'errors.required')}
          </span>
        )}
      </div>
    );
  };
  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        startTransition(() => formAction(data));
      }}
      className="grid gap-8"
    >
      {state.error && (
        <p
          role="alert"
          className="rounded-lg bg-danger-subtle px-4 py-3 text-body-sm font-medium text-danger-subtle-foreground"
        >
          {t(`errors.${state.error}`)}
        </p>
      )}
      <fieldset className="grid gap-3">
        <legend className="mb-2 text-heading-sm font-semibold">{t('package')}</legend>
        {state.errors?.packageId && (
          <p className="text-body-sm font-medium text-danger">{t('errors.package')}</p>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          {packages.map((p, i) => (
            <label
              key={p.id}
              className="flex cursor-pointer gap-3 rounded-xl border border-border bg-card p-4 has-checked:border-primary"
            >
              <input
                type="radio"
                name="packageId"
                value={p.id}
                defaultChecked={i === 0}
                className="mt-1 size-4 accent-primary"
              />
              <span className="grid gap-1">
                <span className="font-semibold">
                  {p.name} · <span className="tabular-nums">{p.price}</span>
                </span>
                <span className="text-body-sm text-muted-foreground">
                  {p.deliverables.join(' · ')}
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      {(['company', 'contact', 'invoice'] as const).map((group) => (
        <fieldset key={group} className="grid gap-4 sm:grid-cols-2">
          <legend className="mb-2 text-heading-sm font-semibold">{t(`groups.${group}`)}</legend>
          {FIELDS.filter((f) => f.group === group).map(field)}
        </fieldset>
      ))}
      <div>
        <button
          type="submit"
          disabled={pending}
          aria-disabled={pending}
          className={buttonVariants({ size: 'lg' })}
        >
          {pending ? t('submitting') : t('submit')}
        </button>
      </div>
    </form>
  );
}
