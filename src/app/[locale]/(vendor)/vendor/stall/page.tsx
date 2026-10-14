import { CircleCheck } from 'lucide-react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { PayStallFee } from '@/components/vendor/pay-stall-fee';
import { Badge } from '@/components/ui/badge';
import { initRequestLocale } from '@/i18n/server';
import { formatDateOslo, formatNok } from '@/lib/format';
import { ore } from '@/lib/money';
import { eventMediaUrl, getMyStall, venueMapPath } from '@/lib/stalls/server';
import { createClient } from '@/lib/supabase/server';
import { currentApplicationEvent } from '@/lib/vendor/server';
import { payStallFee } from './actions';

export const metadata: Metadata = { robots: { index: false } };

function Facts({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="grid gap-2 sm:grid-cols-[11rem_1fr] sm:gap-x-6">
      {rows.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-body-sm text-muted-foreground">{label}</dt>
          <dd className="text-body tabular-nums">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** The vendor's stall fee and, once paid and assigned, their confirmed stall (STL-03/04). */
export default async function VendorStallPage({ params }: PageProps<'/[locale]/vendor/stall'>) {
  const locale = initRequestLocale((await params).locale);
  const t = await getTranslations('VendorStall');
  const event = await currentApplicationEvent();
  const supabase = await createClient();
  const { data: application } = event
    ? await supabase
        .from('event_vendors')
        .select('id, status')
        .eq('event_id', event.id)
        .maybeSingle()
    : { data: null };

  const heading = (
    <header className="grid gap-1">
      {event && <p className="text-body-sm font-semibold text-primary">{event.name}</p>}
      <h1 className="font-display text-display-md font-semibold">{t('title')}</h1>
    </header>
  );
  if (!event || application?.status !== 'approved') {
    return (
      <div className="mx-auto grid w-full max-w-3xl gap-6">
        {heading}
        <p className="rounded-xl border border-border bg-card p-6 text-body text-muted-foreground">
          {t('notApproved')}
        </p>
      </div>
    );
  }

  const { fee, stall } = await getMyStall(application.id);
  const paid = fee?.status === 'paid';
  const mapUrl =
    stall && stall.map_x != null && stall.map_y != null
      ? eventMediaUrl(await venueMapPath(event.id))
      : null;
  const yesNo = (value: boolean) => (value ? t('yes') : t('no'));

  return (
    <div className="mx-auto grid w-full max-w-3xl gap-6">
      {heading}

      {stall ? (
        <section
          aria-labelledby="stall-confirmed"
          className="grid gap-4 rounded-xl border border-success-subtle bg-card p-6"
        >
          <h2
            id="stall-confirmed"
            className="flex items-center gap-2 text-heading-md font-semibold"
          >
            <CircleCheck aria-hidden className="size-6 text-success-subtle-foreground" />
            {t('confirmedTitle', { number: stall.number })}
          </h2>
          <Facts
            rows={[
              ...(stall.zone ? [[t('zone'), stall.zone] as [string, ReactNode]] : []),
              ...(stall.size_label || stall.width_cm
                ? [
                    [
                      t('size'),
                      [
                        stall.size_label,
                        stall.width_cm && stall.depth_cm
                          ? `${stall.width_cm} × ${stall.depth_cm} cm`
                          : null,
                      ]
                        .filter(Boolean)
                        .join(' · '),
                    ] as [string, ReactNode],
                  ]
                : []),
              [t('power'), yesNo(stall.has_power)],
              [t('water'), yesNo(stall.has_water)],
            ]}
          />
          {mapUrl && (
            <figure className="grid gap-2">
              <figcaption className="text-heading-sm font-semibold">{t('mapTitle')}</figcaption>
              <div className="relative overflow-hidden rounded-lg border border-border bg-muted">
                {/* eslint-disable-next-line @next/next/no-img-element -- user-uploaded venue map */}
                <img src={mapUrl} alt={t('mapAlt')} className="block w-full" />
                <span
                  data-testid="my-stall-pin"
                  className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-card bg-primary px-2 py-0.5 text-caption font-semibold text-primary-foreground shadow-md"
                  style={{ left: `${stall.map_x! / 100}%`, top: `${stall.map_y! / 100}%` }}
                >
                  {t('pin', { number: stall.number })}
                </span>
              </div>
            </figure>
          )}
        </section>
      ) : (
        <p role="status" className="rounded-xl border border-border bg-card p-6 text-body">
          {paid ? t('waiting') : t('pending')}
        </p>
      )}

      {fee && (
        <section
          aria-labelledby="stall-invoice"
          className="grid gap-4 rounded-xl border border-border bg-card p-6"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="stall-invoice" className="text-heading-md font-semibold">
              {t('invoiceTitle')}
            </h2>
            <Badge variant={paid ? 'success' : 'warning'}>{t(`feeStatus.${fee.status}`)}</Badge>
          </div>
          <Facts
            rows={[
              ...(fee.invoice
                ? [[t('invoiceNumber'), fee.invoice.invoice_number] as [string, ReactNode]]
                : []),
              [t('amount'), formatNok(ore(fee.amount_ore))],
              [t('mva'), formatNok(ore(fee.mva_ore))],
              [t('total'), <strong key="total">{formatNok(ore(fee.total_ore))}</strong>],
              ...(fee.due_at && !paid
                ? [[t('due'), formatDateOslo(fee.due_at, locale)] as [string, ReactNode]]
                : []),
            ]}
          />
          {paid ? (
            <p className="text-body text-success-subtle-foreground">
              {t('paid', { date: formatDateOslo(fee.paid_at ?? new Date(), locale) })}
            </p>
          ) : (
            <>
              <p className="text-body-sm text-muted-foreground">{t('payHint')}</p>
              <PayStallFee
                action={payStallFee}
                stallFeeId={fee.id}
                labels={{ pay: t('pay'), paying: t('paying'), failed: t('paymentFailed') }}
              />
            </>
          )}
        </section>
      )}
    </div>
  );
}
