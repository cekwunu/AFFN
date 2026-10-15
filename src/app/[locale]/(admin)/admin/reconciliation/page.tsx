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
import { currentOrganization, getCurrentUser } from '@/lib/auth/server';
import { formatDateTimeOslo, formatNok } from '@/lib/format';
import { ore } from '@/lib/money';
import { reconciliationOverview, staffDirectory } from '@/lib/reconciliation/queries';
import { runNow, updateItem } from './actions';

export const metadata: Metadata = { robots: { index: false } };

/** Reconciliation against the payment provider (TRX-02): runs and mismatches to act on. */
export default async function ReconciliationPage({
  params,
  searchParams,
}: PageProps<'/[locale]/admin/reconciliation'>) {
  const locale = initRequestLocale((await params).locale);
  const t = await getTranslations('Reconciliation');
  const user = (await getCurrentUser())!;
  const organization = await currentOrganization();
  const query = await searchParams;
  const show = query.show === 'resolved' ? 'resolved' : 'open';
  const [{ runs, items }, staff] = await Promise.all([
    reconciliationOverview(organization.id, show),
    staffDirectory(organization.id),
  ]);
  const notice = typeof query.notice === 'string' ? query.notice : null;
  const error = typeof query.error === 'string' ? query.error : null;
  const money = (v: number | null) => (v === null ? '–' : formatNok(ore(v)));
  const control = `${fieldControlClasses} h-11 px-3`;
  const last = runs[0];

  return (
    <div className="grid gap-8">
      <header className="grid gap-1">
        <h1 className="font-display text-display-md font-semibold">{t('title')}</h1>
        <p className="max-w-3xl text-body text-muted-foreground">{t('intro')}</p>
      </header>

      {notice && (
        <p
          role="status"
          className="rounded-lg bg-success-subtle px-4 py-3 text-body-sm font-medium text-success-subtle-foreground"
        >
          {t(`notices.${notice as 'ran'}`, {
            matched: Number(query.matched ?? 0),
            mismatches: Number(query.mismatches ?? 0),
          })}
        </p>
      )}
      {error && (
        <p
          role="alert"
          className="rounded-lg bg-danger-subtle px-4 py-3 text-body-sm font-medium text-danger-subtle-foreground"
        >
          {t(`errors.${error as 'failed'}`)}
        </p>
      )}

      <section aria-labelledby="run" className="grid gap-3">
        <h2 id="run" className="text-heading-md font-semibold">
          {t('run.title')}
        </h2>
        <p className="text-body-sm text-muted-foreground">
          {last
            ? t('run.last', {
                time: formatDateTimeOslo(last.created_at, locale),
                matched: last.matched_count,
                mismatches: last.mismatch_count,
              })
            : t('run.never')}{' '}
          {t('run.schedule')}
        </p>
        <form action={runNow} className="flex flex-wrap items-end gap-3">
          <label className="grid gap-1.5 text-body-sm font-medium">
            {t('run.from')}
            <input type="date" name="from" className={control} />
          </label>
          <label className="grid gap-1.5 text-body-sm font-medium">
            {t('run.to')}
            <input type="date" name="to" className={control} />
          </label>
          <button type="submit" className={buttonVariants({ size: 'lg' })}>
            {t('run.now')}
          </button>
        </form>
        {runs.length > 0 && (
          <div className="rounded-xl border border-border bg-card">
            <Table data-testid="runs">
              <TableCaption className="sr-only">{t('run.history')}</TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('run.time')}</TableHead>
                  <TableHead>{t('run.period')}</TableHead>
                  <TableHead className="text-right">{t('run.provider')}</TableHead>
                  <TableHead className="text-right">{t('run.matched')}</TableHead>
                  <TableHead className="text-right">{t('run.mismatches')}</TableHead>
                  <TableHead>{t('run.by')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {runs.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="whitespace-nowrap">
                      {formatDateTimeOslo(r.created_at, locale)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {formatDateTimeOslo(r.period_from, locale)} –{' '}
                      {formatDateTimeOslo(r.period_to, locale)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{r.provider_count}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.matched_count}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.mismatch_count}</TableCell>
                    <TableCell>
                      {r.triggered_by ? (staff.get(r.triggered_by) ?? '—') : t('run.scheduled')}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      <section aria-labelledby="items" className="grid gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="items" className="text-heading-md font-semibold">
            {show === 'open' ? t('items.open') : t('items.resolved')}
          </h2>
          <Link
            href={show === 'open' ? '/admin/reconciliation?show=resolved' : '/admin/reconciliation'}
            className="text-body-sm text-link underline-offset-4 hover:underline"
          >
            {show === 'open' ? t('items.showResolved') : t('items.showOpen')}
          </Link>
        </div>
        {items.length === 0 ? (
          <p
            data-testid="no-mismatches"
            className="rounded-xl border border-dashed border-border px-6 py-8 text-center text-muted-foreground"
          >
            {show === 'open' ? t('items.none') : t('items.noneResolved')}
          </p>
        ) : (
          <ul className="grid gap-3" data-testid="mismatches">
            {items.map((i) => (
              <li
                key={i.id}
                id={`item-${i.id}`}
                data-testid="mismatch"
                data-kind={i.kind}
                data-provider-id={i.provider_id}
                className="grid scroll-mt-20 gap-3 rounded-xl border border-border bg-card p-5"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="danger">{t(`kinds.${i.kind}`)}</Badge>
                  <Badge variant="outline">{t(`transaction.${i.transaction_kind}`)}</Badge>
                  <span className="font-mono text-caption">{i.provider_id}</span>
                  <span className="ml-auto">
                    <Badge
                      variant={
                        i.status === 'resolved'
                          ? 'success'
                          : i.status === 'assigned'
                            ? 'info'
                            : 'warning'
                      }
                    >
                      {t(`status.${i.status}`)}
                      {i.assigned_to &&
                        i.status === 'assigned' &&
                        ` · ${staff.get(i.assigned_to) ?? '—'}`}
                    </Badge>
                  </span>
                </div>
                <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-body-sm sm:grid-cols-4">
                  <dt className="text-muted-foreground">{t('fields.ours')}</dt>
                  <dd className="tabular-nums">{money(i.our_amount_ore)}</dd>
                  <dt className="text-muted-foreground">{t('fields.theirs')}</dt>
                  <dd className="tabular-nums">{money(i.their_amount_ore)}</dd>
                  <dt className="text-muted-foreground">{t('fields.ourFee')}</dt>
                  <dd className="tabular-nums">{money(i.our_fee_ore)}</dd>
                  <dt className="text-muted-foreground">{t('fields.theirFee')}</dt>
                  <dd className="tabular-nums">{money(i.their_fee_ore)}</dd>
                  <dt className="text-muted-foreground">{t('fields.time')}</dt>
                  <dd>{i.occurred_at ? formatDateTimeOslo(i.occurred_at, locale) : '–'}</dd>
                </dl>
                {(i.payment_id || i.refund_id || i.payout_id) && (
                  <Link
                    href={`/admin/transactions?open=${i.payment_id ? `payment:${i.payment_id}` : i.refund_id ? `refund:${i.refund_id}` : `payout:${i.payout_id}`}`}
                    className="w-fit text-body-sm text-link underline-offset-4 hover:underline"
                  >
                    {t('items.openTransaction')}
                  </Link>
                )}
                {i.comments.length > 0 && (
                  <ul className="grid gap-1 border-l-2 border-border pl-3 text-body-sm">
                    {i.comments.map((c) => (
                      <li key={c.id}>
                        <span className="font-medium">{staff.get(c.author_id) ?? '—'}</span>{' '}
                        <span className="text-muted-foreground">
                          {formatDateTimeOslo(c.created_at, locale)}
                        </span>
                        <p>{c.body}</p>
                      </li>
                    ))}
                  </ul>
                )}
                {i.status === 'resolved' ? (
                  <div className="flex flex-wrap items-center gap-3 text-body-sm">
                    <p>
                      <span className="font-semibold">{t('fields.resolution')}:</span>{' '}
                      {i.resolution_reason}
                      {i.resolved_by && ` (${staff.get(i.resolved_by) ?? '—'})`}
                    </p>
                    <form action={updateItem}>
                      <input type="hidden" name="item" value={i.id} />
                      <input type="hidden" name="action" value="reopen" />
                      <button
                        type="submit"
                        className={buttonVariants({ variant: 'ghost', size: 'sm' })}
                      >
                        {t('actions.reopen')}
                      </button>
                    </form>
                  </div>
                ) : (
                  <div className="grid gap-3 lg:grid-cols-3">
                    <form action={updateItem} className="flex items-end gap-2">
                      <input type="hidden" name="item" value={i.id} />
                      <input type="hidden" name="action" value="assign" />
                      <label className="grid flex-1 gap-1.5 text-body-sm font-medium">
                        {t('actions.assignTo')}
                        <select
                          name="assignee"
                          defaultValue={i.assigned_to ?? user.id}
                          className={control}
                        >
                          {[...staff].map(([id, email]) => (
                            <option key={id} value={id}>
                              {email}
                            </option>
                          ))}
                        </select>
                      </label>
                      <button type="submit" className={buttonVariants({ variant: 'outline' })}>
                        {t('actions.assign')}
                      </button>
                    </form>
                    <form action={updateItem} className="flex items-end gap-2">
                      <input type="hidden" name="item" value={i.id} />
                      <input type="hidden" name="action" value="comment" />
                      <label className="grid flex-1 gap-1.5 text-body-sm font-medium">
                        {t('actions.comment')}
                        <input name="body" maxLength={2000} className={control} />
                      </label>
                      <button type="submit" className={buttonVariants({ variant: 'outline' })}>
                        {t('actions.addComment')}
                      </button>
                    </form>
                    <form action={updateItem} className="flex items-end gap-2">
                      <input type="hidden" name="item" value={i.id} />
                      <input type="hidden" name="action" value="resolve" />
                      <label className="grid flex-1 gap-1.5 text-body-sm font-medium">
                        {t('actions.reason')}
                        <input name="reason" maxLength={500} className={control} />
                      </label>
                      <button type="submit" className={buttonVariants()}>
                        {t('actions.resolve')}
                      </button>
                    </form>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
