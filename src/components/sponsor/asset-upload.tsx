'use client';

import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useId, useState, useTransition, type FormEvent } from 'react';
import type { AssetResult } from '@/app/[locale]/(sponsor)/sponsor/actions';
import { buttonVariants } from '@/components/ui/button-variants';
import { fieldControlClasses } from '@/components/ui/field-classes';
import {
  ASSET_KINDS,
  ASSET_TYPES,
  MAX_ASSET_BYTES,
  assetMimeOk,
  type AssetKind,
} from '@/lib/sponsors/assets';
import { createClient } from '@/lib/supabase/client';

const safeName = (name: string) =>
  `${crypto.randomUUID()}-${
    name
      .normalize('NFKD')
      .replace(/[^\w.-]+/g, '-')
      .replace(/-+/g, '-')
      .slice(-80) || 'file'
  }`;

/**
 * Asset upload (SPO-02): the file goes straight from the browser to the sponsor's folder in the
 * private bucket (storage RLS), then the server registers it for AFFN's review.
 */
export function SponsorAssetUpload({
  sponsorId,
  sponsorshipId,
  add,
}: {
  sponsorId: string;
  sponsorshipId: string;
  add: (input: {
    sponsorshipId: string;
    kind: string;
    storagePath: string;
    fileName: string;
    mimeType: string;
    byteSize: number;
  }) => Promise<AssetResult>;
}) {
  const t = useTranslations('SponsorPortal.assets');
  const router = useRouter();
  const id = useId();
  const [kind, setKind] = useState<AssetKind>('logo');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const file = (new FormData(form).get('file') as File | null) ?? null;
    setDone(false);
    if (!file || !file.size) return setError('required');
    if (!assetMimeOk(kind, file.type)) return setError('type');
    if (file.size > MAX_ASSET_BYTES) return setError('size');
    startTransition(async () => {
      const supabase = createClient();
      const path = `${sponsorId}/${kind}-${safeName(file.name)}`;
      const upload = await supabase.storage
        .from('sponsor-assets')
        .upload(path, file, { contentType: file.type, upsert: false });
      if (upload.error) return setError('upload_failed');
      const result = await add({
        sponsorshipId,
        kind,
        storagePath: path,
        fileName: file.name,
        mimeType: file.type,
        byteSize: file.size,
      });
      if (!result.ok) return setError(result.error ?? 'failed');
      setError(null);
      setDone(true);
      form.reset();
      router.refresh();
    });
  };

  return (
    <form
      onSubmit={submit}
      noValidate
      aria-labelledby={`${id}-title`}
      className="grid gap-4 rounded-xl border border-border bg-card p-5"
    >
      <h3 id={`${id}-title`} className="text-heading-sm font-semibold">
        {t('uploadTitle')}
      </h3>
      {error && (
        <p role="alert" className="text-body-sm font-medium text-danger">
          {t(`errors.${error}` as 'errors.required')}
        </p>
      )}
      {done && (
        <p role="status" className="text-body-sm font-medium text-success-subtle-foreground">
          {t('uploaded')}
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5 text-body-sm">
          <label htmlFor={`${id}-kind`} className="font-medium">
            {t('kind')}
          </label>
          <select
            id={`${id}-kind`}
            name="kind"
            value={kind}
            onChange={(e) => setKind(e.target.value as AssetKind)}
            className={`${fieldControlClasses} h-11 px-3`}
          >
            {ASSET_KINDS.map((k) => (
              <option key={k} value={k}>
                {t(`kinds.${k}`)}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5 text-body-sm">
          <label htmlFor={`${id}-file`} className="font-medium">
            {t('file')}
          </label>
          <input
            id={`${id}-file`}
            name="file"
            type="file"
            accept={ASSET_TYPES[kind].join(',')}
            aria-describedby={`${id}-hint`}
            className="text-body-sm file:mr-3 file:rounded-md file:border file:border-border file:bg-secondary file:px-3 file:py-2 file:text-secondary-foreground"
          />
          <span id={`${id}-hint`} className="text-caption text-muted-foreground">
            {t(`hints.${kind}`)}
          </span>
        </div>
      </div>
      <div>
        <button
          type="submit"
          disabled={pending}
          aria-disabled={pending}
          className={buttonVariants()}
        >
          {pending ? t('uploading') : t('upload')}
        </button>
      </div>
    </form>
  );
}
