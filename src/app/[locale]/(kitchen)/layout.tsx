import { ClientIntl } from '@/components/client-intl';
import { initRequestLocale } from '@/i18n/server';
import { requirePortal } from '@/lib/auth/server';

// Kitchen display: full screen on a tablet, without the portal navigation. Same access as the
// vendor portal (live memberships rechecked, AUTH-02).
export default async function KitchenLayout({ children, params }: LayoutProps<'/[locale]'>) {
  const locale = initRequestLocale((await params).locale);
  await requirePortal('vendor', locale);
  return (
    <ClientIntl namespaces={['Components', 'Kitchen']}>
      <main id="main" className="flex min-h-dvh flex-col bg-background p-3 sm:p-5">
        {children}
      </main>
    </ClientIntl>
  );
}
