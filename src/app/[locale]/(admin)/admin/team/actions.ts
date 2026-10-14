'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import type { FormState } from '@/components/auth/auth-form';
import { localizePath } from '@/i18n/paths';
import { newInvitationToken } from '@/lib/auth/invitations';
import { currentOrganization, getCurrentUser } from '@/lib/auth/server';
import { sendEmail } from '@/lib/email/send';
import { invitationEmail } from '@/lib/email/templates';
import { createClient } from '@/lib/supabase/server';

// Team management (AUTH-03). Writes go through the signed-in admin's own client, so RLS (Org
// Admin with MFA) decides; every grant and revocation is audit-logged by database triggers.

async function origin() {
  const h = await headers();
  return h.get('origin') ?? `${h.get('x-forwarded-proto') ?? 'http'}://${h.get('host')}`;
}

export async function inviteEventAdmin(_: FormState, formData: FormData): Promise<FormState> {
  const values = { email: String(formData.get('email') ?? '').trim() };
  const parsed = z
    .object({
      email: z.email().max(254),
      eventId: z.uuid().optional(),
      inviteLocale: z.enum(['nb', 'en']),
    })
    .safeParse({
      email: values.email.toLowerCase(),
      eventId: String(formData.get('eventId') ?? '') || undefined,
      inviteLocale: formData.get('inviteLocale'),
    });
  if (!parsed.success) return { error: 'invalid_email', values };

  const user = await getCurrentUser();
  const organization = await currentOrganization();
  if (!user) return { error: 'forbidden' };

  const { token, hash } = newInvitationToken();
  const supabase = await createClient();
  const { error } = await supabase.from('invitations').insert({
    organization_id: organization.id,
    event_id: parsed.data.eventId ?? null,
    email: parsed.data.email,
    locale: parsed.data.inviteLocale,
    token_hash: hash,
    invited_by: user.id,
  });
  if (error)
    return {
      error:
        error.code === '23505' ? 'duplicate' : error.code === '42501' ? 'forbidden' : 'unknown',
      values,
    };

  let eventName: string | null = null;
  if (parsed.data.eventId) {
    const { data } = await supabase
      .from('events')
      .select('name')
      .eq('id', parsed.data.eventId)
      .single();
    eventName = data?.name ?? null;
  }
  revalidatePath('/[locale]/admin/team', 'page');
  try {
    await sendEmail(
      invitationEmail({
        to: parsed.data.email,
        locale: parsed.data.inviteLocale,
        organizationName: organization.name,
        eventName,
        inviterName: user.name,
        link: `${await origin()}${localizePath(`/invite/${token}`, parsed.data.inviteLocale)}`,
      }),
    );
  } catch {
    return { error: 'email_failed' };
  }
  return { ok: 'sent' };
}

export async function revokeInvitation(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;
  const supabase = await createClient();
  await supabase
    .from('invitations')
    .update({ revoked_at: new Date().toISOString(), revoked_by: user.id })
    .eq('id', String(formData.get('id')));
  revalidatePath('/[locale]/admin/team', 'page');
}

/** Removes an Event Admin's role and event assignments in this organization. */
export async function revokeMembership(formData: FormData): Promise<void> {
  const supabase = await createClient();
  const { data: membership } = await supabase
    .from('memberships')
    .select('id, organization_id, user_id, role')
    .eq('id', String(formData.get('id')))
    .single();
  if (!membership || membership.role !== 'event_admin') return;
  await supabase
    .from('event_admins')
    .delete()
    .match({ organization_id: membership.organization_id, user_id: membership.user_id });
  await supabase.from('memberships').delete().eq('id', membership.id);
  revalidatePath('/[locale]/admin/team', 'page');
}
