import type { Database } from '@/lib/supabase/database.types';

export type OrderStatus = Database['public']['Enums']['order_status'];

/** Kitchen columns, in order (ORD-02). Collected and cancelled orders leave the board. */
export const KITCHEN_COLUMNS = ['new', 'accepted', 'preparing', 'ready'] as const;
export type KitchenStatus = (typeof KITCHEN_COLUMNS)[number];

/**
 * The one step a vendor can take from each kitchen status (ORD-01). Mirrors
 * private.guard_order_update, which enforces it in the database.
 */
export const NEXT_STATUS: Record<KitchenStatus, Exclude<OrderStatus, 'pending_payment'>> = {
  new: 'accepted',
  accepted: 'preparing',
  preparing: 'ready',
  ready: 'collected',
};

export function isKitchenStatus(status: string): status is KitchenStatus {
  return (KITCHEN_COLUMNS as readonly string[]).includes(status);
}

export function canAdvance(from: OrderStatus, to: OrderStatus): boolean {
  return isKitchenStatus(from) && NEXT_STATUS[from] === to;
}

/** Paid orders still to be handed over can be cancelled (with a full refund, ORD-04). */
export function canCancel(status: OrderStatus): boolean {
  return isKitchenStatus(status);
}

/** Customer's progress steps on the tracking page (ORD-03). */
export const TRACKING_STEPS = ['new', 'accepted', 'preparing', 'ready', 'collected'] as const;

/** Whole minutes since `from`, never negative. */
export function minutesSince(from: string | Date, now: Date = new Date()): number {
  return Math.max(0, Math.floor((now.getTime() - new Date(from).getTime()) / 60_000));
}
