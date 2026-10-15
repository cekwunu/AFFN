import { FlaskConical } from 'lucide-react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { buttonVariants } from '@/components/ui/button-variants';
import { initRequestLocale } from '@/i18n/server';
import { formatNok } from '@/lib/format';
import { ore } from '@/lib/money';
import { getMockProvider } from '@/lib/payments';
import { completeMockOnboarding, completeMockPayment } from './actions';

export const metadata: Metadata = { robots: { index: false } };

/**
 * Hosted pages of the mock payment provider: vendor onboarding and payment. TEST MODE: no money
 * moves. A real provider shows its own pages instead.
 */
export default async function MockProviderPage({
  params,
  searchParams,
}: PageProps<'/[locale]/pay/mock/[token]'>) {
  const { locale, token } = await params;
  initRequestLocale(locale);
  const t = await getTranslations('MockPay');
  const error = (await searchParams).error;
  const link = getMockProvider().readToken(token);
  const back = (url: string) => new URL(url).pathname;

  return (
    <section className="mx-auto grid max-w-md gap-6 px-4 py-12 sm:px-6">
      <p className="w-fit rounded-full bg-warning px-3 py-1 text-caption font-bold tracking-wide text-warning-foreground">
        {t('testMode')}
      </p>
      <h1 className="font-display text-display-md font-semibold">
        {link?.kind === 'onboarding' ? t('onboardingTitle') : t('title')}
      </h1>
      <p className="flex gap-3 rounded-lg bg-warning-subtle p-4 text-body-sm text-warning-subtle-foreground">
        <FlaskConical className="size-5 shrink-0" aria-hidden="true" />
        {t('banner')}
      </p>
      {error && (
        <p role="alert" className="text-body text-danger">
          {error === 'invalid' || !link ? t('invalid') : t('failed')}
        </p>
      )}
      {!link ? (
        !error && (
          <p role="alert" className="text-body text-danger">
            {t('invalid')}
          </p>
        )
      ) : link.kind === 'onboarding' ? (
        <>
          <p className="text-body">{t('onboardingIntro', { business: link.businessName })}</p>
          <form action={completeMockOnboarding} className="grid gap-3">
            <input type="hidden" name="token" value={token} />
            <button
              type="submit"
              name="outcome"
              value="enabled"
              className={buttonVariants({ size: 'lg' })}
            >
              {t('completeOnboarding')}
            </button>
            <button
              type="submit"
              name="outcome"
              value="action_required"
              className={buttonVariants({ variant: 'outline', size: 'lg' })}
            >
              {t('needsInfo')}
            </button>
          </form>
          <a href={back(link.returnUrl)} className="font-medium text-link hover:underline">
            {t('cancel')}
          </a>
        </>
      ) : (
        <>
          <dl className="grid gap-2 rounded-xl border border-border bg-card p-5">
            <dt className="text-body-sm text-muted-foreground">{t('for')}</dt>
            <dd className="text-body font-medium">{link.description}</dd>
            <dt className="text-body-sm text-muted-foreground">{t('amount')}</dt>
            <dd className="text-heading-md font-semibold tabular-nums">
              {formatNok(ore(link.amountOre))}
            </dd>
            {link.accountId && (
              <>
                <dt className="text-body-sm text-muted-foreground">{t('split')}</dt>
                <dd className="grid text-body-sm tabular-nums">
                  <span>
                    {t('toVendor')}: {formatNok(ore(link.amountOre - link.platformFeeOre))}
                  </span>
                  <span>
                    {t('toPlatform')}: {formatNok(ore(link.platformFeeOre))}
                  </span>
                </dd>
              </>
            )}
          </dl>
          <form action={completeMockPayment} className="grid gap-4">
            <input type="hidden" name="token" value={token} />
            <fieldset className="grid gap-2">
              <legend className="mb-1 text-body-sm font-medium">{t('method')}</legend>
              {link.methods.map((method, index) => (
                <label
                  key={method}
                  className="flex min-h-12 items-center gap-3 rounded-lg border border-border bg-card px-4 text-body"
                >
                  <input
                    type="radio"
                    name="method"
                    value={method}
                    defaultChecked={index === 0}
                    className="size-5 accent-primary"
                  />
                  {t(`methods.${method}`)}
                </label>
              ))}
            </fieldset>
            <button
              type="submit"
              name="result"
              value="succeeded"
              className={buttonVariants({ size: 'lg' })}
            >
              {t('pay', { amount: formatNok(ore(link.amountOre)) })}
            </button>
            <button
              type="submit"
              name="result"
              value="failed"
              className={buttonVariants({ variant: 'outline' })}
            >
              {t('simulateFailure')}
            </button>
          </form>
          <a href={back(link.cancelUrl)} className="font-medium text-link hover:underline">
            {t('cancel')}
          </a>
        </>
      )}
    </section>
  );
}
