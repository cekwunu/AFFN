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
import { formatDateOslo, formatNok } from '@/lib/format';
import { money as kroner } from '@/lib/exports/csv';
import { ore } from '@/lib/money';
import { adminSponsors } from '@/lib/sponsors/server';
import { currentApplicationEvent } from '@/lib/vendor/server';
import { savePackage } from './actions';

export const metadata: Metadata = { robots: { index: false } };

const STATUS_VARIANT = {
  inquiry: 'warning',
  confirmed: 'info',
  invoiced: 'info',
  paid: 'success',
  cancelled: 'outline',
} as const;

/** Sponsor packages (no fixed tiers) and the sponsorship queue for the current event (SPO-01). */
export default async function AdminSponsorsPage({
  params,
  searchParams,
}: PageProps<'/[locale]/admin/sponsors'>) {
  const locale = initRequestLocale((await params).locale);
  const t = await getTranslations('AdminSponsors');
  const event = await currentApplicationEvent();
  const query = await searchParams;
  const notice = typeof query.notice === 'string' ? query.notice : null;
  const error = typeof query.error === 'string' ? query.error : null;
  if (!event) return <p className="text-muted-foreground">{t('noEvent')}</p>;
  const { packages, sponsorships } = await adminSponsors(event.id);
  const control = `${fieldControlClasses} h-11 px-3`;

  const packageForm = (p?: (typeof packages)[number]) => (
    <form action={savePackage} className="grid gap-4 sm:grid-cols-2" data-testid="package-form">
      {p && <input type="hidden" name="id" value={p.id} />}
      <label className="grid gap-1.5 text-body-sm font-medium">
        {t('fields.name')}
        <input name="name" required defaultValue={p?.name} className={control} />
      </label>
      <label className="grid gap-1.5 text-body-sm font-medium">
        {t('fields.price')}
        <input
          name="price"
          inputMode="decimal"
          required
          defaultValue={p ? kroner(p.price_ore) : ''}
          className={control}
        />
      </label>
      <label className="grid gap-1.5 text-body-sm font-medium sm:col-span-2">
        {t('fields.description')}
        <input name="description" defaultValue={p?.description ?? ''} className={control} />
      </label>
      <label className="grid gap-1.5 text-body-sm font-medium sm:col-span-2">
        {t('fields.deliverables')}
        <textarea
          name="deliverables"
          rows={4}
          defaultValue={p?.deliverables.join('\n')}
          className={`${fieldControlClasses} px-3 py-2`}
        />
        <span className="text-caption font-normal text-muted-foreground">
          {t('fields.deliverablesHint')}
        </span>
      </label>
      <label className="grid gap-1.5 text-body-sm font-medium">
        {t('fields.logoLevel')}
        <select name="logoLevel" defaultValue={String(p?.logo_level ?? 1)} className={control}>
          {[1, 2, 3, 4, 5].map((l) => (
            <option key={l} value={l}>
              {t(`levels.${l}` as 'levels.1')}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-1.5 text-body-sm font-medium">
        {t('fields.qrCodes')}
        <input
          name="qrCodes"
          type="number"
          min={0}
          max={20}
          defaultValue={p?.qr_code_count ?? 1}
          className={control}
        />
      </label>
      <label className="grid gap-1.5 text-body-sm font-medium">
        {t('fields.tier')}
        <input name="tier" type="number" min={1} defaultValue={p?.tier ?? 1} className={control} />
      </label>
      <label className="flex items-center gap-2 self-end text-body-sm font-medium">
        <input
          type="checkbox"
          name="active"
          defaultChecked={p?.is_active ?? true}
          className="size-4 accent-primary"
        />
        {t('fields.active')}
      </label>
      <div className="sm:col-span-2">
        <button type="submit" className={buttonVariants()}>
          {p ? t('savePackage') : t('createPackage')}
        </button>
      </div>
    </form>
  );

  return (
    <div className="grid gap-10">
      <header className="grid gap-1">
        <p className="text-body-sm font-semibold text-primary">{event.name}</p>
        <h1 className="font-display text-display-md font-semibold">{t('title')}</h1>
        <p className="max-w-3xl text-body text-muted-foreground">{t('intro')}</p>
      </header>
      {notice && (
        <p
          role="status"
          className="rounded-lg bg-success-subtle px-4 py-3 text-body-sm font-medium text-success-subtle-foreground"
        >
          {t(`notices.${notice as 'package'}`)}
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

      <section aria-labelledby="queue" className="grid gap-3">
        <h2 id="queue" className="text-heading-md font-semibold">
          {t('queue')}
        </h2>
        {sponsorships.length === 0 ? (
          <p className="text-body-sm text-muted-foreground">{t('noSponsorships')}</p>
        ) : (
          <div className="rounded-xl border border-border bg-card">
            <Table data-testid="sponsorships">
              <TableCaption className="sr-only">{t('queue')}</TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('columns.sponsor')}</TableHead>
                  <TableHead>{t('columns.package')}</TableHead>
                  <TableHead className="text-right">{t('columns.price')}</TableHead>
                  <TableHead>{t('columns.status')}</TableHead>
                  <TableHead>{t('columns.registered')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sponsorships.map((s) => (
                  <TableRow key={s.id} data-testid="sponsorship-row">
                    <TableCell>
                      <Link
                        href={`/admin/sponsors/${s.id}`}
                        className="font-medium text-link underline-offset-4 hover:underline"
                      >
                        {s.sponsor?.name ?? '–'}
                      </Link>
                    </TableCell>
                    <TableCell>{s.package.name}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatNok(ore(s.agreed_price_ore ?? s.package.price_ore))}
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[s.status]}>{t(`status.${s.status}`)}</Badge>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {formatDateOslo(s.created_at, locale)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      <section aria-labelledby="packages" className="grid gap-4">
        <h2 id="packages" className="text-heading-md font-semibold">
          {t('packages')}
        </h2>
        <ul className="grid gap-3">
          {packages.map((p) => (
            <li
              key={p.id}
              className="rounded-xl border border-border bg-card"
              data-testid="package-row"
            >
              <details>
                <summary className="flex cursor-pointer flex-wrap items-center gap-3 px-5 py-4">
                  <span className="font-semibold">{p.name}</span>
                  <span className="tabular-nums">{formatNok(ore(p.price_ore))}</span>
                  <span className="text-body-sm text-muted-foreground">
                    {t('summary', { level: p.logo_level, qr: p.qr_code_count })}
                  </span>
                  {!p.is_active && <Badge variant="outline">{t('inactive')}</Badge>}
                </summary>
                <div className="border-t border-border p-5">{packageForm(p)}</div>
              </details>
            </li>
          ))}
        </ul>
        <div className="grid gap-3 rounded-xl border border-dashed border-border p-5">
          <h3 className="text-heading-sm font-semibold">{t('newPackage')}</h3>
          {packageForm()}
        </div>
      </section>
    </div>
  );
}
