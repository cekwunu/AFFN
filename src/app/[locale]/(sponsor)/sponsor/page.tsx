import { initRequestLocale } from '@/i18n/server';
import { use } from 'react';
import { AreaPlaceholder } from '@/components/area-placeholder';

export default function SponsorHomePage({ params }: PageProps<'/[locale]/sponsor'>) {
  const { locale } = use(params);
  initRequestLocale(locale);
  return <AreaPlaceholder area="sponsor" />;
}
