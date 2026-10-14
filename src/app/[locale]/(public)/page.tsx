import { useTranslations } from 'next-intl';
import { use } from 'react';
import { initRequestLocale } from '@/i18n/server';

export default function HomePage({ params }: PageProps<'/[locale]'>) {
  const { locale } = use(params);
  initRequestLocale(locale);
  const t = useTranslations('Home');

  return (
    <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
      <div className="max-w-2xl space-y-6">
        <h1 className="font-display text-display-xl font-semibold sm:text-display-2xl">
          {t('title')}
        </h1>
        <p className="text-body-lg text-muted-foreground">{t('intro')}</p>
      </div>
    </section>
  );
}
