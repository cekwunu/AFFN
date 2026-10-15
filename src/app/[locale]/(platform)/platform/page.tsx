import { AreaPlaceholder } from '@/components/area-placeholder';
import { initRequestLocale } from '@/i18n/server';

export default async function PlatformHomePage({ params }: PageProps<'/[locale]/platform'>) {
  initRequestLocale((await params).locale);
  return <AreaPlaceholder area="platform" />;
}
