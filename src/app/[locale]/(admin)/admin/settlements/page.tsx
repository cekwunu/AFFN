import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { NewSettlementForm } from '@/components/admin/new-settlement-form';
import { ClientIntl } from '@/components/client-intl';
import { SettlementBadge } from '@/components/admin/settlement-badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Link } from '@/i18n/link';
import { initRequestLocale } from '@/i18n/server';
import { formatDateTimeOslo, formatNok } from '@/lib/format';
import { ore } from '@/lib/money';
import { listSettlements, OPEN_STATUSES, settleableVendors } from '@/lib/settlements/server';
import { currentApplicationEvent } from '@/lib/vendor/server';
import { createSettlement } from './actions';

export const metadata: Metadata = { robots: { index: false } };

/** Settlement queue and history for the current event, and a new batch (SET-02). */
export default async function SettlementsPage({
  params,
}: PageProps<'/[locale]/admin/settlements'>) {
  const locale = initRequestLocale((await params).locale);
  const t = await getTranslations('Settlements');
  const event = await currentApplicationEvent();
  if (!event) return <h1 className="font-display text-display-md font-semibold">{t('title')}</h1>;
  const [batches, vendors] = await Promise.all([
    listSettlements(event.id),
    settleableVendors(event.id),
  ]);
  const queue = batches.filter((b) => OPEN_STATUSES.includes(b.status));
  const history = batches.filter((b) => !OPEN_STATUSES.includes(b.status));

  const table = (rows: typeof batches, caption: string, testId: string) =>
    rows.length === 0 ? (
      <p className="rounded-xl border border-dashed border-border px-6 py-8 text-center text-muted-foreground">
        {t('empty')}
      </p>
    ) : (
      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <Table data-testid={testId}>
          <TableCaption className="sr-only">{caption}</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead>{t('columns.batch')}</TableHead>
              <TableHead>{t('columns.cutoff')}</TableHead>
              <TableHead>{t('columns.status')}</TableHead>
              <TableHead className="text-right">{t('columns.vendors')}</TableHead>
              <TableHead className="text-right">{t('columns.net')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((b) => (
              <TableRow key={b.id}>
                <TableCell>
                  <Link
                    href={`/admin/settlements/${b.id}`}
                    className="font-medium text-link underline-offset-4 hover:underline"
                  >
                    {b.notes || t('batchOf', { date: formatDateTimeOslo(b.created_at, locale) })}
                  </Link>
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  {formatDateTimeOslo(b.cutoff_at, locale)}
                </TableCell>
                <TableCell>
                  <SettlementBadge status={b.status} label={t(`status.${b.status}`)} />
                </TableCell>
                <TableCell className="text-right tabular-nums">{b.vendors}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatNok(ore(b.netOre))}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );

  return (
    <div className="grid gap-8">
      <header className="grid gap-1">
        <h1 className="font-display text-display-md font-semibold">{t('title')}</h1>
        <p className="max-w-3xl text-body text-muted-foreground">
          {t('intro', { event: event.name })}
        </p>
      </header>

      <section aria-labelledby="new-batch" className="grid gap-3">
        <h2 id="new-batch" className="text-heading-md font-semibold">
          {t('new.title')}
        </h2>
        <Card>
          <CardContent className="pt-6">
            <ClientIntl namespaces={['Components', 'Settlements']}>
              <NewSettlementForm action={createSettlement} vendors={vendors} />
            </ClientIntl>
          </CardContent>
        </Card>
      </section>

      <section aria-labelledby="queue" className="grid gap-3">
        <h2 id="queue" className="text-heading-md font-semibold">
          {t('queue')}
        </h2>
        {table(queue, t('queue'), 'settlement-queue')}
      </section>
      <section aria-labelledby="history" className="grid gap-3">
        <h2 id="history" className="text-heading-md font-semibold">
          {t('history')}
        </h2>
        {table(history, t('history'), 'settlement-history')}
      </section>
    </div>
  );
}
