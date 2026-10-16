import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Badge } from '@/components/ui/badge';
import { initRequestLocale } from '@/i18n/server';
import { myVendor } from '@/lib/catalogue/server';
import { formatDateTimeOslo, formatNok } from '@/lib/format';
import { ore } from '@/lib/money';
import { myVendorSettlements } from '@/lib/settlements/server';
import { DocumentLinks } from '@/components/document-links';
import { NoVendor } from '../products/no-vendor';

export const metadata: Metadata = { robots: { index: false } };

/** The vendor's settlements: what each one covered, and whether it is paid (SET-01, SET-03). */
export default async function VendorSettlementsPage({
  params,
}: PageProps<'/[locale]/vendor/settlements'>) {
  const locale = initRequestLocale((await params).locale);
  const t = await getTranslations('VendorSettlements');
  const tS = await getTranslations('Settlements');
  const vendor = await myVendor();
  if (!vendor) return <NoVendor title={t('title')} />;
  const lines = await myVendorSettlements(vendor.id);
  const money = (v: number) => formatNok(ore(v));

  return (
    <div className="mx-auto grid w-full max-w-3xl gap-6">
      <header className="grid gap-1">
        <h1 className="font-display text-display-md font-semibold">{t('title')}</h1>
        <p className="text-body text-muted-foreground">{t('intro')}</p>
      </header>
      {lines.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-6 py-10 text-center text-muted-foreground">
          {t('empty')}
        </p>
      ) : (
        <ul className="grid gap-4" data-testid="vendor-settlements">
          {lines.map((l) => {
            const paid = l.payouts.find((p) => p.status === 'paid');
            const shown = paid ? 'paid' : l.settlement!.status;
            return (
              <li
                key={l.id}
                data-testid="vendor-settlement"
                data-status={shown}
                className="grid gap-3 rounded-xl border border-border bg-card p-5"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-body-sm text-muted-foreground">
                    {l.period_start
                      ? t('period', {
                          from: formatDateTimeOslo(l.period_start, locale),
                          to: formatDateTimeOslo(l.cutoff_at!, locale),
                        })
                      : t('until', { to: formatDateTimeOslo(l.cutoff_at!, locale) })}
                  </p>
                  <Badge
                    variant={
                      paid ? 'success' : shown === 'completed_with_failures' ? 'danger' : 'info'
                    }
                  >
                    {paid
                      ? t('paidAt', { time: formatDateTimeOslo(paid.paid_at!, locale) })
                      : tS(`status.${l.settlement!.status}`)}
                  </Badge>
                </div>
                <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-body-sm sm:grid-cols-3">
                  {(
                    [
                      ['gross', l.gross_sales_ore],
                      ['refunds', -l.refunds_ore],
                      ['commission', -l.commission_ore],
                      ['mva', -l.commission_mva_ore],
                      ['adjustments', l.adjustments_ore],
                    ] as const
                  ).map(([key, amount]) => (
                    <div key={key} className="flex justify-between gap-2">
                      <dt className="text-muted-foreground">{tS(`lines.${key}`)}</dt>
                      <dd className="tabular-nums">{money(amount)}</dd>
                    </div>
                  ))}
                </dl>
                <p className="flex items-baseline justify-between border-t border-border pt-3 text-heading-sm font-semibold">
                  <span>{tS('lines.net')}</span>
                  <span className="tabular-nums">{money(l.net_payout_ore)}</span>
                </p>
                {['releasing', 'completed', 'completed_with_failures'].includes(
                  l.settlement!.status,
                ) && (
                  <DocumentLinks
                    links={[
                      { kind: 'vendor_statement', id: l.id, label: t('statementPdf') },
                      { kind: 'statement_orders_csv', id: l.id, label: t('ordersCsv') },
                      ...(l.invoice
                        ? [
                            {
                              kind: 'commission_invoice' as const,
                              id: l.invoice.id,
                              label: t('invoicePdf', { number: l.invoice.invoice_number }),
                            },
                          ]
                        : []),
                    ]}
                    english={t('english')}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
