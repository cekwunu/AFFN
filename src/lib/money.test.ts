import { describe, expect, it } from 'vitest';
import {
  addOre,
  basisPoints,
  formatOre,
  kronerToOre,
  MVA_STANDARD_RATE,
  ore,
  percentOf,
  roundHalfUp,
  subtractOre,
  sumOre,
} from './money';

/** Test readability only: shows the non-breaking spaces as plain spaces. */
const plain = (s: string) => s.replace(/ /g, ' ');

describe('ore', () => {
  it('accepts integers, including negatives and zero', () => {
    expect(ore(0)).toBe(0);
    expect(ore(123450)).toBe(123450);
    expect(ore(-500)).toBe(-500);
  });

  it.each([12.5, 0.1, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1])(
    'rejects %s',
    (value) => {
      expect(() => ore(value)).toThrow(RangeError);
    },
  );
});

describe('basisPoints', () => {
  it('rejects negative and fractional rates', () => {
    expect(() => basisPoints(-1)).toThrow(RangeError);
    expect(() => basisPoints(10.5)).toThrow(RangeError);
    expect(basisPoints(1000)).toBe(1000);
  });
});

describe('kronerToOre', () => {
  it.each([
    ['500', 50000],
    ['1234,50', 123450],
    ['1 234,50', 123450],
    ['1 234,5', 123450],
    ['12.05', 1205],
    ['0,01', 1],
    ['-12', -1200],
  ])('parses %j as %i øre', (input, expected) => {
    expect(kronerToOre(input)).toBe(expected);
  });

  it.each(['', 'kr 12', '12,345', '1,2,3', '12,', ',5', 'abc'])('rejects %j', (input) => {
    expect(() => kronerToOre(input)).toThrow(RangeError);
  });

  it('does not use float maths (0.1 + 0.2 style errors)', () => {
    expect(addOre(kronerToOre('0,10'), kronerToOre('0,20'))).toBe(30);
  });
});

describe('addOre, subtractOre, sumOre', () => {
  it('adds and subtracts exactly', () => {
    expect(addOre(ore(50000), ore(-6250))).toBe(43750);
    expect(subtractOre(ore(50000), ore(6250))).toBe(43750);
  });

  it('sums a list, and an empty list is zero', () => {
    expect(sumOre([ore(100), ore(250), ore(-50)])).toBe(300);
    expect(sumOre([])).toBe(0);
  });

  it('throws instead of losing precision on overflow', () => {
    expect(() => addOre(ore(Number.MAX_SAFE_INTEGER), ore(1))).toThrow(RangeError);
  });
});

describe('roundHalfUp', () => {
  it('rounds .5 up and below .5 down', () => {
    expect(roundHalfUp(5n, 10n)).toBe(1n);
    expect(roundHalfUp(4n, 10n)).toBe(0n);
    expect(roundHalfUp(15n, 10n)).toBe(2n);
    expect(roundHalfUp(25n, 10n)).toBe(3n); // not banker's rounding
    expect(roundHalfUp(20n, 10n)).toBe(2n);
  });

  it('mirrors negatives so a reversal cancels its original', () => {
    expect(roundHalfUp(-5n, 10n)).toBe(-1n);
    expect(roundHalfUp(-4n, 10n)).toBe(0n);
    expect(roundHalfUp(-25n, 10n) + roundHalfUp(25n, 10n)).toBe(0n);
  });

  it('rejects a zero or negative denominator', () => {
    expect(() => roundHalfUp(1n, 0n)).toThrow(RangeError);
    expect(() => roundHalfUp(1n, -1n)).toThrow(RangeError);
  });
});

describe('percentOf', () => {
  it('reproduces the PRD §6 worked example: kr 500 sale at 10 % + mva', () => {
    const gross = kronerToOre('500');
    const commission = percentOf(gross, basisPoints(1000));
    const mva = percentOf(commission, MVA_STANDARD_RATE);
    const platformFee = addOre(commission, mva);
    const payout = subtractOre(gross, platformFee);

    expect(commission).toBe(5000);
    expect(mva).toBe(1250);
    expect(platformFee).toBe(6250);
    expect(payout).toBe(43750);
  });

  it('rounds half-up at the half-øre boundary', () => {
    expect(percentOf(ore(5), basisPoints(1000))).toBe(1); // 0.5 øre → 1
    expect(percentOf(ore(4), basisPoints(1000))).toBe(0); // 0.4 øre → 0
    expect(percentOf(ore(1050), basisPoints(1250))).toBe(131); // 131.25 → 131
    expect(percentOf(ore(1004), basisPoints(1250))).toBe(126); // 125.5 → 126
  });

  it('handles refunds (negative amounts) symmetrically', () => {
    expect(percentOf(ore(-5), basisPoints(1000))).toBe(-1);
    expect(percentOf(ore(-50000), basisPoints(1000))).toBe(-5000);
  });

  it('handles 0 % and 100 %', () => {
    expect(percentOf(ore(12345), basisPoints(0))).toBe(0);
    expect(percentOf(ore(12345), basisPoints(10000))).toBe(12345);
  });

  it('rejects a fractional amount or rate', () => {
    expect(() => percentOf(1.5 as never, basisPoints(1000))).toThrow(RangeError);
    expect(() => percentOf(ore(100), 10.5 as never)).toThrow(RangeError);
  });

  it('per-line rounding differs from rounding the total, which is why we round per line', () => {
    const lines = [ore(5), ore(5), ore(5)]; // three kr 0,05 lines at 10 %
    const perLine = sumOre(lines.map((line) => percentOf(line, basisPoints(1000))));
    const onTotal = percentOf(sumOre(lines), basisPoints(1000));
    expect(perLine).toBe(3); // 1 + 1 + 1
    expect(onTotal).toBe(2); // 1.5 → 2
  });
});

describe('formatOre', () => {
  it.each([
    [123450, 'kr 1 234,50'],
    [0, 'kr 0,00'],
    [5, 'kr 0,05'],
    [50000, 'kr 500,00'],
    [100000000, 'kr 1 000 000,00'],
    [-123450, 'kr -1 234,50'],
  ])('formats %i øre as %j', (amount, expected) => {
    expect(plain(formatOre(ore(amount)))).toBe(expected);
  });

  it('uses non-breaking spaces so amounts never wrap', () => {
    expect(formatOre(ore(123450))).toBe('kr 1 234,50');
  });
});
