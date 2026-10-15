import { accessFromClaims, canAccess, portalFromPath, requiresMfa } from './roles';

export type RouteDecision =
  { type: 'allow' } | { type: 'redirect'; to: string } | { type: 'forbidden' };

/**
 * What the proxy does with a request for a locale-free path, given the session's JWT claims
 * (null when signed out). Only portal paths are protected; layouts re-check with live data.
 */
export function decideRoute(path: string, search: string, claims: unknown): RouteDecision {
  const portal = portalFromPath(path);
  if (!portal) return { type: 'allow' };

  const next = encodeURIComponent(path + search);
  if (!claims) return { type: 'redirect', to: `/sign-in?next=${next}` };

  const access = accessFromClaims(claims);
  const aal = (claims as { aal?: unknown }).aal;
  if (requiresMfa(access) && aal !== 'aal2') return { type: 'redirect', to: `/mfa?next=${next}` };

  return canAccess(access, portal) ? { type: 'allow' } : { type: 'forbidden' };
}
