import { getTranslations } from 'next-intl/server';
import { connection } from 'next/server';
import { SponsorLogos } from '@/components/sponsor-logos';
import { initRequestLocale } from '@/i18n/server';
import { currentApplicationEvent } from '@/lib/vendor/server';

export default async function HomePage({ params }: PageProps<'/[locale]'>) {
  initRequestLocale((await params).locale);
  // Sponsor logos change as sponsors are approved.
  await connection();
  const t = await getTranslations('Home');
  const event = await currentApplicationEvent();

  return (
    <div className="mx-auto grid max-w-6xl gap-16 px-4 py-20 sm:px-6 sm:py-28">
      <section className="max-w-2xl space-y-6">
        <h1 className="font-display text-display-xl font-semibold sm:text-display-2xl">
          {t('title')}
        </h1>
        <p className="text-body-lg text-muted-foreground">{t('intro')}</p>
      </section>
      {event && <SponsorLogos eventId={event.id} heading />}
    </div>
  );
}
