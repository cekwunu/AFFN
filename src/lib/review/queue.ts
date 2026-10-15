/** Review queue filters (REV-01): parsed from the URL, applied to the event's applications. */

export const QUEUE_STATUSES = [
  'submitted',
  'under_review',
  'more_info_requested',
  'waitlisted',
  'approved',
  'rejected',
  'draft',
] as const;

export interface QueueFilters {
  q: string;
  status: string | null;
  category: string | null;
  documents: 'complete' | 'missing' | null;
  from: string | null;
  to: string | null;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

type Params = Record<string, string | string[] | undefined>;
const one = (params: Params, key: string) => {
  const value = params[key];
  return (Array.isArray(value) ? value[0] : value)?.trim() || null;
};

export function parseQueueFilters(params: Params): QueueFilters {
  const documents = one(params, 'documents');
  const from = one(params, 'from');
  const to = one(params, 'to');
  return {
    q: one(params, 'q') ?? '',
    status: one(params, 'status'),
    category: one(params, 'category'),
    documents: documents === 'complete' || documents === 'missing' ? documents : null,
    from: from && DATE.test(from) ? from : null,
    to: to && DATE.test(to) ? to : null,
  };
}

/** The Oslo calendar day of a timestamp, "YYYY-MM-DD". */
function osloDay(value: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Oslo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(value));
}

const COMBINING_MARKS = new RegExp('[\\u0300-\\u036f]', 'g');

/** Lower case, no spaces, no accents; æ ø å as ae o a, so "kjokken" finds "Kjøkken". */
const normalize = (value: string) =>
  value
    .toLocaleLowerCase('nb')
    .replace(/æ/g, 'ae')
    .replace(/ø/g, 'o')
    .replace(/å/g, 'a')
    .normalize('NFKD')
    .replace(COMBINING_MARKS, '')
    .replace(/\s+/g, '');

export interface QueueRowLike {
  status: string;
  submittedAt: string | null;
  vendorName: string;
  legalName: string;
  orgNumber: string;
  category: string | null;
  contactName: string | null;
  contactEmail: string | null;
  documentsComplete: boolean;
}

export function matchesQueue(row: QueueRowLike, filters: QueueFilters): boolean {
  if (filters.status && row.status !== filters.status) return false;
  if (filters.category && row.category !== filters.category) return false;
  if (filters.documents === 'complete' && !row.documentsComplete) return false;
  if (filters.documents === 'missing' && row.documentsComplete) return false;
  if (filters.from || filters.to) {
    if (!row.submittedAt) return false;
    const day = osloDay(row.submittedAt);
    if (filters.from && day < filters.from) return false;
    if (filters.to && day > filters.to) return false;
  }
  if (filters.q) {
    const needle = normalize(filters.q);
    const haystack = [
      row.vendorName,
      row.legalName,
      row.orgNumber,
      row.contactName ?? '',
      row.contactEmail ?? '',
    ].map(normalize);
    if (!haystack.some((value) => value.includes(needle))) return false;
  }
  return true;
}

/** Expiry warning for a document relative to today and the end of the event (REV-01). */
export function expiryWarning(
  expiresOn: string | null,
  eventEndsAt: string | null,
  today = new Date(),
): 'expired' | 'beforeEvent' | null {
  if (!expiresOn) return null;
  const todayKey = osloDay(today.toISOString());
  if (expiresOn < todayKey) return 'expired';
  if (eventEndsAt && expiresOn < osloDay(eventEndsAt)) return 'beforeEvent';
  return null;
}
