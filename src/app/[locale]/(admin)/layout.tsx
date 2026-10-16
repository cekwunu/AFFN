import {
  BookOpenCheck,
  ArrowLeftRight,
  ClipboardCheck,
  FileSpreadsheet,
  Scale,
  Settings2,
  HandCoins,
  Handshake,
  LayoutDashboard,
  MapPinned,
  Percent,
  Users,
} from 'lucide-react';
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
          { href: '/admin/sponsors', label: t('sponsors'), icon: <Handshake /> },
          { href: '/admin/commission', label: t('commission'), icon: <Percent /> },
          { href: '/admin/ledger', label: t('ledger'), icon: <BookOpenCheck /> },
          { href: '/admin/settlements', label: t('settlements'), icon: <HandCoins /> },
          { href: '/admin/transactions', label: t('transactions'), icon: <ArrowLeftRight /> },
          { href: '/admin/reconciliation', label: t('reconciliation'), icon: <Scale /> },
          { href: '/admin/exports', label: t('exports'), icon: <FileSpreadsheet /> },
          { href: '/admin/team', label: t('team'), icon: <Users /> },
          { href: '/admin/settings', label: t('settings'), icon: <Settings2 /> },
        ]}
      >
        {children}
      </PortalShell>
    </ClientIntl>
  );
}
