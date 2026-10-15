import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { calculateCommission, proRataFeeReversal } from './commission';
import { ore, roundHalfUp } from './index';
import {
  balances,
  imbalance,
  NOTHING_REVERSED,
  refundLines,
  saleLines,
  type LedgerLine,
  type PaidOrder,
  type Reversed,
} from './ledger';

// Property-based tests for the ledger (PRD §5–6): for random baskets, commission rules and
// refund sequences, every transaction balances, vendor + AFFN commission + mva = gross, refunds
// never over-reverse, and totals over many orders show no rounding drift.

const pspFee = (gross: number) => Number(roundHalfUp(BigInt(gross) * 250n, 10_000n)); // 2.5 %

const basket = fc.array(
  fc.record({
    price: fc.integer({ min: 100, max: 50_000 }),
    quantity: fc.integer({ min: 1, max: 20 }),
  }),
  { minLength: 1, maxLength: 30 },
);
const rule = fc.oneof(
  fc.record({
    type: fc.constant('percentage' as const),
    rateBp: fc.integer({ min: 0, max: 3_000 }),
  }),
  fc.record({ type: fc.constant('fixed' as const), fixedOre: fc.integer({ min: 0, max: 5_000 }) }),
  fc.record({
    type: fc.constant('hybrid' as const),
    rateBp: fc.integer({ min: 0, max: 3_000 }),
    fixedOre: fc.integer({ min: 0, max: 5_000 }),
  }),
);

/** A paid order built the way checkout does it: lines summed, commission on the total. */
const paidOrder = fc
  .tuple(basket, rule)
  .map(([lines, r]): PaidOrder | null => {
    const gross = lines.reduce((sum, l) => sum + l.price * l.quantity, 0);
    try {
      const fee = calculateCommission(ore(gross), {
        type: r.type,
        rateBp: 'rateBp' in r ? r.rateBp : null,
        fixedOre: 'fixedOre' in r ? r.fixedOre : null,
      });
      return {
        grossOre: gross,
        commissionOre: fee.commission,
        commissionMvaOre: fee.mva,
        pspFeeOre: pspFee(gross),
      };
    } catch {
      return null; // fee larger than the sale: checkout refuses these
    }
  })
  .filter((o): o is PaidOrder => o !== null);

/** Refund amounts that add up to at most the gross; `full` makes them add up exactly. */
const refunds = (order: PaidOrder, full: boolean) =>
  fc.array(fc.integer({ min: 1, max: 1_000 }), { minLength: 1, maxLength: 5 }).map((weights) => {
    const total = weights.reduce((a, b) => a + b, 0);
    const target = full ? order.grossOre : Math.floor(order.grossOre / 2);
    const parts = weights.map((w) => Math.floor((target * w) / total));
    parts[parts.length - 1]! += target - parts.reduce((a, b) => a + b, 0);
    return parts.filter((p) => p > 0);
  });

/** The provider's fee reversal for each refund (pro rata; the last one gives back the rest). */
function runRefunds(order: PaidOrder, amounts: number[]) {
  const fee = order.commissionOre + order.commissionMvaOre;
  let before: Reversed = NOTHING_REVERSED;
  let feeReversed = 0;
  const all: LedgerLine[][] = [];
  for (const amount of amounts) {
    const last = before.refundedOre + amount === order.grossOre;
    const reversal = last
      ? fee - feeReversed
      : Math.min(proRataFeeReversal(ore(fee), ore(order.grossOre), ore(amount)), fee - feeReversed);
    const { lines, after } = refundLines(order, before, amount, reversal);
    feeReversed += reversal;
    before = after;
    all.push(lines);
  }
  return { all, after: before };
}

describe('ledger postings (property-based)', () => {
  it('a sale balances and splits the gross into vendor + commission + mva', () => {
    fc.assert(
      fc.property(paidOrder, (order) => {
        const lines = saleLines(order);
        expect(imbalance(lines)).toBe(0);
        const b = balances(lines);
        expect(b.vendor_payable + b.commission_revenue + b.mva_payable).toBe(order.grossOre);
        expect(b.commission_revenue).toBe(order.commissionOre);
        expect(b.mva_payable).toBe(order.commissionMvaOre);
        expect(b.psp_fee_expense).toBe(-order.pspFeeOre);
        expect(lines.every((l) => l.amountOre > 0)).toBe(true);
      }),
      { numRuns: 2_000 },
    );
  });

  it('refunds balance, never over-reverse and a full refund clears the order', () => {
    fc.assert(
      fc.property(
        paidOrder.chain((order) =>
          fc
            .tuple(fc.constant(order), fc.boolean())
            .chain(([o, full]) => fc.tuple(fc.constant(o), fc.constant(full), refunds(o, full))),
        ),
        ([order, full, amounts]) => {
          const sale = saleLines(order);
          const { all, after } = runRefunds(order, amounts);
          let running: LedgerLine[] = [...sale];
          for (const lines of all) {
            expect(imbalance(lines)).toBe(0);
            running = [...running, ...lines];
            const b = balances(running);
            // Nothing is ever reversed below zero.
            expect(b.vendor_payable).toBeGreaterThanOrEqual(0);
            expect(b.commission_revenue).toBeGreaterThanOrEqual(0);
            expect(b.mva_payable).toBeGreaterThanOrEqual(0);
          }
          const b = balances(running);
          // What is left still splits exactly: vendor + commission + mva = gross − refunded.
          expect(b.vendor_payable + b.commission_revenue + b.mva_payable).toBe(
            order.grossOre - after.refundedOre,
          );
          // AFFN keeps the PSP fee as a cost on refunds.
          expect(b.psp_fee_expense).toBe(-order.pspFeeOre);
          if (full && amounts.length > 0) {
            expect(after.refundedOre).toBe(order.grossOre);
            expect(b.vendor_payable).toBe(0);
            expect(b.commission_revenue).toBe(0);
            expect(b.mva_payable).toBe(0);
            expect(b.psp_clearing).toBe(order.pspFeeOre);
          }
        },
      ),
      { numRuns: 2_000 },
    );
  });

  it('shows no rounding drift across 10 000 orders', () => {
    const orders = fc.sample(paidOrder, { numRuns: 10_000, seed: 2027 });
    expect(orders.length).toBe(10_000);
    let gross = 0;
    let commission = 0;
    let mva = 0;
    const totals = { vendor: 0, commission: 0, mva: 0, clearing: 0 };
    for (const order of orders) {
      gross += order.grossOre;
      commission += order.commissionOre;
      mva += order.commissionMvaOre;
      const b = balances(saleLines(order));
      totals.vendor += b.vendor_payable;
      totals.commission += b.commission_revenue;
      totals.mva += b.mva_payable;
      totals.clearing += b.psp_clearing;
    }
    // Ledger totals equal the sum of the per-order snapshots, øre for øre.
    expect(totals.commission).toBe(commission);
    expect(totals.mva).toBe(mva);
    expect(totals.vendor + totals.commission + totals.mva).toBe(gross);
    expect(Number.isSafeInteger(gross)).toBe(true);
  });
});

describe('ledger postings (examples)', () => {
  it('posts the PRD example: kr 500 at 10 % + mva, PSP fee 2.5 %', () => {
    const order = {
      grossOre: 50_000,
      commissionOre: 5_000,
      commissionMvaOre: 1_250,
      pspFeeOre: 1_250,
    };
    expect(saleLines(order)).toEqual([
      { entryType: 'sale', account: 'psp_clearing', direction: 'debit', amountOre: 50_000 },
      { entryType: 'sale', account: 'vendor_payable', direction: 'credit', amountOre: 43_750 },
      {
        entryType: 'commission',
        account: 'commission_revenue',
        direction: 'credit',
        amountOre: 5_000,
      },
      {
        entryType: 'commission_mva',
        account: 'mva_payable',
        direction: 'credit',
        amountOre: 1_250,
      },
      { entryType: 'psp_fee', account: 'psp_fee_expense', direction: 'debit', amountOre: 1_250 },
      { entryType: 'psp_fee', account: 'psp_clearing', direction: 'credit', amountOre: 1_250 },
    ]);
  });

  it('reverses a kr 100 partial refund pro rata', () => {
    const order = {
      grossOre: 50_000,
      commissionOre: 5_000,
      commissionMvaOre: 1_250,
      pspFeeOre: 1_250,
    };
    const { lines } = refundLines(order, NOTHING_REVERSED, 10_000, 1_250);
    expect(lines).toEqual([
      { entryType: 'refund', account: 'vendor_payable', direction: 'debit', amountOre: 8_750 },
      {
        entryType: 'refund_commission_reversal',
        account: 'commission_revenue',
        direction: 'debit',
        amountOre: 1_000,
      },
      {
        entryType: 'refund_commission_reversal',
        account: 'mva_payable',
        direction: 'debit',
        amountOre: 250,
      },
      { entryType: 'refund', account: 'psp_clearing', direction: 'credit', amountOre: 10_000 },
    ]);
  });

  it('refuses refunds beyond the order', () => {
    const order = { grossOre: 1_000, commissionOre: 100, commissionMvaOre: 25, pspFeeOre: 25 };
    expect(() => refundLines(order, NOTHING_REVERSED, 1_001, 125)).toThrow(RangeError);
    expect(() => refundLines(order, NOTHING_REVERSED, 500, 200)).toThrow(RangeError);
  });
});
