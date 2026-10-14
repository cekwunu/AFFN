import { useTranslations } from 'next-intl';
import { initRequestLocale } from '@/i18n/server';
import { use } from 'react';

export default function HomePage({ params }: PageProps<'/[locale]'>) {
  const { locale } = use(params);
  initRequestLocale(locale);
  const t = useTranslations('Home');

  return (
    <section className="max-w-2xl space-y-4">
      <h1 className="text-4xl font-semibold tracking-tight">{t('title')}</h1>
      <p className="text-lg text-ink-muted">{t('intro')}</p>
    </section>
  );
}
