import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { buttonVariants } from '@/components/ui/button-variants';
import { Link } from '@/i18n/link';
import { initRequestLocale } from '@/i18n/server';
import { deviceClass } from '@/lib/sponsors/device';
import { publicSponsor } from '@/lib/sponsors/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { currentApplicationEvent } from '@/lib/vendor/server';

const UUID = /^[0-9a-f-]{36}$/;

export async function generateMetadata({
  params,
}: PageProps<'/[locale]/sponsors/[id]'>): Promise<Metadata> {
  const { locale, id } = await params;
  initRequestLocale(locale);
  const event = await currentApplicationEvent();
  const sponsor = event && UUID.test(id) ? await publicSponsor(event.id, id) : null;
  return { title: sponsor?.name };
}

/**
 * A sponsor's page on the festival site. Each view is counted for the sponsor report (SPO-04)
 * with the time and a coarse device type only — no IP address, no cookies.
 */
export default async function SponsorPage({ params }: PageProps<'/[locale]/sponsors/[id]'>) {
  const { locale, id } = await params;
  initRequestLocale(locale);
  const event = await currentApplicationEvent();
  const sponsor = event && UUID.test(id) ? await publicSponsor(event.id, id) : null;
  if (!event || !sponsor) notFound();
  const t = await getTranslations('Sponsors');
  await createAdminClient()
    .from('page_views')
    .insert({
      organization_id: event.organization_id,
      event_id: event.id,
      sponsor_id: sponsor.id,
      path: `/sponsors/${sponsor.id}`,
      device_class: deviceClass((await headers()).get('user-agent')),
    });

  return (
    <div className="mx-auto grid max-w-3xl justify-items-start gap-8 px-4 py-16 sm:px-6 sm:py-20">
      <p className="text-body-sm font-semibold tracking-wide text-primary uppercase">
        {t('sponsorOf', { event: event.name, package: sponsor.packageName })}
      </p>
      {sponsor.logoUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- SVG logos, sized by height
        <img src={sponsor.logoUrl} alt="" className="h-28 w-auto max-w-full object-contain" />
      )}
      <h1 className="font-display text-display-lg font-semibold">{sponsor.name}</h1>
      <p className="max-w-2xl text-body-lg text-muted-foreground">
        {t('thanks', { sponsor: sponsor.name, event: event.name })}
      </p>
      <div className="flex flex-wrap gap-4">
        {sponsor.href && (
          <a href={sponsor.href} className={buttonVariants({ size: 'lg' })} rel="noopener">
            {t('visit', { sponsor: sponsor.name })}
          </a>
        )}
        <Link href="/sponsors" className={buttonVariants({ variant: 'ghost', size: 'lg' })}>
          {t('allSponsors')}
        </Link>
      </div>
    </div>
  );
}
