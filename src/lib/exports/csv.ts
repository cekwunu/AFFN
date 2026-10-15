/**
 * CSV for the accountant (TRX-03), made to open correctly in Excel with Norwegian settings:
 * semicolon-separated, decimal comma, UTF-8 with a byte-order mark (so "ø" survives), CRLF line
 * ends, and times in Europe/Oslo as "2027-06-12 10:30:00". Columns are documented in
 * docs/exports.md.
 */
import { OSLO_TIME_ZONE } from '@/lib/format';

export const BOM = '﻿';
export const SEPARATOR = ';';

export type Cell = string | number | null | undefined;

/** Øre as kroner with a decimal comma and no thousands separator: 123450 → "1234,50". */
export function money(ore: number | null | undefined): string {
  if (ore === null || ore === undefined) return '';
  if (!Number.isSafeInteger(ore)) throw new RangeError(`Not whole øre: ${ore}`);
  const sign = ore < 0 ? '-' : '';
  const abs = Math.abs(ore);
  return `${sign}${Math.floor(abs / 100)},${String(abs % 100).padStart(2, '0')}`;
}

const osloTime = new Intl.DateTimeFormat('sv-SE', {
  timeZone: OSLO_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

/** A timestamp as Oslo wall-clock time Excel reads as a date: "2027-06-12 10:30:00". */
export function time(value: string | Date | null | undefined): string {
  if (!value) return '';
  return osloTime.format(new Date(value));
}

/**
 * Text cell: quoted when it contains the separator, a quote or a line break; a leading = + - @
 * is neutralised so a spreadsheet never runs it as a formula.
 */
export function text(value: Cell): string {
  if (value === null || value === undefined) return '';
  let s = String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** A whole CSV file: header row, then rows; every cell already formatted (money/time/text). */
export function toCsv(headers: readonly string[], rows: readonly (readonly string[])[]): string {
  const line = (cells: readonly string[]) => cells.join(SEPARATOR);
  return `${BOM}${[line(headers.map(text)), ...rows.map(line)].join('\r\n')}\r\n`;
}
