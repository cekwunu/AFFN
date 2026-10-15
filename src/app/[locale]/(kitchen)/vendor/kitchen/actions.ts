'use server';

import { revalidatePath } from 'next/cache';
import { getCurrentUser } from '@/lib/auth/server';
import {
  getKitchenOrders,
  kitchenProducts,
  myKitchen,
  type KitchenOrder,
} from '@/lib/orders/server';
import { canAdvance, canCancel, type OrderStatus } from '@/lib/orders/status';
import { getPaymentProvider } from '@/lib/payments';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

export type KitchenResult = { ok: true } | { ok: false; error: 'failed' | 'refund_failed' };

/** Current open orders and sold-out flags; the kitchen refetches after every change. */
export async function loadKitchen(): Promise<{
  orders: KitchenOrder[];
  products: { id: string; name: string; soldOut: boolean }[];
} | null> {
  const kitchen = await myKitchen();
  if (!kitchen) return null;
  const [orders, products] = await Promise.all([
    getKitchenOrders(kitchen.participation.id),
    kitchenProducts(kitchen.vendor.id, kitchen.participation.id),
  ]);
  return { orders, products };
}

/** Next step for an order (Accept, Start, Ready, Collected). The database checks the step. */
export async function advanceOrder(
  orderId: string,
  from: OrderStatus,
  to: OrderStatus,
): Promise<KitchenResult> {
  if (!canAdvance(from, to)) return { ok: false, error: 'failed' };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('orders')
    .update({ status: to })
    .eq('id', orderId)
    .eq('status', from)
    .select('id');
  if (error || !data?.length) return { ok: false, error: 'failed' };
  revalidatePath('/vendor/orders');
  return { ok: true };
}

/**
 * Cancels a paid order and refunds the customer in full through the payment provider (ORD-04).
 * Safe to repeat: the cancellation and the provider's refund are both idempotent.
 */
export async function cancelOrder(orderId: string, reason: string): Promise<KitchenResult> {
  const user = await getCurrentUser();
  const text = reason.trim().slice(0, 200);
  if (!user || !text) return { ok: false, error: 'failed' };
  // The vendor must be able to see the order (RLS) and it must still be open.
  const supabase = await createClient();
  const { data: order } = await supabase
    .from('orders')
    .select('id, status')
    .eq('id', orderId)
    .maybeSingle();
  if (!order || !(canCancel(order.status) || order.status === 'cancelled')) {
    return { ok: false, error: 'failed' };
  }

  const admin = createAdminClient();
  const { data: started, error } = await admin.rpc('begin_order_cancellation', {
    p_order_id: orderId,
    p_reason: text,
    p_user: user.id,
  });
  if (error || !started) return { ok: false, error: 'failed' };
  const refund = started as {
    refund_id: string | null;
    refund_status: string | null;
    amount_ore: number | null;
    provider_payment_id: string | null;
  };
  revalidatePath('/vendor/orders');
  if (!refund.refund_id || refund.refund_status === 'succeeded') return { ok: true };

  try {
    const result = await getPaymentProvider().refund({
      providerPaymentId: refund.provider_payment_id!,
      amountOre: Number(refund.amount_ore),
      reason: text,
      idempotencyKey: `refund-${refund.refund_id}`,
    });
    const { error: recordError } = await admin.rpc('record_order_refund', {
      p_refund_id: refund.refund_id,
      p_provider_refund_id: result.providerRefundId,
      // Still pending at the provider (null): its refund webhook completes it. The generated
      // types mark SQL arguments non-null, but the function accepts null here.
      p_succeeded: (result.status === 'pending'
        ? null
        : result.status === 'succeeded') as unknown as boolean,
      p_platform_fee_reversal_ore: result.platformFeeReversalOre,
    });
    if (recordError || result.status === 'failed') return { ok: false, error: 'refund_failed' };
    return { ok: true };
  } catch {
    // The order stays cancelled and the refund pending; cancelling again retries it.
    return { ok: false, error: 'refund_failed' };
  }
}
