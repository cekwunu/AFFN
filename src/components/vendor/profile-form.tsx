'use client';

import { useTranslations } from 'next-intl';
import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import type { ProfileState } from '@/app/[locale]/(vendor)/vendor/profile/actions';
import { buttonVariants } from '@/components/ui/button-variants';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

export type ProfileValues = Record<
  | 'displayName'
  | 'description'
  | 'story'
  | 'publicEmail'
  | 'publicPhone'
  | 'websiteUrl'
  | 'instagramHandle'
  | 'facebookUrl'
  | 'tiktokHandle'
  | 'cateringOffer',
  string
> & { offersCatering: boolean; profilePublished: boolean };

function Submit() {
  const t = useTranslations('Profile');
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-disabled={pending}
      className={buttonVariants({ size: 'lg' })}
    >
      {pending ? t('saving') : t('save')}
    </button>
  );
}

/** Business profile shown to guests (VIS-02). */
export function ProfileForm({
  action,
  initial,
}: {
  action: (state: ProfileState, formData: FormData) => Promise<ProfileState>;
  initial: ProfileValues;
}) {
  const t = useTranslations('Profile');
  const tApply = useTranslations('Apply.profile');
  const tE = useTranslations('Profile.errors');
  const [state, formAction] = useActionState(action, {});
  const v = { ...initial, ...state.values } as Record<string, string | boolean>;
  const err = (name: string) => {
    const code = state.errors?.[name];
    if (!code) return undefined;
    return tE.has(code as 'unknown') ? tE(code as 'unknown') : tE('unknown');
  };
  const text = (name: keyof ProfileValues) => String(v[name] ?? '');
  const checked = (name: 'offersCatering' | 'profilePublished') =>
    state.values ? state.values[name] === 'on' : initial[name];
  const [catering, setCatering] = useState(checked('offersCatering'));
  const section = 'grid gap-4 rounded-xl border border-border bg-card p-5';
  const legend = 'px-1 text-heading-sm font-semibold';

  return (
    <form key={state.at ?? 'profile'} action={formAction} noValidate className="grid gap-6">
      <fieldset className={section}>
        <legend className={legend}>{t('aboutTitle')}</legend>
        <Field
          label={tApply('displayName')}
          hint={tApply('displayNameHint')}
          error={err('displayName')}
          required
        >
          <Input name="displayName" defaultValue={text('displayName')} maxLength={80} required />
        </Field>
        <Field
          label={tApply('description')}
          hint={tApply('descriptionHint')}
          error={err('description')}
          required
        >
          <Textarea
            name="description"
            defaultValue={text('description')}
            maxLength={600}
            rows={3}
            required
          />
        </Field>
        <Field label={t('story')} hint={t('storyHint')} error={err('story')}>
          <Textarea name="story" defaultValue={text('story')} maxLength={2000} rows={6} />
        </Field>
      </fieldset>

      <fieldset className={section}>
        <legend className={legend}>{t('contactTitle')}</legend>
        <p className="text-body-sm text-muted-foreground">{t('contactHint')}</p>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label={t('publicEmail')} error={err('publicEmail')}>
            <Input
              name="publicEmail"
              type="email"
              autoComplete="email"
              defaultValue={text('publicEmail')}
            />
          </Field>
          <Field label={t('publicPhone')} error={err('publicPhone')}>
            <Input
              name="publicPhone"
              type="tel"
              autoComplete="tel"
              defaultValue={text('publicPhone')}
            />
          </Field>
          <Field label={tApply('website')} error={err('websiteUrl')}>
            <Input name="websiteUrl" inputMode="url" defaultValue={text('websiteUrl')} />
          </Field>
          <Field label={tApply('instagram')} error={err('instagramHandle')}>
            <Input name="instagramHandle" defaultValue={text('instagramHandle')} />
          </Field>
          <Field label={tApply('facebook')} error={err('facebookUrl')}>
            <Input name="facebookUrl" inputMode="url" defaultValue={text('facebookUrl')} />
          </Field>
          <Field label={tApply('tiktok')} error={err('tiktokHandle')}>
            <Input name="tiktokHandle" defaultValue={text('tiktokHandle')} />
          </Field>
        </div>
      </fieldset>

      <fieldset className={section}>
        <legend className={legend}>{t('cateringTitle')}</legend>
        <label className="flex min-h-11 items-center gap-2 text-body">
          <input
            type="checkbox"
            name="offersCatering"
            checked={catering}
            onChange={(e) => setCatering(e.target.checked)}
            className="size-5 accent-primary"
          />
          {t('offersCatering')}
        </label>
        {catering && (
          <Field label={t('cateringOffer')} hint={t('cateringHint')} error={err('cateringOffer')}>
            <Textarea
              name="cateringOffer"
              defaultValue={text('cateringOffer')}
              maxLength={1000}
              rows={3}
            />
          </Field>
        )}
      </fieldset>

      <fieldset className={section}>
        <legend className={legend}>{t('publishTitle')}</legend>
        <label className="flex min-h-11 items-center gap-2 text-body">
          <input
            type="checkbox"
            name="profilePublished"
            defaultChecked={checked('profilePublished')}
            aria-describedby="publish-hint"
            className="size-5 accent-primary"
          />
          {t('publish')}
        </label>
        <p id="publish-hint" className="text-body-sm text-muted-foreground">
          {t('publishHint')}
        </p>
      </fieldset>

      <div className="flex flex-wrap items-center gap-4">
        <Submit />
        <p role="status" className="text-body-sm text-success-subtle-foreground">
          {state.ok ? t('saved') : ''}
        </p>
        {state.error && (
          <p role="alert" className="text-body-sm font-medium text-danger">
            {tE('unknown')}
          </p>
        )}
      </div>
    </form>
  );
}
