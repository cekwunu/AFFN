/**
 * The vendor application (VEN-01, VEN-04): steps, categories, field rules. Pure and shared by the
 * server actions and the forms. Messages are error codes; the UI translates them.
 */
import { z } from 'zod';

export const STEPS = [
  'business',
  'contact',
  'profile',
  'stall',
  'documents',
  'agreement',
  'review',
] as const;
export type Step = (typeof STEPS)[number];

export function isStep(value: string): value is Step {
  return (STEPS as readonly string[]).includes(value);
}

export const FOOD_CATEGORIES = [
  'hot-food',
  'street-food',
  'bakery-desserts',
  'drinks-coffee',
] as const;
export const CATEGORIES = [
  ...FOOD_CATEGORIES,
  'groceries-spices',
  'fashion-crafts',
  'beauty-wellness',
  'other',
] as const;
export type Category = (typeof CATEGORIES)[number];

/** Food vendors must upload Mattilsynet registration (matloven). */
export function isFoodCategory(category: string | null | undefined): boolean {
  return (FOOD_CATEGORIES as readonly string[]).includes(category ?? '');
}

/** African countries (ISO 3166-1 alpha-2) for "cuisine country"; names come from Intl. */
export const CUISINE_COUNTRIES = [
  'DZ', 'AO', 'BJ', 'BW', 'BF', 'BI', 'CV', 'CM', 'CF', 'TD', 'KM', 'CG', 'CD', 'CI', 'DJ', 'EG',
  'GQ', 'ER', 'SZ', 'ET', 'GA', 'GM', 'GH', 'GN', 'GW', 'KE', 'LS', 'LR', 'LY', 'MG', 'MW', 'ML',
  'MR', 'MU', 'MA', 'MZ', 'NA', 'NE', 'NG', 'RW', 'ST', 'SN', 'SC', 'SL', 'SO', 'ZA', 'SS', 'SD',
  'TZ', 'TG', 'TN', 'UG', 'ZM', 'ZW',
] as const; // prettier-ignore

/** Countries sorted by their name in the given language. */
export function cuisineCountryOptions(locale: string): { value: string; label: string }[] {
  const names = new Intl.DisplayNames([locale], { type: 'region' });
  return CUISINE_COUNTRIES.map((code) => ({ value: code, label: names.of(code) ?? code })).sort(
    (a, b) => a.label.localeCompare(b.label, locale),
  );
}

/**
 * Norwegian phone numbers: 8 digits, with or without +47 / 0047, spaces or dashes.
 * Returns "+47 XXX XX XXX", or null when it is not a Norwegian number.
 */
export function normalizePhone(input: string): string | null {
  const digits = input.replace(/[\s\-(). ]/g, '');
  const match = /^(?:\+47|0047)?([2-9]\d{7})$/.exec(digits);
  if (!match) return null;
  const n = match[1]!;
  return `+47 ${n.slice(0, 3)} ${n.slice(3, 5)} ${n.slice(5)}`;
}

/** Adds https:// when missing; null when it is not a web address. */
export function normalizeUrl(input: string): string | null {
  const value = input.trim();
  if (!value) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    if (!/^https?:$/.test(url.protocol) || !url.hostname.includes('.')) return null;
    return url.toString();
  } catch {
    return null;
  }
}

/** "@mama.afrika", "instagram.com/mama.afrika/" → "mama.afrika". */
export function normalizeHandle(input: string): string | null {
  const value = input
    .trim()
    .replace(/^https?:\/\/(www\.)?(instagram|tiktok)\.com\//i, '')
    .replace(/^@/, '')
    .replace(/\/+$/, '');
  if (!value) return null;
  return /^[A-Za-z0-9._]{1,30}$/.test(value) ? value : null;
}

const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => (value === '' || value == null ? undefined : value), schema.optional());

const trimmed = (min: number, max: number) =>
  z.string().trim().min(min, 'too_short').max(max, 'too_long');

export const contactSchema = z.object({
  contactName: trimmed(2, 120),
  contactEmail: z.email('email').trim().toLowerCase(),
  contactPhone: z.string().transform((value, ctx) => {
    const phone = normalizePhone(value);
    if (!phone) {
      ctx.addIssue({ code: 'custom', message: 'phone' });
      return z.NEVER;
    }
    return phone;
  }),
});

const urlField = optional(
  z.string().transform((value, ctx) => {
    const url = normalizeUrl(value);
    if (!url) {
      ctx.addIssue({ code: 'custom', message: 'url' });
      return z.NEVER;
    }
    return url;
  }),
);
const handleField = optional(
  z.string().transform((value, ctx) => {
    const handle = normalizeHandle(value);
    if (!handle) {
      ctx.addIssue({ code: 'custom', message: 'handle' });
      return z.NEVER;
    }
    return handle;
  }),
);

export const profileSchema = z
  .object({
    displayName: trimmed(2, 80),
    category: z.enum(CATEGORIES, 'required'),
    cuisineCountry: optional(z.enum(CUISINE_COUNTRIES, 'required')),
    description: trimmed(20, 600),
    websiteUrl: urlField,
    instagramHandle: handleField,
    facebookUrl: urlField,
    tiktokHandle: handleField,
  })
  .superRefine((value, ctx) => {
    if (isFoodCategory(value.category) && !value.cuisineCountry) {
      ctx.addIssue({ code: 'custom', path: ['cuisineCountry'], message: 'required' });
    }
  });

export const stallSchema = z.object({
  stallTypeId: z.uuid('required'),
  needsPower: z.preprocess((value) => value === 'on' || value === 'true', z.boolean()),
  needsWater: z.preprocess((value) => value === 'on' || value === 'true', z.boolean()),
  preferredZone: optional(trimmed(1, 60)),
});

export const DOCUMENT_TYPES = ['mattilsynet_registration', 'insurance', 'other'] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];
export const DOCUMENT_ACCEPT = ['application/pdf', 'image/jpeg', 'image/png'] as const;
// Below the bucket limits (10 MiB / 5 MiB), and shown to vendors as "10 MB" / "5 MB".
export const DOCUMENT_MAX_BYTES = 10_000_000;
export const MEDIA_ACCEPT = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const MEDIA_MAX_BYTES = 5_000_000;

export const documentSchema = z.object({
  documentType: z.enum(DOCUMENT_TYPES, 'required'),
  expiresOn: optional(
    z.iso.date('date').refine((value) => value >= new Date().toISOString().slice(0, 10), 'expired'),
  ),
  description: optional(trimmed(2, 200)),
  storagePath: z.string().min(3),
  fileName: z.string().trim().min(1).max(200),
});

/** Field errors as { field: code } from a failed parse. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of error.issues) {
    const field = String(issue.path[0] ?? 'form');
    errors[field] ??= issue.message;
  }
  return errors;
}

export interface ApplicationProgress {
  completed?: Step[];
  drafts?: Partial<Record<Step, Record<string, string>>>;
}

/** Steps that still need work before submitting, in order. */
export function missingSteps(
  progress: ApplicationProgress,
  facts: { hasAgreement: boolean; documentsOk: boolean },
): Step[] {
  const done = new Set(progress.completed ?? []);
  return STEPS.filter((step) => {
    if (step === 'review') return false;
    if (step === 'agreement') return !facts.hasAgreement;
    if (step === 'documents') return !facts.documentsOk;
    return !done.has(step);
  });
}

/** Where to resume: the first unfinished step, or the review. */
export function resumeStep(
  progress: ApplicationProgress,
  facts: { hasAgreement: boolean; documentsOk: boolean },
): Step {
  return missingSteps(progress, facts)[0] ?? 'review';
}

/** Food vendors need a Mattilsynet document that has not been rejected. */
export function documentsComplete(
  category: string | null,
  documents: readonly { document_type: string; status: string }[],
): boolean {
  if (!isFoodCategory(category)) return true;
  return documents.some(
    (d) => d.document_type === 'mattilsynet_registration' && d.status !== 'rejected',
  );
}

/**
 * Facts for missingSteps/resumeStep. Documents only count as done once the profile (and so the
 * category, which decides whether Mattilsynet proof is needed) is saved.
 */
export function applicationFacts(application: {
  progress: ApplicationProgress;
  agreement: unknown;
  vendor: { category: string | null };
  documents: readonly { document_type: string; status: string }[];
}): { hasAgreement: boolean; documentsOk: boolean } {
  return {
    hasAgreement: !!application.agreement,
    documentsOk:
      (application.progress.completed ?? []).includes('profile') &&
      documentsComplete(application.vendor.category, application.documents),
  };
}

/** Only drafts and applications sent back for more information can be edited. */
export function isEditable(status: string): boolean {
  return status === 'draft' || status === 'more_info_requested';
}
