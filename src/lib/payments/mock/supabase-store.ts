import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { fromDbStatus, type SettlementTransaction } from '../provider';
import type { MockPayment, MockRefund, MockStore } from './store';

/**
 * The mock provider's state, read from our own tables (there is no real PSP behind it). Writes
 * are no-ops: our webhook processing and checkout record everything, as with a real provider.
 */
export function supabaseMockStore(): MockStore {
  const db = () => createAdminClient();
  const noop = async () => {};

  const paymentById = async (id: string): Promise<MockPayment | null> => {
    const { data } = await db()
      .from('payments')
      .select(
        'provider_payment_id, amount_ore, platform_fee_ore, status, method, order_id, organization_id, succeeded_at, created_at',
      )
      .eq('provider', 'mock')
      .eq('provider_payment_id', id)
      .maybeSingle();
    if (!data) return null;
    return {
      id,
      amountOre: data.amount_ore,
      platformFeeOre: data.platform_fee_ore,
      accountId: null,
      status:
        data.status === 'succeeded'
          ? 'succeeded'
          : data.status === 'pending'
            ? 'pending'
            : 'failed',
      method: data.method,
      metadata: { kind: 'order', reference: data.order_id, organizationId: data.organization_id },
      at: data.succeeded_at ?? data.created_at,
    };
  };

  return {
    async getAccount(id) {
      const { data } = await db()
        .from('event_vendors')
        .select('psp_account_status')
        .eq('psp_account_id', id)
        .maybeSingle();
      return data ? { id, status: fromDbStatus(data.psp_account_status) } : null;
    },
    putAccount: noop,
    getPayment: paymentById,
    putPayment: noop,
    async refundsFor(paymentId) {
      const { data } = await db()
        .from('refunds')
        .select(
          'provider_refund_id, amount_ore, platform_fee_reversal_ore, created_at, payment:payments!inner(provider_payment_id)',
        )
        .eq('payment.provider_payment_id', paymentId)
        .neq('status', 'failed')
        // Only refunds the provider has seen: ours are recorded before the provider is asked.
        .not('provider_refund_id', 'is', null);
      return (data ?? []).map((r): MockRefund => ({
        id: r.provider_refund_id ?? '',
        paymentId,
        amountOre: r.amount_ore,
        platformFeeReversalOre: r.platform_fee_reversal_ore,
        at: r.created_at,
      }));
    },
    async getRefund(id) {
      const { data } = await db()
        .from('refunds')
        .select(
          'amount_ore, platform_fee_reversal_ore, created_at, payment:payments(provider_payment_id)',
        )
        .eq('provider_refund_id', id)
        .maybeSingle();
      return data
        ? {
            id,
            paymentId: data.payment?.provider_payment_id ?? '',
            amountOre: data.amount_ore,
            platformFeeReversalOre: data.platform_fee_reversal_ore,
            at: data.created_at,
          }
        : null;
    },
    putRefund: noop,
    async getPayout(id) {
      const { data } = await db()
        .from('payouts')
        .select('amount_ore, settlement_line_id, created_at')
        .eq('provider_payout_id', id)
        .maybeSingle();
      return data
        ? {
            id,
            accountId: '',
            amountOre: data.amount_ore,
            reference: data.settlement_line_id,
            at: data.created_at,
          }
        : null;
    },
    putPayout: noop,
    async transactions({ from, to }) {
      const range = <
        T extends { gte: (c: string, v: string) => T; lt: (c: string, v: string) => T },
      >(
        q: T,
        column: string,
      ) => q.gte(column, from.toISOString()).lt(column, to.toISOString());
      const [payments, fees, refunds, payouts] = await Promise.all([
        range(
          db()
            .from('payments')
            .select('provider_payment_id, amount_ore, platform_fee_ore, succeeded_at, order_id')
            .eq('provider', 'mock')
            .eq('status', 'succeeded'),
          'succeeded_at',
        ),
        range(
          db()
            .from('fee_payments')
            .select('provider_payment_id, amount_ore, paid_at, stall_fee_id')
            .eq('provider', 'mock'),
          'paid_at',
        ),
        range(
          db()
            .from('refunds')
            .select(
              'provider_refund_id, amount_ore, platform_fee_reversal_ore, succeeded_at, order_id',
            )
            .eq('status', 'succeeded'),
          'succeeded_at',
        ),
        range(
          db()
            .from('payouts')
            .select('provider_payout_id, amount_ore, paid_at, settlement_line_id')
            .eq('provider', 'mock')
            .eq('status', 'paid'),
          'paid_at',
        ),
      ]);
      const list: SettlementTransaction[] = [
        ...(payments.data ?? []).map((p) => ({
          type: 'payment' as const,
          providerId: p.provider_payment_id ?? '',
          accountId: null,
          amountOre: p.amount_ore,
          platformFeeOre: p.platform_fee_ore,
          occurredAt: p.succeeded_at!,
          reference: p.order_id,
        })),
        ...(fees.data ?? []).map((f) => ({
          type: 'payment' as const,
          providerId: f.provider_payment_id ?? '',
          accountId: null,
          amountOre: f.amount_ore,
          platformFeeOre: f.amount_ore,
          occurredAt: f.paid_at,
          reference: f.stall_fee_id,
        })),
        ...(refunds.data ?? []).map((r) => ({
          type: 'refund' as const,
          providerId: r.provider_refund_id ?? '',
          accountId: null,
          amountOre: -r.amount_ore,
          platformFeeOre: -r.platform_fee_reversal_ore,
          occurredAt: r.succeeded_at!,
          reference: r.order_id,
        })),
        ...(payouts.data ?? []).map((p) => ({
          type: 'payout' as const,
          providerId: p.provider_payout_id ?? '',
          accountId: null,
          amountOre: -p.amount_ore,
          platformFeeOre: 0,
          occurredAt: p.paid_at!,
          reference: p.settlement_line_id,
        })),
      ];
      return list.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
    },
  };
}
