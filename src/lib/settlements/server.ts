import 'server-only';
import { createClient } from '@/lib/supabase/server';
import type { Database } from '@/lib/supabase/database.types';

export type SettlementStatus = Database['public']['Enums']['settlement_status'];

/** Batches still being worked on (queue), as opposed to history. */
export const OPEN_STATUSES: SettlementStatus[] = [
  'draft',
  'prepared',
  'approved',
  'releasing',
  'completed_with_failures',
];

const LINES = 'lines:settlement_lines!settlement_lines_settlement_id_organization_id_fkey';

/** The event's settlement batches, newest first, with their totals (SET-02). Read under RLS. */
export async function listSettlements(eventId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('settlements')
    .select(
      `id, status, notes, cutoff_at, created_at, prepared_at, approved_at, released_at,
       ${LINES}(net_payout_ore)`,
    )
    .eq('event_id', eventId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data.map(({ lines, ...s }) => ({
    ...s,
    vendors: lines.length,
    netOre: lines.reduce((sum, l) => sum + l.net_payout_ore, 0),
  }));
}

/** One batch with lines, blockers, adjustments and payouts. Read under RLS. */
export async function getSettlement(id: string) {
  const supabase = await createClient();
  const { data: settlement } = await supabase
    .from('settlements')
    .select(
      'id, organization_id, event_id, status, notes, cutoff_at, created_at, created_by, prepared_by, prepared_at, approved_by, approved_at, released_at',
    )
    .eq('id', id)
    .maybeSingle();
  if (!settlement) return null;
  const [lines, blockers, adjustments, payouts] = await Promise.all([
    supabase
      .from('settlement_lines')
      .select(
        'id, vendor_id, event_vendor_id, gross_sales_ore, refunds_ore, commission_ore, commission_mva_ore, adjustments_ore, net_payout_ore, period_start, cutoff_at',
      )
      .eq('settlement_id', id),
    supabase.rpc('settlement_blockers', { p_settlement_id: id }),
    supabase
      .from('settlement_adjustments')
      .select('id, vendor_id, amount_ore, reason, created_by, created_at, approved_by, approved_at')
      .eq('settlement_id', id)
      .order('created_at'),
    supabase
      .from('payouts')
      .select(
        'id, settlement_line_id, vendor_id, amount_ore, status, attempt, provider_payout_id, failure_reason, paid_at, created_at',
      )
      .eq('settlement_id', id)
      .order('created_at'),
  ]);
  for (const r of [lines, blockers, adjustments, payouts]) if (r.error) throw r.error;
  // Documents (SET-04): commission invoices and stored statements, invoices and order CSVs.
  const [invoices, documents, organization] = await Promise.all([
    supabase
      .from('invoices')
      .select('id, vendor_id, invoice_number, total_ore')
      .eq('settlement_id', id)
      .eq('kind', 'commission'),
    supabase
      .from('documents')
      .select('id, kind, subject_key, locale, version, created_at')
      .eq('settlement_id', id)
      .order('version', { ascending: false }),
    supabase
      .from('organizations')
      .select('legal_name, org_number')
      .eq('id', settlement.organization_id)
      .single(),
  ]);
  const vendorIds = [
    ...new Set([
      ...lines.data!.map((l) => l.vendor_id),
      ...adjustments.data!.map((a) => a.vendor_id),
    ]),
  ];
  const { data: vendors } = vendorIds.length
    ? await supabase.from('vendors').select('id, display_name').in('id', vendorIds)
    : { data: [] as { id: string; display_name: string }[] };
  const names = new Map((vendors ?? []).map((v) => [v.id, v.display_name]));
  const name = (vendorId: string | null) => (vendorId ? (names.get(vendorId) ?? '–') : null);
  return {
    ...settlement,
    lines: lines
      .data!.map((l) => ({
        ...l,
        name: name(l.vendor_id)!,
        payouts: payouts.data!.filter((p) => p.settlement_line_id === l.id),
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'nb')),
    blockers: blockers.data!.map((b) => ({ ...b, name: name(b.vendor_id) })),
    adjustments: adjustments.data!.map((a) => ({ ...a, name: name(a.vendor_id)! })),
    payouts: payouts.data!.map((p) => ({ ...p, name: name(p.vendor_id)! })),
    invoices: invoices.data ?? [],
    documents: documents.data ?? [],
    sellerReady: !!organization.data?.legal_name && !!organization.data.org_number,
  };
}
export type SettlementDetail = NonNullable<Awaited<ReturnType<typeof getSettlement>>>;

/** Vendors of the event that can be put in a batch (approved participations). */
export async function settleableVendors(eventId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('event_vendors')
    .select('id, vendor_id, psp_account_status, vendor:vendors(display_name)')
    .eq('event_id', eventId)
    .eq('status', 'approved');
  if (error) throw error;
  return data
    .map((ev) => ({
      vendorId: ev.vendor_id,
      name: ev.vendor?.display_name ?? '–',
      payoutsEnabled: ev.psp_account_status === 'eligible',
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'nb'));
}

/** The signed-in vendor's settlement lines and payouts (SET-01). Read under RLS. */
export async function myVendorSettlements(vendorId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('settlement_lines')
    .select(
      `id, gross_sales_ore, refunds_ore, commission_ore, commission_mva_ore, adjustments_ore, net_payout_ore,
       period_start, cutoff_at,
       settlement:settlements!settlement_lines_settlement_id_organization_id_fkey(id, status, approved_at, released_at),
       payouts:payouts!payouts_settlement_line_id_organization_id_fkey(status, amount_ore, paid_at, attempt)`,
    )
    .eq('vendor_id', vendorId)
    .order('cutoff_at', { ascending: false });
  if (error) throw error;
  const lines = data.filter((l) => l.settlement && l.settlement.status !== 'cancelled');
  // The AFFN commission invoice for each released line (SET-04).
  const { data: invoices } = lines.length
    ? await supabase
        .from('invoices')
        .select('id, settlement_id, invoice_number')
        .eq('vendor_id', vendorId)
        .eq('kind', 'commission')
        .in(
          'settlement_id',
          lines.map((l) => l.settlement!.id),
        )
    : { data: [] };
  return lines.map((l) => ({
    ...l,
    invoice: (invoices ?? []).find((i) => i.settlement_id === l.settlement!.id) ?? null,
  }));
}
