/**
 * Reconciliation (TRX-02): every transaction in the payment provider's report is matched to ours
 * by the provider's id. Amounts are signed as the provider reports them (payments positive,
 * refunds and payouts negative), in øre.
 */
export type TransactionKind = 'payment' | 'refund' | 'payout';
export type MismatchKind = 'missing_ours' | 'missing_theirs' | 'amount_differs' | 'fee_differs';

export interface TheirTransaction {
  type: TransactionKind;
  providerId: string;
  amountOre: number;
  platformFeeOre: number;
  occurredAt: string;
}

export interface OurTransaction {
  type: TransactionKind;
  providerId: string;
  amountOre: number;
  platformFeeOre: number;
  occurredAt: string;
  eventId: string | null;
  paymentId?: string | null;
  refundId?: string | null;
  payoutId?: string | null;
}

export interface Mismatch {
  kind: MismatchKind;
  transactionKind: TransactionKind;
  providerId: string;
  ourAmountOre: number | null;
  theirAmountOre: number | null;
  ourFeeOre: number | null;
  theirFeeOre: number | null;
  occurredAt: string;
  eventId: string | null;
  paymentId: string | null;
  refundId: string | null;
  payoutId: string | null;
}

export function reconcile(theirs: readonly TheirTransaction[], ours: readonly OurTransaction[]) {
  const byId = new Map<string, OurTransaction>();
  for (const o of ours) if (o.providerId) byId.set(`${o.type}:${o.providerId}`, o);
  const seen = new Set<string>();
  const mismatches: Mismatch[] = [];
  let matched = 0;

  const item = (
    kind: MismatchKind,
    t: TheirTransaction | null,
    o: OurTransaction | null,
  ): Mismatch => ({
    kind,
    transactionKind: (t ?? o)!.type,
    providerId: (t ?? o)!.providerId,
    ourAmountOre: o?.amountOre ?? null,
    theirAmountOre: t?.amountOre ?? null,
    ourFeeOre: o?.platformFeeOre ?? null,
    theirFeeOre: t?.platformFeeOre ?? null,
    occurredAt: (t ?? o)!.occurredAt,
    eventId: o?.eventId ?? null,
    paymentId: o?.paymentId ?? null,
    refundId: o?.refundId ?? null,
    payoutId: o?.payoutId ?? null,
  });

  for (const t of theirs) {
    const key = `${t.type}:${t.providerId}`;
    const o = byId.get(key);
    if (!o) {
      mismatches.push(item('missing_ours', t, null));
      continue;
    }
    seen.add(key);
    if (o.amountOre !== t.amountOre) mismatches.push(item('amount_differs', t, o));
    else if (o.platformFeeOre !== t.platformFeeOre) mismatches.push(item('fee_differs', t, o));
    else matched++;
  }
  for (const [key, o] of byId) {
    if (!seen.has(key)) mismatches.push(item('missing_theirs', null, o));
  }
  return { matched, mismatches };
}
