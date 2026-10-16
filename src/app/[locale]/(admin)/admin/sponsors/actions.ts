'use server';

import { getLocale } from 'next-intl/server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { localizePath } from '@/i18n/paths';
import type { Locale } from '@/i18n/routing';
import { kronerToOre } from '@/lib/money';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { currentApplicationEvent } from '@/lib/vendor/server';

const text = (formData: FormData, name: string) => {
  const value = formData.get(name);
  return typeof value === 'string' ? value.trim() : '';
};

async function back(path: string, query: string): Promise<never> {
  revalidatePath('/admin/sponsors');
  revalidatePath('/sponsor');
  revalidatePath('/sponsors');
  redirect(localizePath(`${path}?${query}`, (await getLocale()) as Locale));
}

const price = (value: string) => {
  try {
    return kronerToOre(value || '0');
  } catch {
    return null;
  }
};

/**
 * Creates or edits a sponsor package for the current event (SPO-01): name, price, deliverables
 * (one per line), logo level and number of QR codes. No fixed tiers. Event staff (RLS), audited.
 */
export async function savePackage(formData: FormData) {
  const event = await currentApplicationEvent();
  if (!event) return back('/admin/sponsors', 'error=failed');
  const id = text(formData, 'id');
  const name = text(formData, 'name');
  const priceOre = price(text(formData, 'price'));
  const level = Number(text(formData, 'logoLevel'));
  const qr = Number(text(formData, 'qrCodes'));
  const tier = Number(text(formData, 'tier') || '1');
  if (!name || priceOre === null || priceOre < 0) return back('/admin/sponsors', 'error=package');
  if (!(level >= 1 && level <= 5) || !(qr >= 0 && qr <= 20) || !(tier >= 1)) {
    return back('/admin/sponsors', 'error=package');
  }
  const row = {
    name: name.slice(0, 100),
    price_ore: priceOre,
    description: text(formData, 'description').slice(0, 500) || null,
    deliverables: text(formData, 'deliverables')
      .split('\n')
      .map((d) => d.trim())
      .filter(Boolean)
      .slice(0, 30),
    logo_level: level,
    qr_code_count: qr,
    tier,
    is_active: formData.get('active') === 'on',
  };
  const supabase = await createClient();
  const { error } = id
    ? await supabase.from('sponsor_packages').update(row).eq('id', id)
    : await supabase
        .from('sponsor_packages')
        .insert({ ...row, organization_id: event.organization_id, event_id: event.id });
  if (error)
    return back('/admin/sponsors', error.code === '23505' ? 'error=duplicate' : 'error=failed');
  return back('/admin/sponsors', 'notice=package');
}

/** Approves (with the package price or an agreed price) or declines an inquiry, with a note. */
export async function reviewSponsorship(formData: FormData) {
  const id = text(formData, 'id');
  const path = `/admin/sponsors/${id}`;
  const note = text(formData, 'note');
  if (!note) return back(path, 'error=note');
  const approve = formData.get('decision') === 'approve';
  const agreed = text(formData, 'price');
  const priceOre = agreed ? price(agreed) : null;
  if (agreed && priceOre === null) return back(path, 'error=price');
  const supabase = await createClient();
  const { error } = await supabase.rpc('review_sponsorship', {
    p_sponsorship_id: id,
    p_approve: approve,
    p_note: note.slice(0, 1000),
    p_price_ore: priceOre as never,
  });
  if (error) return back(path, 'error=failed');
  return back(path, approve ? 'notice=approved' : 'notice=declined');
}

/** Deliverable status and note (event staff, audited). */
export async function setDeliverable(formData: FormData) {
  const sponsorship = text(formData, 'sponsorship');
  const status = text(formData, 'status') as 'pending' | 'in_progress' | 'delivered';
  if (!['pending', 'in_progress', 'delivered'].includes(status)) {
    return back(`/admin/sponsors/${sponsorship}`, 'error=failed');
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('sponsorship_deliverables')
    .update({ status, note: text(formData, 'note').slice(0, 1000) || null })
    .eq('id', text(formData, 'id'))
    .select('id');
  if (error || !data?.length) return back(`/admin/sponsors/${sponsorship}`, 'error=failed');
  return back(`/admin/sponsors/${sponsorship}`, 'notice=deliverable');
}

/**
 * Approves or rejects an asset with feedback (SPO-02). An approved logo is copied to the public
 * bucket and becomes the sponsor's logo on the website.
 */
export async function reviewAsset(formData: FormData) {
  const sponsorship = text(formData, 'sponsorship');
  const path = `/admin/sponsors/${sponsorship}`;
  const decision = formData.get('decision') === 'accept' ? 'accepted' : 'rejected';
  const feedback = text(formData, 'feedback').slice(0, 1000) || null;
  if (decision === 'rejected' && !feedback) return back(path, 'error=feedback');
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: asset, error } = await supabase
    .from('sponsor_assets')
    .update({
      status: decision,
      feedback,
      reviewed_by: user?.id ?? null,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', text(formData, 'id'))
    .select('id, kind, sponsor_id, storage_path, mime_type')
    .maybeSingle();
  if (error || !asset) return back(path, 'error=failed');
  if (decision === 'accepted' && asset.kind === 'logo') {
    const admin = createAdminClient();
    const file = await admin.storage.from('sponsor-assets').download(asset.storage_path);
    if (file.error) return back(path, 'error=failed');
    const extension = asset.mime_type === 'image/svg+xml' ? 'svg' : 'png';
    const publicPath = `${asset.sponsor_id}/logo-${asset.id}.${extension}`;
    const upload = await admin.storage.from('sponsor-media').upload(publicPath, file.data, {
      contentType: asset.mime_type ?? 'image/png',
      upsert: true,
    });
    if (upload.error) return back(path, 'error=failed');
    await admin.from('sponsors').update({ logo_path: publicPath }).eq('id', asset.sponsor_id);
  }
  return back(path, `notice=asset_${decision}`);
}

/** Bank transfer received (Organization Admin, audited). */
export async function markSponsorInvoicePaid(formData: FormData) {
  const sponsorship = text(formData, 'sponsorship');
  const supabase = await createClient();
  const { error } = await supabase.rpc('mark_sponsor_invoice_paid', {
    p_invoice_id: text(formData, 'invoice'),
  });
  return back(`/admin/sponsors/${sponsorship}`, error ? 'error=paid' : 'notice=paid');
}
