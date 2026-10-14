import 'server-only';
import { cache } from 'react';
import { currentOrganization } from '@/lib/auth/server';
import { resolveCommissionRule, type CommissionRule } from '@/lib/commission';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import type { ApplicationProgress } from './application';

/**
 * The event vendors apply for now: the organization's next published event that has not ended.
 * Public information, read with the service role so it also works before sign-in.
 */
export const currentApplicationEvent = cache(async () => {
  const org = await currentOrganization();
  const { data, error } = await createAdminClient()
    .from('events')
    .select(
      'id, organization_id, name, slug, starts_at, ends_at, venue_name, venue_address, applications_open_at, application_deadline, decisions_by',
    )
    .eq('organization_id', org.id)
    .eq('status', 'published')
    .or(`ends_at.is.null,ends_at.gt.${new Date().toISOString()}`)
    .order('starts_at', { ascending: true, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
});

export type ApplicationEvent = NonNullable<Awaited<ReturnType<typeof currentApplicationEvent>>>;

/** Whether applications are open for the event right now. */
export function applicationsOpen(event: ApplicationEvent, now = new Date()): boolean {
  if (event.applications_open_at && new Date(event.applications_open_at) > now) return false;
  if (event.application_deadline && new Date(event.application_deadline) < now) return false;
  return true;
}

export const stallTypesFor = cache(async (eventId: string) => {
  const { data, error } = await createAdminClient()
    .from('stall_types')
    .select('id, name_nb, name_en, description_nb, description_en, size_label, fee_ore')
    .eq('event_id', eventId)
    .order('sort_order');
  if (error) throw error;
  return data;
});

/** Zones of the event's stalls, for "preferred zone". */
export const zonesFor = cache(async (eventId: string) => {
  const { data, error } = await createAdminClient()
    .from('stalls')
    .select('zone')
    .eq('event_id', eventId)
    .not('zone', 'is', null);
  if (error) throw error;
  return [...new Set(data.map((s) => s.zone!))].sort((a, b) => a.localeCompare(b, 'nb'));
});

/** The commission in force for a vendor at this event (vendor → event → organization). */
export const commissionRuleFor = cache(async (eventId: string, vendorId: string | null) => {
  const event = await currentApplicationEvent();
  const { data, error } = await createAdminClient()
    .from('commission_rules')
    .select('scope, type, rate_bp, fixed_ore, event_id, category_id, vendor_id, effective_from')
    .eq('organization_id', event?.organization_id ?? '');
  if (error) throw error;
  const rules: CommissionRule[] = data.map((r) => ({
    scope: r.scope,
    type: r.type,
    rateBp: r.rate_bp,
    fixedOre: r.fixed_ore,
    eventId: r.event_id,
    categoryId: r.category_id,
    vendorId: r.vendor_id,
    effectiveFrom: r.effective_from,
  }));
  return resolveCommissionRule(rules, { vendorId, eventId });
});

/** The signed-in vendor's application for the event, with everything the steps need. */
export async function getMyApplication(eventId: string) {
  const supabase = await createClient();
  const { data: application, error } = await supabase
    .from('event_vendors')
    .select(
      `id, status, submitted_at, decided_at, stall_type_id, preferred_zone, needs_power, needs_water,
       application_progress, vendor_id,
       vendor:vendors (id, org_number, legal_name, display_name, business_form, business_address,
         postal_code, city, brreg_status, category, cuisine_country, description, website_url,
         instagram_handle, facebook_url, tiktok_handle, logo_path, cover_image_path)`,
    )
    .eq('event_id', eventId)
    .maybeSingle();
  if (error) throw error;
  if (!application?.vendor) return null;

  const [contact, documents, agreement, reviews] = await Promise.all([
    supabase
      .from('vendor_contacts')
      .select('contact_name, contact_email, contact_phone')
      .eq('vendor_id', application.vendor_id)
      .maybeSingle(),
    supabase
      .from('vendor_documents')
      .select(
        'id, document_type, file_name, storage_path, expires_on, description, status, created_at',
      )
      .eq('vendor_id', application.vendor_id)
      .order('created_at'),
    supabase
      .from('vendor_agreements')
      .select(
        'terms_version, commission_terms, stall_fee_terms, settlement_terms, accepted_at, accepted_by',
      )
      .eq('event_vendor_id', application.id)
      .order('accepted_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('application_reviews')
      .select('to_status, note, created_at')
      .eq('event_vendor_id', application.id)
      .order('created_at', { ascending: false }),
  ]);
  for (const result of [contact, documents, agreement, reviews])
    if (result.error) throw result.error;

  return {
    ...application,
    vendor: application.vendor,
    progress: (application.application_progress ?? {}) as ApplicationProgress,
    contact: contact.data,
    documents: documents.data ?? [],
    agreement: agreement.data,
    reviews: reviews.data ?? [],
  };
}

export type MyApplication = NonNullable<Awaited<ReturnType<typeof getMyApplication>>>;
