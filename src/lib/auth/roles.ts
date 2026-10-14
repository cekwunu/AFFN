// Roles and portals (AUTH-02, AUTH-03). Pure functions: used by the proxy (edge), server code
// and tests. The JWT carries the roles (claim `affn`, added by the access token hook); server
// code builds the same shape from live memberships.

export const PORTALS = ['platform', 'admin', 'vendor', 'sponsor'] as const;
export type Portal = (typeof PORTALS)[number];

export type MembershipRole = 'org_admin' | 'event_admin' | 'vendor' | 'sponsor';

export interface RoleGrant {
  org: string;
  role: MembershipRole;
  status: 'pending' | 'active';
}

export interface Access {
  platformOwner: boolean;
  roles: RoleGrant[];
}

export const NO_ACCESS: Access = { platformOwner: false, roles: [] };

const ROLE_VALUES = new Set<string>(['org_admin', 'event_admin', 'vendor', 'sponsor']);

/** Reads the `affn` claim; anything malformed counts as no access. */
export function accessFromClaims(claims: unknown): Access {
  const affn = (claims as { affn?: unknown } | null | undefined)?.affn as
    { po?: unknown; roles?: unknown } | undefined;
  if (!affn || typeof affn !== 'object') return NO_ACCESS;
  const roles = Array.isArray(affn.roles)
    ? affn.roles.filter(
        (r): r is RoleGrant =>
          !!r &&
          typeof r === 'object' &&
          typeof (r as RoleGrant).org === 'string' &&
          ROLE_VALUES.has((r as RoleGrant).role) &&
          ((r as RoleGrant).status === 'active' || (r as RoleGrant).status === 'pending'),
      )
    : [];
  return { platformOwner: affn.po === true, roles };
}

const active = (access: Access, ...roles: MembershipRole[]) =>
  access.roles.some((r) => r.status === 'active' && roles.includes(r.role));

/** Portals the user may open, in a stable order. Pending vendors/sponsors reach their portal's
 * onboarding page; staff roles count only when active. */
export function portalsFor(access: Access): Portal[] {
  return PORTALS.filter((portal) => canAccess(access, portal));
}

export function canAccess(access: Access, portal: Portal): boolean {
  switch (portal) {
    case 'platform':
      return access.platformOwner;
    case 'admin':
      return active(access, 'org_admin', 'event_admin');
    case 'vendor':
      return access.roles.some((r) => r.role === 'vendor');
    case 'sponsor':
      return access.roles.some((r) => r.role === 'sponsor');
  }
}

/** Organization Admins and Platform Owners must use MFA (AUTH-04). */
export function requiresMfa(access: Access): boolean {
  return access.platformOwner || active(access, 'org_admin');
}

/** The portal a path belongs to ("/vendor/orders" → "vendor"); paths are locale-free. */
export function portalFromPath(path: string): Portal | null {
  const first = path.split('/')[1];
  return (PORTALS as readonly string[]).includes(first ?? '') ? (first as Portal) : null;
}

/**
 * A redirect target from user input (e.g. `?next=`), or null if it is not a plain local path.
 * Rejects absolute URLs, protocol-relative and backslash tricks.
 */
export function safeNextPath(next: unknown): string | null {
  if (typeof next !== 'string' || next.length > 512) return null;
  if (!next.startsWith('/') || next.startsWith('//') || next.includes('\\')) return null;
  if (/[\u0000-\u001f]/.test(next)) return null;
  return next;
}
