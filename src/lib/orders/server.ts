import 'server-only';
import { cache } from 'react';
import { listMyProducts, myParticipation, myVendor } from '@/lib/catalogue/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { currentApplicationEvent } from '@/lib/vendor/server';
import { KITCHEN_COLUMNS, type OrderStatus } from './status';

/** The active stall number of a participation, or null. */
export async function stallNumberFor(eventVendorId: string): Promise<string | null> {
  const { data } = await createAdminClient()
    .from('stall_assignments')
    .select('stall:stalls!stall_assignments_stall_id_organization_id_fkey(number)')
    .eq('event_vendor_id', eventVendorId)
    .eq('status', 'active')
    .order('assigned_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.stall?.number ?? null;
}

/**
 * The signed-in vendor's participation in the current event, if approved: the kitchen and the
 * order history work on it.
 */
export const myKitchen = cache(async () => {
  const vendor = await myVendor();
  const event = await currentApplicationEvent();
  if (!vendor || !event) return null;
  const participation = await myParticipation(vendor.id, event.id);
  if (participation?.status !== 'approved') return null;
  return { vendor, event, participation, stall: await stallNumberFor(participation.id) };
});
export type MyKitchen = NonNullable<Awaited<ReturnType<typeof myKitchen>>>;

const ORDER_ITEMS = 'items:order_items!order_items_order_id_organization_id_fkey';

/** Open orders for the kitchen board (ORD-02), oldest first. Read under RLS. */
export async function getKitchenOrders(eventVendorId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('orders')
    .select(
      `id, order_code, status, customer_name, pickup_note, paid_at, created_at,
       ${ORDER_ITEMS}(product_name, quantity)`,
    )
    .eq('event_vendor_id', eventVendorId)
    .in('status', [...KITCHEN_COLUMNS])
    .order('paid_at', { ascending: true });
  if (error) throw error;
  return data.map((o) => ({
    id: o.id,
    code: o.order_code,
    status: o.status,
    name: o.customer_name,
    note: o.pickup_note,
    paidAt: o.paid_at ?? o.created_at,
    items: o.items.map((i) => ({ name: i.product_name, quantity: i.quantity })),
  }));
}
export type KitchenOrder = Awaited<ReturnType<typeof getKitchenOrders>>[number];

/** Products on sale at the participation, for the kitchen's sold-out toggles. */
export async function kitchenProducts(vendorId: string, eventVendorId: string) {
  return (await listMyProducts(vendorId, eventVendorId))
    .filter((p) => p.onSale && !p.archived_at)
    .map((p) => ({ id: p.id, name: p.name, soldOut: p.soldOut }));
}

export const HISTORY_PAGE_SIZE = 25;

export interface HistoryFilters {
  status?: OrderStatus;
  /** Oslo calendar day, yyyy-mm-dd. */
  date?: string;
  /** Part of the order code or the customer's name. */
  q?: string;
  page?: number;
}

/** The vendor's paid orders, newest first, with filters (ORD-01). Read under RLS. */
export async function getOrderHistory(eventVendorId: string, filters: HistoryFilters) {
  const supabase = await createClient();
  const page = Math.max(1, filters.page ?? 1);
  let query = supabase
    .from('orders')
    .select(
      `id, order_code, status, customer_name, total_ore, paid_at, created_at, cancel_reason,
       ${ORDER_ITEMS}(product_name, quantity)`,
      { count: 'exact' },
    )
    .eq('event_vendor_id', eventVendorId)
    .neq('status', 'pending_payment')
    .not('paid_at', 'is', null);
  if (filters.status) query = query.eq('status', filters.status);
  if (filters.date) query = query.eq('service_date', filters.date);
  const q = filters.q?.trim().replace(/[%,()]/g, '');
  if (q) query = query.or(`order_code.ilike.%${q}%,customer_name.ilike.%${q}%`);
  const { data, count, error } = await query
    .order('paid_at', { ascending: false })
    .range((page - 1) * HISTORY_PAGE_SIZE, page * HISTORY_PAGE_SIZE - 1);
  if (error) throw error;
  return { orders: data, total: count ?? 0, page };
}
