import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { money, text, time } from './csv';

export const EXPORT_KINDS = ['transactions', 'ledger', 'settlements', 'invoices'] as const;
export type ExportKind = (typeof EXPORT_KINDS)[number];

/** Column keys per export, in order (headers come from messages: Exports.columns.<kind>.<key>). */
export const EXPORT_COLUMNS: Record<ExportKind, readonly string[]> = {
  transactions: [
    'time',
    'type',
    'status',
    'vendor',
    'orgNumber',
    'order',
    'reference',
    'method',
    'amount',
    'platformFee',
    'pspFee',
    'id',
  ],
  ledger: [
    'time',
    'transaction',
    'entryType',
    'account',
    'debit',
    'credit',
    'vendor',
    'orgNumber',
    'description',
    'id',
  ],
  settlements: [
    'settlement',
    'status',
    'cutoff',
    'approved',
    'vendor',
    'orgNumber',
    'gross',
    'refunds',
    'commission',
    'mva',
    'adjustments',
    'net',
    'paid',
    'payoutReference',
  ],
  invoices: [
    'number',
    'kind',
    'issued',
    'due',
    'vendor',
    'orgNumber',
    'subtotal',
    'mva',
    'total',
    'status',
    'settledByDeduction',
  ],
};

/**
 * Rows for one export, for one event and a time range (half-open [from, to)). Read with the
 * user's own access (RLS), so a person only exports what they may see.
 */
export async function exportRows(
  kind: ExportKind,
  eventId: string,
  from: Date,
  to: Date,
  label: (group: string, key: string) => string,
): Promise<string[][]> {
  const supabase = await createClient();
  const [f, t] = [from.toISOString(), to.toISOString()];
  const { data: vendorRows } = await supabase
    .from('event_vendors')
    .select('vendor_id, vendor:vendors(display_name, org_number)')
    .eq('event_id', eventId);
  const vendors = new Map(
    (vendorRows ?? []).map((v) => [v.vendor_id, v.vendor ?? { display_name: '', org_number: '' }]),
  );
  const vendor = (id: string | null) =>
    vendors.get(id ?? '') ?? { display_name: '', org_number: '' };

  switch (kind) {
    case 'transactions': {
      const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .eq('event_id', eventId)
        .gte('occurred_at', f)
        .lt('occurred_at', t)
        .order('occurred_at');
      if (error) throw error;
      return data.map((r) => [
        time(r.occurred_at),
        text(label('kinds', r.kind!)),
        text(r.status),
        text(vendor(r.vendor_id).display_name),
        text(vendor(r.vendor_id).org_number),
        text(r.order_code),
        text(r.provider_id),
        text(r.method),
        money(r.amount_ore),
        money(r.fee_ore),
        money(r.psp_fee_ore),
        text(r.id),
      ]);
    }
    case 'ledger': {
      const { data, error } = await supabase
        .from('ledger_entries')
        .select(
          'id, transaction_id, entry_type, account, direction, amount_ore, vendor_id, description, created_at',
        )
        .eq('event_id', eventId)
        .gte('created_at', f)
        .lt('created_at', t)
        .order('created_at')
        .order('transaction_id')
        .order('direction', { ascending: false });
      if (error) throw error;
      return data.map((e) => [
        time(e.created_at),
        text(e.transaction_id),
        text(e.entry_type),
        text(e.account),
        e.direction === 'debit' ? money(e.amount_ore) : '',
        e.direction === 'credit' ? money(e.amount_ore) : '',
        text(vendor(e.vendor_id).display_name),
        text(vendor(e.vendor_id).org_number),
        text(e.description),
        text(e.id),
      ]);
    }
    case 'settlements': {
      const { data, error } = await supabase
        .from('settlement_lines')
        .select(
          `vendor_id, gross_sales_ore, refunds_ore, commission_ore, commission_mva_ore, adjustments_ore, net_payout_ore,
           settlement:settlements!settlement_lines_settlement_id_organization_id_fkey!inner(id, status, cutoff_at, approved_at),
           payouts:payouts!payouts_settlement_line_id_organization_id_fkey(status, amount_ore, provider_payout_id)`,
        )
        .eq('event_id', eventId)
        .gte('settlement.cutoff_at', f)
        .lt('settlement.cutoff_at', t)
        .neq('settlement.status', 'cancelled');
      if (error) throw error;
      return data
        .sort((a, b) => a.settlement.cutoff_at.localeCompare(b.settlement.cutoff_at))
        .map((l) => {
          const paid = l.payouts.filter((p) => p.status === 'paid');
          return [
            text(l.settlement.id),
            text(label('status', l.settlement.status)),
            time(l.settlement.cutoff_at),
            time(l.settlement.approved_at),
            text(vendor(l.vendor_id).display_name),
            text(vendor(l.vendor_id).org_number),
            money(l.gross_sales_ore),
            money(l.refunds_ore),
            money(l.commission_ore),
            money(l.commission_mva_ore),
            money(l.adjustments_ore),
            money(l.net_payout_ore),
            money(paid.reduce((s, p) => s + p.amount_ore, 0)),
            text(paid.map((p) => p.provider_payout_id).join(' ')),
          ];
        });
    }
    case 'invoices': {
      const { data, error } = await supabase
        .from('invoices')
        .select(
          'invoice_number, kind, issued_at, due_at, vendor_id, subtotal_ore, mva_ore, total_ore, status, settled_by_deduction',
        )
        .eq('event_id', eventId)
        .gte('issued_at', f)
        .lt('issued_at', t)
        .order('invoice_number');
      if (error) throw error;
      return data.map((i) => [
        text(i.invoice_number === null ? '' : String(i.invoice_number)),
        text(label('invoiceKinds', i.kind)),
        time(i.issued_at),
        time(i.due_at),
        text(vendor(i.vendor_id).display_name),
        text(vendor(i.vendor_id).org_number),
        money(i.subtotal_ore),
        money(i.mva_ore),
        money(i.total_ore),
        text(label('invoiceStatus', i.status)),
        text(label('yesNo', i.settled_by_deduction ? 'yes' : 'no')),
      ]);
    }
  }
}
