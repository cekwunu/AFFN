import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';

/** A new invitation token (in the email link) and the hash stored in the database. */
export function newInvitationToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: hashInvitationToken(token) };
}

export function hashInvitationToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export type InvitationState = 'open' | 'invalid' | 'expired' | 'used';

/** Looks an invitation up by its token (server only, service role). */
export async function findInvitation(token: string) {
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token))
    return { state: 'invalid' as const, invitation: null };
  const { data } = await createAdminClient()
    .from('invitations')
    .select(
      'id, organization_id, event_id, email, role, locale, expires_at, accepted_at, revoked_at, invited_by, organizations(name), events(name)',
    )
    .eq('token_hash', hashInvitationToken(token))
    .maybeSingle();
  if (!data) return { state: 'invalid' as const, invitation: null };
  const state: InvitationState =
    data.accepted_at || data.revoked_at
      ? 'used'
      : new Date(data.expires_at) < new Date()
        ? 'expired'
        : 'open';
  return { state, invitation: data };
}
