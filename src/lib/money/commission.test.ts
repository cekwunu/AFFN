import { describe, expect, it } from 'vitest';
import {
  calculateCommission,
  formatCommissionTerms,
  formatPercent,
  proRataFeeReversal,
  resolveCommissionRule,
  type CommissionRule,
} from './commission';
import { ore } from './index';

const rule = (overrides: Partial<CommissionRule>): CommissionRule => ({
  scope: 'organization',
  type: 'percentage',
  rateBp: 1000,
  fixedOre: null,
  eventId: null,
  categoryId: null,
  vendorId: null,
  effectiveFrom: '2026-01-01T00:00:00Z',
  ...overrides,
});

describe('calculateCommission (PRD §6)', () => {
  it('matches the PRD worked example: kr 500 at 10 % + mva → vendor kr 437,50', () => {
    expect(calculateCommission(ore(50_000), rule({}))).toEqual({
      gross: 50_000,
      commission: 5_000,
      mva: 1_250,
      platformFee: 6_250,
      vendorPayout: 43_750,
    });
  });

  it('rounds half-up per order, on commission and then on its mva', () => {
    // 10 % of 105 øre = 10,5 → 11; 25 % of 11 = 2,75 → 3.
    expect(calculateCommission(ore(105), rule({}))).toMatchObject({ commission: 11, mva: 3 });
    // 12,5 % of 99 øre = 12,375 → 12; 25 % of 12 = 3.
    expect(calculateCommission(ore(99), rule({ rateBp: 1250 }))).toMatchObject({
      commission: 12,
      mva: 3,
      vendorPayout: 84,
    });
    // 10 % of 104 = 10,4 → 10 (down); 25 % of 10 = 2,5 → 3 (half goes up).
    expect(calculateCommission(ore(104), rule({}))).toMatchObject({ commission: 10, mva: 3 });
    // 10 % of 14 = 1,4 → 1; 25 % of 1 = 0,25 → 0.
    expect(calculateCommission(ore(14), rule({}))).toMatchObject({ commission: 1, mva: 0 });
  });

  it('never loses an øre: gross = vendor payout + commission + mva', () => {
    for (const gross of [1, 7, 99, 105, 999, 12_345, 50_000, 123_457, 9_999_999]) {
      for (const rateBp of [0, 1, 333, 750, 1000, 1250, 2000]) {
        const r = calculateCommission(ore(gross), rule({ rateBp }));
        expect(r.vendorPayout + r.commission + r.mva).toBe(gross);
        expect(r.platformFee).toBe(r.commission + r.mva);
      }
    }
  });

  it('supports fixed and hybrid commission', () => {
    expect(calculateCommission(ore(10_000), rule({ type: 'fixed', fixedOre: 500 }))).toMatchObject({
      commission: 500,
      mva: 125,
      vendorPayout: 9_375,
    });
    expect(
      calculateCommission(ore(10_000), rule({ type: 'hybrid', rateBp: 500, fixedOre: 200 })),
    ).toMatchObject({ commission: 700, mva: 175, platformFee: 875, vendorPayout: 9_125 });
    // A percentage rule ignores a stray fixed amount and vice versa.
    expect(
      calculateCommission(ore(10_000), rule({ type: 'percentage', fixedOre: 999 })).commission,
    ).toBe(1_000);
    expect(
      calculateCommission(ore(10_000), rule({ type: 'fixed', rateBp: 9_999, fixedOre: 300 }))
        .commission,
    ).toBe(300);
  });

  it('a 0 % rule takes nothing', () => {
    expect(calculateCommission(ore(50_000), rule({ rateBp: 0 }))).toMatchObject({
      platformFee: 0,
      vendorPayout: 50_000,
    });
  });

  it('refuses a fee larger than the sale (a fixed fee on a tiny order)', () => {
    expect(() => calculateCommission(ore(400), rule({ type: 'fixed', fixedOre: 500 }))).toThrow(
      RangeError,
    );
    // Exactly the whole sale is allowed: 400 commission + 100 mva on 500.
    expect(calculateCommission(ore(500), rule({ type: 'fixed', fixedOre: 400 })).vendorPayout).toBe(
      0,
    );
  });

  it('a refund (negative gross) mirrors the sale exactly', () => {
    for (const r of [rule({}), rule({ type: 'hybrid', rateBp: 500, fixedOre: 200 })]) {
      const sale = calculateCommission(ore(10_505), r);
      const refund = calculateCommission(ore(-10_505), r);
      expect(refund.commission).toBe(-sale.commission);
      expect(refund.mva).toBe(-sale.mva);
      expect(refund.vendorPayout).toBe(-sale.vendorPayout);
    }
  });
});

describe('proRataFeeReversal (PRD §5)', () => {
  it('reverses the whole fee on a full refund', () => {
    expect(proRataFeeReversal(ore(6_250), ore(50_000), ore(50_000))).toBe(6_250);
    expect(proRataFeeReversal(ore(3), ore(105), ore(105))).toBe(3);
  });

  it('reverses pro rata, half-up, on a partial refund', () => {
    // Half of kr 500 → half of kr 62,50.
    expect(proRataFeeReversal(ore(6_250), ore(50_000), ore(25_000))).toBe(3_125);
    // 6 250 × 1/3 = 2 083,33 → 2 083.
    expect(proRataFeeReversal(ore(6_250), ore(30_000), ore(10_000))).toBe(2_083);
    // 5 × 1/2 = 2,5 → 3.
    expect(proRataFeeReversal(ore(5), ore(100), ore(50))).toBe(3);
  });

  it('two partial refunds never reverse more than the fee', () => {
    const first = proRataFeeReversal(ore(6_250), ore(30_000), ore(15_000));
    const rest = 6_250 - first;
    expect(first + rest).toBe(6_250);
    expect(first).toBeLessThanOrEqual(6_250);
  });

  it('rejects impossible refunds', () => {
    expect(() => proRataFeeReversal(ore(100), ore(1_000), ore(0))).toThrow(RangeError);
    expect(() => proRataFeeReversal(ore(100), ore(1_000), ore(1_001))).toThrow(RangeError);
    expect(() => proRataFeeReversal(ore(100), ore(0), ore(1))).toThrow(RangeError);
  });
});

describe('resolveCommissionRule', () => {
  const event = 'event-1';
  const rules = [
    rule({ scope: 'organization', rateBp: 1000 }),
    rule({ scope: 'event', eventId: event, rateBp: 900 }),
    rule({ scope: 'category', categoryId: 'drinks', rateBp: 800 }),
    rule({ scope: 'vendor', vendorId: 'v-1', rateBp: 700 }),
    rule({ scope: 'vendor', vendorId: 'v-1', rateBp: 600, effectiveFrom: '2030-01-01T00:00:00Z' }),
  ];
  const at = new Date('2027-06-12T12:00:00Z');
  const rate = (opts: Parameters<typeof resolveCommissionRule>[1]) =>
    resolveCommissionRule(rules, opts)?.rateBp ?? null;

  it('follows vendor → category → event → organization', () => {
    expect(rate({ vendorId: 'v-1', categoryIds: ['drinks'], eventId: event, at })).toBe(700);
    expect(rate({ vendorId: 'v-2', categoryIds: ['drinks', 'drinks'], eventId: event, at })).toBe(
      800,
    );
    expect(rate({ vendorId: 'v-2', eventId: event, at })).toBe(900);
    expect(rate({ eventId: 'event-2', at })).toBe(1000);
  });

  it('uses a category rule only when every item is in that category', () => {
    expect(rate({ vendorId: 'v-2', categoryIds: ['drinks', 'mains'], eventId: event, at })).toBe(
      900,
    );
    expect(rate({ vendorId: 'v-2', categoryIds: ['drinks', null], eventId: event, at })).toBe(900);
    expect(rate({ vendorId: 'v-2', categoryIds: [], eventId: event, at })).toBe(900);
  });

  it('ignores rules of another event and rules not yet in force', () => {
    const other = [
      rule({ scope: 'event', eventId: 'event-2', rateBp: 500 }),
      rule({ scope: 'vendor', vendorId: 'v-1', eventId: 'event-2', rateBp: 400 }),
      rule({ scope: 'organization', rateBp: 1000 }),
    ];
    expect(resolveCommissionRule(other, { vendorId: 'v-1', eventId: event, at })?.rateBp).toBe(
      1000,
    );
    expect(rate({ vendorId: 'v-1', eventId: event, at: new Date('2031-01-01T00:00:00Z') })).toBe(
      600,
    );
    expect(resolveCommissionRule([], { eventId: event, at })).toBeNull();
  });

  it('picks the latest rule in force within a scope', () => {
    const history = [
      rule({ scope: 'organization', rateBp: 1000, effectiveFrom: '2026-01-01T00:00:00Z' }),
      rule({ scope: 'organization', rateBp: 1100, effectiveFrom: '2027-03-01T00:00:00Z' }),
      rule({ scope: 'organization', rateBp: 1200, effectiveFrom: '2027-09-01T00:00:00Z' }),
    ];
    expect(resolveCommissionRule(history, { eventId: event, at })?.rateBp).toBe(1100);
    // A rule effective at exactly the order time applies.
    expect(
      resolveCommissionRule(history, { eventId: event, at: new Date('2027-09-01T00:00:00Z') })
        ?.rateBp,
    ).toBe(1200);
  });
});

describe('formatting', () => {
  it('writes the terms as "X % + mva"', () => {
    expect(formatPercent(1000)).toBe('10\u00a0%');
    expect(formatPercent(1250)).toBe('12,5\u00a0%');
    expect(formatCommissionTerms(rule({}), 'per ordre')).toBe('10\u00a0% + mva');
    expect(formatCommissionTerms(rule({ type: 'fixed', fixedOre: 500 }), 'per order')).toBe(
      'kr\u00a05,00 per order + mva',
    );
    expect(
      formatCommissionTerms(rule({ type: 'hybrid', rateBp: 500, fixedOre: 200 }), 'per ordre'),
    ).toBe('5\u00a0% + kr\u00a02,00 per ordre + mva');
  });
});
