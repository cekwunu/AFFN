import { ArrowLeft } from 'lucide-react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { KitchenBoard } from '@/components/kitchen/kitchen-board';
import { Link } from '@/i18n/link';
import { initRequestLocale } from '@/i18n/server';
import { getKitchenOrders, kitchenProducts, myKitchen } from '@/lib/orders/server';
import { setAvailability } from '@/app/[locale]/(vendor)/vendor/products/actions';
import { advanceOrder, cancelOrder, loadKitchen } from './actions';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Kitchen');
  return { title: t('title'), robots: { index: false } };
}

/** Kitchen display for the vendor's current event (ORD-02). */
export default async function KitchenPage({ params }: PageProps<'/[locale]/vendor/kitchen'>) {
  initRequestLocale((await params).locale);
  const t = await getTranslations('Kitchen');
  const kitchen = await myKitchen();
  const back = (
    <Link
      href="/vendor"
      className="inline-flex h-11 items-center gap-2 rounded-md px-3 text-body-sm font-medium hover:bg-accent"
    >
      <ArrowLeft aria-hidden className="size-4" />
      {t('back')}
    </Link>
  );
  if (!kitchen) {
    return (
      <div className="mx-auto grid max-w-lg gap-4 py-16 text-center">
        <h1 className="font-display text-display-md font-semibold">{t('title')}</h1>
        <p className="text-body text-muted-foreground">{t('notApproved')}</p>
        <div>{back}</div>
      </div>
    );
  }
  const [orders, products] = await Promise.all([
    getKitchenOrders(kitchen.participation.id),
    kitchenProducts(kitchen.vendor.id, kitchen.participation.id),
  ]);

  return (
    <>
      <header className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1">
        {back}
        <h1 className="font-display text-heading-lg font-semibold">
          {t('heading', { vendor: kitchen.vendor.display_name })}
        </h1>
        <p className="text-body-sm text-muted-foreground">
          {kitchen.event.name}
          {kitchen.stall && ` · ${t('stall', { number: kitchen.stall })}`}
        </p>
        {kitchen.participation.is_paused && (
          <p className="rounded-full bg-warning-subtle px-3 py-1 text-body-sm font-semibold text-warning-subtle-foreground">
            {t('paused')}
          </p>
        )}
      </header>
      <KitchenBoard
        eventVendorId={kitchen.participation.id}
        initial={{ orders, products }}
        load={loadKitchen}
        advance={advanceOrder}
        cancel={cancelOrder}
        setSoldOut={setAvailability}
      />
    </>
  );
}
