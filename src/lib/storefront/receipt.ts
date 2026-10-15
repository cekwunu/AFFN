import 'server-only';
import { stallNumberFor } from '@/lib/orders/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * An order as its customer sees it, found by the secret tracking token (QR-05, ORD-03). Read
 * with the service role: visitors have no account; the token is the key.
 */
export async function getReceipt(token: string) {
  if (!/^[0-9a-f]{64}$/.test(token)) return null;
  const admin = createAdminClient();
  const { data: order } = await admin
    .from('orders')
    .select(
      `id, order_number, order_code, status, cancel_reason, ready_at, event_vendor_id, total_ore, mva_ore, customer_name, customer_email, pickup_note, paid_at, created_at, locale,
       vendor_id, event_id, organization_id,
       items:order_items!order_items_order_id_organization_id_fkey(product_name, unit_price_ore, quantity, line_total_ore, mva_rate_bp, mva_ore),
       payments!payments_order_id_organization_id_fkey(method, status, succeeded_at),
       refunds!refunds_order_id_vendor_id_fkey(amount_ore, status)`,
    )
    .eq('tracking_token', token)
    .maybeSingle();
  if (!order) return null;
  const waiting = ['new', 'accepted', 'preparing'] as const;
  const [{ data: vendor }, { data: event }, { data: organization }, ahead, stall] =
    await Promise.all([
      admin
        .from('vendors')
        .select('display_name, legal_name, org_number, slug')
        .eq('id', order.vendor_id)
        .single(),
      admin.from('events').select('name, slug').eq('id', order.event_id).single(),
      admin
        .from('organizations')
        .select('name, org_number')
        .eq('id', order.organization_id)
        .single(),
      // Queue position (ORD-03): paid orders at this stall still waiting and paid before this one.
      order.paid_at && (waiting as readonly string[]).includes(order.status)
        ? admin
            .from('orders')
            .select('id', { count: 'exact', head: true })
            .eq('event_vendor_id', order.event_vendor_id)
            .in('status', [...waiting])
            .lt('paid_at', order.paid_at)
            .then((r) => r.count ?? 0)
        : Promise.resolve(null),
      stallNumberFor(order.event_vendor_id),
    ]);
  if (!vendor || !event || !organization) return null;
  const payment = order.payments.find((p) => p.status === 'succeeded') ?? null;
  // Mva per rate, summed from the lines.
  const mvaByRate = new Map<number, number>();
  for (const item of order.items) {
    if (item.mva_rate_bp > 0) {
      mvaByRate.set(item.mva_rate_bp, (mvaByRate.get(item.mva_rate_bp) ?? 0) + item.mva_ore);
    }
  }
  return {
    ...order,
    vendor,
    event,
    organization,
    method: payment?.method ?? null,
    ahead,
    stall,
    refundedOre: order.refunds
      .filter((r) => r.status === 'succeeded')
      .reduce((sum, r) => sum + r.amount_ore, 0),
    refundPending: order.refunds.some((r) => r.status === 'pending'),
    paidAt: payment?.succeeded_at ?? order.paid_at,
    mvaByRate: [...mvaByRate].sort(([a], [b]) => a - b),
  };
}

export type Receipt = NonNullable<Awaited<ReturnType<typeof getReceipt>>>;
