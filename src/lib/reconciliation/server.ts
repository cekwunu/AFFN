import 'server-only';
import { currentOrganization } from '@/lib/auth/server';
import { getPaymentProvider } from '@/lib/payments';
import { createAdminClient } from '@/lib/supabase/admin';
import { reconcile, type OurTransaction } from './match';

/**
 * Runs reconciliation for a period (TRX-02): the provider's settlement report against our
 * payments, stall-fee payments, refunds and payouts. Every mismatch is stored for follow-up;
 * mismatches that no longer appear are resolved. Server code (cron route or "Run now").
 */
export async function runReconciliation({
  from,
  to,
  userId,
}: {
  from: Date;
  to: Date;
  userId: string | null;
}) {
  const provider = getPaymentProvider();
  const organization = await currentOrganization();
  const admin = createAdminClient();
  const [from_, to_] = [from.toISOString(), to.toISOString()];

  const [theirs, payments, fees, refunds, payouts] = await Promise.all([
    provider.fetchSettlementReport({ from, to }),
    admin
      .from('payments')
      .select('id, event_id, provider_payment_id, amount_ore, platform_fee_ore, succeeded_at')
      .eq('organization_id', organization.id)
      .eq('provider', provider.name)
      .eq('status', 'succeeded')
      .gte('succeeded_at', from_)
      .lt('succeeded_at', to_),
    admin
      .from('fee_payments')
      .select('id, event_id, provider_payment_id, amount_ore, paid_at')
      .eq('organization_id', organization.id)
      .eq('provider', provider.name)
      .gte('paid_at', from_)
      .lt('paid_at', to_),
    admin
      .from('refunds')
      .select(
        'id, event_id, provider_refund_id, amount_ore, platform_fee_reversal_ore, succeeded_at',
      )
      .eq('organization_id', organization.id)
      .eq('status', 'succeeded')
      .gte('succeeded_at', from_)
      .lt('succeeded_at', to_),
    admin
      .from('payouts')
      .select('id, event_id, provider_payout_id, amount_ore, paid_at')
      .eq('organization_id', organization.id)
      .eq('provider', provider.name)
      .eq('status', 'paid')
      .gte('paid_at', from_)
      .lt('paid_at', to_),
  ]);
  for (const r of [payments, fees, refunds, payouts]) if (r.error) throw r.error;

  const ours: OurTransaction[] = [
    ...payments.data!.map((p) => ({
      type: 'payment' as const,
      providerId: p.provider_payment_id ?? '',
      amountOre: p.amount_ore,
      platformFeeOre: p.platform_fee_ore,
      occurredAt: p.succeeded_at!,
      eventId: p.event_id,
      paymentId: p.id,
    })),
    ...fees.data!.map((f) => ({
      type: 'payment' as const,
      providerId: f.provider_payment_id ?? '',
      amountOre: f.amount_ore,
      platformFeeOre: f.amount_ore,
      occurredAt: f.paid_at,
      eventId: f.event_id,
    })),
    ...refunds.data!.map((r) => ({
      type: 'refund' as const,
      providerId: r.provider_refund_id ?? '',
      amountOre: -r.amount_ore,
      platformFeeOre: -r.platform_fee_reversal_ore,
      occurredAt: r.succeeded_at!,
      eventId: r.event_id,
      refundId: r.id,
    })),
    ...payouts.data!.map((p) => ({
      type: 'payout' as const,
      providerId: p.provider_payout_id ?? '',
      amountOre: -p.amount_ore,
      platformFeeOre: 0,
      occurredAt: p.paid_at!,
      eventId: p.event_id,
      payoutId: p.id,
    })),
  ];

  const { matched, mismatches } = reconcile(theirs, ours);
  const { data: runId, error } = await admin.rpc('record_reconciliation', {
    p_organization_id: organization.id,
    p_provider: provider.name,
    p_from: from_,
    p_to: to_,
    p_provider_count: theirs.length,
    p_matched: matched,
    p_items: mismatches.map((m) => ({
      kind: m.kind,
      transaction_kind: m.transactionKind,
      provider_id: m.providerId,
      our_amount_ore: m.ourAmountOre,
      their_amount_ore: m.theirAmountOre,
      our_fee_ore: m.ourFeeOre,
      their_fee_ore: m.theirFeeOre,
      occurred_at: m.occurredAt,
      event_id: m.eventId,
      payment_id: m.paymentId,
      refund_id: m.refundId,
      payout_id: m.payoutId,
    })),
    p_user: userId as never,
  });
  if (error) throw error;
  return { runId: runId as string, matched, mismatches: mismatches.length, total: theirs.length };
}
