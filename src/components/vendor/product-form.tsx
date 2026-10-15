'use client';

import { useTranslations } from 'next-intl';
import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import type { ProductState } from '@/app/[locale]/(vendor)/vendor/products/actions';
import { buttonVariants } from '@/components/ui/button-variants';
import { Field } from '@/components/ui/field';
import { fieldControlClasses } from '@/components/ui/field-classes';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ALLERGENS, DIETARY_TAGS, MVA_RATES } from '@/lib/catalogue/products';
import { compressImage } from '@/lib/images/compress';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';

export interface ProductFormValues {
  id?: string;
  name: string;
  description: string;
  price: string;
  categoryId: string;
  mvaRateBp: string;
  dietaryTags: string[];
  allergens: string[];
  noAllergens: boolean;
  imagePath: string | null;
  imageUrl: string | null;
}

function Submit() {
  const t = useTranslations('Catalogue.form');
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

/** Create or edit a product (CAT-01). */
export function ProductForm({
  action,
  vendorId,
  initial,
  categories,
  mvaRegistered,
  created,
}: {
  action: (state: ProductState, formData: FormData) => Promise<ProductState>;
  vendorId: string;
  initial: ProductFormValues;
  categories: { id: string; name: string }[];
  mvaRegistered: boolean;
  created?: boolean;
}) {
  const t = useTranslations('Catalogue');
  const tA = useTranslations('Allergens');
  const tD = useTranslations('Dietary');
  const tE = useTranslations('Catalogue.errors');
  const message = (code: string) =>
    tE.has(code as 'unknown') ? tE(code as 'unknown') : tE('unknown');
  const [state, formAction] = useActionState(action, {});
  const errors = state.errors ?? {};
  const err = (name: string) => (errors[name] ? message(errors[name]!) : undefined);
  const values = (state.values ?? {}) as Partial<Record<string, string | string[]>>;
  const text = (name: keyof ProductFormValues) =>
    typeof values[name] === 'string' ? (values[name] as string) : String(initial[name] ?? '');
  const list = (name: 'dietaryTags' | 'allergens') =>
    Array.isArray(values[name]) ? (values[name] as string[]) : initial[name];
  const [allergens, setAllergens] = useState<string[]>(list('allergens'));
  const [noAllergens, setNoAllergens] = useState(
    state.values ? values.noAllergens === 'on' : initial.noAllergens,
  );
  const [image, setImage] = useState({ path: initial.imagePath, url: initial.imageUrl });
  const [upload, setUpload] = useState<'idle' | 'compressing' | 'uploading' | 'failed'>('idle');

  const onImage = async (file: File | undefined) => {
    if (!file) return;
    setUpload('compressing');
    const small = await compressImage(file);
    setUpload('uploading');
    const ext = small.type === 'image/webp' ? 'webp' : small.type === 'image/png' ? 'png' : 'jpg';
    const path = `${vendorId}/products/${crypto.randomUUID()}.${ext}`;
    const bucket = createClient().storage.from('vendor-media');
    const { error } = await bucket.upload(path, small, { contentType: small.type, upsert: false });
    if (error) {
      setUpload('failed');
      return;
    }
    setImage({ path, url: bucket.getPublicUrl(path).data.publicUrl });
    setUpload('idle');
  };

  const status =
    state.ok === 'saved'
      ? t('form.saved')
      : created && !state.at && !state.errors
        ? t('form.created')
        : '';

  return (
    <form action={formAction} noValidate className="grid gap-6">
      {initial.id && <input type="hidden" name="id" value={initial.id} />}
      <input type="hidden" name="imagePath" value={image.path ?? ''} />

      <div className="grid gap-4 rounded-xl border border-border bg-card p-5 md:grid-cols-2">
        <Field label={t('form.name')} error={err('name')} required className="md:col-span-2">
          <Input name="name" defaultValue={text('name')} maxLength={80} required />
        </Field>
        <Field
          label={t('form.description')}
          hint={t('form.descriptionHint')}
          error={err('description')}
          className="md:col-span-2"
        >
          <Textarea
            name="description"
            defaultValue={text('description')}
            maxLength={400}
            rows={3}
          />
        </Field>
        <Field label={t('form.price')} hint={t('form.priceHint')} error={err('price')} required>
          <Input name="price" defaultValue={text('price')} inputMode="decimal" required />
        </Field>
        <Field label={t('form.category')} error={err('categoryId')}>
          <select
            name="categoryId"
            defaultValue={text('categoryId')}
            className={cn(fieldControlClasses, 'h-11 px-3.5')}
          >
            <option value="">{t('form.categoryNone')}</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('form.mva')} hint={t('form.mvaHint')} error={err('mvaRateBp')}>
          <select
            name="mvaRateBp"
            defaultValue={text('mvaRateBp') || '0'}
            className={cn(fieldControlClasses, 'h-11 px-3.5')}
          >
            {MVA_RATES.filter((r) => r === 0 || mvaRegistered).map((r) => (
              <option key={r} value={r}>
                {t('form.mvaRate', { rate: r / 100 })}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <fieldset className="grid gap-3 rounded-xl border border-border bg-card p-5">
        <legend className="px-1 text-heading-sm font-semibold">{t('form.dietary')}</legend>
        <div className="flex flex-wrap gap-x-6 gap-y-1">
          {DIETARY_TAGS.map((tag) => (
            <label key={tag} className="flex min-h-11 items-center gap-2 text-body">
              <input
                type="checkbox"
                name="dietaryTags"
                value={tag}
                defaultChecked={list('dietaryTags').includes(tag)}
                className="size-5 accent-primary"
              />
              {tD(tag)}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset
        className="grid gap-3 rounded-xl border border-border bg-card p-5"
        aria-describedby="allergens-hint"
        aria-invalid={errors.allergens ? true : undefined}
      >
        <legend className="px-1 text-heading-sm font-semibold">{t('form.allergens')}</legend>
        <p id="allergens-hint" className="text-body-sm text-muted-foreground">
          {t('form.allergensHint')}
        </p>
        <div className="grid gap-x-6 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
          {ALLERGENS.map((a) => (
            <label key={a} className="flex min-h-11 items-center gap-2 text-body">
              <input
                type="checkbox"
                name="allergens"
                value={a}
                checked={allergens.includes(a)}
                onChange={(e) => {
                  setAllergens((current) =>
                    e.target.checked ? [...current, a] : current.filter((x) => x !== a),
                  );
                  if (e.target.checked) setNoAllergens(false);
                }}
                className="size-5 accent-primary"
              />
              {tA(a)}
            </label>
          ))}
        </div>
        <label className="flex min-h-11 items-center gap-2 border-t border-border pt-3 text-body font-medium">
          <input
            type="checkbox"
            name="noAllergens"
            checked={noAllergens}
            onChange={(e) => {
              setNoAllergens(e.target.checked);
              if (e.target.checked) setAllergens([]);
            }}
            className="size-5 accent-primary"
          />
          {tA('none')}
        </label>
        {errors.allergens && (
          <p role="alert" className="text-body-sm font-medium text-danger">
            {err('allergens')}
          </p>
        )}
      </fieldset>

      <fieldset className="grid gap-3 rounded-xl border border-border bg-card p-5">
        <legend className="px-1 text-heading-sm font-semibold">{t('form.image')}</legend>
        {image.url && (
          // eslint-disable-next-line @next/next/no-img-element -- user upload from Supabase Storage
          <img
            src={image.url}
            alt={t('form.imageAlt', { name: text('name') })}
            className="aspect-[4/3] w-full max-w-xs rounded-lg border border-border object-cover"
          />
        )}
        <label className="grid w-fit gap-1.5 text-body-sm font-medium">
          {t('form.image')}
          <span className="text-caption font-normal text-muted-foreground">
            {t('form.imageHint')}
          </span>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) => void onImage(e.target.files?.[0])}
            className="text-body-sm"
          />
        </label>
        {image.path && (
          <button
            type="button"
            onClick={() => setImage({ path: null, url: null })}
            className={buttonVariants({ variant: 'ghost', size: 'sm', className: 'w-fit' })}
          >
            {t('form.removeImage')}
          </button>
        )}
        <p role="status" className="text-body-sm text-muted-foreground">
          {upload === 'compressing'
            ? t('form.compressing')
            : upload === 'uploading'
              ? t('form.uploading')
              : upload === 'failed'
                ? t('form.uploadFailed')
                : ''}
        </p>
      </fieldset>

      <div className="flex flex-wrap items-center gap-4">
        <Submit />
        <p role="status" className="text-body-sm text-success-subtle-foreground">
          {status}
        </p>
        {state.error && (
          <p role="alert" className="text-body-sm font-medium text-danger">
            {message(state.error)}
          </p>
        )}
      </div>
    </form>
  );
}
