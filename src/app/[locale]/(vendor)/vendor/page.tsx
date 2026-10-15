import {
  CircleCheck,
  CircleDashed,
  ClipboardList,
  CreditCard,
  MapPin,
  ShoppingBag,
  Sparkles,
} from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button-variants';
import { EmptyState } from '@/components/ui/empty-state';
import { Link } from '@/i18n/link';
import { initRequestLocale } from '@/i18n/server';
import { listMyProducts, myGallery, myVendor } from '@/lib/catalogue/server';
import { formatNok } from '@/lib/format';
import { ore } from '@/lib/money';
import { STATUS_VARIANT } from '@/lib/review/status';
import { getMyStall } from '@/lib/stalls/server';
import { createClient } from '@/lib/supabase/server';
import { currentApplicationEvent, getMyApplication } from '@/lib/vendor/server';

function Card({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <section className="grid content-start gap-2 rounded-xl border border-border bg-card p-5">
      <h2 className="flex items-center gap-2 text-heading-sm font-semibold [&_svg]:size-5 [&_svg]:text-primary">
        {icon}
        {title}
      </h2>
      {children}
    </section>
  );
}

/** Vendor home: status at a glance and the next steps (vendor portal shell). */
export default async function VendorHomePage({ params }: PageProps<'/[locale]/vendor'>) {
  initRequestLocale((await params).locale);
  const t = await getTranslations('VendorHome');
  const tAreas = await getTranslations('Areas');
  const ta = await getTranslations('Application');
  const tFee = await getTranslations('VendorStall.feeStatus');
  const event = await currentApplicationEvent();
  const [application, vendor] = await Promise.all([
    event ? getMyApplication(event.id) : null,
    myVendor(),
  ]);

  if (!application || !vendor) {
    return (
      <div className="grid gap-6">
        <h1 className="font-display text-display-md font-semibold">{t('title')}</h1>
        <EmptyState
          icon={<Sparkles />}
          title={tAreas('pendingVendorTitle')}
          description={tAreas('pendingVendorText')}
          headingLevel="h2"
          action={
            event ? (
              <Link href="/vendor/apply" className={buttonVariants({ size: 'lg' })}>
                {ta('start')}
              </Link>
            ) : undefined
          }
        />
      </div>
    );
  }

  const supabase = await createClient();
  const [{ data: participation }, stall, products, gallery] = await Promise.all([
    supabase.from('event_vendors').select('psp_account_status').eq('id', application.id).single(),
    getMyStall(application.id),
    listMyProducts(vendor.id, application.id),
    myGallery(vendor.id),
  ]);
  const psp = participation?.psp_account_status ?? 'not_started';
  const active = products.filter((p) => !p.archived_at);
  const approved = application.status === 'approved';
  const feePaid = stall.fee?.status === 'paid';
  const steps: { key: string; done: boolean; href: string }[] = [
    {
      key: 'submit',
      done: application.status !== 'draft',
      href: application.status === 'draft' ? '/vendor/apply' : '/vendor/application',
    },
    { key: 'approved', done: approved, href: '/vendor/application' },
    { key: 'fee', done: feePaid, href: '/vendor/stall' },
    {
      key: 'profile',
      done: !!vendor.story && !!vendor.logo_path && gallery.length > 0,
      href: '/vendor/profile',
    },
    { key: 'products', done: active.length > 0, href: '/vendor/products/new' },
    { key: 'onSale', done: active.some((p) => p.onSale), href: '/vendor/products/availability' },
    { key: 'payments', done: psp === 'eligible', href: '/vendor/payouts' },
  ];

  return (
    <div className="grid gap-6">
      <header className="grid gap-1">
        <p className="text-body-sm font-semibold text-primary">{event!.name}</p>
        <h1 className="font-display text-display-md font-semibold">
          {t('welcome', { name: vendor.display_name })}
        </h1>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card icon={<ClipboardList aria-hidden />} title={t('applicationTitle')}>
          <p>
            <Badge variant={STATUS_VARIANT[application.status] ?? 'neutral'}>
              {ta(`status.${application.status}`)}
            </Badge>
          </p>
          <Link
            href={application.status === 'draft' ? '/vendor/apply' : '/vendor/application'}
            className="text-body-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            {application.status === 'draft' ? ta('continue') : ta('view')}
          </Link>
        </Card>
        <Card icon={<MapPin aria-hidden />} title={t('stallTitle')}>
          <p className="text-body font-semibold">
            {stall.stall ? t('stallConfirmed', { number: stall.stall.number }) : t('stallNone')}
          </p>
          <p className="text-body-sm text-muted-foreground">
            {stall.fee ? t('feeStatus', { status: tFee(stall.fee.status) }) : t('feeNone')}
          </p>
          {stall.fee && (
            <Link
              href="/vendor/stall"
              className="text-body-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              {t('open')}
            </Link>
          )}
        </Card>
        <Card icon={<CreditCard aria-hidden />} title={t('paymentsTitle')}>
          <p>
            <Badge
              variant={psp === 'eligible' ? 'success' : psp === 'restricted' ? 'danger' : 'neutral'}
            >
              {t(`payments.${psp}`)}
            </Badge>
          </p>
          <p className="text-body-sm text-muted-foreground">{t('paymentsHint')}</p>
          <Link
            href="/vendor/payouts"
            className="text-body-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            {t('open')}
          </Link>
        </Card>
        <Card icon={<ShoppingBag aria-hidden />} title={t('todayTitle')}>
          <dl className="grid grid-cols-2 gap-2">
            <div>
              <dt className="text-caption text-muted-foreground">{t('orders')}</dt>
              <dd className="text-heading-md font-semibold tabular-nums">0</dd>
            </div>
            <div>
              <dt className="text-caption text-muted-foreground">{t('sales')}</dt>
              <dd className="text-heading-md font-semibold tabular-nums">{formatNok(ore(0))}</dd>
            </div>
          </dl>
          <p className="text-body-sm text-muted-foreground">{t('todayHint')}</p>
        </Card>
      </div>

      <section
        aria-labelledby="next-steps"
        className="grid gap-3 rounded-xl border border-border bg-card p-5"
      >
        <h2 id="next-steps" className="text-heading-md font-semibold">
          {t('nextTitle')}
        </h2>
        <ol className="grid gap-1" data-testid="next-steps">
          {steps.map((step) => (
            <li key={step.key} className="flex min-h-11 items-center gap-3">
              {step.done ? (
                <CircleCheck
                  aria-hidden
                  className="size-5 shrink-0 text-success-subtle-foreground"
                />
              ) : (
                <CircleDashed aria-hidden className="size-5 shrink-0 text-muted-foreground" />
              )}
              <span className="sr-only">{step.done ? t('done') : t('todo')}: </span>
              {step.done ? (
                <span className={step.done ? 'text-muted-foreground' : undefined}>
                  {t(`steps.${step.key as 'submit'}`)}
                </span>
              ) : (
                <Link
                  href={step.href}
                  className="font-medium text-primary underline-offset-4 hover:underline"
                >
                  {t(`steps.${step.key as 'submit'}`)}
                </Link>
              )}
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
