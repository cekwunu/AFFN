/** Client-side file checks for uploads. The server must validate again. */

export interface FileLike {
  name: string;
  size: number;
  type: string;
}

export type FileRejectionReason = 'type' | 'size' | 'count';

export interface FileRules {
  /** MIME types ("application/pdf"), wildcards ("image/*") or extensions (".pdf"). Empty = any. */
  accept?: readonly string[];
  maxSizeBytes?: number;
  maxFiles?: number;
}

export function isAccepted(file: FileLike, accept: readonly string[] = []): boolean {
  if (accept.length === 0) return true;
  const name = file.name.toLowerCase();
  const type = file.type.toLowerCase();
  return accept.some((rule) => {
    const r = rule.trim().toLowerCase();
    if (r.startsWith('.')) return name.endsWith(r);
    if (r.endsWith('/*')) return type.startsWith(r.slice(0, -1));
    return type === r;
  });
}

/**
 * Splits new files into accepted and rejected, given how many are already selected.
 * Order is preserved; once maxFiles is reached, further valid files are rejected as 'count'.
 */
export function validateFiles<T extends FileLike>(
  files: readonly T[],
  rules: FileRules,
  alreadySelected = 0,
): { accepted: T[]; rejected: { file: T; reason: FileRejectionReason }[] } {
  const accepted: T[] = [];
  const rejected: { file: T; reason: FileRejectionReason }[] = [];
  for (const file of files) {
    if (!isAccepted(file, rules.accept)) rejected.push({ file, reason: 'type' });
    else if (rules.maxSizeBytes !== undefined && file.size > rules.maxSizeBytes)
      rejected.push({ file, reason: 'size' });
    else if (rules.maxFiles !== undefined && alreadySelected + accepted.length >= rules.maxFiles)
      rejected.push({ file, reason: 'count' });
    else accepted.push(file);
  }
  return { accepted, rejected };
}

/** "2,4 MB" / "2.4 MB" — decimal units, as file managers show them. */
export function formatFileSize(bytes: number, locale: string): string {
  const units = ['byte', 'kilobyte', 'megabyte', 'gigabyte'] as const;
  let value = bytes;
  let unit = 0;
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000;
    unit += 1;
  }
  return new Intl.NumberFormat(locale === 'nb' ? 'nb-NO' : 'en-GB', {
    style: 'unit',
    unit: units[unit],
    unitDisplay: 'short',
    maximumFractionDigits: unit === 0 ? 0 : 1,
  }).format(value);
}
