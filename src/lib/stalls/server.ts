import 'server-only';
import { requireSupabasePublicConfig } from '@/lib/env';
import { createClient } from '@/lib/supabase/server';

/** Public URL of an object in the public event-media bucket. */
export function eventMediaUrl(path: string | null): string | null {
  if (!path) return null;
  return `${requireSupabasePublicConfig().url}/storage/v1/object/public/event-media/${path}`;
}

/** The event's stalls with their active assignment (STL-01/02). RLS: event staff. */
export async function listStalls(eventId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('stalls')
    .select(
      'id, number, zone, size_label, width_cm, depth_cm, has_power, has_water, is_premium, fee_ore, map_x, map_y, stall_assignments(event_vendor_id, status)',
    )
    .eq('event_id', eventId)
    .order('number');
  if (error) throw error;
  return data
    .map(({ stall_assignments, ...stall }) => ({
      ...stall,
      assignedTo: stall_assignments.find((a) => a.status === 'active')?.event_vendor_id ?? null,
    }))
    .sort((a, b) => a.number.localeCompare(b.number, 'nb', { numeric: true }));
}

export type StallListRow = Awaited<ReturnType<typeof listStalls>>[number];

/** Approved vendors with their needs, requested stall type, fee status and stall (STL-02). */
export async function listApprovedVendors(eventId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('event_vendors')
    .select(
      'id, needs_power, needs_water, preferred_zone, vendor:vendors(display_name), stall_type:stall_types(name_nb, name_en), stall_fees!stall_fees_event_vendor_id_organization_id_fkey(status), stall_assignments!stall_assignments_event_vendor_id_organization_id_fkey(stall_id, status)',
    )
    .eq('event_id', eventId)
    .eq('status', 'approved');
  if (error) throw error;
  return data
    .map((ev) => ({
      id: ev.id,
      name: ev.vendor?.display_name ?? '',
      needsPower: ev.needs_power,
      needsWater: ev.needs_water,
      preferredZone: ev.preferred_zone,
      stallType: ev.stall_type,
      feePaid: ev.stall_fees.some((f) => f.status === 'paid'),
      stallId: ev.stall_assignments.find((a) => a.status === 'active')?.stall_id ?? null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'nb'));
}

export async function venueMapPath(eventId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('events')
    .select('venue_map_path')
    .eq('id', eventId)
    .single();
  if (error) throw error;
  return data.venue_map_path;
}

/**
 * The signed-in vendor's stall fee, invoice and stall (STL-04). The stall is returned only once
 * the fee is paid: an assignment is confirmed to the vendor after payment.
 */
export async function getMyStall(eventVendorId: string) {
  const supabase = await createClient();
  const [fees, assignment] = await Promise.all([
    supabase
      .from('stall_fees')
      .select(
        'id, amount_ore, mva_ore, total_ore, status, due_at, paid_at, invoices(id, invoice_number, status, issued_at), fee_payments(id, paid_at)',
      )
      .eq('event_vendor_id', eventVendorId)
      .neq('status', 'cancelled')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('stall_assignments')
      .select(
        'stall:stalls!stall_assignments_stall_id_organization_id_fkey(id, number, zone, size_label, width_cm, depth_cm, has_power, has_water, map_x, map_y)',
      )
      .eq('event_vendor_id', eventVendorId)
      .eq('status', 'active')
      .maybeSingle(),
  ]);
  if (fees.error) throw fees.error;
  if (assignment.error) throw assignment.error;
  const fee = fees.data && {
    ...fees.data,
    invoice: fees.data.invoices.at(-1) ?? null,
    payment: fees.data.fee_payments.at(-1) ?? null,
  };
  const paid = fee?.status === 'paid';
  return { fee, stall: paid ? (assignment.data?.stall ?? null) : null };
}
