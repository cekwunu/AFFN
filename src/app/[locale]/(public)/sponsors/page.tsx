import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { connection } from 'next/server';
import { SponsorLogos } from '@/components/sponsor-logos';
import { buttonVariants } from '@/components/ui/button-variants';
import { Link } from '@/i18n/link';
import { initRequestLocale } from '@/i18n/server';
import { currentApplicationEvent } from '@/lib/vendor/server';

export async function generateMetadata({
  params,
}: PageProps<'/[locale]/sponsors'>): Promise<Metadata> {
  const locale = initRequestLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: 'Sponsors' });
  return { title: t('title') };
}

/** The festival's sponsors, by package level (SPO-02). */
export default async function SponsorsPage({ params }: PageProps<'/[locale]/sponsors'>) {
  initRequestLocale((await params).locale);
  await connection();
  const t = await getTranslations('Sponsors');
  const event = await currentApplicationEvent();
  return (
    <div className="mx-auto grid max-w-6xl gap-12 px-4 py-16 sm:px-6 sm:py-20">
      <header className="grid max-w-3xl gap-3">
        {event && (
          <p className="text-body-sm font-semibold tracking-wide text-primary uppercase">
            {event.name}
          </p>
        )}
        <h1 className="font-display text-display-lg font-semibold">{t('title')}</h1>
        <p className="text-body-lg text-muted-foreground">{t('intro')}</p>
      </header>
      {event && <SponsorLogos eventId={event.id} heading={false} />}
      <p>
        <Link
          href="/become-a-sponsor"
          className={buttonVariants({ variant: 'outline', size: 'lg' })}
        >
          {t('becomeOne')}
        </Link>
      </p>
    </div>
  );
}
