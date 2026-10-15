import 'server-only';
import { cache } from 'react';
import { createAdminClient } from '@/lib/supabase/admin';

/** Why a vendor cannot take orders right now (QR-04); null when it can. */
export type BlockedReason = 'paused' | 'payouts' | 'closed' | null;

/**
 * Everything the public vendor page needs (QR-02), read with the service role and filtered
 * explicitly: only an approved, published participation of a public vendor at a published or
 * closed event is shown; null otherwise (404).
 */
export const getStorefront = cache(async (eventSlug: string, vendorSlug: string) => {
  const admin = createAdminClient();
  const [{ data: event }, { data: vendor }] = await Promise.all([
    admin
      .from('events')
      .select('id, organization_id, name, slug, status, starts_at, ends_at, venue_name')
      .eq('slug', eventSlug)
      .in('status', ['published', 'closed'])
      .maybeSingle(),
    admin
      .from('vendors')
      .select(
        'id, display_name, legal_name, org_number, slug, description, story, logo_path, cover_image_path, cuisine_country, profile_published',
      )
      .eq('slug', vendorSlug)
      .eq('profile_published', true)
      .maybeSingle(),
  ]);
  if (!event || !vendor) return null;
  const { data: participation } = await admin
    .from('event_vendors')
    .select('id, status, is_published, is_paused, psp_account_id, psp_account_status')
    .eq('event_id', event.id)
    .eq('vendor_id', vendor.id)
    .eq('status', 'approved')
    .eq('is_published', true)
    .maybeSingle();
  if (!participation) return null;

  const [{ data: products }, { data: categories }] = await Promise.all([
    admin
      .from('product_availability')
      .select(
        'is_available, product:products!inner(id, name, description, price_ore, mva_rate_bp, image_path, category_id, dietary_tags, allergens, sort_order, archived_at)',
      )
      .eq('event_vendor_id', participation.id)
      .is('product.archived_at', null),
    admin
      .from('product_categories')
      .select('id, name_nb, name_en, sort_order')
      .eq('organization_id', event.organization_id)
      .order('sort_order'),
  ]);

  const menu = (products ?? [])
    .map(({ is_available, product }) => ({ ...product, soldOut: !is_available }))
    .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, 'nb'));

  const blocked: BlockedReason =
    event.status === 'closed'
      ? 'closed'
      : participation.is_paused
        ? 'paused'
        : participation.psp_account_status !== 'eligible' || !participation.psp_account_id
          ? 'payouts'
          : null;

  return {
    event,
    vendor,
    eventVendorId: participation.id,
    pspAccountId: participation.psp_account_id,
    menu,
    categories: categories ?? [],
    blocked,
  };
});

export type Storefront = NonNullable<Awaited<ReturnType<typeof getStorefront>>>;

/** Commission rules that can apply to this vendor at this event (resolved per order). */
export async function commissionRulesFor(
  organizationId: string,
  eventId: string,
  vendorId: string,
) {
  const { data, error } = await createAdminClient()
    .from('commission_rules')
    .select('id, scope, type, rate_bp, fixed_ore, event_id, category_id, vendor_id, effective_from')
    .eq('organization_id', organizationId)
    .or(`event_id.is.null,event_id.eq.${eventId}`)
    .or(`vendor_id.is.null,vendor_id.eq.${vendorId}`);
  if (error) throw error;
  return data.map((r) => ({
    id: r.id,
    scope: r.scope,
    type: r.type,
    rateBp: r.rate_bp,
    fixedOre: r.fixed_ore,
    eventId: r.event_id,
    categoryId: r.category_id,
    vendorId: r.vendor_id,
    effectiveFrom: r.effective_from,
  }));
}
