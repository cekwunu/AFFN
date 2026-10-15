/**
 * Display formatting. Times are stored as UTC timestamptz and always shown in
 * Europe/Oslo, whatever the viewer's device time zone.
 */
import type { Locale } from '@/i18n/routing';
import { formatOre, type Ore } from './money/index';

export const OSLO_TIME_ZONE = 'Europe/Oslo';

const intlLocale: Record<Locale, string> = { nb: 'nb-NO', en: 'en-GB' };

/** "kr 1 234,50" in every locale (see formatOre). */
export function formatNok(amount: Ore): string {
  return formatOre(amount);
}

type DateInput = Date | string | number;

function toDate(value: DateInput): Date {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new RangeError(`Invalid date: ${String(value)}`);
  return date;
}

/** "29. mars 2026" (nb) / "29 Mar 2026" (en), as the date falls in Oslo. */
export function formatDateOslo(
  value: DateInput,
  locale: Locale,
  dateStyle: 'short' | 'medium' | 'long' = 'medium',
): string {
  return new Intl.DateTimeFormat(intlLocale[locale], {
    dateStyle,
    timeZone: OSLO_TIME_ZONE,
  }).format(toDate(value));
}

/** "29. mars 2026, 03:30" (nb) / "29 Mar 2026, 03:30" (en), 24-hour Oslo time. */
export function formatDateTimeOslo(value: DateInput, locale: Locale): string {
  return new Intl.DateTimeFormat(intlLocale[locale], {
    dateStyle: 'medium',
    timeStyle: 'short',
    hourCycle: 'h23',
    timeZone: OSLO_TIME_ZONE,
  }).format(toDate(value));
}

/** "03:30" in Oslo time. */
export function formatTimeOslo(value: DateInput, locale: Locale): string {
  return new Intl.DateTimeFormat(intlLocale[locale], {
    timeStyle: 'short',
    hourCycle: 'h23',
    timeZone: OSLO_TIME_ZONE,
  }).format(toDate(value));
}

/** The calendar day in Oslo as "YYYY-MM-DD", e.g. for grouping sales per festival day. */
export function osloDateKey(value: DateInput): string {
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: OSLO_TIME_ZONE,
  }).format(toDate(value));
}
