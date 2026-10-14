import { use } from 'react';
import { ClientIntl } from '@/components/client-intl';
import { PortalShell } from '@/components/shells/portal-shell';
import { initRequestLocale } from '@/i18n/server';

// Admin area. Role check and area navigation are added with auth (AUTH-02).
export default function AdminLayout({ children, params }: LayoutProps<'/[locale]'>) {
  initRequestLocale(use(params).locale);
  return (
    <ClientIntl>
      <PortalShell area="admin">{children}</PortalShell>
    </ClientIntl>
  );
}
