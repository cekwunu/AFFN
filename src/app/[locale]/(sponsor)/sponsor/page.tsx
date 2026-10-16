import { Download, QrCode } from 'lucide-react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { ClientIntl } from '@/components/client-intl';
import { DocumentLinks } from '@/components/document-links';
import { SponsorAssetUpload } from '@/components/sponsor/asset-upload';
import { Badge } from '@/components/ui/badge';
import { localizePath } from '@/i18n/paths';
import { initRequestLocale } from '@/i18n/server';
import { getCurrentUser } from '@/lib/auth/server';
import { publicEnv } from '@/lib/env';
import { formatDateOslo, formatNok } from '@/lib/format';
import { ore } from '@/lib/money';
import { mySponsorship } from '@/lib/sponsors/server';
import { createClient } from '@/lib/supabase/server';
import { currentApplicationEvent } from '@/lib/vendor/server';
import { addSponsorAsset, removeSponsorAsset } from './actions';

export const metadata: Metadata = { robots: { index: false } };

const STATUS_VARIANT = {
  inquiry: 'warning',
  confirmed: 'info',
  invoiced: 'info',
  paid: 'success',
  cancelled: 'danger',
} as const;

/**
 * Sponsor portal (SPO-01 … SPO-04): the package and its deliverables, the invoice, QR codes and
 * tracked links with their counts, assets for review, and the report.
 */
export default async function SponsorHomePage({
  params,
  searchParams,
}: PageProps<'/[locale]/sponsor'>) {
  const locale = initRequestLocale((await params).locale);
  const t = await getTranslations('SponsorPortal');
  const user = (await getCurrentUser())!;
  const supabase = await createClient();
  const { data: memberships } = await supabase
    .from('memberships')
    .select('sponsor_id')
    .eq('user_id', user.id)
    .eq('role', 'sponsor')
    .not('sponsor_id', 'is', null);
  if (!memberships?.length) redirect(localizePath('/sponsor/register', locale));
  const event = await currentApplicationEvent();
  const sponsorship = event ? await mySponsorship(event.id) : null;
  const notice = (await searchParams).notice === 'registered';
  const money = (v: number) => formatNok(ore(v));
  const site = publicEnv.NEXT_PUBLIC_SITE_URL;

  if (!sponsorship) {
    return (
      <div className="mx-auto grid w-full max-w-3xl gap-6">
        <h1 className="font-display text-display-md font-semibold">{t('title')}</h1>
        <p className="rounded-xl border border-border bg-card p-6 text-body text-muted-foreground">
          {t('noSponsorship')}
        </p>
      </div>
    );
  }
  const accepted = ['confirmed', 'invoiced', 'paid'].includes(sponsorship.status);

  return (
    <div className="mx-auto grid w-full max-w-4xl gap-8">
      <header className="grid gap-1">
        {event && <p className="text-body-sm font-semibold text-primary">{event.name}</p>}
        <h1 className="font-display text-display-md font-semibold">{sponsorship.sponsor?.name}</h1>
      </header>
      {notice && (
        <p
          role="status"
          className="rounded-lg bg-success-subtle px-4 py-3 text-body-sm font-medium text-success-subtle-foreground"
        >
          {t('registered')}
        </p>
      )}

      <section
        aria-labelledby="package"
        className="grid gap-4 rounded-xl border border-border bg-card p-6"
        data-testid="sponsorship"
        data-status={sponsorship.status}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="package" className="text-heading-md font-semibold">
            {t('package', { name: sponsorship.package.name })}
          </h2>
          <Badge variant={STATUS_VARIANT[sponsorship.status]}>
            {t(`status.${sponsorship.status}`)}
          </Badge>
        </div>
        <p className="text-body text-muted-foreground">{t(`statusText.${sponsorship.status}`)}</p>
        {sponsorship.deliverables.length > 0 && (
          <ul className="grid gap-2" data-testid="deliverables">
            {sponsorship.deliverables.map((d) => (
              <li
                key={d.id}
                className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2 text-body-sm"
              >
                <span>{d.title}</span>
                <Badge variant={d.status === 'delivered' ? 'success' : 'outline'}>
                  {t(`deliverable.${d.status}`)}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </section>

      {sponsorship.invoice && (
        <section
          aria-labelledby="invoice"
          className="grid gap-3 rounded-xl border border-border bg-card p-6"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="invoice" className="text-heading-md font-semibold">
              {t('invoice.title', { number: sponsorship.invoice.invoice_number })}
            </h2>
            <Badge variant={sponsorship.invoice.status === 'paid' ? 'success' : 'warning'}>
              {t(`invoice.status.${sponsorship.invoice.status}`)}
            </Badge>
          </div>
          <p className="text-body">
            {t('invoice.summary', {
              total: money(sponsorship.invoice.total_ore),
              mva: money(sponsorship.invoice.mva_ore),
              due: formatDateOslo(sponsorship.invoice.due_at, locale),
            })}
          </p>
          <DocumentLinks
            links={[
              { kind: 'sponsor_invoice', id: sponsorship.invoice.id, label: t('invoice.pdf') },
            ]}
            english={t('english')}
          />
        </section>
      )}

      {sponsorship.links.length > 0 && (
        <section aria-labelledby="links" className="grid gap-3">
          <h2 id="links" className="text-heading-md font-semibold">
            {t('links.title')}
          </h2>
          <p className="text-body-sm text-muted-foreground">{t('links.intro')}</p>
          <ul className="grid gap-3" data-testid="sponsor-links">
            {sponsorship.links.map((l) => (
              <li
                key={l.id}
                data-testid="sponsor-link"
                data-slug={l.slug}
                className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border border-border bg-card p-4"
              >
                <span className="grid gap-0.5">
                  <span className="font-semibold">
                    {l.kind === 'qr' ? t('links.qr', { label: l.label ?? '' }) : t('links.link')}
                  </span>
                  <span className="font-mono text-caption text-muted-foreground">
                    {new URL(`/s/${l.slug}`, site).toString()}
                  </span>
                </span>
                <span className="text-body-sm tabular-nums" data-testid="link-hits">
                  {t(l.kind === 'qr' ? 'links.scans' : 'links.clicks', { count: l.hits })}
                </span>
                {l.kind === 'qr' && (
                  <span className="ml-auto flex gap-4 text-body-sm">
                    <a
                      href={`/api/sponsor/qr/${l.id}?format=png`}
                      className="inline-flex items-center gap-1 text-link underline-offset-4 hover:underline"
                    >
                      <QrCode aria-hidden className="size-4" /> {t('links.png')}
                    </a>
                    <a
                      href={`/api/sponsor/qr/${l.id}?format=pdf`}
                      className="inline-flex items-center gap-1 text-link underline-offset-4 hover:underline"
                    >
                      <Download aria-hidden className="size-4" /> {t('links.pdf')}
                    </a>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {sponsorship.status !== 'cancelled' && (
        <section aria-labelledby="assets" className="grid gap-3">
          <h2 id="assets" className="text-heading-md font-semibold">
            {t('assets.title')}
          </h2>
          <p className="text-body-sm text-muted-foreground">{t('assets.intro')}</p>
          {sponsorship.assets.length > 0 && (
            <ul className="grid gap-2" data-testid="sponsor-assets">
              {sponsorship.assets.map((a) => (
                <li
                  key={a.id}
                  data-testid="sponsor-asset"
                  data-status={a.status}
                  className="grid gap-1 rounded-lg border border-border bg-card px-4 py-3 text-body-sm"
                >
                  <span className="flex flex-wrap items-center justify-between gap-2">
                    <span>
                      <span className="font-medium">{t(`assets.kinds.${a.kind}`)}</span> ·{' '}
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
                      {t(`assets.status.${a.status}`)}
                    </Badge>
                  </span>
                  {a.feedback && (
                    <span className="text-muted-foreground">
                      {t('assets.feedback', { text: a.feedback })}
                    </span>
                  )}
                  {a.status === 'pending' && (
                    <form action={removeSponsorAsset}>
                      <input type="hidden" name="id" value={a.id} />
                      <button
                        type="submit"
                        className="text-caption text-link underline-offset-4 hover:underline"
                      >
                        {t('assets.remove')}
                      </button>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          )}
          <ClientIntl namespaces={['SponsorPortal']}>
            <SponsorAssetUpload
              sponsorId={sponsorship.sponsor_id}
              sponsorshipId={sponsorship.id}
              add={addSponsorAsset}
            />
          </ClientIntl>
        </section>
      )}

      {accepted && (
        <section
          aria-labelledby="report"
          className="grid gap-3 rounded-xl border border-border bg-card p-6"
        >
          <h2 id="report" className="text-heading-md font-semibold">
            {t('report.title')}
          </h2>
          <p className="text-body-sm text-muted-foreground">{t('report.intro')}</p>
          <DocumentLinks
            links={[
              { kind: 'sponsor_report_pdf', id: sponsorship.id, label: t('report.pdf') },
              { kind: 'sponsor_report_csv', id: sponsorship.id, label: t('report.csv') },
            ]}
            english={t('english')}
          />
        </section>
      )}
    </div>
  );
}
