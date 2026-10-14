import { describe, expect, it } from 'vitest';
import {
  commissionBreakdown,
  formatCommissionTerms,
  formatPercent,
  resolveCommissionRule,
  type CommissionRule,
} from './commission';
import { ore } from './money';

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

describe('commissionBreakdown', () => {
  it('matches the PRD worked example: kr 500 at 10 % + mva', () => {
    expect(commissionBreakdown(ore(50_000), rule({}))).toEqual({
      gross: 50_000,
      commission: 5_000,
      mva: 1_250,
      platformFee: 6_250,
      vendorPayout: 43_750,
    });
  });

  it('rounds half-up per order, on commission and on its mva', () => {
    // 10 % of 1,05 kr = 10,5 øre → 11; 25 % of 11 = 2,75 → 3.
    expect(commissionBreakdown(ore(105), rule({}))).toMatchObject({ commission: 11, mva: 3 });
    // 12,5 % of 99 øre = 12,375 → 12; mva 3.
    expect(commissionBreakdown(ore(99), rule({ rateBp: 1250 }))).toMatchObject({
      commission: 12,
      mva: 3,
      vendorPayout: 84,
    });
  });

  it('supports fixed and hybrid commission', () => {
    expect(commissionBreakdown(ore(10_000), rule({ type: 'fixed', fixedOre: 500 }))).toMatchObject({
      commission: 500,
      mva: 125,
      vendorPayout: 9_375,
    });
    expect(
      commissionBreakdown(ore(10_000), rule({ type: 'hybrid', rateBp: 500, fixedOre: 200 })),
    ).toMatchObject({ commission: 700, mva: 175, platformFee: 875 });
  });

  it('a refund (negative gross) mirrors the sale exactly', () => {
    const sale = commissionBreakdown(ore(105), rule({}));
    const refund = commissionBreakdown(ore(-105), rule({}));
    expect(refund.commission).toBe(-sale.commission);
    expect(refund.mva).toBe(-sale.mva);
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

  it('follows vendor → category → event → organization', () => {
    expect(resolveCommissionRule(rules, { vendorId: 'v-1', eventId: event, at })?.rateBp).toBe(700);
    expect(
      resolveCommissionRule(rules, { vendorId: 'v-2', categoryId: 'drinks', eventId: event, at })
        ?.rateBp,
    ).toBe(800);
    expect(resolveCommissionRule(rules, { vendorId: 'v-2', eventId: event, at })?.rateBp).toBe(900);
    expect(resolveCommissionRule(rules, { eventId: 'event-2', at })?.rateBp).toBe(1000);
  });

  it('uses the latest rule already in force', () => {
    const later = new Date('2031-01-01T00:00:00Z');
    expect(
      resolveCommissionRule(rules, { vendorId: 'v-1', eventId: event, at: later })?.rateBp,
    ).toBe(600);
    expect(resolveCommissionRule([], { eventId: event, at })).toBeNull();
  });
});

describe('formatting', () => {
  it('writes the terms as "X % + mva"', () => {
    expect(formatPercent(1000)).toBe('10 %');
    expect(formatPercent(1250)).toBe('12,5 %');
    expect(formatCommissionTerms(rule({}), 'per ordre')).toBe('10 % + mva');
    expect(formatCommissionTerms(rule({ type: 'fixed', fixedOre: 500 }), 'per order')).toBe(
      'kr 5,00 per order + mva',
    );
    expect(
      formatCommissionTerms(rule({ type: 'hybrid', rateBp: 500, fixedOre: 200 }), 'per ordre'),
    ).toBe('5 % + kr 2,00 per ordre + mva');
  });
});
