import { X } from 'lucide-react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button-variants';
import { fieldControlClasses } from '@/components/ui/field-classes';
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
import { settleableVendors } from '@/lib/settlements/server';
import {
  listTransactions,
  transactionDetail,
  TRANSACTIONS_PAGE_SIZE,
  type TransactionFilters,
  type TransactionKind,
} from '@/lib/transactions/server';
import { currentApplicationEvent } from '@/lib/vendor/server';

export const metadata: Metadata = { robots: { index: false } };

const KINDS: TransactionKind[] = ['payment', 'refund', 'payout'];
const STATUSES = ['pending', 'succeeded', 'failed', 'cancelled', 'in_transit', 'paid'];
const METHODS = ['vipps', 'card', 'apple_pay', 'google_pay'];
const FILTER_KEYS = [
  'q',
  'kind',
  'vendor',
  'status',
  'method',
  'min',
  'max',
  'from',
  'to',
] as const;

/** Transaction centre (TRX-01): search, filters and a detail drawer. */
export default async function TransactionsPage({
  params,
  searchParams,
}: PageProps<'/[locale]/admin/transactions'>) {
  const locale = initRequestLocale((await params).locale);
  const t = await getTranslations('Transactions');
  const event = await currentApplicationEvent();
  if (!event) return <h1 className="font-display text-display-md font-semibold">{t('title')}</h1>;
  const query = await searchParams;
  const one = (k: string) =>
    typeof query[k] === 'string' ? (query[k] as string).slice(0, 80) : undefined;
  const date = (k: string) => (/^\d{4}-\d{2}-\d{2}$/.test(one(k) ?? '') ? one(k) : undefined);
  const filters: TransactionFilters = {
    q: one('q'),
    kind: KINDS.find((k) => k === one('kind')),
    vendor: /^[0-9a-f-]{36}$/.test(one('vendor') ?? '') ? one('vendor') : undefined,
    status: STATUSES.find((s) => s === one('status')),
    method: METHODS.find((m) => m === one('method')),
    min: one('min'),
    max: one('max'),
    from: date('from'),
    to: date('to'),
    page: Number(one('page')) || 1,
  };
  const [{ rows, total, page }, vendors] = await Promise.all([
    listTransactions(event.id, filters),
    settleableVendors(event.id),
  ]);
  const names = new Map(vendors.map((v) => [v.vendorId, v.name]));
  const [openKind, openId] = (one('open') ?? '').split(':');
  const detail =
    KINDS.includes(openKind as TransactionKind) && /^[0-9a-f-]{36}$/.test(openId ?? '')
      ? await transactionDetail(openKind as TransactionKind, openId!)
      : null;
  const pages = Math.max(1, Math.ceil(total / TRANSACTIONS_PAGE_SIZE));
  const href = (changes: Record<string, string | undefined>) => {
    const search = new URLSearchParams();
    for (const k of [...FILTER_KEYS, 'page', 'open']) {
      const v = k in changes ? changes[k] : one(k);
      if (v) search.set(k, v);
    }
    const s = search.toString();
    return `/admin/transactions${s ? `?${s}` : ''}`;
  };
  const money = (v: number | null) => (v === null ? '–' : formatNok(ore(v)));
  const control = `${fieldControlClasses} h-11 px-3`;

  return (
    <div className="grid gap-6">
      <header className="grid gap-1">
        <h1 className="font-display text-display-md font-semibold">{t('title')}</h1>
        <p className="max-w-3xl text-body text-muted-foreground">
          {t('intro', { event: event.name })}
        </p>
      </header>

      <form
        method="get"
        role="search"
        className="grid gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-3 lg:grid-cols-5"
      >
        <label className="grid gap-1.5 text-body-sm font-medium sm:col-span-2">
          {t('filters.q')}
          <input
            type="search"
            name="q"
            defaultValue={filters.q ?? ''}
            placeholder={t('filters.qHint')}
            className={control}
          />
        </label>
        <label className="grid gap-1.5 text-body-sm font-medium">
          {t('filters.kind')}
          <select name="kind" defaultValue={filters.kind ?? ''} className={control}>
            <option value="">{t('filters.all')}</option>
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {t(`kinds.${k}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1.5 text-body-sm font-medium">
          {t('filters.vendor')}
          <select name="vendor" defaultValue={filters.vendor ?? ''} className={control}>
            <option value="">{t('filters.all')}</option>
            {vendors.map((v) => (
              <option key={v.vendorId} value={v.vendorId}>
                {v.name}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1.5 text-body-sm font-medium">
          {t('filters.status')}
          <select name="status" defaultValue={filters.status ?? ''} className={control}>
            <option value="">{t('filters.all')}</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`statuses.${s as 'paid'}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1.5 text-body-sm font-medium">
          {t('filters.method')}
          <select name="method" defaultValue={filters.method ?? ''} className={control}>
            <option value="">{t('filters.all')}</option>
            {METHODS.map((m) => (
              <option key={m} value={m}>
                {t(`methods.${m as 'vipps'}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1.5 text-body-sm font-medium">
          {t('filters.min')}
          <input
            name="min"
            inputMode="decimal"
            defaultValue={filters.min ?? ''}
            className={control}
          />
        </label>
        <label className="grid gap-1.5 text-body-sm font-medium">
          {t('filters.max')}
          <input
            name="max"
            inputMode="decimal"
            defaultValue={filters.max ?? ''}
            className={control}
          />
        </label>
        <label className="grid gap-1.5 text-body-sm font-medium">
          {t('filters.from')}
          <input type="date" name="from" defaultValue={filters.from ?? ''} className={control} />
        </label>
        <label className="grid gap-1.5 text-body-sm font-medium">
          {t('filters.to')}
          <input type="date" name="to" defaultValue={filters.to ?? ''} className={control} />
        </label>
        <div className="flex items-end gap-2 sm:col-span-3 lg:col-span-5">
          <button type="submit" className={buttonVariants({ variant: 'secondary' })}>
            {t('filters.apply')}
          </button>
          <Link href="/admin/transactions" className={buttonVariants({ variant: 'ghost' })}>
            {t('filters.clear')}
          </Link>
          <p className="ml-auto text-body-sm text-muted-foreground" role="status">
            {t('count', { total })}
          </p>
        </div>
      </form>

      <div className={detail ? 'grid gap-6 xl:grid-cols-[minmax(0,1fr)_28rem]' : 'grid gap-6'}>
        <div className="grid content-start gap-4">
          {rows.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border px-6 py-10 text-center text-muted-foreground">
              {t('empty')}
            </p>
          ) : (
            <div className="rounded-xl border border-border bg-card">
              <Table data-testid="transactions">
                <TableCaption className="sr-only">{t('title')}</TableCaption>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('columns.time')}</TableHead>
                    <TableHead>{t('columns.kind')}</TableHead>
                    <TableHead>{t('columns.vendor')}</TableHead>
                    <TableHead>{t('columns.order')}</TableHead>
                    <TableHead>{t('columns.status')}</TableHead>
                    <TableHead className="text-right">{t('columns.amount')}</TableHead>
                    <TableHead className="text-right">{t('columns.fee')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow
                      key={`${r.kind}:${r.id}`}
                      data-testid="transaction"
                      data-provider-id={r.provider_id ?? ''}
                    >
                      <TableCell className="whitespace-nowrap">
                        <Link
                          href={href({ open: `${r.kind}:${r.id}` })}
                          className="font-medium text-link underline-offset-4 hover:underline"
                          aria-label={t('open', { id: r.provider_id ?? r.id!.slice(0, 8) })}
                        >
                          {formatDateTimeOslo(r.occurred_at!, locale)}
                        </Link>
                      </TableCell>
                      <TableCell>{t(`kinds.${r.kind!}`)}</TableCell>
                      <TableCell>{names.get(r.vendor_id!) ?? '–'}</TableCell>
                      <TableCell className="tabular-nums">{r.order_code ?? '–'}</TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            ['succeeded', 'paid'].includes(r.status!)
                              ? 'success'
                              : r.status === 'failed'
                                ? 'danger'
                                : 'neutral'
                          }
                        >
                          {t(`statuses.${r.status as 'paid'}`)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {money(r.amount_ore)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{money(r.fee_ore)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          {pages > 1 && (
            <nav aria-label={t('pagination')} className="flex items-center justify-between">
              {page > 1 ? (
                <Link
                  href={href({ page: String(page - 1), open: undefined })}
                  className={buttonVariants({ variant: 'outline' })}
                >
                  {t('previous')}
                </Link>
              ) : (
                <span />
              )}
              <p className="text-body-sm text-muted-foreground">{t('page', { page, pages })}</p>
              {page < pages ? (
                <Link
                  href={href({ page: String(page + 1), open: undefined })}
                  className={buttonVariants({ variant: 'outline' })}
                >
                  {t('next')}
                </Link>
              ) : (
                <span />
              )}
            </nav>
          )}
        </div>

        {detail && (
          <aside
            aria-labelledby="tx-detail"
            data-testid="transaction-detail"
            className="grid content-start gap-5 rounded-xl border border-border bg-card p-5 xl:sticky xl:top-4 xl:max-h-[calc(100dvh-2rem)] xl:overflow-y-auto"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="grid gap-1">
                <h2 id="tx-detail" className="text-heading-md font-semibold">
                  {t(`kinds.${detail.kind!}`)} {detail.order_code ? `· ${detail.order_code}` : ''}
                </h2>
                <p className="font-mono text-caption text-muted-foreground">
                  {detail.provider_id ?? '–'}
                </p>
              </div>
              <Link
                href={href({ open: undefined })}
                className={buttonVariants({ variant: 'ghost', size: 'icon-sm' })}
                aria-label={t('detail.close')}
              >
                <X aria-hidden />
              </Link>
            </div>
            <dl className="grid grid-cols-2 gap-2 text-body-sm">
              <dt className="text-muted-foreground">{t('columns.amount')}</dt>
              <dd className="text-right tabular-nums">{money(detail.amount_ore)}</dd>
              <dt className="text-muted-foreground">{t('columns.fee')}</dt>
              <dd className="text-right tabular-nums">{money(detail.fee_ore)}</dd>
              {detail.psp_fee_ore !== null && (
                <>
                  <dt className="text-muted-foreground">{t('detail.pspFee')}</dt>
                  <dd className="text-right tabular-nums">{money(detail.psp_fee_ore)}</dd>
                </>
              )}
              <dt className="text-muted-foreground">{t('columns.vendor')}</dt>
              <dd className="text-right">{names.get(detail.vendor_id!) ?? '–'}</dd>
              {detail.method && (
                <>
                  <dt className="text-muted-foreground">{t('filters.method')}</dt>
                  <dd className="text-right">{t(`methods.${detail.method}`)}</dd>
                </>
              )}
            </dl>

            {detail.items.length > 0 && (
              <section aria-labelledby="tx-items" className="grid gap-2">
                <h3 id="tx-items" className="text-heading-sm font-semibold">
                  {t('detail.items')}
                </h3>
                <ul className="grid gap-1 text-body-sm">
                  {detail.items.map((i, n) => (
                    <li key={n} className="flex justify-between gap-2">
                      <span>
                        {i.quantity}× {i.product_name}
                      </span>
                      <span className="tabular-nums">{money(i.line_total_ore)}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section aria-labelledby="tx-ledger" className="grid gap-2">
              <h3 id="tx-ledger" className="text-heading-sm font-semibold">
                {t('detail.ledger')}
              </h3>
              {detail.ledger.length === 0 ? (
                <p className="text-body-sm text-muted-foreground">{t('detail.none')}</p>
              ) : (
                <ul className="grid gap-1 text-body-sm" data-testid="tx-ledger">
                  {detail.ledger.map((l) => (
                    <li key={l.id} className="grid grid-cols-[1fr_auto_auto] gap-2">
                      <span>{t(`accounts.${l.account as 'psp_clearing'}`)}</span>
                      <span className="text-muted-foreground">
                        {t(`directions.${l.direction}`)}
                      </span>
                      <span className="text-right tabular-nums">{money(l.amount_ore)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section aria-labelledby="tx-webhooks" className="grid gap-2">
              <h3 id="tx-webhooks" className="text-heading-sm font-semibold">
                {t('detail.webhooks')}
              </h3>
              {detail.webhooks.length === 0 ? (
                <p className="text-body-sm text-muted-foreground">{t('detail.noneOrRestricted')}</p>
              ) : (
                <ul className="grid gap-2 text-body-sm" data-testid="tx-webhooks">
                  {detail.webhooks.map((w) => (
                    <li key={w.id} className="grid gap-0.5">
                      <span className="font-medium">
                        {w.event_type} · {formatDateTimeOslo(w.received_at, locale)}
                      </span>
                      <span className="text-caption text-muted-foreground">
                        {w.attempts.map((a) => t(`outcomes.${a.outcome}`)).join(', ')}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section aria-labelledby="tx-audit" className="grid gap-2">
              <h3 id="tx-audit" className="text-heading-sm font-semibold">
                {t('detail.audit')}
              </h3>
              {detail.audit.length === 0 ? (
                <p className="text-body-sm text-muted-foreground">{t('detail.noneOrRestricted')}</p>
              ) : (
                <ul className="grid gap-1 text-body-sm" data-testid="tx-audit">
                  {detail.audit.map((a) => (
                    <li key={a.id}>
                      {formatDateTimeOslo(a.created_at, locale)} · {a.table_name} ·{' '}
                      {a.status ?? a.action}
                      {a.reason ? ` — ${a.reason}` : ''}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </aside>
        )}
      </div>
    </div>
  );
}
