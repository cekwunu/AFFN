'use client';

import { clsx } from 'clsx';
import { useRouter } from 'next/navigation';
import { useId, useState, useTransition, type FormEvent } from 'react';
import { buttonVariants } from '@/components/ui/button-variants';
import { fieldControlClasses } from '@/components/ui/field-classes';
import { FileUpload } from '@/components/ui/file-upload';
import { createClient } from '@/lib/supabase/client';
import type { StepState } from '@/app/[locale]/(vendor)/vendor/apply/actions';

/** Storage keys allow a limited character set; keep the extension. */
function storageName(file: File): string {
  const safe = file.name
    .normalize('NFKD')
    .replace(/[^\w.-]+/g, '-')
    .replace(/-+/g, '-')
    .slice(-80);
  return `${crypto.randomUUID()}-${safe || 'file'}`;
}

/** Logo or cover image: uploaded to the public media bucket straight away. */
export function MediaUpload({
  vendorId,
  kind,
  label,
  hint,
  currentUrl,
  accept,
  maxSizeBytes,
  save,
  labels,
}: {
  vendorId: string;
  kind: 'logo' | 'cover';
  label: string;
  hint: string;
  currentUrl: string | null;
  accept: readonly string[];
  maxSizeBytes: number;
  save: (kind: 'logo' | 'cover', path: string) => Promise<boolean>;
  labels: { uploading: string; uploaded: string; failed: string; alt: string };
}) {
  const router = useRouter();
  const [status, setStatus] = useState<'idle' | 'uploading' | 'uploaded' | 'failed'>('idle');
  const [preview, setPreview] = useState(currentUrl);

  const upload = async (files: File[]) => {
    const file = files[0];
    if (!file) return;
    setStatus('uploading');
    const path = `${vendorId}/${kind}-${storageName(file)}`;
    const supabase = createClient();
    const { error } = await supabase.storage
      .from('vendor-media')
      .upload(path, file, { contentType: file.type, upsert: false });
    if (error || !(await save(kind, path))) {
      setStatus('failed');
      return;
    }
    setPreview(supabase.storage.from('vendor-media').getPublicUrl(path).data.publicUrl);
    setStatus('uploaded');
    router.refresh();
  };

  return (
    <div className="grid gap-3">
      {preview && (
        // eslint-disable-next-line @next/next/no-img-element -- user upload from Supabase Storage
        <img
          src={preview}
          alt={labels.alt}
          className={clsx(
            'rounded-lg border border-border bg-muted object-cover',
            kind === 'logo' ? 'size-24' : 'aspect-[16/9] w-full max-w-md',
          )}
        />
      )}
      <FileUpload
        label={label}
        description={hint}
        accept={accept}
        maxSizeBytes={maxSizeBytes}
        value={[]}
        onChange={upload}
        disabled={status === 'uploading'}
        error={status === 'failed' ? labels.failed : undefined}
      />
      <p role="status" className="text-body-sm text-muted-foreground">
        {status === 'uploading' ? labels.uploading : status === 'uploaded' ? labels.uploaded : ''}
      </p>
    </div>
  );
}

export interface DocumentUploadLabels {
  title: string;
  type: string;
  expires: string;
  expiresHint: string;
  description: string;
  file: string;
  add: string;
  adding: string;
}

/** Adds one document: type, expiry date and file, stored privately (VEN-03). */
export function DocumentUpload({
  vendorId,
  types,
  defaultType,
  accept,
  acceptLabel,
  maxSizeBytes,
  add,
  labels,
  messages,
}: {
  vendorId: string;
  types: { value: string; label: string }[];
  defaultType: string;
  accept: readonly string[];
  acceptLabel: string;
  maxSizeBytes: number;
  add: (input: Record<string, string>) => Promise<StepState>;
  labels: DocumentUploadLabels;
  messages: Record<string, string>;
}) {
  const router = useRouter();
  const id = useId();
  const [files, setFiles] = useState<File[]>([]);
  const [type, setType] = useState(defaultType);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();
  const message = (code: string) => messages[code] ?? messages.unknown ?? code;

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const file = files[0];
    if (!file) {
      setErrors({ file: 'required' });
      return;
    }
    startTransition(async () => {
      const supabase = createClient();
      const path = `${vendorId}/${storageName(file)}`;
      const { error } = await supabase.storage
        .from('vendor-documents')
        .upload(path, file, { contentType: file.type, upsert: false });
      if (error) {
        setErrors({ form: 'upload_failed' });
        return;
      }
      const result = await add({
        documentType: String(data.get('documentType') ?? ''),
        expiresOn: String(data.get('expiresOn') ?? ''),
        description: String(data.get('description') ?? ''),
        storagePath: path,
        fileName: file.name,
      });
      if (!result.ok) {
        await supabase.storage.from('vendor-documents').remove([path]);
        setErrors(result.errors ?? { form: result.error ?? 'unknown' });
        return;
      }
      setErrors({});
      setFiles([]);
      form.reset();
      setType(defaultType);
      router.refresh();
    });
  };

  const fieldError = (name: string) =>
    errors[name] ? (
      <p id={`${id}-${name}-error`} className="text-body-sm font-medium text-danger">
        {message(errors[name]!)}
      </p>
    ) : null;

  return (
    <form
      onSubmit={submit}
      noValidate
      aria-labelledby={`${id}-title`}
      className="grid gap-5 rounded-xl border border-border bg-card p-5 sm:p-6"
    >
      <h2 id={`${id}-title`} className="text-heading-md font-semibold">
        {labels.title}
      </h2>
      {errors.form && (
        <p role="alert" className="text-body-sm font-medium text-danger">
          {message(errors.form)}
        </p>
      )}
      <div className="grid gap-1.5">
        <label htmlFor={`${id}-type`} className="text-body font-medium">
          {labels.type}
        </label>
        <select
          id={`${id}-type`}
          name="documentType"
          value={type}
          onChange={(e) => setType(e.target.value)}
          className={clsx(fieldControlClasses, 'h-11 px-3')}
        >
          {types.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </div>
      {type === 'other' && (
        <div className="grid gap-1.5">
          <label htmlFor={`${id}-description`} className="text-body font-medium">
            {labels.description}
          </label>
          <input
            id={`${id}-description`}
            name="description"
            maxLength={200}
            aria-invalid={errors.description ? true : undefined}
            aria-describedby={errors.description ? `${id}-description-error` : undefined}
            className={clsx(fieldControlClasses, 'h-11 px-3.5')}
          />
          {fieldError('description')}
        </div>
      )}
      <div className="grid gap-1.5">
        <label htmlFor={`${id}-expires`} className="text-body font-medium">
          {labels.expires}
        </label>
        <p id={`${id}-expires-hint`} className="text-body-sm text-muted-foreground">
          {labels.expiresHint}
        </p>
        <input
          id={`${id}-expires`}
          name="expiresOn"
          type="date"
          aria-invalid={errors.expiresOn ? true : undefined}
          aria-describedby={clsx(`${id}-expires-hint`, errors.expiresOn && `${id}-expiresOn-error`)}
          className={clsx(fieldControlClasses, 'h-11 px-3.5 sm:max-w-56')}
        />
        {fieldError('expiresOn')}
      </div>
      <FileUpload
        label={labels.file}
        accept={accept}
        acceptLabel={acceptLabel}
        maxSizeBytes={maxSizeBytes}
        value={files}
        onChange={setFiles}
        error={errors.file ? message(errors.file) : undefined}
      />
      <button
        type="submit"
        disabled={pending}
        aria-disabled={pending}
        className={buttonVariants({ variant: 'outline', size: 'lg', className: 'w-full sm:w-fit' })}
      >
        {pending ? labels.adding : labels.add}
      </button>
    </form>
  );
}
