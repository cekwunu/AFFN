import { AreaPlaceholder } from '@/components/area-placeholder';
import { initRequestLocale } from '@/i18n/server';
import { getCurrentUser } from '@/lib/auth/server';

export default async function VendorHomePage({ params }: PageProps<'/[locale]/vendor'>) {
  initRequestLocale((await params).locale);
  const user = await getCurrentUser();
  const active = user?.access.roles.some((r) => r.role === 'vendor' && r.status === 'active');
  return <AreaPlaceholder area="vendor" pending={!active} />;
}
