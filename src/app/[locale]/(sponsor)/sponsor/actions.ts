'use server';

import { getLocale } from 'next-intl/server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { localizePath } from '@/i18n/paths';
import type { Locale } from '@/i18n/routing';
import { getCurrentUser } from '@/lib/auth/server';
import { normalizeOrgNumber, suggestDisplayName } from '@/lib/brreg';
import { lookupOrgNumber } from '@/lib/brreg.server';
import { hitLimit } from '@/lib/rate-limit';
import { ASSET_KINDS, MAX_ASSET_BYTES, assetMimeOk } from '@/lib/sponsors/assets';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

export interface RegisterState {
  error?: 'unknown' | 'rate_limited' | 'failed';
  errors?: Partial<Record<string, string>>;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Sponsor registration (SPO-01): company (checked in Brønnøysundregistrene), contact and invoice
 * details, and the package. Creates the sponsor and an inquiry for AFFN to approve.
 */
export async function registerSponsor(
  _: RegisterState,
  formData: FormData,
): Promise<RegisterState> {
  const user = await getCurrentUser();
  if (!user) return { error: 'unknown' };
  const value = (name: string) => {
    const v = formData.get(name);
    return typeof v === 'string' ? v.trim() : '';
  };
  const orgNumber = normalizeOrgNumber(value('orgNumber'));
  const errors: Record<string, string> = {};
  if (!value('packageId')) errors.packageId = 'required';
  if (!value('contactName')) errors.contactName = 'required';
  if (!EMAIL.test(value('contactEmail'))) errors.contactEmail = 'invalid';
  if (!EMAIL.test(value('invoiceEmail'))) errors.invoiceEmail = 'invalid';
  const website = value('websiteUrl');
  if (website && !/^https?:\/\/[^\s]+\.[^\s]+$/.test(website)) errors.websiteUrl = 'invalid';
  if (!orgNumber) errors.orgNumber = 'required';
  if (Object.keys(errors).length) return { errors };
  if (!(await hitLimit('brregLookupUser', user.id))) return { error: 'rate_limited' };
  const result = await lookupOrgNumber(orgNumber);
  if (result.status !== 'active') return { errors: { orgNumber: result.status } };

  const { error } = await createAdminClient().rpc('register_sponsor', {
    p_user_id: user.id,
    p_package_id: value('packageId'),
    p_org_number: result.entity.orgNumber,
    p_legal_name: result.entity.name,
    p_name: value('name') || suggestDisplayName(result.entity.name),
    p_website_url: website,
    p_contact_name: value('contactName'),
    p_contact_email: value('contactEmail'),
    p_contact_phone: value('contactPhone'),
    p_invoice_email: value('invoiceEmail'),
    p_invoice_address: value('invoiceAddress'),
    p_invoice_reference: value('invoiceReference'),
  });
  if (error) return { error: 'failed' };
  redirect(localizePath('/sponsor?notice=registered', (await getLocale()) as Locale));
}

export interface AssetResult {
  ok?: boolean;
  error?: string;
}

/**
 * Registers an uploaded asset (SPO-02) for review. The file is already in the sponsor's folder
 * of the private bucket (uploaded by the browser under storage RLS); the row is inserted under
 * the sponsor's own RLS (pending only).
 */
export async function addSponsorAsset(input: {
  sponsorshipId: string;
  kind: string;
  storagePath: string;
  fileName: string;
  mimeType: string;
  byteSize: number;
}): Promise<AssetResult> {
  if (!(ASSET_KINDS as readonly string[]).includes(input.kind)) return { error: 'kind' };
  if (!assetMimeOk(input.kind, input.mimeType)) return { error: 'type' };
  if (input.byteSize <= 0 || input.byteSize > MAX_ASSET_BYTES) return { error: 'size' };
  const supabase = await createClient();
  const { data: sponsorship } = await supabase
    .from('sponsorships')
    .select('id, organization_id, event_id, sponsor_id, status')
    .eq('id', input.sponsorshipId)
    .maybeSingle();
  if (!sponsorship || sponsorship.status === 'cancelled') return { error: 'forbidden' };
  if (!input.storagePath.startsWith(`${sponsorship.sponsor_id}/`)) return { error: 'forbidden' };
  const { error } = await supabase.from('sponsor_assets').insert({
    organization_id: sponsorship.organization_id,
    event_id: sponsorship.event_id,
    sponsorship_id: sponsorship.id,
    sponsor_id: sponsorship.sponsor_id,
    kind: input.kind as 'logo',
    storage_path: input.storagePath,
    file_name: input.fileName.slice(0, 200),
    mime_type: input.mimeType,
    byte_size: input.byteSize,
  });
  if (error) return { error: 'failed' };
  revalidatePath('/sponsor');
  return { ok: true };
}

/** Withdraws an asset still waiting for review (row and file). */
export async function removeSponsorAsset(formData: FormData) {
  const id = String(formData.get('id') ?? '');
  const supabase = await createClient();
  const { data } = await supabase
    .from('sponsor_assets')
    .delete()
    .eq('id', id)
    .eq('status', 'pending')
    .select('storage_path')
    .maybeSingle();
  if (data) await createAdminClient().storage.from('sponsor-assets').remove([data.storage_path]);
  revalidatePath('/sponsor');
}
