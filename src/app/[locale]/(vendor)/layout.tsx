import { signOut } from '@/app/[locale]/(auth)/actions';
import { ClientIntl } from '@/components/client-intl';
import { PortalShell } from '@/components/shells/portal-shell';
import { initRequestLocale } from '@/i18n/server';
import { requirePortal } from '@/lib/auth/server';

// Vendor portal. The proxy routes by the roles in the JWT; this re-checks live memberships, so
// a revoked role loses access immediately (AUTH-02).
export default async function VendorLayout({ children, params }: LayoutProps<'/[locale]'>) {
  const locale = initRequestLocale((await params).locale);
  const user = await requirePortal('vendor', locale);
  return (
    <ClientIntl>
      <PortalShell area="vendor" account={{ email: user.email, portals: user.portals, signOut }}>
        {children}
      </PortalShell>
    </ClientIntl>
  );
}
