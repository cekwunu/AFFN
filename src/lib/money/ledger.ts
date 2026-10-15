/**
 * The double-entry postings for a paid order and its refunds (PRD §5–6, COM-02). This is the
 * specification the database functions private.post_order_ledger and private.post_refund_ledger
 * implement; tests run both and compare. All amounts are øre; zero lines are left out (the
 * ledger stores positive amounts only).
 */
import { roundHalfUp } from './index';

export type LedgerAccount =
  'psp_clearing' | 'vendor_payable' | 'commission_revenue' | 'mva_payable' | 'psp_fee_expense';
export type LedgerEntryType =
  'sale' | 'commission' | 'commission_mva' | 'psp_fee' | 'refund' | 'refund_commission_reversal';

export interface LedgerLine {
  entryType: LedgerEntryType;
  account: LedgerAccount;
  direction: 'debit' | 'credit';
  amountOre: number;
}

/** What the order snapshotted at payment time, plus the fee the PSP reported. */
export interface PaidOrder {
  grossOre: number;
  commissionOre: number;
  commissionMvaOre: number;
  pspFeeOre: number;
}

function line(
  entryType: LedgerEntryType,
  account: LedgerAccount,
  direction: 'debit' | 'credit',
  amountOre: number,
): LedgerLine[] {
  if (!Number.isSafeInteger(amountOre) || amountOre < 0) {
    throw new RangeError(`Ledger amount must be a non-negative whole number of øre: ${amountOre}`);
  }
  return amountOre === 0 ? [] : [{ entryType, account, direction, amountOre }];
}

/**
 * Payment succeeded: the customer's money sits with the PSP (clearing); the vendor's share is
 * owed to the vendor; AFFN earns the commission and owes the mva on it; the PSP's fee is AFFN's
 * expense, taken from AFFN's PSP balance.
 */
export function saleLines(order: PaidOrder): LedgerLine[] {
  const fee = order.commissionOre + order.commissionMvaOre;
  if (fee > order.grossOre) throw new RangeError('Platform fee exceeds the sale');
  return [
    ...line('sale', 'psp_clearing', 'debit', order.grossOre),
    ...line('sale', 'vendor_payable', 'credit', order.grossOre - fee),
    ...line('commission', 'commission_revenue', 'credit', order.commissionOre),
    ...line('commission_mva', 'mva_payable', 'credit', order.commissionMvaOre),
    ...line('psp_fee', 'psp_fee_expense', 'debit', order.pspFeeOre),
    ...line('psp_fee', 'psp_clearing', 'credit', order.pspFeeOre),
  ];
}

/** Amounts already reversed by earlier refunds of the same order. */
export interface Reversed {
  refundedOre: number;
  commissionOre: number;
  commissionMvaOre: number;
}

export const NOTHING_REVERSED: Reversed = { refundedOre: 0, commissionOre: 0, commissionMvaOre: 0 };

/**
 * How a refund's fee reversal splits between commission and its mva: commission pro rata
 * (half-up), mva the rest, so the two always add up to the reversal. A refund that completes
 * the order reverses exactly what is left of each. Never reverses more than was charged.
 */
export function splitFeeReversal(
  order: PaidOrder,
  before: Reversed,
  refundOre: number,
  feeReversalOre: number,
): { commissionOre: number; commissionMvaOre: number } {
  const fee = order.commissionOre + order.commissionMvaOre;
  const leftCommission = order.commissionOre - before.commissionOre;
  const leftMva = order.commissionMvaOre - before.commissionMvaOre;
  if (before.refundedOre + refundOre === order.grossOre) {
    return { commissionOre: leftCommission, commissionMvaOre: leftMva };
  }
  if (feeReversalOre > leftCommission + leftMva) {
    throw new RangeError('Fee reversal exceeds what is left of the fee');
  }
  const commission =
    fee === 0
      ? 0
      : Math.min(
          leftCommission,
          Number(roundHalfUp(BigInt(feeReversalOre) * BigInt(order.commissionOre), BigInt(fee))),
        );
  const mva = feeReversalOre - commission;
  if (mva > leftMva) return { commissionOre: feeReversalOre - leftMva, commissionMvaOre: leftMva };
  return { commissionOre: commission, commissionMvaOre: mva };
}

/**
 * Refund succeeded: money leaves the PSP clearing back to the customer; the vendor's share and
 * AFFN's fee are reversed pro rata. The PSP fee is not reversed (AFFN keeps that cost).
 */
export function refundLines(
  order: PaidOrder,
  before: Reversed,
  refundOre: number,
  feeReversalOre: number,
): { lines: LedgerLine[]; after: Reversed } {
  if (refundOre <= 0 || before.refundedOre + refundOre > order.grossOre) {
    throw new RangeError('Refund exceeds what is left of the order');
  }
  const split = splitFeeReversal(order, before, refundOre, feeReversalOre);
  const reversal = split.commissionOre + split.commissionMvaOre;
  return {
    lines: [
      ...line('refund', 'vendor_payable', 'debit', refundOre - reversal),
      ...line('refund_commission_reversal', 'commission_revenue', 'debit', split.commissionOre),
      ...line('refund_commission_reversal', 'mva_payable', 'debit', split.commissionMvaOre),
      ...line('refund', 'psp_clearing', 'credit', refundOre),
    ],
    after: {
      refundedOre: before.refundedOre + refundOre,
      commissionOre: before.commissionOre + split.commissionOre,
      commissionMvaOre: before.commissionMvaOre + split.commissionMvaOre,
    },
  };
}

/** Signed balance per account (credit positive for liabilities and revenue). */
export function balances(lines: readonly LedgerLine[]): Record<LedgerAccount, number> {
  const out: Record<LedgerAccount, number> = {
    psp_clearing: 0,
    vendor_payable: 0,
    commission_revenue: 0,
    mva_payable: 0,
    psp_fee_expense: 0,
  };
  for (const l of lines) out[l.account] += l.direction === 'credit' ? l.amountOre : -l.amountOre;
  return out;
}

/** Debits minus credits; zero for every balanced transaction. */
export function imbalance(lines: readonly LedgerLine[]): number {
  return lines.reduce((sum, l) => sum + (l.direction === 'debit' ? l.amountOre : -l.amountOre), 0);
}
