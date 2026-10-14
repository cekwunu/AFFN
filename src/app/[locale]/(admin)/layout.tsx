import { ClipboardCheck, LayoutDashboard, MapPinned, Users } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { signOut } from '@/app/[locale]/(auth)/actions';
import { ClientIntl } from '@/components/client-intl';
import { PortalShell } from '@/components/shells/portal-shell';
import { initRequestLocale } from '@/i18n/server';
import { requirePortal } from '@/lib/auth/server';

// Admin portal. The proxy routes by the roles in the JWT; this re-checks live memberships, so
// a revoked role loses access immediately (AUTH-02).
export default async function AdminLayout({ children, params }: LayoutProps<'/[locale]'>) {
  const locale = initRequestLocale((await params).locale);
  const user = await requirePortal('admin', locale);
  const t = await getTranslations('Shell.portal');
  return (
    <ClientIntl>
      <PortalShell
        area="admin"
        account={{ email: user.email, portals: user.portals, signOut }}
        nav={[
          { href: '/admin', label: t('overview'), icon: <LayoutDashboard /> },
          { href: '/admin/applications', label: t('applications'), icon: <ClipboardCheck /> },
          { href: '/admin/stalls', label: t('stalls'), icon: <MapPinned /> },
          { href: '/admin/team', label: t('team'), icon: <Users /> },
        ]}
      >
        {children}
      </PortalShell>
    </ClientIntl>
  );
}
