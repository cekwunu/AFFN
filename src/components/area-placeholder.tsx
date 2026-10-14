import { Construction, Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { EmptyState } from '@/components/ui/empty-state';

export function AreaPlaceholder({
  area,
  pending = false,
}: {
  area: 'vendor' | 'sponsor' | 'admin' | 'platform';
  /** Signed up, business not registered yet (pending membership). */
  pending?: boolean;
}) {
  const t = useTranslations('Areas');
  const pendingKey = area === 'sponsor' ? 'Sponsor' : 'Vendor';
  return (
    <div className="grid gap-6">
      <h1 className="font-display text-display-md font-semibold">{t(area)}</h1>
      {pending ? (
        <EmptyState
          icon={<Sparkles />}
          title={t(`pending${pendingKey}Title`)}
          description={t(`pending${pendingKey}Text`)}
          headingLevel="h2"
        />
      ) : (
        <EmptyState icon={<Construction />} title={t('comingSoon')} headingLevel="h2" />
      )}
    </div>
  );
}
