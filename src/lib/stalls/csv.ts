/**
 * Stall inventory CSV import (STL-01). Columns in order:
 * number, zone, size, width_cm, depth_cm, power, water, premium, fee_kr.
 * Comma or semicolon separated (Norwegian Excel uses semicolons), quotes allowed, an optional
 * heading line, fees in kroner ("2 500" or "2500,50") converted to øre without floats.
 */
import { kronerToOre } from '@/lib/money';

export interface StallRow {
  number: string;
  zone: string | null;
  sizeLabel: string | null;
  widthCm: number | null;
  depthCm: number | null;
  hasPower: boolean;
  hasWater: boolean;
  isPremium: boolean;
  feeOre: number;
}

export interface CsvRowError {
  line: number;
  code: 'columns' | 'required' | 'number' | 'boolean' | 'fee' | 'duplicate';
  column?: string;
}

/** Splits one CSV line, honouring double quotes ("" inside quotes is a quote). */
export function splitCsvLine(line: string, separator: string): string[] {
  const cells: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i]!;
    if (quoted) {
      if (char === '"' && line[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === separator) {
      cells.push(cell);
      cell = '';
    } else {
      cell += char;
    }
  }
  cells.push(cell);
  return cells.map((c) => c.trim());
}

const TRUE = new Set(['ja', 'j', 'yes', 'y', 'true', '1', 'x']);
const FALSE = new Set(['nei', 'n', 'no', 'false', '0', '']);

function parseBoolean(value: string): boolean | null {
  const v = value.toLowerCase();
  if (TRUE.has(v)) return true;
  if (FALSE.has(v)) return false;
  return null;
}

function parseCm(value: string): number | null | 'invalid' {
  if (!value) return null;
  if (!/^\d+$/.test(value) || Number(value) <= 0) return 'invalid';
  return Number(value);
}

const looksLikeHeading = (cells: string[]) =>
  /^(nummer|number|nr\.?|stand|stall)$/i.test(cells[0] ?? '');

export function parseStallCsv(text: string): { rows: StallRow[]; errors: CsvRowError[] } {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/);
  const firstContent = lines.find((l) => l.trim());
  const separator =
    firstContent && firstContent.split(';').length > firstContent.split(',').length ? ';' : ',';
  const rows: StallRow[] = [];
  const errors: CsvRowError[] = [];
  const seen = new Set<string>();

  lines.forEach((raw, index) => {
    const line = index + 1;
    if (!raw.trim()) return;
    const cells = splitCsvLine(raw, separator);
    if (rows.length === 0 && errors.length === 0 && looksLikeHeading(cells)) return;
    if (cells.length < 9) {
      errors.push({ line, code: 'columns' });
      return;
    }
    const [number, zone, size, width, depth, power, water, premium, fee] = cells as [
      string,
      string,
      string,
      string,
      string,
      string,
      string,
      string,
      string,
    ];
    if (!number) return (errors.push({ line, code: 'required', column: 'number' }), undefined);
    if (seen.has(number.toUpperCase())) {
      errors.push({ line, code: 'duplicate', column: 'number' });
      return;
    }
    const widthCm = parseCm(width);
    const depthCm = parseCm(depth);
    if (widthCm === 'invalid')
      return (errors.push({ line, code: 'number', column: 'width' }), undefined);
    if (depthCm === 'invalid')
      return (errors.push({ line, code: 'number', column: 'depth' }), undefined);
    const flags = [parseBoolean(power), parseBoolean(water), parseBoolean(premium)];
    const flagNames = ['power', 'water', 'premium'];
    const bad = flags.findIndex((f) => f === null);
    if (bad >= 0)
      return (errors.push({ line, code: 'boolean', column: flagNames[bad] }), undefined);
    let feeOre: number;
    try {
      feeOre = kronerToOre(fee || '0');
      if (feeOre < 0) throw new RangeError('negative');
    } catch {
      errors.push({ line, code: 'fee', column: 'fee' });
      return;
    }
    seen.add(number.toUpperCase());
    rows.push({
      number,
      zone: zone || null,
      sizeLabel: size || null,
      widthCm,
      depthCm,
      hasPower: flags[0]!,
      hasWater: flags[1]!,
      isPremium: flags[2]!,
      feeOre,
    });
  });
  return { rows, errors };
}

/** Pin position from a click: basis points (0–10 000) of the image's width and height. */
export function pinFromClick(
  click: { x: number; y: number },
  box: { left: number; top: number; width: number; height: number },
): { x: number; y: number } {
  const clamp = (v: number) => Math.min(10_000, Math.max(0, Math.round(v)));
  return {
    x: clamp(((click.x - box.left) / box.width) * 10_000),
    y: clamp(((click.y - box.top) / box.height) * 10_000),
  };
}
