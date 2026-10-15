import { CircleAlert, CircleCheck } from 'lucide-react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { SettlementBadge } from '@/components/admin/settlement-badge';
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
import { getCurrentUser } from '@/lib/auth/server';
import { formatDateTimeOslo, formatNok } from '@/lib/format';
import { ore } from '@/lib/money';
import { getPaymentProvider } from '@/lib/payments';
import { getSettlement, type SettlementStatus } from '@/lib/settlements/server';
import {
  addAdjustment,
  approveAdjustment,
  deleteAdjustment,
  refreshLines,
  releaseSettlement,
  setSettlementStatus,
  simulateDispute,
} from '../actions';

export const metadata: Metadata = { robots: { index: false } };

const STEPS: SettlementStatus[] = ['draft', 'prepared', 'approved', 'releasing', 'completed'];

/** One settlement batch (SET-02 … SET-05): blockers, lines, adjustments, approval, payouts. */
export default async function SettlementPage({
  params,
  searchParams,
}: PageProps<'/[locale]/admin/settlements/[id]'>) {
  const { locale: rawLocale, id } = await params;
  const locale = initRequestLocale(rawLocale);
  const t = await getTranslations('Settlements');
  const settlement = /^[0-9a-f-]{36}$/.test(id) ? await getSettlement(id) : null;
  if (!settlement) notFound();
  const user = (await getCurrentUser())!;
  const query = await searchParams;
  const notice = typeof query.notice === 'string' ? query.notice : null;
  const error = typeof query.error === 'string' ? query.error : null;
  const isOrgAdmin = user.access.roles.some(
    (r) => r.org === settlement.organization_id && r.role === 'org_admin' && r.status === 'active',
  );
  const testMode = getPaymentProvider().testMode;
  const { status } = settlement;
  const draft = status === 'draft';
  const money = (v: number) => formatNok(ore(v));
  const total = (
    key:
      | 'gross_sales_ore'
      | 'refunds_ore'
      | 'commission_ore'
      | 'commission_mva_ore'
      | 'adjustments_ore'
      | 'net_payout_ore',
  ) => settlement.lines.reduce((sum, l) => sum + l[key], 0);
  const hidden = <input type="hidden" name="id" value={settlement.id} />;
  const stepIndex = STEPS.indexOf(status === 'completed_with_failures' ? 'releasing' : status);
  const fixLink = (kind: string, eventVendorId: string | null) =>
    kind === 'payout_account' && eventVendorId
      ? { href: `/admin/applications/${eventVendorId}`, label: t('blockers.fix.payout_account') }
      : kind === 'negative'
        ? { href: '#adjustments', label: t('blockers.fix.negative') }
        : kind === 'dispute' && eventVendorId
          ? { href: `/admin/applications/${eventVendorId}`, label: t('blockers.fix.dispute') }
          : null;

  const statusButton = (
    to: string,
    label: string,
    variant: 'primary' | 'outline' | 'danger' = 'primary',
  ) => (
    <form action={setSettlementStatus}>
      {hidden}
      <input type="hidden" name="to" value={to} />
      <button type="submit" className={buttonVariants({ variant, size: 'lg' })}>
        {label}
      </button>
    </form>
  );

  return (
    <div className="grid gap-8">
      <header className="grid gap-3">
        <Link
          href="/admin/settlements"
          className="w-fit text-body-sm text-link underline-offset-4 hover:underline"
        >
          {t('backToList')}
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-display text-display-md font-semibold">
            {settlement.notes ||
              t('batchOf', { date: formatDateTimeOslo(settlement.created_at, locale) })}
          </h1>
          <SettlementBadge status={status} label={t(`status.${status}`)} />
        </div>
        <p className="text-body text-muted-foreground">
          {t('cutoffAt', { time: formatDateTimeOslo(settlement.cutoff_at, locale) })}
          {settlement.prepared_at &&
            ` · ${t('preparedAt', { time: formatDateTimeOslo(settlement.prepared_at, locale) })}`}
          {settlement.approved_at &&
            ` · ${t('approvedAt', { time: formatDateTimeOslo(settlement.approved_at, locale) })}`}
        </p>
        {status !== 'cancelled' && (
          <ol className="flex flex-wrap gap-2" aria-label={t('steps')}>
            {STEPS.map((step, i) => (
              <li
                key={step}
                aria-current={i === stepIndex ? 'step' : undefined}
                className={
                  i <= stepIndex
                    ? 'rounded-full bg-primary px-3 py-1 text-caption font-semibold text-primary-foreground'
                    : 'rounded-full bg-muted px-3 py-1 text-caption text-muted-foreground'
                }
              >
                {t(`status.${step}`)}
              </li>
            ))}
          </ol>
        )}
      </header>

      {notice && (
        <p
          role="status"
          className="rounded-lg bg-success-subtle px-4 py-3 text-body-sm font-medium text-success-subtle-foreground"
        >
          {t(`notices.${notice as 'created'}`)}
        </p>
      )}
      {error && (
        <p
          role="alert"
          className="rounded-lg bg-danger-subtle px-4 py-3 text-body-sm font-medium text-danger-subtle-foreground"
        >
          {t(`errors.${error as 'failed'}`, { count: Number(query.count ?? 1) })}
        </p>
      )}

      {(draft || status === 'prepared') && (
        <section aria-labelledby="blockers" className="grid gap-3">
          <h2 id="blockers" className="text-heading-md font-semibold">
            {t('blockers.title')}
          </h2>
          {settlement.blockers.length === 0 ? (
            <p
              data-testid="no-blockers"
              className="flex items-center gap-2 text-body text-success-subtle-foreground"
            >
              <CircleCheck aria-hidden className="size-5" />
              {t('blockers.none')}
            </p>
          ) : (
            <ul className="grid gap-2" data-testid="blockers">
              {settlement.blockers.map((b, i) => {
                const fix = fixLink(b.kind, b.event_vendor_id);
                return (
                  <li
                    key={i}
                    data-kind={b.kind}
                    className="flex flex-wrap items-center gap-3 rounded-lg border border-danger bg-danger-subtle px-4 py-3 text-body-sm text-danger-subtle-foreground"
                  >
                    <CircleAlert aria-hidden className="size-5 shrink-0" />
                    <span className="flex-1">
                      {t(`blockers.kinds.${b.kind as 'dispute'}`, {
                        vendor: b.name ?? '',
                        amount: b.amount_ore === null ? '' : money(b.amount_ore),
                      })}
                    </span>
                    {fix &&
                      (fix.href.startsWith('#') ? (
                        <a href={fix.href} className="font-semibold underline underline-offset-4">
                          {fix.label}
                        </a>
                      ) : (
                        <Link
                          href={fix.href}
                          className="font-semibold underline underline-offset-4"
                        >
                          {fix.label}
                        </Link>
                      ))}
                    {testMode && b.kind === 'dispute' && b.vendor_id && (
                      <form action={simulateDispute}>
                        {hidden}
                        <input type="hidden" name="vendor" value={b.vendor_id} />
                        <input type="hidden" name="outcome" value="won" />
                        <button
                          type="submit"
                          className={buttonVariants({ variant: 'outline', size: 'sm' })}
                        >
                          {t('test.disputeWon')}
                        </button>
                      </form>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      <section aria-labelledby="actions" className="grid gap-3">
        <h2 id="actions" className="sr-only">
          {t('actionsTitle')}
        </h2>
        <div className="flex flex-wrap gap-3">
          {draft && (
            <>
              <form action={refreshLines}>
                {hidden}
                <button
                  type="submit"
                  className={buttonVariants({ variant: 'outline', size: 'lg' })}
                >
                  {t('actions.refresh')}
                </button>
              </form>
              {statusButton('prepared', t('actions.prepare'))}
            </>
          )}
          {status === 'prepared' && (
            <>
              {isOrgAdmin &&
                settlement.prepared_by !== user.id &&
                statusButton('approved', t('actions.approve'))}
              {statusButton('draft', t('actions.backToDraft'), 'outline')}
            </>
          )}
          {(draft || status === 'prepared') &&
            statusButton('cancelled', t('actions.cancel'), 'outline')}
          {(status === 'approved' ||
            status === 'completed_with_failures' ||
            status === 'releasing') && (
            <form action={releaseSettlement}>
              {hidden}
              <button type="submit" className={buttonVariants({ size: 'lg' })}>
                {status === 'approved' ? t('actions.release') : t('actions.retry')}
              </button>
            </form>
          )}
        </div>
        {status === 'prepared' && settlement.prepared_by === user.id && (
          <p className="text-body-sm text-muted-foreground">{t('fourEyes')}</p>
        )}
        {status === 'prepared' && !isOrgAdmin && (
          <p className="text-body-sm text-muted-foreground">{t('needsOrgAdmin')}</p>
        )}
      </section>

      <section aria-labelledby="lines" className="grid gap-3">
        <h2 id="lines" className="text-heading-md font-semibold">
          {t('lines.title')}
        </h2>
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <Table data-testid="settlement-lines">
            <TableCaption className="sr-only">{t('lines.title')}</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>{t('lines.vendor')}</TableHead>
                <TableHead className="text-right">{t('lines.gross')}</TableHead>
                <TableHead className="text-right">{t('lines.refunds')}</TableHead>
                <TableHead className="text-right">{t('lines.commission')}</TableHead>
                <TableHead className="text-right">{t('lines.mva')}</TableHead>
                <TableHead className="text-right">{t('lines.adjustments')}</TableHead>
                <TableHead className="text-right">{t('lines.net')}</TableHead>
                <TableHead>{t('lines.payout')}</TableHead>
                {testMode && draft && <TableHead>{t('test.title')}</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {settlement.lines.map((l) => {
                const last = l.payouts.at(-1);
                return (
                  <TableRow key={l.id} data-testid="settlement-line" data-vendor={l.name}>
                    <TableCell className="font-medium">{l.name}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {money(l.gross_sales_ore)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {money(l.refunds_ore)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {money(l.commission_ore)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {money(l.commission_mva_ore)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {money(l.adjustments_ore)}
                    </TableCell>
                    <TableCell
                      className="text-right font-semibold tabular-nums"
                      data-testid="line-net"
                    >
                      {money(l.net_payout_ore)}
                    </TableCell>
                    <TableCell>
                      {last ? (
                        <span className="grid gap-0.5">
                          <Badge
                            data-testid="payout-status"
                            data-status={last.status}
                            variant={
                              last.status === 'paid'
                                ? 'success'
                                : last.status === 'failed'
                                  ? 'danger'
                                  : 'warning'
                            }
                          >
                            {t(`payout.${last.status}`)}
                          </Badge>
                          {last.attempt > 1 && (
                            <span className="text-caption text-muted-foreground">
                              {t('payout.attempt', { attempt: last.attempt })}
                            </span>
                          )}
                          {last.status === 'failed' && last.failure_reason && (
                            <span className="text-caption text-danger">{last.failure_reason}</span>
                          )}
                        </span>
                      ) : (
                        '–'
                      )}
                    </TableCell>
                    {testMode && draft && (
                      <TableCell>
                        <form action={simulateDispute}>
                          {hidden}
                          <input type="hidden" name="vendor" value={l.vendor_id} />
                          <input type="hidden" name="outcome" value="open" />
                          <button
                            type="submit"
                            className={buttonVariants({ variant: 'ghost', size: 'sm' })}
                          >
                            {t('test.dispute')}
                          </button>
                        </form>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
            {settlement.lines.length > 0 && (
              <tfoot className="border-t border-border font-semibold">
                <TableRow>
                  <TableCell>{t('lines.total')}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {money(total('gross_sales_ore'))}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {money(total('refunds_ore'))}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {money(total('commission_ore'))}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {money(total('commission_mva_ore'))}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {money(total('adjustments_ore'))}
                  </TableCell>
                  <TableCell className="text-right tabular-nums" data-testid="total-net">
                    {money(total('net_payout_ore'))}
                  </TableCell>
                  <TableCell />
                  {testMode && draft && <TableCell />}
                </TableRow>
              </tfoot>
            )}
          </Table>
        </div>
        <p className="text-body-sm text-muted-foreground">{t('lines.explain')}</p>
      </section>

      <section
        id="adjustments"
        aria-labelledby="adjustments-title"
        className="grid scroll-mt-20 gap-3"
      >
        <h2 id="adjustments-title" className="text-heading-md font-semibold">
          {t('adjustments.title')}
        </h2>
        {settlement.adjustments.length > 0 && (
          <ul className="grid gap-2" data-testid="adjustments">
            {settlement.adjustments.map((a) => (
              <li
                key={a.id}
                data-testid="adjustment"
                className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 text-body-sm"
              >
                <span className="font-semibold tabular-nums">
                  {a.amount_ore > 0 ? '+' : '−'} {money(Math.abs(a.amount_ore))}
                </span>
                <span>{a.name}</span>
                <span className="flex-1 text-muted-foreground">{a.reason}</span>
                {a.approved_at ? (
                  <Badge variant="success">{t('adjustments.approved')}</Badge>
                ) : (
                  <>
                    <Badge variant="warning">{t('adjustments.awaiting')}</Badge>
                    {draft && isOrgAdmin && a.created_by !== user.id && (
                      <form action={approveAdjustment}>
                        {hidden}
                        <input type="hidden" name="adjustment" value={a.id} />
                        <button type="submit" className={buttonVariants({ size: 'sm' })}>
                          {t('adjustments.approve')}
                        </button>
                      </form>
                    )}
                    {draft && (
                      <form action={deleteAdjustment}>
                        {hidden}
                        <input type="hidden" name="adjustment" value={a.id} />
                        <button
                          type="submit"
                          className={buttonVariants({ variant: 'ghost', size: 'sm' })}
                        >
                          {t('adjustments.delete')}
                        </button>
                      </form>
                    )}
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
        {draft ? (
          <form
            action={addAdjustment}
            className="grid gap-4 rounded-xl border border-border bg-card p-5 sm:grid-cols-2"
          >
            {hidden}
            <label className="grid gap-1.5 text-body-sm font-medium">
              {t('adjustments.vendor')}
              <select name="vendor" required className={`${fieldControlClasses} h-11 px-3`}>
                {settlement.lines.map((l) => (
                  <option key={l.vendor_id} value={l.vendor_id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </label>
            <fieldset className="grid gap-1.5">
              <legend className="text-body-sm font-medium">{t('adjustments.direction')}</legend>
              <div className="flex gap-2">
                {(['credit', 'debit'] as const).map((d) => (
                  <label
                    key={d}
                    className="flex h-11 items-center gap-2 rounded-md border border-input px-3 text-body-sm has-[:checked]:border-primary has-[:checked]:bg-accent"
                  >
                    <input
                      type="radio"
                      name="direction"
                      value={d}
                      defaultChecked={d === 'credit'}
                    />
                    {t(`adjustments.${d}`)}
                  </label>
                ))}
              </div>
            </fieldset>
            <label className="grid gap-1.5 text-body-sm font-medium">
              {t('adjustments.amount')}
              <input
                name="amount"
                inputMode="decimal"
                required
                className={`${fieldControlClasses} h-11 px-3`}
              />
            </label>
            <label className="grid gap-1.5 text-body-sm font-medium">
              {t('adjustments.reason')}
              <input
                name="reason"
                required
                maxLength={300}
                className={`${fieldControlClasses} h-11 px-3`}
              />
            </label>
            <div className="sm:col-span-2">
              <button type="submit" className={buttonVariants({ variant: 'secondary' })}>
                {t('adjustments.add')}
              </button>
              <p className="mt-2 text-caption text-muted-foreground">{t('adjustments.explain')}</p>
            </div>
          </form>
        ) : (
          settlement.adjustments.length === 0 && (
            <p className="text-body-sm text-muted-foreground">{t('adjustments.none')}</p>
          )
        )}
      </section>

      {settlement.payouts.length > 0 && (
        <section aria-labelledby="payouts" className="grid gap-3">
          <h2 id="payouts" className="text-heading-md font-semibold">
            {t('payouts.title')}
          </h2>
          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <Table>
              <TableCaption className="sr-only">{t('payouts.title')}</TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('lines.vendor')}</TableHead>
                  <TableHead className="text-right">{t('payouts.amount')}</TableHead>
                  <TableHead>{t('payouts.attempt')}</TableHead>
                  <TableHead>{t('payouts.status')}</TableHead>
                  <TableHead>{t('payouts.reference')}</TableHead>
                  <TableHead>{t('payouts.time')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {settlement.payouts.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>{p.name}</TableCell>
                    <TableCell className="text-right tabular-nums">{money(p.amount_ore)}</TableCell>
                    <TableCell className="tabular-nums">{p.attempt}</TableCell>
                    <TableCell>{t(`payout.${p.status}`)}</TableCell>
                    <TableCell className="font-mono text-caption">
                      {p.provider_payout_id ?? '–'}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {formatDateTimeOslo(p.paid_at ?? p.created_at, locale)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
      )}
    </div>
  );
}
