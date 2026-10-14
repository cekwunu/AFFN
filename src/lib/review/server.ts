import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { documentsComplete } from '@/lib/vendor/application';
import { matchesQueue, type QueueFilters } from './queue';

/** Applications for one event, as event staff see them under RLS (REV-01). */
export async function listApplications(eventId: string, filters: QueueFilters) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('event_vendors')
    .select(
      `id, status, submitted_at, created_at,
       vendor:vendors (id, display_name, legal_name, org_number, category,
         contact:vendor_contacts!vendor_contacts_vendor_id_fkey (contact_name, contact_email),
         documents:vendor_documents!vendor_documents_vendor_id_fkey (document_type, status)),
       stall_type:stall_types (name_nb, name_en)`,
    )
    .eq('event_id', eventId)
    .order('submitted_at', { ascending: false, nullsFirst: false });
  if (error) throw error;

  const rows = data
    .filter((row) => row.vendor)
    .map((row) => {
      const vendor = row.vendor!;
      const contact = Array.isArray(vendor.contact) ? vendor.contact[0] : vendor.contact;
      return {
        id: row.id,
        status: row.status,
        submittedAt: row.submitted_at,
        vendorName: vendor.display_name,
        legalName: vendor.legal_name,
        orgNumber: vendor.org_number,
        category: vendor.category,
        contactName: contact?.contact_name ?? null,
        contactEmail: contact?.contact_email ?? null,
        documentsComplete: documentsComplete(vendor.category, vendor.documents ?? []),
        stallType: row.stall_type,
      };
    });

  const counts: Record<string, number> = {};
  for (const row of rows) counts[row.status] = (counts[row.status] ?? 0) + 1;
  return { rows: rows.filter((row) => matchesQueue(row, filters)), counts, total: rows.length };
}

export type QueueRow = Awaited<ReturnType<typeof listApplications>>['rows'][number];

/** Emails of users, for actor names in the history (staff pages only). */
async function emailsOf(ids: (string | null | undefined)[]) {
  const admin = createAdminClient();
  const unique = [...new Set(ids.filter((id): id is string => !!id))];
  const entries = await Promise.all(
    unique.map(async (id) => {
      const { data } = await admin.auth.admin.getUserById(id);
      return [id, data.user?.email ?? '—'] as const;
    }),
  );
  return new Map(entries);
}

/** Everything the reviewer needs for one application. Null when not visible to the user. */
export async function getApplicationForReview(id: string) {
  const supabase = await createClient();
  const { data: application, error } = await supabase
    .from('event_vendors')
    .select(
      `id, organization_id, event_id, status, submitted_at, decided_at, needs_power, needs_water,
       preferred_zone, stall_type_id,
       event:events (id, name, starts_at, ends_at),
       stall_type:stall_types (name_nb, name_en, size_label, fee_ore),
       vendor:vendors (id, organization_id, org_number, legal_name, display_name, business_form,
         business_address, postal_code, city, brreg_status, brreg_verified_at, category,
         cuisine_country, description, website_url, instagram_handle, facebook_url, tiktok_handle,
         logo_path, cover_image_path)`,
    )
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!application?.vendor || !application.event) return null;
  const vendorId = application.vendor.id;

  const [contact, documents, agreement, reviews, notes, fee] = await Promise.all([
    supabase
      .from('vendor_contacts')
      .select('contact_name, contact_email, contact_phone')
      .eq('vendor_id', vendorId)
      .maybeSingle(),
    supabase
      .from('vendor_documents')
      .select('id, document_type, file_name, expires_on, description, status, created_at')
      .eq('vendor_id', vendorId)
      .order('created_at'),
    supabase
      .from('vendor_agreements')
      .select(
        'terms_version, commission_terms, stall_fee_terms, settlement_terms, accepted_at, accepted_by',
      )
      .eq('event_vendor_id', id)
      .order('accepted_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('application_reviews')
      .select('id, from_status, to_status, note, actor_id, created_at')
      .eq('event_vendor_id', id)
      .order('created_at'),
    supabase
      .from('internal_notes')
      .select('id, body, author_id, created_at')
      .eq('event_vendor_id', id)
      .order('created_at', { ascending: false }),
    supabase
      .from('stall_fees')
      .select(
        'id, amount_ore, mva_ore, total_ore, status, due_at, paid_at, invoice:invoices (invoice_number, status, total_ore)',
      )
      .eq('event_vendor_id', id)
      .neq('status', 'cancelled')
      .maybeSingle(),
  ]);
  for (const result of [contact, documents, agreement, reviews, notes, fee]) {
    if (result.error) throw result.error;
  }

  const people = await emailsOf([
    agreement.data?.accepted_by,
    ...(reviews.data ?? []).map((r) => r.actor_id),
    ...(notes.data ?? []).map((n) => n.author_id),
  ]);

  return {
    ...application,
    vendor: application.vendor,
    event: application.event,
    contact: contact.data,
    documents: documents.data ?? [],
    agreement: agreement.data,
    reviews: reviews.data ?? [],
    notes: notes.data ?? [],
    stallFee: fee.data ? { ...fee.data, invoice: fee.data.invoice.at(-1) ?? null } : null,
    people,
  };
}

export type ApplicationForReview = NonNullable<Awaited<ReturnType<typeof getApplicationForReview>>>;
