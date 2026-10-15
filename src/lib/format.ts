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

/**
 * A wall-clock time in Oslo ("2027-06-12T10:30", as from <input type="datetime-local">) as the
 * UTC instant it denotes, summer time included. Null if the input is not such a time.
 */
export function osloLocalToUtc(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const [y, mo, d, h, mi] = match.slice(1).map(Number) as [number, number, number, number, number];
  const wall = Date.UTC(y, mo - 1, d, h, mi);
  const offset = (instant: number) => {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat('en-GB', {
        timeZone: OSLO_TIME_ZONE,
        hourCycle: 'h23',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })
        .formatToParts(instant)
        .map((p) => [p.type, p.value]),
    );
    const shown = Date.UTC(
      +parts.year!,
      +parts.month! - 1,
      +parts.day!,
      +parts.hour!,
      +parts.minute!,
    );
    return shown - instant;
  };
  // Two passes settle the offset around a summer-time change.
  let instant = wall - offset(wall);
  instant = wall - offset(instant);
  return Number.isNaN(instant) ? null : new Date(instant);
}
