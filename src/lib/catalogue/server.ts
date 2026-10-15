import 'server-only';
import { cache } from 'react';
import { getCurrentUser } from '@/lib/auth/server';
import { createClient } from '@/lib/supabase/server';

const VENDOR_COLUMNS =
  'id, organization_id, slug, display_name, legal_name, org_number, category, cuisine_country, description, story, logo_path, cover_image_path, public_email, public_phone, website_url, instagram_handle, facebook_url, tiktok_handle, offers_catering, catering_offer, mva_registered, profile_published';

/** The signed-in user's vendor business (vendor membership), or null before applying. */
export const myVendor = cache(async () => {
  const user = await getCurrentUser();
  if (!user) return null;
  const supabase = await createClient();
  const { data: membership } = await supabase
    .from('memberships')
    .select('vendor_id')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .not('vendor_id', 'is', null)
    .limit(1)
    .maybeSingle();
  if (!membership?.vendor_id) return null;
  const { data, error } = await supabase
    .from('vendors')
    .select(VENDOR_COLUMNS)
    .eq('id', membership.vendor_id)
    .single();
  if (error) throw error;
  return data;
});
export type MyVendor = NonNullable<Awaited<ReturnType<typeof myVendor>>>;

/** The vendor's participation in an event (status, payment account), or null. */
export async function myParticipation(vendorId: string, eventId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('event_vendors')
    .select('id, status, psp_account_status, is_published, is_paused')
    .eq('vendor_id', vendorId)
    .eq('event_id', eventId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** The vendor's products in display order, with order count and availability at the event. */
export async function listMyProducts(vendorId: string, eventVendorId: string | null) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('products')
    .select(
      'id, name, description, price_ore, mva_rate_bp, image_path, category_id, dietary_tags, allergens, archived_at, sort_order, created_at, orders:order_items(count), availability:product_availability(id, event_vendor_id, is_available)',
    )
    .eq('vendor_id', vendorId)
    .order('sort_order')
    .order('created_at');
  if (error) throw error;
  return data.map(({ orders, availability, ...product }) => {
    const here = availability.find((a) => a.event_vendor_id === eventVendorId) ?? null;
    return {
      ...product,
      ordered: (orders[0]?.count ?? 0) > 0,
      onSale: !!here,
      soldOut: here ? !here.is_available : false,
    };
  });
}
export type MyProduct = Awaited<ReturnType<typeof listMyProducts>>[number];

export async function getMyProduct(vendorId: string, id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('products')
    .select(
      'id, name, description, price_ore, mva_rate_bp, image_path, category_id, dietary_tags, allergens, archived_at',
    )
    .eq('vendor_id', vendorId)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** Product categories of the organization (menu sections). */
export const productCategories = cache(async (organizationId: string) => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('product_categories')
    .select('id, slug, name_nb, name_en, sort_order')
    .eq('organization_id', organizationId)
    .order('sort_order');
  if (error) throw error;
  return data;
});

export async function myGallery(vendorId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('vendor_gallery_images')
    .select('id, storage_path, alt_text, sort_order')
    .eq('vendor_id', vendorId)
    .order('sort_order')
    .order('created_at');
  if (error) throw error;
  return data;
}
