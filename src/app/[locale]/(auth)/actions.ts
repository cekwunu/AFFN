'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import type { FormState } from '@/components/auth/auth-form';
import { localizePath } from '@/i18n/paths';
import type { Locale } from '@/i18n/routing';
import { findInvitation } from '@/lib/auth/invitations';
import { accessFromClaims, requiresMfa, safeNextPath } from '@/lib/auth/roles';
import { getCurrentUser } from '@/lib/auth/server';
import { serverEnv } from '@/lib/env.server';
import { hitLimit, requestIp, withinLimit } from '@/lib/rate-limit';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

// All auth goes through these server actions (not the browser SDK) so we can rate-limit per
// client, keep tokens in httpOnly cookies and keep the pages light.

const localeOf = (formData: FormData): Locale => (formData.get('locale') === 'en' ? 'en' : 'nb');
const text = (formData: FormData, name: string) => String(formData.get(name) ?? '').trim();
const go = (locale: Locale, path: string): never => redirect(localizePath(path, locale));

const email = z.email().max(254);
const newPassword = z.string().min(12).max(128);

/** The URL Supabase links in its emails point to (must be allowed in Auth's redirect list). */
async function confirmUrl(): Promise<string> {
  const h = await headers();
  const origin =
    h.get('origin') ??
    `${h.get('x-forwarded-proto') ?? 'http'}://${h.get('x-forwarded-host') ?? h.get('host')}`;
  return `${origin}/api/auth/confirm`;
}

export async function signIn(_: FormState, formData: FormData): Promise<FormState> {
  const locale = localeOf(formData);
  const values = { email: text(formData, 'email') };
  const parsed = z
    .object({ email, password: z.string().min(1) })
    .safeParse({ email: values.email.toLowerCase(), password: formData.get('password') });
  if (!parsed.success) return { error: 'invalid', values };

  const ip = await requestIp();
  const account = `${parsed.data.email}|${ip}`;
  const [accountOk, ipOk] = await Promise.all([
    withinLimit('signInAccount', account),
    withinLimit('signInIp', ip),
  ]);
  if (!accountOk || !ipOk) return { error: 'rate_limited', values };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    // Only failed attempts count towards the limit.
    await Promise.all([hitLimit('signInAccount', account), hitLimit('signInIp', ip)]);
    if (error.code === 'email_not_confirmed') return { error: 'email_not_confirmed', values };
    if (error.code === 'invalid_credentials') return { error: 'invalid', values };
    return { error: 'unknown', values };
  }
  // Send Organization Admins and Platform Owners to MFA directly (roles are in the new token),
  // so the address bar shows the page they are on.
  const next = safeNextPath(formData.get('next'));
  const { data } = await supabase.auth.getClaims();
  if (requiresMfa(accessFromClaims(data?.claims))) {
    return go(locale, next ? `/mfa?next=${encodeURIComponent(next)}` : '/mfa');
  }
  return go(locale, next ?? '/portal');
}

export async function signUp(_: FormState, formData: FormData): Promise<FormState> {
  const locale = localeOf(formData);
  const values = { name: text(formData, 'name'), email: text(formData, 'email') };
  if (formData.get('terms') !== 'on') return { error: 'terms_required', values };

  const parsed = z
    .object({
      name: z.string().min(1).max(200),
      email,
      password: z.string().min(1).max(128),
      role: z.enum(['vendor', 'sponsor']).optional(),
      invite: z.string().max(100).optional(),
    })
    .safeParse({
      name: values.name,
      email: values.email.toLowerCase(),
      password: formData.get('password'),
      role: text(formData, 'role') || undefined,
      invite: text(formData, 'invite') || undefined,
    });
  if (!parsed.success) {
    return {
      error: parsed.error.issues.some((i) => i.path[0] === 'email') ? 'invalid_email' : 'invalid',
      values,
    };
  }
  if (!newPassword.safeParse(parsed.data.password).success)
    return { error: 'weak_password', values };
  if (!(await hitLimit('signUpIp', await requestIp()))) return { error: 'rate_limited', values };

  const { name, invite, role } = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      emailRedirectTo: await confirmUrl(),
      data: {
        full_name: name,
        locale,
        organization_slug: serverEnv.DEFAULT_ORGANIZATION_SLUG,
        // Invited users get their role by accepting the invitation, not by signing up.
        ...(invite ? { after_confirm: `/invite/${invite}` } : { signup_role: role ?? 'vendor' }),
      },
    },
  });
  if (error) {
    if (error.code === 'weak_password') return { error: 'weak_password', values };
    if (error.code === 'email_address_invalid' || error.code === 'validation_failed')
      return { error: 'invalid_email', values };
    if (error.code === 'over_email_send_rate_limit') return { error: 'rate_limited', values };
    // "user_already_exists" and similar: show the same page as for a new account, so the form
    // does not reveal which addresses are registered.
    if (error.code !== 'user_already_exists') return { error: 'unknown', values };
  }
  return go(locale, '/check-email?kind=signup');
}

export async function forgotPassword(_: FormState, formData: FormData): Promise<FormState> {
  const locale = localeOf(formData);
  const values = { email: text(formData, 'email') };
  const parsed = email.safeParse(values.email.toLowerCase());
  if (!parsed.success) return { error: 'invalid', values };

  const ip = await requestIp();
  const [accountOk, ipOk] = await Promise.all([
    hitLimit('resetAccount', parsed.data),
    hitLimit('resetIp', ip),
  ]);
  if (!accountOk || !ipOk) return { error: 'rate_limited', values };

  const supabase = await createClient();
  // The result is deliberately not shown, so the form does not reveal registered addresses.
  await supabase.auth.resetPasswordForEmail(parsed.data, { redirectTo: await confirmUrl() });
  return go(locale, '/check-email?kind=reset');
}

export async function resetPassword(_: FormState, formData: FormData): Promise<FormState> {
  const locale = localeOf(formData);
  const password = String(formData.get('password') ?? '');
  if (password !== String(formData.get('confirm') ?? '')) return { error: 'mismatch' };
  if (!newPassword.safeParse(password).success) return { error: 'weak_password' };

  const user = await getCurrentUser();
  if (!user) return { error: 'session' };
  // Accounts with MFA must confirm the second factor before changing the password.
  if (user.aal !== 'aal2' && user.mfaRequired) go(locale, '/mfa?next=%2Freset-password');

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    if (error.code === 'weak_password') return { error: 'weak_password' };
    if (error.code === 'same_password') return { error: 'same_password' };
    if (error.code === 'insufficient_aal') return go(locale, '/mfa?next=%2Freset-password');
    return { error: 'unknown' };
  }
  return go(locale, '/portal');
}

export async function signOut(formData: FormData): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  go(localeOf(formData), '/');
}

export async function verifyMfa(_: FormState, formData: FormData): Promise<FormState> {
  const locale = localeOf(formData);
  const code = text(formData, 'code').replace(/\s/g, '');
  const factorId = text(formData, 'factorId');
  if (!/^\d{6}$/.test(code) || !factorId) return { error: 'invalid_code' };

  const supabase = await createClient();
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
  if (error)
    return { error: error.code === 'mfa_verification_failed' ? 'invalid_code' : 'unknown' };
  return go(locale, safeNextPath(formData.get('next')) ?? '/portal');
}

/** Accepts an Event Admin invitation for the signed-in user (server side, service role). */
export async function acceptInvitation(formData: FormData): Promise<void> {
  const locale = localeOf(formData);
  const token = text(formData, 'token');
  const user = await getCurrentUser();
  if (!user) go(locale, `/sign-in?next=${encodeURIComponent(`/invite/${token}`)}`);

  const { state, invitation } = await findInvitation(token);
  if (state !== 'open' || !invitation || invitation.email !== user!.email.toLowerCase()) {
    go(locale, `/invite/${token}`);
  }

  const admin = createAdminClient();
  const existing = await admin
    .from('memberships')
    .select('id')
    .match({
      organization_id: invitation!.organization_id,
      user_id: user!.id,
      role: invitation!.role,
    })
    .maybeSingle();
  if (!existing.data) {
    const { error } = await admin.from('memberships').insert({
      organization_id: invitation!.organization_id,
      user_id: user!.id,
      role: invitation!.role,
    });
    if (error) throw error;
  }
  if (invitation!.event_id) {
    const { error } = await admin.from('event_admins').upsert(
      {
        organization_id: invitation!.organization_id,
        event_id: invitation!.event_id,
        user_id: user!.id,
      },
      { onConflict: 'event_id,user_id', ignoreDuplicates: true },
    );
    if (error) throw error;
  }
  const { error } = await admin
    .from('invitations')
    .update({ accepted_at: new Date().toISOString(), accepted_by: user!.id })
    .eq('id', invitation!.id);
  if (error) throw error;

  // New token with the new role, so routing sees it straight away.
  await (await createClient()).auth.refreshSession();
  go(locale, '/portal');
}
