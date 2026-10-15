import { ChefHat } from 'lucide-react';
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
import { getOrderHistory, HISTORY_PAGE_SIZE, myKitchen } from '@/lib/orders/server';
import type { OrderStatus } from '@/lib/orders/status';

export const metadata: Metadata = { robots: { index: false } };

const STATUSES: OrderStatus[] = ['new', 'accepted', 'preparing', 'ready', 'collected', 'cancelled'];
const BADGE: Record<OrderStatus, 'neutral' | 'info' | 'warning' | 'success' | 'danger'> = {
  pending_payment: 'neutral',
  new: 'info',
  accepted: 'info',
  preparing: 'warning',
  ready: 'success',
  collected: 'neutral',
  cancelled: 'danger',
};

/** The vendor's orders at the current event, newest first, with filters (ORD-01). */
export default async function OrdersPage({
  params,
  searchParams,
}: PageProps<'/[locale]/vendor/orders'>) {
  const locale = initRequestLocale((await params).locale);
  const t = await getTranslations('Orders');
  const tK = await getTranslations('Kitchen');
  const kitchen = await myKitchen();
  const query = await searchParams;
  const one = (v: string | string[] | undefined) => (typeof v === 'string' ? v : undefined);
  const status = STATUSES.find((s) => s === one(query.status));
  const date = /^\d{4}-\d{2}-\d{2}$/.test(one(query.date) ?? '') ? one(query.date) : undefined;
  const q = one(query.q)?.slice(0, 40);
  const page = Math.max(1, Number(one(query.page)) || 1);

  const header = (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="grid gap-1">
        <h1 className="font-display text-display-md font-semibold">{t('title')}</h1>
        <p className="text-body text-muted-foreground">{t('intro')}</p>
      </div>
      {kitchen && (
        <Link href="/vendor/kitchen" className={buttonVariants({ size: 'lg' })}>
          <ChefHat aria-hidden />
          {t('openKitchen')}
        </Link>
      )}
    </header>
  );
  if (!kitchen) {
    return (
      <div className="grid gap-6">
        {header}
        <p className="rounded-xl border border-border bg-card p-6 text-body text-muted-foreground">
          {tK('notApproved')}
        </p>
      </div>
    );
  }

  const { orders, total } = await getOrderHistory(kitchen.participation.id, {
    status,
    date,
    q,
    page,
  });
  const pages = Math.max(1, Math.ceil(total / HISTORY_PAGE_SIZE));
  const pageHref = (n: number) => {
    const search = new URLSearchParams();
    if (status) search.set('status', status);
    if (date) search.set('date', date);
    if (q) search.set('q', q);
    if (n > 1) search.set('page', String(n));
    const s = search.toString();
    return `/vendor/orders${s ? `?${s}` : ''}`;
  };

  return (
    <div className="grid gap-6">
      {header}
      <form method="get" className="flex flex-wrap items-end gap-3" role="search">
        <label className="grid gap-1.5 text-body-sm font-medium">
          {t('filters.status')}
          <select
            name="status"
            defaultValue={status ?? ''}
            className={`${fieldControlClasses} h-11 px-3`}
          >
            <option value="">{t('filters.all')}</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {tK(`status.${s}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1.5 text-body-sm font-medium">
          {t('filters.date')}
          <input
            type="date"
            name="date"
            defaultValue={date ?? ''}
            className={`${fieldControlClasses} h-11 px-3`}
          />
        </label>
        <label className="grid gap-1.5 text-body-sm font-medium">
          {t('filters.search')}
          <input
            type="search"
            name="q"
            defaultValue={q ?? ''}
            placeholder={t('filters.searchHint')}
            className={`${fieldControlClasses} h-11 px-3`}
          />
        </label>
        <button type="submit" className={buttonVariants({ variant: 'secondary' })}>
          {t('filters.apply')}
        </button>
        {(status || date || q) && (
          <Link href="/vendor/orders" className={buttonVariants({ variant: 'ghost' })}>
            {t('filters.clear')}
          </Link>
        )}
      </form>

      {orders.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-6 py-10 text-center text-muted-foreground">
          {t('empty')}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <Table>
            <TableCaption className="sr-only">{t('title')}</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>{t('columns.code')}</TableHead>
                <TableHead>{t('columns.time')}</TableHead>
                <TableHead>{t('columns.items')}</TableHead>
                <TableHead>{t('columns.customer')}</TableHead>
                <TableHead>{t('columns.status')}</TableHead>
                <TableHead className="text-right">{t('columns.total')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.map((o) => (
                <TableRow key={o.id} data-testid="history-row">
                  <TableCell className="font-semibold tabular-nums">{o.order_code}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    {formatDateTimeOslo(o.paid_at ?? o.created_at, locale)}
                  </TableCell>
                  <TableCell>
                    {o.items.map((i) => `${i.quantity}× ${i.product_name}`).join(', ')}
                  </TableCell>
                  <TableCell>{o.customer_name ?? '–'}</TableCell>
                  <TableCell>
                    <Badge variant={BADGE[o.status]}>{tK(`status.${o.status}`)}</Badge>
                    {o.cancel_reason && (
                      <span className="mt-1 block text-caption text-muted-foreground">
                        {o.cancel_reason}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatNok(ore(o.total_ore))}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {pages > 1 && (
        <nav aria-label={t('pagination')} className="flex items-center justify-between gap-4">
          {page > 1 ? (
            <Link href={pageHref(page - 1)} className={buttonVariants({ variant: 'outline' })}>
              {t('previous')}
            </Link>
          ) : (
            <span />
          )}
          <p className="text-body-sm text-muted-foreground">{t('page', { page, pages, total })}</p>
          {page < pages ? (
            <Link href={pageHref(page + 1)} className={buttonVariants({ variant: 'outline' })}>
              {t('next')}
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </div>
  );
}
