import { Check } from 'lucide-react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { connection } from 'next/server';
import { buttonVariants } from '@/components/ui/button-variants';
import { Link } from '@/i18n/link';
import { initRequestLocale } from '@/i18n/server';
import { formatNok } from '@/lib/format';
import { ore } from '@/lib/money';
import { publicPackages } from '@/lib/sponsors/server';
import { currentApplicationEvent } from '@/lib/vendor/server';

export async function generateMetadata({
  params,
}: PageProps<'/[locale]/become-a-sponsor'>): Promise<Metadata> {
  const locale = initRequestLocale((await params).locale);
  await connection();
  const t = await getTranslations({ locale, namespace: 'BecomeSponsor' });
  const event = await currentApplicationEvent();
  return {
    title: t('metaTitle'),
    description: event ? t('metaDescription', { event: event.name }) : undefined,
  };
}

/** Public sponsor packages (SPO-01), read from the database: no fixed tiers. */
export default async function BecomeSponsorPage({
  params,
}: PageProps<'/[locale]/become-a-sponsor'>) {
  initRequestLocale((await params).locale);
  await connection();
  const t = await getTranslations('BecomeSponsor');
  const event = await currentApplicationEvent();
  const packages = event ? await publicPackages(event.id) : [];

  return (
    <>
      <section className="border-b border-border bg-card">
        <div className="mx-auto grid max-w-6xl gap-6 px-4 py-16 sm:px-6 sm:py-24">
          {event && (
            <p className="text-body-sm font-semibold tracking-wide text-primary uppercase">
              {event.name}
            </p>
          )}
          <h1 className="max-w-3xl font-display text-display-lg font-semibold sm:text-display-2xl">
            {t('title')}
          </h1>
          <p className="max-w-2xl text-body-lg text-muted-foreground">{t('intro')}</p>
          {packages.length > 0 && (
            <div className="flex flex-wrap items-center gap-4">
              <Link href="/sign-up?role=sponsor" className={buttonVariants({ size: 'lg' })}>
                {t('register')}
              </Link>
              <Link
                href={`/sign-in?next=${encodeURIComponent('/sponsor')}`}
                className="text-body font-medium text-link hover:underline"
              >
                {t('signIn')}
              </Link>
            </div>
          )}
        </div>
      </section>

      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:px-6 sm:py-20">
        <section aria-labelledby="packages" className="grid gap-6">
          <h2 id="packages" className="font-display text-display-md font-semibold">
            {t('packagesTitle')}
          </h2>
          {packages.length === 0 ? (
            <p className="text-body text-muted-foreground">{t('noPackages')}</p>
          ) : (
            <ul className="grid gap-6 md:grid-cols-2 lg:grid-cols-3" data-testid="packages">
              {packages.map((p) => (
                <li
                  key={p.id}
                  data-testid="package"
                  className="grid content-start gap-4 rounded-xl border border-border bg-card p-6"
                >
                  <div className="grid gap-1">
                    <h3 className="text-display-sm font-display font-semibold">{p.name}</h3>
                    <p className="text-heading-md font-semibold tabular-nums">
                      {formatNok(ore(p.price_ore))}{' '}
                      <span className="text-body-sm font-normal text-muted-foreground">
                        {t('exMva')}
                      </span>
                    </p>
                  </div>
                  {p.description && (
                    <p className="text-body text-muted-foreground">{p.description}</p>
                  )}
                  <ul className="grid gap-2 text-body-sm">
                    {p.deliverables.map((d) => (
                      <li key={d} className="flex gap-2">
                        <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-primary" />
                        {d}
                      </li>
                    ))}
                    {p.qr_code_count > 0 && (
                      <li className="flex gap-2">
                        <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-primary" />
                        {t('qrCodes', { count: p.qr_code_count })}
                      </li>
                    )}
                    <li className="flex gap-2">
                      <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-primary" />
                      {t('report')}
                    </li>
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </section>
        <p className="max-w-2xl text-body-sm text-muted-foreground">{t('privacy')}</p>
      </div>
    </>
  );
}
