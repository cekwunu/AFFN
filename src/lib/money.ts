/**
 * Money helpers. All amounts are integer øre (1 kr = 100 øre); never floats.
 * The database stores øre as bigint; values here stay within Number.MAX_SAFE_INTEGER
 * (about NOK 90 trillion), and every helper throws rather than lose precision.
 */

export type Ore = number & { readonly __brand: 'Ore' };

/** Basis points: 1 % = 100 bp, so "10 %" is 1000 and 25 % mva is 2500. */
export type BasisPoints = number & { readonly __brand: 'BasisPoints' };

export const MVA_STANDARD_RATE = 2500 as BasisPoints;

function assertSafeInteger(value: number, what: string): void {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`${what} must be a safe integer, got ${value}`);
  }
}

/** Brands a number as øre. Throws on fractions, NaN, Infinity and unsafe integers. */
export function ore(value: number): Ore {
  assertSafeInteger(value, 'Øre amount');
  return value as Ore;
}

/** Brands a number as basis points. Throws unless it is a non-negative integer. */
export function basisPoints(value: number): BasisPoints {
  assertSafeInteger(value, 'Basis points');
  if (value < 0) throw new RangeError(`Basis points must not be negative, got ${value}`);
  return value as BasisPoints;
}

function fromBigInt(value: bigint): Ore {
  if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < BigInt(Number.MIN_SAFE_INTEGER)) {
    throw new RangeError(`Øre amount out of safe range: ${value}`);
  }
  return Number(value) as Ore;
}

const KRONER_PATTERN = /^(-)?(\d+)(?:[.,](\d{1,2}))?$/;

/**
 * Parses a kroner amount typed by a person or read from a CSV, without float maths.
 * Accepts "1234,50", "1 234,50", "1234.5", "-12". More than two decimals is rejected
 * rather than silently rounded.
 */
export function kronerToOre(input: string): Ore {
  const cleaned = input.replace(/[\s  ]/g, '');
  const match = KRONER_PATTERN.exec(cleaned);
  if (!match) throw new RangeError(`Not a valid kroner amount: "${input}"`);
  const [, minus, kroner = '0', fraction = ''] = match;
  const total = BigInt(kroner) * 100n + BigInt(fraction.padEnd(2, '0'));
  return fromBigInt(minus ? -total : total);
}

export function addOre(a: Ore, b: Ore): Ore {
  return fromBigInt(BigInt(a) + BigInt(b));
}

export function subtractOre(a: Ore, b: Ore): Ore {
  return fromBigInt(BigInt(a) - BigInt(b));
}

/** Sums order-line amounts. Totals are always sums of already-rounded lines. */
export function sumOre(amounts: readonly Ore[]): Ore {
  return fromBigInt(amounts.reduce((total, amount) => total + BigInt(amount), 0n));
}

/**
 * Integer division rounded half-up: 0.5 goes up. Negative values (refunds, reversals)
 * round half away from zero, so a reversal is the exact mirror of the original line.
 */
export function roundHalfUp(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) throw new RangeError('Denominator must be positive');
  if (numerator < 0n) return -roundHalfUp(-numerator, denominator);
  return (numerator * 2n + denominator) / (denominator * 2n);
}

/**
 * A percentage of an amount, rounded half-up to whole øre. Apply per order line,
 * never to a total.
 *
 * percentOf(ore(50000), basisPoints(1000)) === 5000  // 10 % of kr 500,00
 */
export function percentOf(amount: Ore, rate: BasisPoints): Ore {
  assertSafeInteger(amount, 'Øre amount');
  basisPoints(rate);
  return fromBigInt(roundHalfUp(BigInt(amount) * BigInt(rate), 10_000n));
}

function groupThousands(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

/**
 * Formats øre as "kr 1 234,50" in every locale. The spaces are non-breaking (U+00A0)
 * so an amount never wraps across lines. Negative: "kr -1 234,50".
 */
export function formatOre(amount: Ore): string {
  assertSafeInteger(amount, 'Øre amount');
  const value = BigInt(amount);
  const absolute = value < 0n ? -value : value;
  const kroner = groupThousands((absolute / 100n).toString());
  const fraction = (absolute % 100n).toString().padStart(2, '0');
  return `kr ${value < 0n ? '-' : ''}${kroner},${fraction}`;
}
