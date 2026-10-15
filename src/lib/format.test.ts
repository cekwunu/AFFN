import { describe, expect, it } from 'vitest';
import {
  formatDateOslo,
  formatDateTimeOslo,
  formatNok,
  formatTimeOslo,
  osloDateKey,
} from './format';
import { ore } from './money';

describe('formatNok', () => {
  it('formats øre as "kr 1 234,50" with non-breaking spaces', () => {
    expect(formatNok(ore(123450))).toBe('kr 1 234,50');
  });
});

describe('Oslo dates', () => {
  // Summer time starts 29 March 2026 at 01:00 UTC (02:00 → 03:00 local).
  const beforeDst = '2026-03-29T00:30:00Z';
  const afterDst = '2026-03-29T01:30:00Z';

  it('shows Oslo time on both sides of the summer-time switch', () => {
    expect(formatTimeOslo(beforeDst, 'nb')).toBe('01:30');
    expect(formatTimeOslo(afterDst, 'nb')).toBe('03:30');
  });

  it('formats dates in bokmål and English', () => {
    expect(formatDateOslo(afterDst, 'nb')).toBe('29. mars 2026');
    expect(formatDateOslo(afterDst, 'en')).toBe('29 Mar 2026');
    expect(formatDateOslo(afterDst, 'nb', 'short')).toBe('29.03.2026');
    expect(formatDateTimeOslo(afterDst, 'nb')).toBe('29. mars 2026, 03:30');
    expect(formatDateTimeOslo(afterDst, 'en')).toBe('29 Mar 2026, 03:30');
  });

  it('uses the Oslo calendar day, not the UTC day', () => {
    // 23:30 UTC on 14 Oct is 01:30 on 15 Oct in Oslo (CEST, UTC+2).
    expect(osloDateKey('2026-10-14T23:30:00Z')).toBe('2026-10-15');
    expect(osloDateKey(new Date('2026-10-14T21:59:00Z'))).toBe('2026-10-14');
  });

  it('rejects invalid dates', () => {
    expect(() => formatDateOslo('not a date', 'nb')).toThrow(RangeError);
  });
});

describe('osloLocalToUtc', () => {
  it('converts Oslo wall-clock time to UTC, summer and winter', async () => {
    const { osloLocalToUtc } = await import('./format');
    expect(osloLocalToUtc('2027-06-12T10:30')?.toISOString()).toBe('2027-06-12T08:30:00.000Z');
    expect(osloLocalToUtc('2027-01-15T00:00')?.toISOString()).toBe('2027-01-14T23:00:00.000Z');
    expect(osloLocalToUtc('2027-03-28T03:30')?.toISOString()).toBe('2027-03-28T01:30:00.000Z');
    expect(osloLocalToUtc('12.06.2027')).toBeNull();
  });
});
