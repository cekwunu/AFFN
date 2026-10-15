'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { localizePath } from '@/i18n/paths';
import type { Locale } from '@/i18n/routing';
import { getCurrentUser, currentOrganization } from '@/lib/auth/server';
import { normalizeOrgNumber, suggestDisplayName, type BrregEntity } from '@/lib/brreg';
import { lookupOrgNumber } from '@/lib/brreg.server';
import { hitLimit } from '@/lib/rate-limit';
import { createAdminClient } from '@/lib/supabase/admin';
import type { Json } from '@/lib/supabase/database.types';
import { createClient } from '@/lib/supabase/server';
import { buildAgreement } from '@/lib/vendor/agreement';
import {
  STEPS,
  contactSchema,
  documentSchema,
  applicationFacts,
  fieldErrors,
  isEditable,
  isStep,
  missingSteps,
  profileSchema,
  stallSchema,
  type ApplicationProgress,
  type Step,
} from '@/lib/vendor/application';
import { applicationsOpen, currentApplicationEvent, getMyApplication } from '@/lib/vendor/server';

export interface StepState {
  /** Form-level error code. */
  error?: string;
  /** Field → error code. */
  errors?: Record<string, string>;
  /** Values to show again after an error. */
  values?: Record<string, string>;
  /** Registry result to confirm (business step). */
  entity?: BrregEntity;
  ok?: boolean;
}

const localeOf = (formData: FormData): Locale => (formData.get('locale') === 'en' ? 'en' : 'nb');
const go = (locale: Locale, path: string): never => redirect(localizePath(path, locale));
const stringValues = (formData: FormData) =>
  Object.fromEntries(
    [...formData.entries()].filter(
      (entry): entry is [string, string] =>
        typeof entry[1] === 'string' && !entry[0].startsWith('$') && entry[0] !== 'locale',
    ),
  );

async function context() {
  const user = await getCurrentUser();
  if (!user) throw new Error('Not signed in');
  const event = await currentApplicationEvent();
  const application = event ? await getMyApplication(event.id) : null;
  return { user, event, application };
}

/** The signed-in vendor's editable application, or a form error code. */
async function editableApplication() {
  const ctx = await context();
  if (!ctx.event || !ctx.application) return { error: 'unknown' as const };
  if (!isEditable(ctx.application.status)) return { error: 'not_editable' as const };
  return { ...ctx, event: ctx.event, application: ctx.application };
}

async function saveProgress(
  applicationId: string,
  update: (progress: ApplicationProgress) => ApplicationProgress,
  current: ApplicationProgress,
) {
  const supabase = await createClient();
  const { error } = await supabase
    .from('event_vendors')
    .update({ application_progress: update(current) as { [key: string]: Json } })
    .eq('id', applicationId);
  if (error) throw error;
}

const nextStep = (step: Step): Step => STEPS[Math.min(STEPS.indexOf(step) + 1, STEPS.length - 1)]!;

// Step 1: business -----------------------------------------------------------------------------

export async function lookupBusiness(_: StepState, formData: FormData): Promise<StepState> {
  const orgNumber = normalizeOrgNumber(String(formData.get('orgNumber') ?? ''));
  const values = { orgNumber };
  const user = await getCurrentUser();
  if (!user) return { error: 'unknown', values };
  if (!(await hitLimit('brregLookupUser', user.id))) return { error: 'rate_limited', values };

  const result = await lookupOrgNumber(orgNumber);
  if (result.status !== 'active') return { errors: { orgNumber: result.status }, values };
  return { entity: result.entity, values };
}

export async function startApplication(_: StepState, formData: FormData): Promise<StepState> {
  const locale = localeOf(formData);
  const orgNumber = normalizeOrgNumber(String(formData.get('orgNumber') ?? ''));
  const { user, event, application } = await context();
  if (!event || !applicationsOpen(event)) return { error: 'closed' };
  if (application) go(locale, '/vendor/apply');

  // Look up again (from the cache) so the registry data cannot be changed in the browser.
  const result = await lookupOrgNumber(orgNumber);
  if (result.status !== 'active')
    return { errors: { orgNumber: result.status }, values: { orgNumber } };
  const { entity } = result;

  const { error } = await createAdminClient().rpc('start_vendor_application', {
    p_user_id: user.id,
    p_event_id: event.id,
    p_org_number: entity.orgNumber,
    p_legal_name: entity.name,
    p_display_name: suggestDisplayName(entity.name),
    p_business_form: entity.form,
    p_business_address: entity.address ?? '',
    p_postal_code: entity.postalCode ?? '',
    p_city: entity.city ?? '',
    p_brreg_status: 'active',
  });
  if (error) {
    if (error.code === '23505') return { errors: { orgNumber: 'taken' }, values: { orgNumber } };
    if (error.code === 'P0002') return { error: 'no_signup' };
    throw error;
  }
  // The membership is active now: refresh the token so its role claim says so too.
  await (await createClient()).auth.refreshSession();
  revalidatePath('/', 'layout');
  return go(locale, '/vendor/apply/contact');
}

/** A registered vendor applying for a new event. */
export async function startEventApplication(formData: FormData): Promise<void> {
  const locale = localeOf(formData);
  const { event, application } = await context();
  if (!event || !applicationsOpen(event) || application) return go(locale, '/vendor/apply');
  const supabase = await createClient();
  const { data: membership } = await supabase
    .from('memberships')
    .select('vendor_id')
    .eq('role', 'vendor')
    .eq('status', 'active')
    .not('vendor_id', 'is', null)
    .limit(1)
    .maybeSingle();
  if (!membership?.vendor_id) return go(locale, '/vendor/apply');
  const { error } = await supabase.from('event_vendors').insert({
    organization_id: event.organization_id,
    event_id: event.id,
    vendor_id: membership.vendor_id,
    application_progress: { completed: ['business'] },
  });
  if (error) throw error;
  return go(locale, '/vendor/apply/contact');
}

// Autosave (VEN-04) -------------------------------------------------------------------------------

const MAX_DRAFT_FIELDS = 20;
const MAX_DRAFT_VALUE = 2000;

/** Keeps half-filled input so the vendor can leave and resume. Called while typing. */
export async function saveDraft(step: Step, values: Record<string, string>): Promise<boolean> {
  if (!isStep(step) || !['contact', 'profile', 'stall'].includes(step)) return false;
  const ctx = await editableApplication();
  if ('error' in ctx) return false;
  const clean = Object.fromEntries(
    Object.entries(values)
      .filter(([key, value]) => typeof value === 'string' && /^[a-zA-Z]{1,40}$/.test(key))
      .slice(0, MAX_DRAFT_FIELDS)
      .map(([key, value]) => [key, value.slice(0, MAX_DRAFT_VALUE)]),
  );
  await saveProgress(
    ctx.application.id,
    (p) => ({ ...p, drafts: { ...p.drafts, [step]: clean } }),
    ctx.application.progress,
  );
  return true;
}

// Steps 2–4: save and continue ---------------------------------------------------------------------

export async function saveStep(step: Step, _: StepState, formData: FormData): Promise<StepState> {
  const locale = localeOf(formData);
  const values = stringValues(formData);
  const ctx = await editableApplication();
  if ('error' in ctx) return { error: ctx.error, values };
  const { application } = ctx;
  const vendor = application.vendor;
  const supabase = await createClient();

  if (step === 'contact') {
    const parsed = contactSchema.safeParse(values);
    if (!parsed.success) return { errors: fieldErrors(parsed.error), values };
    const { error } = await supabase.from('vendor_contacts').upsert({
      vendor_id: vendor.id,
      organization_id: vendor.organization_id,
      contact_name: parsed.data.contactName,
      contact_email: parsed.data.contactEmail,
      contact_phone: parsed.data.contactPhone,
    });
    if (error) throw error;
  } else if (step === 'profile') {
    const parsed = profileSchema.safeParse(values);
    if (!parsed.success) return { errors: fieldErrors(parsed.error), values };
    const p = parsed.data;
    const { error } = await supabase
      .from('vendors')
      .update({
        display_name: p.displayName,
        category: p.category,
        cuisine_country: p.cuisineCountry ?? null,
        description: p.description,
        website_url: p.websiteUrl ?? null,
        instagram_handle: p.instagramHandle ?? null,
        facebook_url: p.facebookUrl ?? null,
        tiktok_handle: p.tiktokHandle ?? null,
      })
      .eq('id', vendor.id);
    if (error) throw error;
  } else if (step === 'stall') {
    const parsed = stallSchema.safeParse(values);
    if (!parsed.success) return { errors: fieldErrors(parsed.error), values };
    const { error } = await supabase
      .from('event_vendors')
      .update({
        stall_type_id: parsed.data.stallTypeId,
        needs_power: parsed.data.needsPower,
        needs_water: parsed.data.needsWater,
        preferred_zone: parsed.data.preferredZone ?? null,
      })
      .eq('id', application.id);
    if (error) {
      // Unknown stall type for this event (foreign key).
      if (error.code === '23503') return { errors: { stallTypeId: 'required' }, values };
      throw error;
    }
  } else {
    return { error: 'unknown', values };
  }

  await saveProgress(
    application.id,
    (p) => {
      const drafts = { ...p.drafts };
      delete drafts[step];
      return { ...p, completed: [...new Set([...(p.completed ?? []), step])], drafts };
    },
    application.progress,
  );
  return go(locale, `/vendor/apply/${nextStep(step)}`);
}

// Step 3: logo and cover image ------------------------------------------------------------------

export async function setMedia(kind: 'logo' | 'cover', path: string): Promise<boolean> {
  const ctx = await editableApplication();
  if ('error' in ctx) return false;
  const vendorId = ctx.application.vendor.id;
  if (!path.startsWith(`${vendorId}/`)) return false;
  const supabase = await createClient();
  const { error } = await supabase
    .from('vendors')
    .update(kind === 'logo' ? { logo_path: path } : { cover_image_path: path })
    .eq('id', vendorId);
  if (error) throw error;
  revalidatePath('/', 'layout');
  return true;
}

// Step 5: documents (VEN-03) ------------------------------------------------------------------------

export async function addDocument(input: Record<string, string>): Promise<StepState> {
  const ctx = await editableApplication();
  if ('error' in ctx) return { error: ctx.error };
  const parsed = documentSchema.safeParse(input);
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };
  const vendor = ctx.application.vendor;
  if (!parsed.data.storagePath.startsWith(`${vendor.id}/`)) return { error: 'upload_failed' };

  const supabase = await createClient();
  const { error } = await supabase.from('vendor_documents').insert({
    organization_id: vendor.organization_id,
    vendor_id: vendor.id,
    document_type: parsed.data.documentType,
    storage_path: parsed.data.storagePath,
    file_name: parsed.data.fileName,
    expires_on: parsed.data.expiresOn ?? null,
    description: parsed.data.description ?? null,
    uploaded_by: ctx.user.id,
  });
  if (error) throw error;
  revalidatePath('/', 'layout');
  return { ok: true };
}

export async function deleteDocument(formData: FormData): Promise<void> {
  const id = String(formData.get('id') ?? '');
  const ctx = await editableApplication();
  if ('error' in ctx) return;
  const supabase = await createClient();
  const { data } = await supabase
    .from('vendor_documents')
    .delete()
    .eq('id', id)
    .eq('status', 'pending')
    .select('storage_path')
    .maybeSingle();
  if (data) await supabase.storage.from('vendor-documents').remove([data.storage_path]);
  revalidatePath('/', 'layout');
}

// Step 6: agreement (VEN-05) ---------------------------------------------------------------------------

export async function acceptAgreement(_: StepState, formData: FormData): Promise<StepState> {
  const locale = localeOf(formData);
  if (formData.get('accept') !== 'on') return { errors: { accept: 'required' } };
  const ctx = await editableApplication();
  if ('error' in ctx) return { error: ctx.error };
  const { application, event, user } = ctx;

  const organizer = (await currentOrganization()).name;
  const agreement = await buildAgreement({
    locale,
    event,
    organizer,
    vendor: application.vendor,
    stallTypeId: application.stall_type_id,
  });
  if (!agreement) return { error: 'stall_first' };

  const supabase = await createClient();
  const { error } = await supabase.from('vendor_agreements').insert({
    organization_id: event.organization_id,
    event_id: event.id,
    event_vendor_id: application.id,
    vendor_id: application.vendor.id,
    accepted_by: user.id,
    ...agreement.snapshot,
  });
  if (error) throw error;
  return go(locale, '/vendor/apply/review');
}

// Step 7: submit ----------------------------------------------------------------------------------------

export async function submitApplication(_: StepState, formData: FormData): Promise<StepState> {
  const locale = localeOf(formData);
  const ctx = await editableApplication();
  if ('error' in ctx) return { error: ctx.error };
  const { application } = ctx;
  const missing = missingSteps(application.progress, applicationFacts(application));
  if (missing.length > 0) return { error: 'missing' };

  const supabase = await createClient();
  const { error } = await supabase
    .from('event_vendors')
    .update({ status: 'submitted' })
    .eq('id', application.id);
  if (error) {
    if (error.code === '23514') return { error: 'missing' };
    throw error;
  }
  revalidatePath('/', 'layout');
  return go(locale, '/vendor/application');
}
