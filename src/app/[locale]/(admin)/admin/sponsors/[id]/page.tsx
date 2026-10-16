import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { DocumentLinks } from '@/components/document-links';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button-variants';
import { fieldControlClasses } from '@/components/ui/field-classes';
import { Link } from '@/i18n/link';
import { initRequestLocale } from '@/i18n/server';
import { getCurrentUser } from '@/lib/auth/server';
import { formatOrgNumber } from '@/lib/brreg';
import { formatDateOslo, formatNok } from '@/lib/format';
import { ore } from '@/lib/money';
import { sponsorshipDetail } from '@/lib/sponsors/server';
import { createClient } from '@/lib/supabase/server';
import { markSponsorInvoicePaid, reviewAsset, reviewSponsorship, setDeliverable } from '../actions';

export const metadata: Metadata = { robots: { index: false } };

/**
 * One sponsorship (SPO-01 … SPO-04): approve or decline, deliverables, asset review with feedback,
 * the invoice (marked paid on bank transfer), QR codes and links with counts, and the report.
 */
export default async function AdminSponsorshipPage({
  params,
  searchParams,
}: PageProps<'/[locale]/admin/sponsors/[id]'>) {
  const { locale: rawLocale, id } = await params;
  const locale = initRequestLocale(rawLocale);
  const t = await getTranslations('AdminSponsors');
  const tp = await getTranslations('SponsorPortal');
  const sponsorship = /^[0-9a-f-]{36}$/.test(id) ? await sponsorshipDetail(id) : null;
  if (!sponsorship) notFound();
  const user = (await getCurrentUser())!;
  const isOrgAdmin = user.access.roles.some(
    (r) => r.org === sponsorship.organization_id && r.role === 'org_admin' && r.status === 'active',
  );
  const query = await searchParams;
  const notice = typeof query.notice === 'string' ? query.notice : null;
  const error = typeof query.error === 'string' ? query.error : null;
  const money = (v: number) => formatNok(ore(v));
  const control = `${fieldControlClasses} h-11 px-3`;
  const supabase = await createClient();
  // Short-lived links to preview uploaded files (private bucket, staff policy).
  const previews = new Map(
    await Promise.all(
      sponsorship.assets.map(async (a) => {
        const { data } = await supabase.storage
          .from('sponsor-assets')
          .createSignedUrl(a.storage_path, 300);
        return [a.id, data?.signedUrl ?? null] as const;
      }),
    ),
  );
  const sponsor = sponsorship.sponsor!;
  const hidden = <input type="hidden" name="sponsorship" value={sponsorship.id} />;
  const accepted = ['confirmed', 'invoiced', 'paid'].includes(sponsorship.status);

  return (
    <div className="grid gap-8">
      <Link href="/admin/sponsors" className="w-fit text-body-sm text-link hover:underline">
        {t('back')}
      </Link>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <h1 className="font-display text-display-md font-semibold">{sponsor.name}</h1>
          <p className="text-body-sm text-muted-foreground">
            {[
              sponsor.legal_name,
              sponsor.org_number && `Org.nr. ${formatOrgNumber(sponsor.org_number)}`,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
        <Badge variant={sponsorship.status === 'paid' ? 'success' : 'info'} data-testid="status">
          {t(`status.${sponsorship.status}`)}
        </Badge>
      </header>
      {notice && (
        <p
          role="status"
          className="rounded-lg bg-success-subtle px-4 py-3 text-body-sm font-medium text-success-subtle-foreground"
        >
          {t(`notices.${notice as 'approved'}`)}
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

      <section
        aria-labelledby="details"
        className="grid gap-3 rounded-xl border border-border bg-card p-6"
      >
        <h2 id="details" className="text-heading-md font-semibold">
          {t('package', { name: sponsorship.package.name })}
        </h2>
        <dl className="grid gap-x-6 gap-y-1 text-body-sm sm:grid-cols-[max-content_1fr]">
          <dt className="text-muted-foreground">{t('columns.price')}</dt>
          <dd className="tabular-nums">
            {money(sponsorship.agreed_price_ore ?? sponsorship.package.price_ore)}
          </dd>
          <dt className="text-muted-foreground">{t('contact')}</dt>
          <dd>
            {[sponsor.contact_name, sponsor.contact_email, sponsor.contact_phone]
              .filter(Boolean)
              .join(' · ')}
          </dd>
          <dt className="text-muted-foreground">{t('invoiceTo')}</dt>
          <dd>
            {[sponsor.invoice_email, sponsor.invoice_address, sponsor.invoice_reference]
              .filter(Boolean)
              .join(' · ')}
          </dd>
          {sponsor.website_url && (
            <>
              <dt className="text-muted-foreground">{t('website')}</dt>
              <dd>{sponsor.website_url}</dd>
            </>
          )}
          {sponsorship.notes && (
            <>
              <dt className="text-muted-foreground">{t('note')}</dt>
              <dd>{sponsorship.notes}</dd>
            </>
          )}
        </dl>
        {sponsorship.status === 'inquiry' && (
          <form
            action={reviewSponsorship}
            className="grid gap-3 border-t border-border pt-4 sm:grid-cols-2"
          >
            <input type="hidden" name="id" value={sponsorship.id} />
            <label className="grid gap-1.5 text-body-sm font-medium sm:col-span-2">
              {t('review.note')}
              <input name="note" required className={control} />
            </label>
            <label className="grid gap-1.5 text-body-sm font-medium">
              {t('review.price')}
              <input name="price" inputMode="decimal" className={control} />
              <span className="text-caption font-normal text-muted-foreground">
                {t('review.priceHint', { price: money(sponsorship.package.price_ore) })}
              </span>
            </label>
            <div className="flex flex-wrap items-end gap-3">
              <button type="submit" name="decision" value="approve" className={buttonVariants()}>
                {t('review.approve')}
              </button>
              <button
                type="submit"
                name="decision"
                value="decline"
                className={buttonVariants({ variant: 'outline' })}
              >
                {t('review.decline')}
              </button>
            </div>
          </form>
        )}
      </section>

      {sponsorship.invoice && (
        <section
          aria-labelledby="invoice"
          className="grid gap-3 rounded-xl border border-border bg-card p-6"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="invoice" className="text-heading-md font-semibold">
              {tp('invoice.title', { number: sponsorship.invoice.invoice_number })}
            </h2>
            <Badge variant={sponsorship.invoice.status === 'paid' ? 'success' : 'warning'}>
              {tp(`invoice.status.${sponsorship.invoice.status}`)}
            </Badge>
          </div>
          <p className="text-body">
            {tp('invoice.summary', {
              total: money(sponsorship.invoice.total_ore),
              mva: money(sponsorship.invoice.mva_ore),
              due: formatDateOslo(sponsorship.invoice.due_at, locale),
            })}
          </p>
          <DocumentLinks
            links={[
              { kind: 'sponsor_invoice', id: sponsorship.invoice.id, label: tp('invoice.pdf') },
            ]}
            english={tp('english')}
          />
          {sponsorship.invoice.status === 'issued' &&
            (isOrgAdmin ? (
              <form action={markSponsorInvoicePaid}>
                {hidden}
                <input type="hidden" name="invoice" value={sponsorship.invoice.id} />
                <button type="submit" className={buttonVariants({ variant: 'outline' })}>
                  {t('markPaid')}
                </button>
              </form>
            ) : (
              <p className="text-body-sm text-muted-foreground">{t('markPaidOrgAdmin')}</p>
            ))}
        </section>
      )}

      {sponsorship.deliverables.length > 0 && (
        <section aria-labelledby="deliverables" className="grid gap-3">
          <h2 id="deliverables" className="text-heading-md font-semibold">
            {t('deliverables')}
          </h2>
          <ul className="grid gap-2">
            {sponsorship.deliverables.map((d) => (
              <li key={d.id} className="rounded-xl border border-border bg-card p-4">
                <form action={setDeliverable} className="flex flex-wrap items-end gap-3">
                  {hidden}
                  <input type="hidden" name="id" value={d.id} />
                  <span className="min-w-48 flex-1 font-medium">{d.title}</span>
                  <label className="grid gap-1 text-body-sm">
                    <span className="sr-only">{t('deliverableStatus', { title: d.title })}</span>
                    <select name="status" defaultValue={d.status} className={control}>
                      {(['pending', 'in_progress', 'delivered'] as const).map((s) => (
                        <option key={s} value={s}>
                          {tp(`deliverable.${s}`)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="grid gap-1 text-body-sm">
                    <span className="sr-only">{t('deliverableNote', { title: d.title })}</span>
                    <input
                      name="note"
                      defaultValue={d.note ?? ''}
                      placeholder={t('notePlaceholder')}
                      className={control}
                    />
                  </label>
                  <button type="submit" className={buttonVariants({ variant: 'outline' })}>
                    {t('save')}
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="assets" className="grid gap-3">
        <h2 id="assets" className="text-heading-md font-semibold">
          {t('assets')}
        </h2>
        {sponsorship.assets.length === 0 ? (
          <p className="text-body-sm text-muted-foreground">{t('noAssets')}</p>
        ) : (
          <ul className="grid gap-3">
            {sponsorship.assets.map((a) => (
              <li
                key={a.id}
                data-testid="asset"
                data-status={a.status}
                className="grid gap-3 rounded-xl border border-border bg-card p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    <span className="font-medium">{tp(`assets.kinds.${a.kind}`)}</span> ·{' '}
                    {a.file_name}
                  </span>
                  <Badge
                    variant={
                      a.status === 'accepted'
                        ? 'success'
                        : a.status === 'rejected'
                          ? 'danger'
                          : 'warning'
                    }
                  >
                    {tp(`assets.status.${a.status}`)}
                  </Badge>
                </div>
                {previews.get(a.id) &&
                  (a.mime_type?.startsWith('image/') ? (
                    // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL
                    <img
                      src={previews.get(a.id)!}
                      alt={t('preview', { name: a.file_name })}
                      className="h-24 w-auto max-w-full rounded-md border border-border bg-background object-contain p-2"
                    />
                  ) : (
                    <a
                      href={previews.get(a.id)!}
                      className="w-fit text-body-sm text-link underline-offset-4 hover:underline"
                    >
                      {t('open', { name: a.file_name })}
                    </a>
                  ))}
                {a.feedback && <p className="text-body-sm text-muted-foreground">{a.feedback}</p>}
                {a.status === 'pending' && (
                  <form action={reviewAsset} className="flex flex-wrap items-end gap-3">
                    {hidden}
                    <input type="hidden" name="id" value={a.id} />
                    <label className="grid flex-1 gap-1 text-body-sm font-medium">
                      {t('feedback')}
                      <input name="feedback" className={control} />
                    </label>
                    <button
                      type="submit"
                      name="decision"
                      value="accept"
                      className={buttonVariants()}
                    >
                      {t('accept')}
                    </button>
                    <button
                      type="submit"
                      name="decision"
                      value="reject"
                      className={buttonVariants({ variant: 'outline' })}
                    >
                      {t('reject')}
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {sponsorship.links.length > 0 && (
        <section aria-labelledby="links" className="grid gap-3">
          <h2 id="links" className="text-heading-md font-semibold">
            {tp('links.title')}
          </h2>
          <ul className="grid gap-2 text-body-sm">
            {sponsorship.links.map((l) => (
              <li
                key={l.id}
                className="flex flex-wrap items-center gap-x-6 gap-y-1 rounded-lg border border-border bg-card px-4 py-3"
              >
                <span className="font-medium">
                  {l.kind === 'qr' ? tp('links.qr', { label: l.label ?? '' }) : tp('links.link')}
                </span>
                <span className="font-mono text-caption text-muted-foreground">/s/{l.slug}</span>
                <span className="tabular-nums">
                  {tp(l.kind === 'qr' ? 'links.scans' : 'links.clicks', { count: l.hits })}
                </span>
                {l.kind === 'qr' && (
                  <a
                    href={`/api/sponsor/qr/${l.id}?format=pdf`}
                    className="ml-auto text-link underline-offset-4 hover:underline"
                  >
                    {tp('links.pdf')}
                  </a>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {accepted && (
        <section
          aria-labelledby="report"
          className="grid gap-3 rounded-xl border border-border bg-card p-6"
        >
          <h2 id="report" className="text-heading-md font-semibold">
            {tp('report.title')}
          </h2>
          <DocumentLinks
            links={[
              { kind: 'sponsor_report_pdf', id: sponsorship.id, label: tp('report.pdf') },
              { kind: 'sponsor_report_csv', id: sponsorship.id, label: tp('report.csv') },
            ]}
            english={tp('english')}
          />
        </section>
      )}
    </div>
  );
}
