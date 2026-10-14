import { use } from 'react';
import { ClientIntl } from '@/components/client-intl';
import { PortalShell } from '@/components/shells/portal-shell';
import { initRequestLocale } from '@/i18n/server';

// Vendor area. Role check and area navigation are added with auth (AUTH-02).
export default function VendorLayout({ children, params }: LayoutProps<'/[locale]'>) {
  initRequestLocale(use(params).locale);
  return (
    <ClientIntl>
      <PortalShell area="vendor">{children}</PortalShell>
    </ClientIntl>
  );
}
