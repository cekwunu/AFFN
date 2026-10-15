import 'server-only';
import { osloLocalToUtc } from '@/lib/format';
import { kronerToOre } from '@/lib/money';
import { createClient } from '@/lib/supabase/server';
import type { Database } from '@/lib/supabase/database.types';

export type TransactionKind = Database['public']['Enums']['transaction_kind'];
export const TRANSACTIONS_PAGE_SIZE = 30;

export interface TransactionFilters {
  q?: string;
  kind?: TransactionKind;
  vendor?: string;
  status?: string;
  method?: string;
  /** Kroner, as typed. */
  min?: string;
  max?: string;
  /** Oslo dates, yyyy-mm-dd. */
  from?: string;
  to?: string;
  page?: number;
}

/** Start of an Oslo calendar day as an ISO instant (the boundary moves with summer time). */
const osloDayStart = (date: string) => osloLocalToUtc(`${date}T00:00`)!.toISOString();

const nextDay = (date: string) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

/** Payments, refunds and payouts of the event (TRX-01), newest first. Read under RLS. */
export async function listTransactions(eventId: string, f: TransactionFilters) {
  const supabase = await createClient();
  const page = Math.max(1, f.page ?? 1);
  let query = supabase.from('transactions').select('*', { count: 'exact' }).eq('event_id', eventId);
  if (f.kind) query = query.eq('kind', f.kind);
  if (f.vendor) query = query.eq('vendor_id', f.vendor);
  if (f.status) query = query.eq('status', f.status);
  if (f.method) query = query.eq('method', f.method as 'vipps');
  const amount = (value: string | undefined) => {
    if (!value) return null;
    try {
      return kronerToOre(value);
    } catch {
      return null;
    }
  };
  // Amount filters on the size of the amount (refunds and payouts are negative).
  const min = amount(f.min);
  const max = amount(f.max);
  if (min !== null) query = query.or(`amount_ore.gte.${min},amount_ore.lte.${-min}`);
  if (max !== null) query = query.gte('amount_ore', -max).lte('amount_ore', max);
  if (f.from) query = query.gte('occurred_at', osloDayStart(f.from));
  if (f.to) query = query.lt('occurred_at', osloDayStart(nextDay(f.to)));
  const q = f.q?.trim().replace(/[%,()]/g, '');
  if (q) {
    query = query.or(`order_code.ilike.%${q}%,provider_id.ilike.%${q}%,customer_name.ilike.%${q}%`);
  }
  const { data, count, error } = await query
    .order('occurred_at', { ascending: false })
    .range((page - 1) * TRANSACTIONS_PAGE_SIZE, page * TRANSACTIONS_PAGE_SIZE - 1);
  if (error) throw error;
  return { rows: data, total: count ?? 0, page };
}
export type TransactionRow = Awaited<ReturnType<typeof listTransactions>>['rows'][number];

/**
 * Everything about one transaction for the detail drawer: order items, ledger lines, the
 * provider's webhook events (with each processing attempt) and the audit trail. Read under RLS.
 */
export async function transactionDetail(kind: TransactionKind, id: string) {
  const supabase = await createClient();
  const { data: tx } = await supabase
    .from('transactions')
    .select('*')
    .eq('kind', kind)
    .eq('id', id)
    .maybeSingle();
  if (!tx) return null;
  const ledgerColumn =
    kind === 'payment' ? 'payment_id' : kind === 'refund' ? 'refund_id' : 'payout_id';
  const [items, ledger, webhooks, audit] = await Promise.all([
    tx.order_id
      ? supabase
          .from('order_items')
          .select('product_name, quantity, unit_price_ore, line_total_ore')
          .eq('order_id', tx.order_id)
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from('ledger_entries')
      .select(
        'id, transaction_id, entry_type, account, direction, amount_ore, description, created_at',
      )
      .eq(ledgerColumn, id)
      .order('created_at')
      .order('direction', { ascending: false }),
    tx.provider_id
      ? supabase
          .from('psp_webhook_events')
          .select(
            'id, provider_event_id, event_type, signature_valid, received_at, attempts:psp_webhook_attempts(outcome, error, attempted_at)',
          )
          .or(
            [
              `payload->>providerPaymentId.eq.${tx.provider_id}`,
              `payload->>providerRefundId.eq.${tx.provider_id}`,
              `payload->>providerPayoutId.eq.${tx.provider_id}`,
            ].join(','),
          )
          .order('received_at')
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from('audit_log')
      .select('id, table_name, action, actor_id, reason, created_at, new_data')
      .in('row_id', [id, ...(tx.order_id ? [tx.order_id] : [])])
      .order('created_at'),
  ]);
  return {
    ...tx,
    items: items.data ?? [],
    ledger: ledger.data ?? [],
    webhooks: webhooks.data ?? [],
    audit: (audit.data ?? []).map((a) => ({
      ...a,
      status: (a.new_data as { status?: string } | null)?.status ?? null,
    })),
  };
}
export type TransactionDetail = NonNullable<Awaited<ReturnType<typeof transactionDetail>>>;
