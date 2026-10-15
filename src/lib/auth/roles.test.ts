import { describe, expect, it } from 'vitest';
import {
  accessFromClaims,
  canAccess,
  portalFromPath,
  portalsFor,
  requiresMfa,
  safeNextPath,
} from './roles';
import { decideRoute } from './routing';

const ORG = '10000000-0000-4000-8000-000000000001';
const claims = (roles: unknown[], po = false, aal = 'aal1') => ({ aal, affn: { po, roles } });

describe('accessFromClaims', () => {
  it('reads roles and the platform owner flag', () => {
    expect(
      accessFromClaims(claims([{ org: ORG, role: 'vendor', status: 'pending' }], true)),
    ).toEqual({
      platformOwner: true,
      roles: [{ org: ORG, role: 'vendor', status: 'pending' }],
    });
  });

  it('treats missing or malformed claims as no access', () => {
    for (const bad of [null, undefined, {}, { affn: 'x' }, { affn: { roles: 'x' } }]) {
      expect(accessFromClaims(bad)).toEqual({ platformOwner: false, roles: [] });
    }
    expect(
      accessFromClaims(
        claims([{ org: ORG, role: 'superuser', status: 'active' }, { role: 'vendor' }]),
      ).roles,
    ).toEqual([]);
  });
});

describe('portals', () => {
  it('maps roles to portals in a stable order', () => {
    const access = accessFromClaims(
      claims(
        [
          { org: ORG, role: 'sponsor', status: 'active' },
          { org: ORG, role: 'org_admin', status: 'active' },
          { org: ORG, role: 'vendor', status: 'active' },
        ],
        true,
      ),
    );
    expect(portalsFor(access)).toEqual(['platform', 'admin', 'vendor', 'sponsor']);
  });

  it('lets pending vendors and sponsors reach their portal (onboarding), but nothing else', () => {
    const access = accessFromClaims(claims([{ org: ORG, role: 'vendor', status: 'pending' }]));
    expect(portalsFor(access)).toEqual(['vendor']);
    expect(canAccess(access, 'admin')).toBe(false);
  });

  it('gives Event Admins the admin portal without MFA, Organization Admins only with MFA', () => {
    const eventAdmin = accessFromClaims(
      claims([{ org: ORG, role: 'event_admin', status: 'active' }]),
    );
    const orgAdmin = accessFromClaims(claims([{ org: ORG, role: 'org_admin', status: 'active' }]));
    expect(canAccess(eventAdmin, 'admin')).toBe(true);
    expect(requiresMfa(eventAdmin)).toBe(false);
    expect(requiresMfa(orgAdmin)).toBe(true);
    expect(requiresMfa({ platformOwner: true, roles: [] })).toBe(true);
  });

  it('finds the portal of a path', () => {
    expect(portalFromPath('/vendor')).toBe('vendor');
    expect(portalFromPath('/admin/team')).toBe('admin');
    expect(portalFromPath('/')).toBeNull();
    expect(portalFromPath('/vendors')).toBeNull();
    expect(portalFromPath('/design')).toBeNull();
  });
});

describe('safeNextPath', () => {
  it.each(['/vendor', '/invite/abc?x=1', '/admin/team#x'])('accepts %s', (path) => {
    expect(safeNextPath(path)).toBe(path);
  });
  it.each([
    'https://evil.example',
    '//evil.example',
    '/\\evil.example',
    'vendor',
    '',
    null,
    42,
    '/a\nb',
  ])('rejects %j', (path) => {
    expect(safeNextPath(path)).toBeNull();
  });
});

describe('decideRoute', () => {
  const vendor = claims([{ org: ORG, role: 'vendor', status: 'active' }]);
  const orgAdmin = (aal: string) =>
    claims([{ org: ORG, role: 'org_admin', status: 'active' }], false, aal);

  it('leaves non-portal paths alone, even when signed out', () => {
    expect(decideRoute('/', '', null)).toEqual({ type: 'allow' });
    expect(decideRoute('/sign-in', '', null)).toEqual({ type: 'allow' });
  });

  it('sends signed-out visitors to sign-in with a return path', () => {
    expect(decideRoute('/vendor/orders', '?day=1', null)).toEqual({
      type: 'redirect',
      to: '/sign-in?next=%2Fvendor%2Forders%3Fday%3D1',
    });
  });

  it('allows the right portal and forbids the others', () => {
    expect(decideRoute('/vendor', '', vendor)).toEqual({ type: 'allow' });
    expect(decideRoute('/admin', '', vendor)).toEqual({ type: 'forbidden' });
    expect(decideRoute('/sponsor', '', vendor)).toEqual({ type: 'forbidden' });
    expect(decideRoute('/platform', '', vendor)).toEqual({ type: 'forbidden' });
  });

  it('requires MFA before any portal for Organization Admins', () => {
    expect(decideRoute('/admin', '', orgAdmin('aal1'))).toEqual({
      type: 'redirect',
      to: '/mfa?next=%2Fadmin',
    });
    expect(decideRoute('/vendor', '', orgAdmin('aal1'))).toEqual({
      type: 'redirect',
      to: '/mfa?next=%2Fvendor',
    });
    expect(decideRoute('/admin', '', orgAdmin('aal2'))).toEqual({ type: 'allow' });
  });
});
