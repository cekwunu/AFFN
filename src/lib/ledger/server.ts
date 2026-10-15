import 'server-only';
import { createClient } from '@/lib/supabase/server';

export interface MoneyTotals {
  grossOre: number;
  refundedOre: number;
  platformFeeOre: number;
  commissionOre: number | null;
  commissionMvaOre: number | null;
  pspFeeOre: number;
  vendorOre: number;
}

/** Event totals from the ledger and, independently, from orders and refunds (must agree). */
export async function eventMoneyTotals(eventId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('event_money_totals', { p_event_id: eventId });
  if (error) throw error;
  const pick = (source: string): MoneyTotals => {
    const row = data.find((r) => r.source === source)!;
    return {
      grossOre: row.gross_ore,
      refundedOre: row.refunded_ore,
      platformFeeOre: row.platform_fee_ore,
      commissionOre: row.commission_ore,
      commissionMvaOre: row.commission_mva_ore,
      pspFeeOre: row.psp_fee_ore,
      vendorOre: row.vendor_ore,
    };
  };
  return { ledger: pick('ledger'), orders: pick('orders') };
}

/** Vendor balances from the ledger (RLS: a vendor sees only its own). */
export async function vendorBalances(eventId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('vendor_balances', { p_event_id: eventId });
  if (error) throw error;
  const ids = data.map((b) => b.vendor_id);
  const { data: vendors } = ids.length
    ? await supabase.from('vendors').select('id, display_name').in('id', ids)
    : { data: [] as { id: string; display_name: string }[] };
  const names = new Map((vendors ?? []).map((v) => [v.id, v.display_name]));
  return data
    .map((b) => ({
      vendorId: b.vendor_id,
      name: names.get(b.vendor_id) ?? '–',
      lifetimeOre: b.lifetime_ore,
      inSettlementOre: b.in_settlement_ore,
      paidOre: b.paid_ore,
      pendingOre: b.pending_ore,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'nb'));
}
export type VendorBalance = Awaited<ReturnType<typeof vendorBalances>>[number];
