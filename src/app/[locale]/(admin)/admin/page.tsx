import { AreaPlaceholder } from '@/components/area-placeholder';
import { initRequestLocale } from '@/i18n/server';

export default async function AdminHomePage({ params }: PageProps<'/[locale]/admin'>) {
  initRequestLocale((await params).locale);
  return <AreaPlaceholder area="admin" />;
}
