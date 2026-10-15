import { CircleAlert, CircleCheck } from 'lucide-react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { initRequestLocale } from '@/i18n/server';
import { formatNok } from '@/lib/format';
import { eventMoneyTotals, vendorBalances, type MoneyTotals } from '@/lib/ledger/server';
import { ore } from '@/lib/money';
import { currentApplicationEvent } from '@/lib/vendor/server';

export const metadata: Metadata = { robots: { index: false } };

const ROWS: (keyof MoneyTotals)[] = [
  'grossOre',
  'refundedOre',
  'platformFeeOre',
  'commissionOre',
  'commissionMvaOre',
  'pspFeeOre',
  'vendorOre',
];

/**
 * Money for the current event from the double-entry ledger (PRD §5), side by side with the same
 * totals worked out from orders and refunds; they must match to the øre. Vendor balances below.
 */
export default async function LedgerPage({ params }: PageProps<'/[locale]/admin/ledger'>) {
  initRequestLocale((await params).locale);
  const t = await getTranslations('Ledger');
  const event = await currentApplicationEvent();
  if (!event) return <h1 className="font-display text-display-md font-semibold">{t('title')}</h1>;
  const [totals, balances] = await Promise.all([
    eventMoneyTotals(event.id),
    vendorBalances(event.id),
  ]);
  const money = (v: number | null) => (v === null ? '–' : formatNok(ore(v)));
  const matches = ROWS.every(
    (k) => totals.orders[k] === null || totals.ledger[k] === totals.orders[k],
  );

  return (
    <div className="grid gap-8">
      <header className="grid gap-1">
        <h1 className="font-display text-display-md font-semibold">{t('title')}</h1>
        <p className="max-w-3xl text-body text-muted-foreground">
          {t('intro', { event: event.name })}
        </p>
      </header>

      <section aria-labelledby="totals" className="grid gap-3">
        <h2 id="totals" className="text-heading-md font-semibold">
          {t('totals')}
        </h2>
        <p
          role="status"
          data-testid="ledger-match"
          data-match={matches}
          className={
            matches
              ? 'flex items-center gap-2 rounded-lg bg-success-subtle px-4 py-3 text-body-sm font-medium text-success-subtle-foreground'
              : 'flex items-center gap-2 rounded-lg bg-danger-subtle px-4 py-3 text-body-sm font-medium text-danger-subtle-foreground'
          }
        >
          {matches ? (
            <CircleCheck aria-hidden className="size-5" />
          ) : (
            <CircleAlert aria-hidden className="size-5" />
          )}
          {matches ? t('match') : t('mismatch')}
        </p>
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <Table>
            <TableCaption className="sr-only">{t('totals')}</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>{t('columns.line')}</TableHead>
                <TableHead className="text-right">{t('columns.ledger')}</TableHead>
                <TableHead className="text-right">{t('columns.orders')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ROWS.map((k) => (
                <TableRow key={k} data-testid={`total-${k}`}>
                  <TableCell>{t(`rows.${k}`)}</TableCell>
                  <TableCell className="text-right tabular-nums" data-source="ledger">
                    {money(totals.ledger[k])}
                  </TableCell>
                  <TableCell className="text-right tabular-nums" data-source="orders">
                    {money(totals.orders[k])}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <p className="text-body-sm text-muted-foreground">{t('note')}</p>
      </section>

      <section aria-labelledby="balances" className="grid gap-3">
        <h2 id="balances" className="text-heading-md font-semibold">
          {t('balances')}
        </h2>
        {balances.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border px-6 py-10 text-center text-muted-foreground">
            {t('noBalances')}
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <Table>
              <TableCaption className="sr-only">{t('balances')}</TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('columns.vendor')}</TableHead>
                  <TableHead className="text-right">{t('columns.pending')}</TableHead>
                  <TableHead className="text-right">{t('columns.inSettlement')}</TableHead>
                  <TableHead className="text-right">{t('columns.paid')}</TableHead>
                  <TableHead className="text-right">{t('columns.lifetime')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {balances.map((b) => (
                  <TableRow key={b.vendorId}>
                    <TableCell>{b.name}</TableCell>
                    <TableCell className="text-right tabular-nums">{money(b.pendingOre)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {money(b.inSettlementOre)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{money(b.paidOre)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {money(b.lifetimeOre)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </div>
  );
}
