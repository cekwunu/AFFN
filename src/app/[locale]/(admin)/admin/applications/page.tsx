import { clsx } from 'clsx';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button-variants';
import { fieldControlClasses } from '@/components/ui/field-classes';
import { Link } from '@/i18n/link';
import { initRequestLocale } from '@/i18n/server';
import { formatOrgNumber } from '@/lib/brreg';
import { formatDateOslo } from '@/lib/format';
import { QUEUE_STATUSES, parseQueueFilters, type QueueFilters } from '@/lib/review/queue';
import { listApplications } from '@/lib/review/server';
import { STATUS_VARIANT } from '@/lib/review/status';
import { CATEGORIES } from '@/lib/vendor/application';
import { currentApplicationEvent } from '@/lib/vendor/server';

export const metadata: Metadata = { robots: { index: false } };

/** Review queue (REV-01): filters live in the URL, so it works without JavaScript. */
export default async function ApplicationsPage({
  params,
  searchParams,
}: PageProps<'/[locale]/admin/applications'>) {
  const locale = initRequestLocale((await params).locale);
  const t = await getTranslations('Review.queue');
  const tStatus = await getTranslations('Application.status');
  const tCategory = await getTranslations('Apply.categories');
  const event = await currentApplicationEvent();
  if (!event) {
    return <h1 className="font-display text-display-md font-semibold">{t('title')}</h1>;
  }
  const filters = parseQueueFilters(await searchParams);
  const { rows, counts, total } = await listApplications(event.id, filters);

  const hrefWith = (change: Partial<QueueFilters>) => {
    const next = { ...filters, ...change };
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(next)) if (value) query.set(key, String(value));
    const qs = query.toString();
    return `/admin/applications${qs ? `?${qs}` : ''}`;
  };
  const label = 'text-body-sm font-medium';
  const control = clsx(fieldControlClasses, 'h-10 px-3');

  return (
    <div className="grid gap-6">
      <header className="grid gap-1">
        <p className="text-body-sm font-semibold text-primary">
          {t('event', { event: event.name })}
        </p>
        <h1 className="font-display text-display-md font-semibold">{t('title')}</h1>
      </header>

      <nav aria-label={t('countsLabel')}>
        <ul className="flex flex-wrap gap-2">
          {[null, ...QUEUE_STATUSES].map((status) => {
            const active = filters.status === status;
            const count = status ? (counts[status] ?? 0) : total;
            return (
              <li key={status ?? 'all'}>
                <Link
                  href={hrefWith({ status })}
                  aria-current={active ? 'page' : undefined}
                  className={clsx(
                    'inline-flex min-h-10 items-center gap-2 rounded-full border px-3.5 text-body-sm font-medium transition-colors',
                    active
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-card hover:bg-accent',
                  )}
                >
                  {status ? tStatus(status) : t('all')}
                  <span className="tabular-nums opacity-80">{count}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <form
        method="get"
        className="grid gap-4 rounded-xl border border-border bg-card p-4 md:grid-cols-6 md:items-end"
      >
        {filters.status && <input type="hidden" name="status" value={filters.status} />}
        <div className="grid gap-1.5 md:col-span-2">
          <label htmlFor="q" className={label}>
            {t('search')}
          </label>
          <input
            id="q"
            name="q"
            type="search"
            defaultValue={filters.q}
            placeholder={t('searchPlaceholder')}
            className={control}
          />
        </div>
        <div className="grid gap-1.5">
          <label htmlFor="category" className={label}>
            {t('category')}
          </label>
          <select
            id="category"
            name="category"
            defaultValue={filters.category ?? ''}
            className={control}
          >
            <option value="">{t('allCategories')}</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {tCategory(c)}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <label htmlFor="documents" className={label}>
            {t('documents')}
          </label>
          <select
            id="documents"
            name="documents"
            defaultValue={filters.documents ?? ''}
            className={control}
          >
            <option value="">{t('allDocuments')}</option>
            <option value="complete">{t('documentsComplete')}</option>
            <option value="missing">{t('documentsMissing')}</option>
          </select>
        </div>
        <div className="grid gap-1.5">
          <label htmlFor="from" className={label}>
            {t('submittedFrom')}
          </label>
          <input
            id="from"
            name="from"
            type="date"
            defaultValue={filters.from ?? ''}
            className={control}
          />
        </div>
        <div className="grid gap-1.5">
          <label htmlFor="to" className={label}>
            {t('submittedTo')}
          </label>
          <input
            id="to"
            name="to"
            type="date"
            defaultValue={filters.to ?? ''}
            className={control}
          />
        </div>
        <div className="flex gap-3 md:col-span-6">
          <button type="submit" className={buttonVariants()}>
            {t('filter')}
          </button>
          <Link href="/admin/applications" className={buttonVariants({ variant: 'ghost' })}>
            {t('reset')}
          </Link>
        </div>
      </form>

      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-6 py-10 text-center text-muted-foreground">
          {t('empty')}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full text-left text-body-sm">
            <caption className="sr-only">{t('caption', { event: event.name })}</caption>
            <thead className="border-b border-border text-caption tracking-wide text-muted-foreground uppercase">
              <tr>
                {(['vendor', 'category', 'status', 'submitted', 'documents', 'stall'] as const).map(
                  (c) => (
                    <th key={c} scope="col" className="px-4 py-3 font-semibold whitespace-nowrap">
                      {t(`columns.${c}`)}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((row) => (
                <tr key={row.id} className="hover:bg-muted/50">
                  <th scope="row" className="px-4 py-3 font-normal">
                    <Link
                      href={`/admin/applications/${row.id}`}
                      aria-label={t('open', { name: row.vendorName })}
                      className="font-semibold text-foreground hover:text-link hover:underline"
                    >
                      {row.vendorName}
                    </Link>
                    <span className="block text-caption text-muted-foreground tabular-nums">
                      {formatOrgNumber(row.orgNumber)}
                      {row.contactName ? ` · ${row.contactName}` : ''}
                    </span>
                  </th>
                  <td className="px-4 py-3">
                    {row.category ? tCategory(row.category as (typeof CATEGORIES)[number]) : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={STATUS_VARIANT[row.status]}>{tStatus(row.status)}</Badge>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap tabular-nums">
                    {row.submittedAt ? formatDateOslo(row.submittedAt, locale) : t('notSubmitted')}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={row.documentsComplete ? 'success' : 'warning'}>
                      {row.documentsComplete ? t('docsOk') : t('docsMissing')}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    {row.stallType
                      ? locale === 'en'
                        ? row.stallType.name_en
                        : row.stallType.name_nb
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
