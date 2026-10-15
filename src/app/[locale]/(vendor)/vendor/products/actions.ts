'use server';

import { getLocale, getTranslations } from 'next-intl/server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { localizePath } from '@/i18n/paths';
import type { Locale } from '@/i18n/routing';
import { duplicateName, productSchema } from '@/lib/catalogue/products';
import { getMyProduct, myParticipation, myVendor } from '@/lib/catalogue/server';
import { fieldErrors } from '@/lib/vendor/application';
import { createClient } from '@/lib/supabase/server';
import { currentApplicationEvent } from '@/lib/vendor/server';

export interface ProductState {
  ok?: 'saved';
  at?: number;
  error?: string;
  errors?: Record<string, string>;
  values?: Record<string, string | string[]>;
}

async function vendorOrThrow() {
  const vendor = await myVendor();
  if (!vendor) throw new Error('No vendor');
  return vendor;
}

const back = async (query: string): Promise<never> =>
  redirect(localizePath(`/vendor/products${query}`, (await getLocale()) as Locale));

/** Create or edit a product (CAT-01). The image is uploaded by the browser beforehand. */
export async function saveProduct(_: ProductState, formData: FormData): Promise<ProductState> {
  const vendor = await vendorOrThrow();
  const values = {
    name: String(formData.get('name') ?? ''),
    description: String(formData.get('description') ?? ''),
    price: String(formData.get('price') ?? ''),
    categoryId: String(formData.get('categoryId') ?? ''),
    mvaRateBp: String(formData.get('mvaRateBp') ?? '0'),
    noAllergens: String(formData.get('noAllergens') ?? ''),
    dietaryTags: formData.getAll('dietaryTags').map(String),
    allergens: formData.getAll('allergens').map(String),
  };
  const parsed = productSchema({ mvaRegistered: vendor.mva_registered }).safeParse(values);
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values };

  const id = String(formData.get('id') ?? '');
  const imagePath = String(formData.get('imagePath') ?? '') || null;
  if (imagePath && !imagePath.startsWith(`${vendor.id}/products/`)) return { error: 'forbidden' };

  const row = {
    name: parsed.data.name,
    description: parsed.data.description || null,
    price_ore: parsed.data.price,
    category_id: parsed.data.categoryId,
    dietary_tags: parsed.data.dietaryTags,
    allergens: parsed.data.allergens,
    mva_rate_bp: parsed.data.mvaRateBp,
    image_path: imagePath,
  };
  const supabase = await createClient();
  if (id) {
    const { data, error } = await supabase
      .from('products')
      .update(row)
      .eq('id', id)
      .eq('vendor_id', vendor.id)
      .select('id');
    if (error) throw error;
    if (data.length !== 1) return { error: 'forbidden', values };
    revalidatePath('/', 'layout');
    return { ok: 'saved', at: Date.now() };
  }

  const { data: last } = await supabase
    .from('products')
    .select('sort_order')
    .eq('vendor_id', vendor.id)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();
  const { data, error } = await supabase
    .from('products')
    .insert({
      ...row,
      organization_id: vendor.organization_id,
      vendor_id: vendor.id,
      sort_order: (last?.sort_order ?? 0) + 1,
    })
    .select('id')
    .single();
  if (error) throw error;
  revalidatePath('/', 'layout');
  return redirect(
    localizePath(`/vendor/products/${data.id}?created=1`, (await getLocale()) as Locale),
  );
}

/** Copy of a product, added at the end of the menu and not on sale yet. */
export async function duplicateProduct(formData: FormData): Promise<void> {
  const vendor = await vendorOrThrow();
  const product = await getMyProduct(vendor.id, String(formData.get('id') ?? ''));
  if (!product) return back('?error=forbidden');
  const t = await getTranslations('Catalogue');
  const supabase = await createClient();
  const { data: last } = await supabase
    .from('products')
    .select('sort_order')
    .eq('vendor_id', vendor.id)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();
  const { error } = await supabase.from('products').insert({
    description: product.description,
    price_ore: product.price_ore,
    mva_rate_bp: product.mva_rate_bp,
    image_path: product.image_path,
    category_id: product.category_id,
    dietary_tags: product.dietary_tags,
    allergens: product.allergens,
    name: duplicateName(product.name, t('copyPrefix')),
    organization_id: vendor.organization_id,
    vendor_id: vendor.id,
    sort_order: (last?.sort_order ?? 0) + 1,
  });
  if (error) throw error;
  revalidatePath('/', 'layout');
  return back('?done=duplicated');
}

/** Archive (also takes it off sale, in the database) or restore (CAT-03). */
export async function setArchived(formData: FormData): Promise<void> {
  const vendor = await vendorOrThrow();
  const archive = formData.get('archive') === 'true';
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('products')
    .update({ archived_at: archive ? new Date().toISOString() : null })
    .eq('id', String(formData.get('id') ?? ''))
    .eq('vendor_id', vendor.id)
    .select('id');
  if (error) throw error;
  if (data.length !== 1) return back('?error=forbidden');
  revalidatePath('/', 'layout');
  return back(archive ? '?done=archived' : '?show=archived&done=restored');
}

/** Delete, only for a product no order refers to (enforced in the database). */
export async function deleteProduct(formData: FormData): Promise<void> {
  await vendorOrThrow();
  const supabase = await createClient();
  const { error } = await supabase.rpc('delete_product', {
    p_product_id: String(formData.get('id') ?? ''),
  });
  const show = formData.get('show') === 'archived' ? 'show=archived&' : '';
  if (error) {
    if (error.code === '23503') return back(`?${show}error=ordered`);
    if (error.code === '42501') return back(`?${show}error=forbidden`);
    throw error;
  }
  revalidatePath('/', 'layout');
  return back(`?${show}done=deleted`);
}

/** Drag-and-drop order (one order per vendor, used at every event). */
export async function reorderProducts(ids: string[]): Promise<boolean> {
  const vendor = await vendorOrThrow();
  const supabase = await createClient();
  const { error } = await supabase.rpc('reorder_products', {
    p_vendor_id: vendor.id,
    p_ids: ids,
  });
  if (error) return false;
  revalidatePath('/', 'layout');
  return true;
}

/** On sale at the current event or not; sold out or not (CAT-02). */
export async function setAvailability(
  productId: string,
  change: { onSale?: boolean; soldOut?: boolean },
): Promise<boolean> {
  const vendor = await vendorOrThrow();
  const event = await currentApplicationEvent();
  const participation = event ? await myParticipation(vendor.id, event.id) : null;
  if (!event || participation?.status !== 'approved') return false;
  const supabase = await createClient();
  let error;
  if (change.onSale === false) {
    ({ error } = await supabase
      .from('product_availability')
      .delete()
      .eq('product_id', productId)
      .eq('event_vendor_id', participation.id));
  } else if (change.onSale === true) {
    const product = await getMyProduct(vendor.id, productId);
    if (!product || product.archived_at) return false;
    ({ error } = await supabase.from('product_availability').upsert(
      {
        organization_id: event.organization_id,
        event_id: event.id,
        event_vendor_id: participation.id,
        vendor_id: vendor.id,
        product_id: productId,
        is_available: true,
      },
      { onConflict: 'event_id,product_id' },
    ));
  } else if (change.soldOut !== undefined) {
    ({ error } = await supabase
      .from('product_availability')
      .update({ is_available: !change.soldOut })
      .eq('product_id', productId)
      .eq('event_vendor_id', participation.id));
  }
  if (error) return false;
  revalidatePath('/', 'layout');
  return true;
}
