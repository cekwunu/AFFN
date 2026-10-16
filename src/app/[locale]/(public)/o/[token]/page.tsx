import { clsx } from 'clsx';
import { BellRing, CircleCheck, CircleX, Clock } from 'lucide-react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { OrderLive } from '@/components/storefront/order-live';
import { Link } from '@/i18n/link';
import { initRequestLocale } from '@/i18n/server';
import { publicEnv } from '@/lib/env';
import { formatDateTimeOslo, formatNok } from '@/lib/format';
import { ore } from '@/lib/money';
import { formatPercent } from '@/lib/money/commission';
import { TRACKING_STEPS } from '@/lib/orders/status';
import { getReceipt } from '@/lib/storefront/receipt';
import { sendReceipt } from './actions';

export const metadata: Metadata = { robots: { index: false } };

/**
 * After payment (QR-03, QR-05): order status and the digital receipt. The vendor is the seller
 * of record (name and org number); AFFN appears as the platform.
 */
export default async function OrderPage({
  params,
  searchParams,
}: PageProps<'/[locale]/o/[token]'>) {
  const { locale: rawLocale, token } = await params;
  const locale = initRequestLocale(rawLocale);
  const receipt = await getReceipt(token);
  if (!receipt) notFound();
  const t = await getTranslations('Receipt');
  const query = await searchParams;
  const emailState = typeof query.email === 'string' ? query.email : null;
  const paid = !!receipt.paidAt && receipt.status !== 'pending_payment';
  const cancelled = receipt.status === 'cancelled' && !receipt.paidAt;
  const vendorPath = `/e/${receipt.event.slug}/${receipt.vendor.slug}`;

  return (
    <div className="mx-auto grid w-full max-w-xl gap-6 px-4 py-8 sm:px-6">
      {paid ? (
        <section
          aria-labelledby="tracking"
          data-testid="tracking"
          data-status={receipt.status}
          className={clsx(
            'grid justify-items-center gap-4 rounded-2xl border p-6 text-center',
            receipt.status === 'ready'
              ? 'border-success bg-success-subtle text-success-subtle-foreground'
              : 'border-border bg-card',
          )}
        >
          <OrderLive
            token={token}
            status={receipt.status}
            supabaseUrl={publicEnv.NEXT_PUBLIC_SUPABASE_URL ?? null}
            anonKey={publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? null}
            readyTitle={t('track.readyTitle', { code: receipt.order_code })}
            settled={!receipt.refundPending}
          />
          {receipt.status === 'ready' ? (
            <BellRing aria-hidden className="size-12" />
          ) : receipt.status === 'cancelled' ? (
            <CircleX aria-hidden className="size-12 text-danger" />
          ) : (
            <CircleCheck aria-hidden className="size-12 text-success-subtle-foreground" />
          )}
          <h1
            id="tracking"
            className="font-display text-heading-lg font-semibold"
            aria-live="polite"
          >
            {t(`track.title.${receipt.status as 'new'}`)}
          </h1>
          <p className="text-body-sm font-medium">{t('orderNumber')}</p>
          <p
            className="font-display text-display-xl leading-none font-semibold tabular-nums"
            data-testid="order-number"
          >
            {receipt.order_code}
          </p>
          {receipt.stall && (
            <p className="text-heading-sm font-semibold" data-testid="order-stall">
              {t('track.stall', { number: receipt.stall, vendor: receipt.vendor.display_name })}
            </p>
          )}
          {receipt.status !== 'cancelled' && (
            <ol
              className="flex w-full max-w-md justify-between gap-1"
              aria-label={t('track.progress')}
            >
              {TRACKING_STEPS.map((step, i) => {
                const reached = TRACKING_STEPS.indexOf(receipt.status as 'new') >= i;
                return (
                  <li
                    key={step}
                    aria-current={receipt.status === step ? 'step' : undefined}
                    className="grid flex-1 justify-items-center gap-1.5 text-caption"
                  >
                    <span
                      aria-hidden
                      className={clsx(
                        'h-1.5 w-full rounded-full',
                        reached ? 'bg-primary' : 'bg-muted',
                      )}
                    />
                    <span className={clsx(reached ? 'font-semibold' : 'text-muted-foreground')}>
                      {t(`status.${step}`)}
                    </span>
                  </li>
                );
              })}
            </ol>
          )}
          <p className="text-body" data-testid="order-status">
            {receipt.status === 'cancelled'
              ? receipt.cancel_reason
                ? t('track.cancelledReason', { reason: receipt.cancel_reason })
                : t('track.text.cancelled')
              : receipt.ahead === null
                ? t(`track.text.${receipt.status as 'ready'}`, {
                    vendor: receipt.vendor.display_name,
                  })
                : receipt.ahead === 0
                  ? t('track.next')
                  : t('track.ahead', { count: receipt.ahead })}
          </p>
          {receipt.status === 'cancelled' && (
            <p className="text-body font-semibold" data-testid="order-refund">
              {receipt.refundedOre > 0
                ? t('track.refunded', { amount: formatNok(ore(receipt.refundedOre)) })
                : t('track.refundPending')}
            </p>
          )}
        </section>
      ) : (
        <section className="grid justify-items-center gap-3 rounded-2xl border border-border bg-card p-6 text-center">
          {cancelled ? (
            <CircleX aria-hidden className="size-12 text-danger" />
          ) : (
            <Clock aria-hidden className="size-12 text-muted-foreground" />
          )}
          <h1 className="font-display text-heading-lg font-semibold">
            {cancelled ? t('cancelledTitle') : t('pendingTitle')}
          </h1>
          <p className="text-body">{cancelled ? t('cancelledText') : t('pendingText')}</p>
          {!cancelled && (
            <Link
              href={`/o/${token}`}
              className="font-medium text-link underline-offset-4 hover:underline"
            >
              {t('refresh')}
            </Link>
          )}
          <Link
            href={vendorPath}
            className="font-medium text-link underline-offset-4 hover:underline"
          >
            {t('back', { vendor: receipt.vendor.display_name })}
          </Link>
        </section>
      )}

      {paid && (
        <section
          aria-labelledby="receipt"
          className="grid gap-4 rounded-2xl border border-border bg-card p-6"
          data-testid="receipt"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="receipt" className="text-heading-md font-semibold">
              {t('receipt')} · {t('title', { number: receipt.order_code })}
            </h2>
            <a
              href={`/api/receipts/${token}${locale === 'en' ? '?lang=en' : ''}`}
              className="text-body-sm font-medium text-link underline-offset-4 hover:underline"
              data-testid="receipt-pdf"
            >
              {t('downloadPdf')}
            </a>
          </div>
          <dl className="grid gap-1 text-body-sm">
            <div className="flex flex-wrap gap-x-2">
              <dt className="font-semibold">{t('seller')}:</dt>
              <dd>
                {receipt.vendor.legal_name}, {t('orgNumber', { number: receipt.vendor.org_number })}
              </dd>
            </div>
            <div className="flex flex-wrap gap-x-2">
              <dt className="font-semibold">{t('platform')}:</dt>
              <dd>{t('platformText', { name: receipt.organization.name })}</dd>
            </div>
            {receipt.customer_name && (
              <div className="flex flex-wrap gap-x-2">
                <dt className="font-semibold">{t('name')}:</dt>
                <dd>{receipt.customer_name}</dd>
              </div>
            )}
            {receipt.pickup_note && (
              <div className="flex flex-wrap gap-x-2">
                <dt className="font-semibold">{t('pickup')}:</dt>
                <dd>{receipt.pickup_note}</dd>
              </div>
            )}
          </dl>
          <table className="w-full text-body-sm">
            <caption className="sr-only">{t('receipt')}</caption>
            <thead className="border-b border-border text-left text-muted-foreground">
              <tr>
                <th scope="col" className="py-1.5 font-medium">
                  {t('item')}
                </th>
                <th scope="col" className="py-1.5 text-right font-medium">
                  {t('quantity')}
                </th>
                <th scope="col" className="py-1.5 text-right font-medium">
                  {t('amount')}
                </th>
              </tr>
            </thead>
            <tbody>
              {receipt.items.map((item, i) => (
                <tr key={i} className="border-b border-border">
                  <td className="py-2">{item.product_name}</td>
                  <td className="py-2 text-right tabular-nums">{item.quantity}</td>
                  <td className="py-2 text-right tabular-nums">
                    {formatNok(ore(item.line_total_ore))}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              {receipt.mvaByRate.map(([rate, amount]) => (
                <tr key={rate}>
                  <td colSpan={2} className="pt-2 text-muted-foreground">
                    {t('mva', { rate: formatPercent(rate) })}
                  </td>
                  <td className="pt-2 text-right text-muted-foreground tabular-nums">
                    {formatNok(ore(amount))}
                  </td>
                </tr>
              ))}
              <tr>
                <th scope="row" colSpan={2} className="pt-2 text-left text-body font-semibold">
                  {t('total')}
                </th>
                <td
                  className="pt-2 text-right text-body font-semibold tabular-nums"
                  data-testid="receipt-total"
                >
                  {formatNok(ore(receipt.total_ore))}
                </td>
              </tr>
            </tfoot>
          </table>
          {receipt.mvaByRate.length === 0 && (
            <p className="text-caption text-muted-foreground">{t('noMva')}</p>
          )}
          <p className="text-body-sm text-muted-foreground">
            {receipt.method && (
              <>
                {t('method')}: {t(`methods.${receipt.method}`)} ·{' '}
              </>
            )}
            {formatDateTimeOslo(receipt.paidAt!, locale)}
          </p>
        </section>
      )}

      {paid && (
        <section
          aria-labelledby="email-receipt"
          className="grid gap-3 rounded-2xl border border-border bg-card p-6"
        >
          <h2 id="email-receipt" className="text-heading-sm font-semibold">
            {t('email.title')}
          </h2>
          {emailState === 'sent' ? (
            <p role="status" className="text-body-sm text-success-subtle-foreground">
              {t('email.sent', { email: receipt.customer_email ?? '' })}
            </p>
          ) : (
            <form action={sendReceipt} className="grid gap-2">
              <input type="hidden" name="token" value={token} />
              <input type="hidden" name="locale" value={locale} />
              <label htmlFor="receipt-email" className="text-body-sm font-medium">
                {t('email.label')}
              </label>
              <div className="flex flex-wrap gap-2">
                <input
                  id="receipt-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  aria-describedby="receipt-email-hint"
                  aria-invalid={emailState === 'invalid' ? true : undefined}
                  className="h-11 min-w-0 flex-1 rounded-md border border-input bg-background px-3.5 text-body"
                />
                <button
                  type="submit"
                  className="inline-flex h-11 items-center rounded-lg bg-primary px-5 text-body-sm font-semibold text-primary-foreground hover:bg-primary-hover"
                >
                  {t('email.send')}
                </button>
              </div>
              <p id="receipt-email-hint" className="text-caption text-muted-foreground">
                {t('email.privacy')}
              </p>
              {(emailState === 'invalid' || emailState === 'limited') && (
                <p role="alert" className="text-body-sm font-medium text-danger">
                  {t(`email.${emailState}`)}
                </p>
              )}
            </form>
          )}
        </section>
      )}
    </div>
  );
}
