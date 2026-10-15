'use client';

import { ArrowLeft, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useId, useRef, useState, useTransition, type FormEvent } from 'react';
import { buttonVariants } from '@/components/ui/button-variants';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { compressImage } from '@/lib/images/compress';
import { createClient } from '@/lib/supabase/client';

export interface GalleryImage {
  id: string;
  url: string;
  alt: string;
}

/** Up to 8 photos with alt text (VIS-02), compressed in the browser before upload. */
export function GalleryEditor({
  vendorId,
  images,
  max,
  add,
  remove,
  move,
}: {
  vendorId: string;
  images: GalleryImage[];
  max: number;
  add: (path: string, alt: string) => Promise<string | null>;
  remove: (formData: FormData) => Promise<void>;
  move: (formData: FormData) => Promise<void>;
}) {
  const t = useTranslations('Profile');
  const tE = useTranslations('Profile.errors');
  const router = useRouter();
  const id = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const [pending, startTransition] = useTransition();
  const full = images.length >= max;

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const alt = String(new FormData(form).get('alt') ?? '').trim();
    const file = fileRef.current?.files?.[0];
    if (!file) return setError('file');
    if (!alt) return setError('alt');
    setError(null);
    startTransition(async () => {
      setStatus(t('galleryUploading'));
      const small = await compressImage(file);
      const ext = small.type === 'image/webp' ? 'webp' : small.type === 'image/png' ? 'png' : 'jpg';
      const path = `${vendorId}/gallery/${crypto.randomUUID()}.${ext}`;
      const { error: uploadError } = await createClient()
        .storage.from('vendor-media')
        .upload(path, small, { contentType: small.type, upsert: false });
      const result = uploadError ? 'unknown' : await add(path, alt);
      if (result) {
        setError(result);
        setStatus('');
        return;
      }
      form.reset();
      setStatus(t('galleryAdded'));
      router.refresh();
    });
  };

  return (
    <div className="grid gap-4">
      {images.length === 0 ? (
        <p className="text-body-sm text-muted-foreground">{t('galleryEmpty')}</p>
      ) : (
        <ol className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {images.map((image, index) => (
            <li key={image.id} className="grid gap-1.5" data-testid="gallery-item">
              {/* eslint-disable-next-line @next/next/no-img-element -- user upload from Supabase Storage */}
              <img
                src={image.url}
                alt={image.alt}
                className="aspect-square w-full rounded-lg border border-border object-cover"
              />
              <p className="truncate text-caption text-muted-foreground">{image.alt}</p>
              <div className="flex gap-1">
                {index > 0 && (
                  <form action={move}>
                    <input type="hidden" name="id" value={image.id} />
                    <button
                      type="submit"
                      aria-label={t('galleryMoveUp', { alt: image.alt })}
                      className={buttonVariants({ variant: 'ghost', size: 'icon-sm' })}
                    >
                      <ArrowLeft aria-hidden />
                    </button>
                  </form>
                )}
                <form action={remove}>
                  <input type="hidden" name="id" value={image.id} />
                  <button
                    type="submit"
                    aria-label={t('galleryRemove', { alt: image.alt })}
                    className={buttonVariants({
                      variant: 'ghost',
                      size: 'icon-sm',
                      className: 'text-danger',
                    })}
                  >
                    <Trash2 aria-hidden />
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ol>
      )}

      {full ? (
        <p className="text-body-sm text-muted-foreground">{t('galleryFull')}</p>
      ) : (
        <form
          onSubmit={submit}
          noValidate
          className="grid gap-3 rounded-lg border border-dashed border-border p-4"
        >
          <p className="text-body-sm font-semibold">{t('galleryAdd')}</p>
          <label htmlFor={`${id}-file`} className="text-body-sm font-medium">
            {t('galleryTitle')}
          </label>
          <input
            id={`${id}-file`}
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            aria-invalid={error === 'file' ? true : undefined}
            className="text-body-sm"
          />
          <Field
            label={t('galleryAlt')}
            hint={t('galleryAltHint')}
            error={error === 'alt' ? tE('alt') : undefined}
          >
            <Input name="alt" maxLength={200} />
          </Field>
          <button
            type="submit"
            disabled={pending}
            className={buttonVariants({ className: 'w-fit' })}
          >
            {pending ? t('galleryUploading') : t('galleryUpload')}
          </button>
          {error && error !== 'alt' && (
            <p role="alert" className="text-body-sm font-medium text-danger">
              {tE.has(error as 'unknown') ? tE(error as 'unknown') : tE('unknown')}
            </p>
          )}
        </form>
      )}
      <p role="status" className="text-body-sm text-muted-foreground">
        {status}
      </p>
    </div>
  );
}
