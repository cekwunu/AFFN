'use client';

import { FileText, UploadCloud, X } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useId, useRef, useState, type DragEvent } from 'react';
import { formatFileSize, validateFiles, type FileRejectionReason } from '@/lib/files';
import { cn } from '@/lib/utils';
import { Button } from './button';

export interface FileUploadProps {
  label: string;
  /** Shown under the drop zone, e.g. what the document is for. */
  description?: string;
  accept?: readonly string[];
  /** Human list of accepted types for the hint, e.g. "PDF, JPG, PNG". */
  acceptLabel?: string;
  maxSizeBytes?: number;
  maxFiles?: number;
  disabled?: boolean;
  error?: string;
  value?: File[];
  onChange?: (files: File[]) => void;
  className?: string;
}

export function FileUpload({
  label,
  description,
  accept = [],
  acceptLabel,
  maxSizeBytes,
  maxFiles = 1,
  disabled,
  error,
  value,
  onChange,
  className,
}: FileUploadProps) {
  const t = useTranslations('Components.fileUpload');
  const locale = useLocale();
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [internal, setInternal] = useState<File[]>([]);
  const [rejections, setRejections] = useState<{ name: string; reason: FileRejectionReason }[]>([]);
  const [dragging, setDragging] = useState(false);
  const files = value ?? internal;

  const update = (next: File[]) => {
    if (value === undefined) setInternal(next);
    onChange?.(next);
  };

  const add = (incoming: File[]) => {
    const { accepted, rejected } = validateFiles(
      incoming,
      { accept, maxSizeBytes, maxFiles },
      files.length,
    );
    setRejections(rejected.map((r) => ({ name: r.file.name, reason: r.reason })));
    if (accepted.length) update([...files, ...accepted]);
  };

  const onDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setDragging(false);
    if (!disabled) add(Array.from(event.dataTransfer.files));
  };

  const limits = [
    acceptLabel && t('types', { types: acceptLabel }),
    maxSizeBytes && t('maxSize', { size: formatFileSize(maxSizeBytes, locale) }),
    maxFiles > 1 && t('maxFiles', { count: maxFiles }),
  ]
    .filter(Boolean)
    .join(' · ');

  const descriptionId = `${id}-description`;
  const errorId = `${id}-error`;
  const full = files.length >= maxFiles;

  return (
    <div className={cn('grid gap-3', className)}>
      <span className="text-body-sm font-medium" id={`${id}-label`}>
        {label}
      </span>
      <label
        htmlFor={id}
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled && !full) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          'flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed border-input bg-card px-6 py-8 text-center transition-colors duration-fast hover:bg-muted/50',
          'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring has-[:focus-visible]:outline-solid',
          dragging && 'border-primary bg-muted',
          error && 'border-danger',
          (disabled || full) && 'cursor-not-allowed opacity-60 hover:bg-card',
        )}
      >
        <UploadCloud className="size-7 text-muted-foreground" aria-hidden="true" />
        <span className="text-body-sm">
          <span className="font-semibold text-link">{t('choose')}</span> {t('orDrag')}
        </span>
        {limits && <span className="text-caption text-muted-foreground">{limits}</span>}
        <input
          ref={inputRef}
          id={id}
          type="file"
          className="sr-only"
          accept={accept.join(',') || undefined}
          multiple={maxFiles > 1}
          disabled={disabled || full}
          aria-labelledby={`${id}-label`}
          aria-describedby={
            [description && descriptionId, error && errorId].filter(Boolean).join(' ') || undefined
          }
          aria-invalid={error ? true : undefined}
          onChange={(event) => {
            add(Array.from(event.target.files ?? []));
            event.target.value = '';
          }}
        />
      </label>
      {description && (
        <p id={descriptionId} className="text-body-sm text-muted-foreground">
          {description}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-body-sm font-medium text-danger">
          {error}
        </p>
      )}
      <div aria-live="polite" className="grid gap-1">
        {rejections.map((rejection, index) => (
          <p key={`${rejection.name}-${index}`} className="text-body-sm text-danger">
            {t(`rejected.${rejection.reason}`, { name: rejection.name })}
          </p>
        ))}
      </div>
      {files.length > 0 && (
        <ul className="grid gap-2" aria-label={t('selected')}>
          {files.map((file, index) => (
            <li
              key={`${file.name}-${index}`}
              className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2"
            >
              <FileText className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-body-sm font-medium">{file.name}</span>
                <span className="text-caption text-muted-foreground">
                  {formatFileSize(file.size, locale)}
                </span>
              </span>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t('remove', { name: file.name })}
                onClick={() => {
                  update(files.filter((_, i) => i !== index));
                  setRejections([]);
                  inputRef.current?.focus();
                }}
                disabled={disabled}
              >
                <X />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
