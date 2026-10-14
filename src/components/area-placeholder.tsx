import { useTranslations } from 'next-intl';

export function AreaPlaceholder({ area }: { area: 'vendor' | 'sponsor' | 'admin' | 'platform' }) {
  const t = useTranslations('Areas');
  return (
    <section className="space-y-2">
      <h1 className="text-3xl font-semibold tracking-tight">{t(area)}</h1>
      <p className="text-ink-muted">{t('comingSoon')}</p>
    </section>
  );
}
