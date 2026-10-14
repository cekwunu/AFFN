import { initRequestLocale } from '@/i18n/server';
import { use } from 'react';
import { AreaPlaceholder } from '@/components/area-placeholder';

export default function AdminHomePage({ params }: PageProps<'/[locale]/admin'>) {
  const { locale } = use(params);
  initRequestLocale(locale);
  return <AreaPlaceholder area="admin" />;
}
