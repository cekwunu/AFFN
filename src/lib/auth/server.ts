import 'server-only';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { localizePath } from '@/i18n/paths';
import type { Locale } from '@/i18n/routing';
import { serverEnv } from '@/lib/env.server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import {
  canAccess,
  portalsFor,
  requiresMfa,
  type Access,
  type Portal,
  type RoleGrant,
} from './roles';

export interface CurrentUser {
  id: string;
  email: string;
  name: string | null;
  aal: 'aal1' | 'aal2';
  locale: Locale;
  /** Live roles from the database (not the possibly stale JWT). */
  access: Access;
  portals: Portal[];
  mfaRequired: boolean;
}

/** The signed-in user with live roles, or null. Cached per request. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) return null;

  // Own memberships and platform-admin row are readable at any assurance level.
  const [memberships, platform] = await Promise.all([
    supabase.from('memberships').select('organization_id, role, status').eq('user_id', claims.sub),
    supabase.from('platform_admins').select('user_id').eq('user_id', claims.sub).maybeSingle(),
  ]);
  const roles: RoleGrant[] = (memberships.data ?? []).map((m) => ({
    org: m.organization_id,
    role: m.role,
    status: m.status,
  }));
  const access: Access = { platformOwner: !!platform.data, roles };
  const metadata = (claims.user_metadata ?? {}) as { locale?: string; full_name?: string };

  return {
    id: claims.sub,
    email: typeof claims.email === 'string' ? claims.email : '',
    name: metadata.full_name ?? null,
    aal: claims.aal === 'aal2' ? 'aal2' : 'aal1',
    locale: metadata.locale === 'en' ? 'en' : 'nb',
    access,
    portals: portalsFor(access),
    mfaRequired: requiresMfa(access),
  };
});

/**
 * For portal layouts: the user must be signed in, have passed MFA if required, and hold a role
 * for this portal (checked against live memberships, so revocations apply immediately).
 */
export async function requirePortal(portal: Portal, locale: Locale): Promise<CurrentUser> {
  const user = await getCurrentUser();
  const go = (path: string) => redirect(localizePath(path, locale));
  if (!user) go(`/sign-in?next=${encodeURIComponent(`/${portal}`)}`);
  if (user!.mfaRequired && user!.aal !== 'aal2')
    go(`/mfa?next=${encodeURIComponent(`/${portal}`)}`);
  if (!canAccess(user!.access, portal)) go('/forbidden');
  return user!;
}

/** Where to send a user after sign-in: MFA, one portal, the role switcher, or "no access". */
export function homePath(user: CurrentUser): string {
  if (user.mfaRequired && user.aal !== 'aal2') return '/mfa';
  if (user.portals.length === 1) return `/${user.portals[0]}`;
  if (user.portals.length > 1) return '/select-role';
  return '/portal';
}

/** The organization that self sign-up joins (single tenant today: AFFN). */
export const currentOrganization = cache(async () => {
  const { data, error } = await createAdminClient()
    .from('organizations')
    .select('id, name, slug')
    .eq('slug', serverEnv.DEFAULT_ORGANIZATION_SLUG)
    .single();
  if (error) throw error;
  return data;
});
