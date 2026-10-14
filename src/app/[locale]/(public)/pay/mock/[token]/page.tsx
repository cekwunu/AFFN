import { FlaskConical } from 'lucide-react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { buttonVariants } from '@/components/ui/button-variants';
import { initRequestLocale } from '@/i18n/server';
import { formatNok } from '@/lib/format';
import { ore } from '@/lib/money';
import { readMockLink } from '@/lib/payments/mock';
import { completeMockPayment } from './actions';

export const metadata: Metadata = { robots: { index: false } };

/** Checkout page of the mock payment provider (temporary until Prompt 09). Moves no money. */
export default async function MockCheckoutPage({
  params,
  searchParams,
}: PageProps<'/[locale]/pay/mock/[token]'>) {
  const { locale, token } = await params;
  initRequestLocale(locale);
  const t = await getTranslations('MockPay');
  const error = (await searchParams).error;
  const link = readMockLink(token);

  return (
    <section className="mx-auto grid max-w-md gap-6 px-4 py-16 sm:px-6">
      <h1 className="font-display text-display-md font-semibold">{t('title')}</h1>
      <p className="flex gap-3 rounded-lg bg-warning-subtle p-4 text-body-sm text-warning-subtle-foreground">
        <FlaskConical className="size-5 shrink-0" aria-hidden="true" />
        {t('banner')}
      </p>
      {!link ? (
        <p role="alert" className="text-body text-danger">
          {t('invalid')}
        </p>
      ) : (
        <>
          {error === 'failed' && (
            <p role="alert" className="text-body text-danger">
              {t('failed')}
            </p>
          )}
          <dl className="grid gap-2 rounded-xl border border-border bg-card p-5">
            <dt className="text-body-sm text-muted-foreground">{t('for')}</dt>
            <dd className="text-body font-medium">{link.description}</dd>
            <dt className="text-body-sm text-muted-foreground">{t('amount')}</dt>
            <dd className="text-heading-md font-semibold tabular-nums">
              {formatNok(ore(link.amountOre))}
            </dd>
          </dl>
          <form action={completeMockPayment} className="flex flex-wrap items-center gap-4">
            <input type="hidden" name="token" value={token} />
            <button type="submit" className={buttonVariants({ size: 'lg' })}>
              {t('pay', { amount: formatNok(ore(link.amountOre)) })}
            </button>
            <a
              href={new URL(link.returnUrl).pathname}
              className="font-medium text-link hover:underline"
            >
              {t('cancel')}
            </a>
          </form>
        </>
      )}
    </section>
  );
}
