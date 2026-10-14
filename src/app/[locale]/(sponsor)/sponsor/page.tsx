import { AreaPlaceholder } from '@/components/area-placeholder';
import { initRequestLocale } from '@/i18n/server';
import { getCurrentUser } from '@/lib/auth/server';

export default async function SponsorHomePage({ params }: PageProps<'/[locale]/sponsor'>) {
  initRequestLocale((await params).locale);
  const user = await getCurrentUser();
  const active = user?.access.roles.some((r) => r.role === 'sponsor' && r.status === 'active');
  return <AreaPlaceholder area="sponsor" pending={!active} />;
}
