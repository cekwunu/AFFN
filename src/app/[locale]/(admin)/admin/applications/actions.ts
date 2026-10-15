'use server';

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { z } from 'zod';
import { localizePath } from '@/i18n/paths';
import type { Locale } from '@/i18n/routing';
import { getCurrentUser } from '@/lib/auth/server';
import { decisionEmail, type DecisionEmailKind } from '@/lib/email/templates';
import { sendEmail } from '@/lib/email/send';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

export interface ReviewState {
  ok?: string;
  /** Set on success, so the form can start fresh (used as a React key). */
  at?: number;
  error?: string;
  errors?: Record<string, string>;
  values?: Record<string, string>;
}

const DECISIONS = [
  'under_review',
  'approved',
  'rejected',
  'waitlisted',
  'more_info_requested',
] as const;

const decisionSchema = z.object({
  id: z.uuid(),
  decision: z.enum(DECISIONS),
  note: z.string().trim().min(1, 'required').max(2000),
  rate: z
    .string()
    .trim()
    .optional()
    .transform((value, ctx) => {
      if (!value) return null;
      const percent = Number(value.replace(',', '.'));
      if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
        ctx.addIssue({ code: 'custom', message: 'rate' });
        return z.NEVER;
      }
      // Basis points, at most two decimals of a percent: 12,5 % → 1250.
      return Math.round(percent * 100);
    }),
  reason: z.string().trim().max(500).optional(),
});

async function siteOrigin(): Promise<string> {
  const h = await headers();
  return (
    h.get('origin') ??
    `${h.get('x-forwarded-proto') ?? 'http'}://${h.get('x-forwarded-host') ?? h.get('host')}`
  );
}

/** Emails the vendor's contact person about the decision, in the vendor user's language. */
async function notifyVendor(eventVendorId: string, decision: DecisionEmailKind, note: string) {
  const admin = createAdminClient();
  const { data } = await admin
    .from('event_vendors')
    .select(
      `vendor_id, event:events (name),
       vendor:vendors (display_name, contact:vendor_contacts!vendor_contacts_vendor_id_fkey (contact_email))`,
    )
    .eq('id', eventVendorId)
    .single();
  const contact = Array.isArray(data?.vendor?.contact)
    ? data.vendor.contact[0]
    : data?.vendor?.contact;
  if (!data || !contact?.contact_email) return;

  // The language the vendor signed up in (user metadata), bokmål by default.
  const { data: member } = await admin
    .from('memberships')
    .select('user_id')
    .eq('vendor_id', data.vendor_id)
    .eq('role', 'vendor')
    .limit(1)
    .maybeSingle();
  let locale: Locale = 'nb';
  if (member) {
    const { data: user } = await admin.auth.admin.getUserById(member.user_id);
    if (user.user?.user_metadata?.locale === 'en') locale = 'en';
  }

  await sendEmail(
    decisionEmail({
      to: contact.contact_email,
      locale,
      decision,
      vendorName: data.vendor?.display_name ?? '',
      eventName: data.event?.name ?? '',
      note,
      link: `${await siteOrigin()}${localizePath('/vendor/application', locale)}`,
    }),
  );
}

const ERROR_CODES: Record<string, string> = {
  '42501': 'forbidden',
  '23514': 'invalid',
};

/** A review decision (REV-02): one database transaction, then the email to the vendor. */
export async function decide(_: ReviewState, formData: FormData): Promise<ReviewState> {
  const values = {
    decision: String(formData.get('decision') ?? ''),
    note: String(formData.get('note') ?? ''),
    rate: String(formData.get('rate') ?? ''),
    reason: String(formData.get('reason') ?? ''),
  };
  const parsed = decisionSchema.safeParse({
    id: formData.get('id'),
    ...values,
    rate: values.rate || undefined,
    reason: values.reason || undefined,
  });
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      errors[String(issue.path[0])] ??= issue.path[0] === 'decision' ? 'required' : issue.message;
    }
    return { errors, values };
  }
  const { id, decision, note, rate, reason } = parsed.data;
  if (rate !== null && !reason) return { errors: { reason: 'reason' }, values };
  if (!(await getCurrentUser())) return { error: 'forbidden', values };

  const supabase = await createClient();
  const { error } = await supabase.rpc('review_application', {
    p_event_vendor_id: id,
    p_decision: decision,
    p_note: note,
    p_commission_rate_bp: rate ?? undefined,
    p_commission_reason: rate !== null ? reason : undefined,
  });
  if (error) {
    if (error.message.includes('stall type')) return { error: 'stall', values };
    if (error.message.includes('agreement')) return { error: 'agreement', values };
    return { error: ERROR_CODES[error.code ?? ''] ?? 'unknown', values };
  }

  if (decision !== 'under_review') await notifyVendor(id, decision, note);
  revalidatePath('/', 'layout');
  return { ok: decision, at: Date.now() };
}

/** Internal note on an application (REV-03): staff only, never shown to the vendor. */
export async function addNote(_: ReviewState, formData: FormData): Promise<ReviewState> {
  const id = String(formData.get('id') ?? '');
  const body = String(formData.get('body') ?? '').trim();
  if (!body) return { errors: { body: 'required' } };
  const user = await getCurrentUser();
  if (!user) return { error: 'forbidden' };

  const supabase = await createClient();
  const { data: application } = await supabase
    .from('event_vendors')
    .select('organization_id, event_id')
    .eq('id', id)
    .maybeSingle();
  if (!application) return { error: 'forbidden' };
  const { error } = await supabase.from('internal_notes').insert({
    organization_id: application.organization_id,
    event_id: application.event_id,
    event_vendor_id: id,
    body: body.slice(0, 4000),
    author_id: user.id,
  });
  if (error) return { error: error.code === '42501' ? 'forbidden' : 'unknown' };
  revalidatePath('/', 'layout');
  return { ok: 'note', at: Date.now() };
}
