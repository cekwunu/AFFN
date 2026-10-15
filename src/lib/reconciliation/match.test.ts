import { describe, expect, it } from 'vitest';
import { reconcile, type OurTransaction, type TheirTransaction } from './match';

const at = '2027-06-12T10:00:00.000Z';
const theirs = (over: Partial<TheirTransaction> = {}): TheirTransaction => ({
  type: 'payment',
  providerId: 'pay_1',
  amountOre: 50_000,
  platformFeeOre: 6_250,
  occurredAt: at,
  ...over,
});
const ours = (over: Partial<OurTransaction> = {}): OurTransaction => ({
  ...theirs(),
  eventId: 'event-1',
  paymentId: 'payment-1',
  ...over,
});

describe('reconcile', () => {
  it('matches identical transactions by type and provider id', () => {
    const result = reconcile(
      [
        theirs(),
        theirs({ type: 'refund', providerId: 're_1', amountOre: -10_000, platformFeeOre: -1_250 }),
      ],
      [
        ours(),
        ours({ type: 'refund', providerId: 're_1', amountOre: -10_000, platformFeeOre: -1_250 }),
      ],
    );
    expect(result).toEqual({ matched: 2, mismatches: [] });
  });

  it('finds every kind of mismatch', () => {
    const { matched, mismatches } = reconcile(
      [
        theirs(),
        theirs({ providerId: 'pay_2', amountOre: 49_000 }),
        theirs({ providerId: 'pay_3', platformFeeOre: 6_000 }),
        theirs({ providerId: 'pay_unknown' }),
      ],
      [
        ours(),
        ours({ providerId: 'pay_2' }),
        ours({ providerId: 'pay_3' }),
        ours({ providerId: 'pay_missing', paymentId: 'payment-9' }),
      ],
    );
    expect(matched).toBe(1);
    expect(mismatches.map((m) => [m.kind, m.providerId])).toEqual([
      ['amount_differs', 'pay_2'],
      ['fee_differs', 'pay_3'],
      ['missing_ours', 'pay_unknown'],
      ['missing_theirs', 'pay_missing'],
    ]);
    const amount = mismatches[0]!;
    expect([amount.ourAmountOre, amount.theirAmountOre, amount.eventId]).toEqual([
      50_000,
      49_000,
      'event-1',
    ]);
    expect(mismatches[2]).toMatchObject({ ourAmountOre: null, eventId: null, paymentId: null });
    expect(mismatches[3]).toMatchObject({ theirAmountOre: null, paymentId: 'payment-9' });
  });

  it('does not confuse a payment and a refund with the same provider id', () => {
    const { mismatches } = reconcile(
      [theirs({ type: 'refund', providerId: 'x', amountOre: -100, platformFeeOre: 0 })],
      [ours({ providerId: 'x' })],
    );
    expect(mismatches.map((m) => m.kind)).toEqual(['missing_ours', 'missing_theirs']);
  });
});
