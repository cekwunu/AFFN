import { Construction } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { EmptyState } from '@/components/ui/empty-state';

export function AreaPlaceholder({ area }: { area: 'vendor' | 'sponsor' | 'admin' | 'platform' }) {
  const t = useTranslations('Areas');
  return (
    <div className="grid gap-6">
      <h1 className="font-display text-display-md font-semibold">{t(area)}</h1>
      <EmptyState icon={<Construction />} title={t('comingSoon')} headingLevel="h2" />
    </div>
  );
}
