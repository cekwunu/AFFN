'use server';

import { revalidatePath } from 'next/cache';
import { myVendor } from '@/lib/catalogue/server';
import { createClient } from '@/lib/supabase/server';
import { fieldErrors } from '@/lib/vendor/application';
import { GALLERY_MAX, galleryAltSchema, portalProfileSchema } from '@/lib/vendor/profile';

export interface ProfileState {
  ok?: boolean;
  at?: number;
  error?: string;
  errors?: Record<string, string>;
  values?: Record<string, string>;
}

const FIELDS = [
  'displayName',
  'description',
  'story',
  'publicEmail',
  'publicPhone',
  'websiteUrl',
  'instagramHandle',
  'facebookUrl',
  'tiktokHandle',
  'offersCatering',
  'cateringOffer',
  'profilePublished',
] as const;

/** Business profile (VIS-02). RLS limits the update to the vendor's own row and columns. */
export async function saveProfile(_: ProfileState, formData: FormData): Promise<ProfileState> {
  const vendor = await myVendor();
  if (!vendor) return { error: 'unknown' };
  const values = Object.fromEntries(FIELDS.map((k) => [k, String(formData.get(k) ?? '')]));
  const parsed = portalProfileSchema.safeParse(values);
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values };
  const p = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase
    .from('vendors')
    .update({
      display_name: p.displayName,
      description: p.description,
      story: p.story ?? null,
      public_email: p.publicEmail ?? null,
      public_phone: p.publicPhone ?? null,
      website_url: p.websiteUrl ?? null,
      instagram_handle: p.instagramHandle ?? null,
      facebook_url: p.facebookUrl ?? null,
      tiktok_handle: p.tiktokHandle ?? null,
      offers_catering: p.offersCatering,
      catering_offer: p.offersCatering ? (p.cateringOffer ?? null) : null,
      profile_published: p.profilePublished,
    })
    .eq('id', vendor.id);
  if (error) throw error;
  revalidatePath('/', 'layout');
  return { ok: true, at: Date.now() };
}

/** Logo or cover image uploaded by the browser to vendor-media/{vendor_id}/. */
export async function setProfileMedia(kind: 'logo' | 'cover', path: string): Promise<boolean> {
  const vendor = await myVendor();
  if (!vendor || !path.startsWith(`${vendor.id}/`)) return false;
  const supabase = await createClient();
  const { error } = await supabase
    .from('vendors')
    .update(kind === 'logo' ? { logo_path: path } : { cover_image_path: path })
    .eq('id', vendor.id);
  if (error) return false;
  revalidatePath('/', 'layout');
  return true;
}

export async function addGalleryImage(path: string, alt: string): Promise<string | null> {
  const vendor = await myVendor();
  if (!vendor || !path.startsWith(`${vendor.id}/gallery/`)) return 'unknown';
  const parsedAlt = galleryAltSchema.safeParse(alt);
  if (!parsedAlt.success) return parsedAlt.error.issues[0]?.message ?? 'alt';
  const supabase = await createClient();
  const { count } = await supabase
    .from('vendor_gallery_images')
    .select('id', { count: 'exact', head: true })
    .eq('vendor_id', vendor.id);
  if ((count ?? 0) >= GALLERY_MAX) return 'full';
  const { error } = await supabase.from('vendor_gallery_images').insert({
    organization_id: vendor.organization_id,
    vendor_id: vendor.id,
    storage_path: path,
    alt_text: parsedAlt.data,
    sort_order: (count ?? 0) + 1,
  });
  if (error) return error.code === '23514' ? 'full' : 'unknown';
  revalidatePath('/', 'layout');
  return null;
}

export async function removeGalleryImage(formData: FormData): Promise<void> {
  const vendor = await myVendor();
  if (!vendor) return;
  const supabase = await createClient();
  const { data } = await supabase
    .from('vendor_gallery_images')
    .delete()
    .eq('id', String(formData.get('id') ?? ''))
    .eq('vendor_id', vendor.id)
    .select('storage_path');
  const path = data?.[0]?.storage_path;
  if (path) await supabase.storage.from('vendor-media').remove([path]);
  revalidatePath('/', 'layout');
}

/** Moves an image one place forward in the gallery. */
export async function moveGalleryImage(formData: FormData): Promise<void> {
  const vendor = await myVendor();
  if (!vendor) return;
  const supabase = await createClient();
  const { data: images } = await supabase
    .from('vendor_gallery_images')
    .select('id')
    .eq('vendor_id', vendor.id)
    .order('sort_order')
    .order('created_at');
  const ids = (images ?? []).map((i) => i.id);
  const index = ids.indexOf(String(formData.get('id') ?? ''));
  if (index <= 0) return;
  [ids[index - 1], ids[index]] = [ids[index]!, ids[index - 1]!];
  await Promise.all(
    ids.map((id, position) =>
      supabase
        .from('vendor_gallery_images')
        .update({ sort_order: position + 1 })
        .eq('id', id),
    ),
  );
  revalidatePath('/', 'layout');
}
