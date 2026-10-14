import { BadgeCheck, CalendarDays, QrCode, Store, Users, Wallet } from 'lucide-react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { connection } from 'next/server';
import type { ReactNode } from 'react';
import { buttonVariants } from '@/components/ui/button-variants';
import { Link } from '@/i18n/link';
import type { Locale } from '@/i18n/routing';
import { initRequestLocale } from '@/i18n/server';
import { commissionBreakdown, formatCommissionTerms, formatPercent } from '@/lib/commission';
import { formatDateOslo, formatNok } from '@/lib/format';
import { ore } from '@/lib/money';
import {
  applicationsOpen,
  commissionRuleFor,
  currentApplicationEvent,
  stallTypesFor,
} from '@/lib/vendor/server';

const EXAMPLE_GROSS = ore(50_000); // kr 500, the PRD's worked example

export async function generateMetadata({
  params,
}: PageProps<'/[locale]/become-a-vendor'>): Promise<Metadata> {
  const locale = initRequestLocale((await params).locale);
  await connection();
  const t = await getTranslations({ locale, namespace: 'BecomeVendor' });
  const event = await currentApplicationEvent();
  return {
    title: t('metaTitle'),
    description: event ? t('metaDescription', { event: event.name }) : undefined,
  };
}

export default async function BecomeVendorPage({ params }: PageProps<'/[locale]/become-a-vendor'>) {
  const locale = initRequestLocale((await params).locale) as Locale;
  // Fees, dates and rates live in the database; always show the current ones.
  await connection();
  const t = await getTranslations('BecomeVendor');
  const event = await currentApplicationEvent();

  if (!event) {
    return (
      <section className="mx-auto max-w-3xl px-4 py-20 sm:px-6">
        <h1 className="font-display text-display-lg font-semibold">{t('metaTitle')}</h1>
        <p className="mt-4 text-body-lg text-muted-foreground">{t('noEvent')}</p>
      </section>
    );
  }

  const [stallTypes, rule] = await Promise.all([
    stallTypesFor(event.id),
    commissionRuleFor(event.id, null),
  ]);
  const perOrder = locale === 'en' ? 'per order' : 'per ordre';
  const terms = rule ? formatCommissionTerms(rule, perOrder) : null;
  const example = rule ? commissionBreakdown(EXAMPLE_GROSS, rule) : null;
  const open = applicationsOpen(event);
  const notYet = event.applications_open_at && new Date(event.applications_open_at) > new Date();
  const date = (value: string) => formatDateOslo(value, locale, 'long');

  const dates = [
    { label: t('opens'), value: event.applications_open_at },
    { label: t('deadline'), value: event.application_deadline },
    { label: t('decisions'), value: event.decisions_by },
    { label: t('festival'), value: event.starts_at },
  ].filter((d): d is { label: string; value: string } => !!d.value);

  const benefits: { key: 'visitors' | 'payments' | 'payout' | 'profile'; icon: ReactNode }[] = [
    { key: 'visitors', icon: <Users /> },
    { key: 'payments', icon: <QrCode /> },
    { key: 'payout', icon: <Wallet /> },
    { key: 'profile', icon: <Store /> },
  ];

  return (
    <>
      <section className="border-b border-border bg-card">
        <div className="mx-auto grid max-w-6xl gap-6 px-4 py-16 sm:px-6 sm:py-24">
          <p className="text-body-sm font-semibold tracking-wide text-primary uppercase">
            {t('eyebrow', { event: event.name })}
          </p>
          <h1 className="max-w-3xl font-display text-display-lg font-semibold sm:text-display-2xl">
            {t('title', { event: event.name })}
          </h1>
          <p className="max-w-2xl text-body-lg text-muted-foreground">{t('intro')}</p>
          {open ? (
            <div className="flex flex-wrap items-center gap-4">
              <Link href="/sign-up?role=vendor" className={buttonVariants({ size: 'lg' })}>
                {t('apply')}
              </Link>
              <Link
                href={`/sign-in?next=${encodeURIComponent('/vendor/apply')}`}
                className="text-body font-medium text-link hover:underline"
              >
                {t('signIn')}
              </Link>
            </div>
          ) : (
            <p className="max-w-2xl rounded-lg border border-border bg-background p-4 text-body">
              {notYet ? t('notOpenYet', { date: date(event.applications_open_at!) }) : t('closed')}
            </p>
          )}
        </div>
      </section>

      <div className="mx-auto grid max-w-6xl gap-16 px-4 py-16 sm:px-6 sm:py-20">
        <section aria-labelledby="benefits" className="grid gap-8">
          <h2 id="benefits" className="font-display text-display-md font-semibold">
            {t('benefitsTitle')}
          </h2>
          <ul className="grid gap-6 sm:grid-cols-2">
            {benefits.map(({ key, icon }) => (
              <li key={key} className="flex gap-4">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-secondary text-secondary-foreground [&_svg]:size-5">
                  {icon}
                </span>
                <div className="grid gap-1">
                  <h3 className="text-heading-sm font-semibold">{t(`benefits.${key}.title`)}</h3>
                  <p className="text-body text-muted-foreground">
                    {t(`benefits.${key}.text`, { venue: event.venue_name ?? event.name })}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        {stallTypes.length > 0 && (
          <section aria-labelledby="stalls" className="grid gap-6">
            <div className="grid gap-2">
              <h2 id="stalls" className="font-display text-display-md font-semibold">
                {t('stallsTitle')}
              </h2>
              <p className="max-w-2xl text-body text-muted-foreground">{t('stallsIntro')}</p>
            </div>
            <ul className="grid gap-4 md:grid-cols-3">
              {stallTypes.map((type) => (
                <li
                  key={type.id}
                  className="flex flex-col gap-3 rounded-xl border border-border bg-card p-6"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <h3 className="text-heading-md font-semibold">
                      {locale === 'en' ? type.name_en : type.name_nb}
                    </h3>
                    <span className="text-body-sm text-muted-foreground">
                      <span className="sr-only">{t('size')}: </span>
                      {type.size_label}
                    </span>
                  </div>
                  <p className="text-body-sm text-muted-foreground">
                    {locale === 'en' ? type.description_en : type.description_nb}
                  </p>
                  <p className="mt-auto pt-2 text-heading-sm font-semibold tabular-nums">
                    <span className="sr-only">{t('fee')}: </span>
                    {formatNok(ore(Number(type.fee_ore)))}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        )}

        {terms && example && rule && (
          <section aria-labelledby="commission" className="grid gap-6 md:grid-cols-2 md:gap-12">
            <div className="grid content-start gap-3">
              <h2 id="commission" className="font-display text-display-md font-semibold">
                {t('commissionTitle', { terms })}
              </h2>
              <p className="text-body text-muted-foreground">{t('commissionIntro', { terms })}</p>
            </div>
            <table className="w-full text-body">
              <caption className="pb-3 text-left text-body-sm font-semibold text-muted-foreground">
                {t('exampleCaption', { gross: formatNok(example.gross) })}
              </caption>
              <thead className="sr-only">
                <tr>
                  <th scope="col">{t('line')}</th>
                  <th scope="col">{t('amount')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border border-y border-border">
                {[
                  [t('exampleGross'), example.gross],
                  [
                    t('exampleCommission', {
                      rate: rule.type === 'fixed' ? terms : formatPercent(rule.rateBp ?? 0),
                    }),
                    example.commission,
                  ],
                  [t('exampleMva'), example.mva],
                  [t('exampleFee'), example.platformFee],
                ].map(([label, amount]) => (
                  <tr key={String(label)}>
                    <th scope="row" className="py-3 text-left font-normal text-muted-foreground">
                      {label}
                    </th>
                    <td className="py-3 text-right tabular-nums">
                      {formatNok(amount as typeof example.gross)}
                    </td>
                  </tr>
                ))}
                <tr>
                  <th scope="row" className="py-3 text-left font-semibold">
                    {t('examplePayout')}
                  </th>
                  <td className="py-3 text-right font-semibold tabular-nums">
                    {formatNok(example.vendorPayout)}
                  </td>
                </tr>
              </tbody>
            </table>
          </section>
        )}

        <div className="grid gap-12 md:grid-cols-2">
          {dates.length > 0 && (
            <section aria-labelledby="dates" className="grid content-start gap-5">
              <h2
                id="dates"
                className="flex items-center gap-3 font-display text-heading-lg font-semibold"
              >
                <CalendarDays className="size-6 text-primary" aria-hidden="true" />
                {t('datesTitle')}
              </h2>
              <dl className="grid gap-3">
                {dates.map((d) => (
                  <div
                    key={d.label}
                    className="flex justify-between gap-4 border-b border-border pb-3"
                  >
                    <dt className="text-muted-foreground">{d.label}</dt>
                    <dd className="font-medium">{date(d.value)}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}
          <section aria-labelledby="need" className="grid content-start gap-5">
            <h2
              id="need"
              className="flex items-center gap-3 font-display text-heading-lg font-semibold"
            >
              <BadgeCheck className="size-6 text-primary" aria-hidden="true" />
              {t('needTitle')}
            </h2>
            <ul className="grid list-disc gap-2 pl-5 text-body">
              <li>{t('need.orgNumber')}</li>
              <li>{t('need.mattilsynet')}</li>
              <li>{t('need.extras')}</li>
            </ul>
          </section>
        </div>

        <section aria-labelledby="how" className="grid gap-6">
          <h2 id="how" className="font-display text-display-md font-semibold">
            {t('howTitle')}
          </h2>
          <ol className="grid gap-4 md:grid-cols-4">
            {(['1', '2', '3', '4'] as const).map((n) => (
              <li key={n} className="grid content-start gap-3 rounded-xl border border-border p-5">
                <span className="flex size-8 items-center justify-center rounded-full bg-primary text-body-sm font-semibold text-primary-foreground">
                  {n}
                </span>
                <p className="text-body">{t(`how.${n}`)}</p>
              </li>
            ))}
          </ol>
          {open && (
            <Link
              href="/sign-up?role=vendor"
              className={buttonVariants({ size: 'lg', className: 'w-fit' })}
            >
              {t('apply')}
            </Link>
          )}
        </section>
      </div>
    </>
  );
}
