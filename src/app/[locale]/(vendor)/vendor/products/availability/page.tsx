import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ClientIntl } from '@/components/client-intl';
import { AvailabilityList } from '@/components/vendor/availability-list';
import { CATALOGUE_NAMESPACES, CatalogueNav } from '@/components/vendor/catalogue-nav';
import { initRequestLocale } from '@/i18n/server';
import { listMyProducts, myParticipation, myVendor } from '@/lib/catalogue/server';
import { formatNok } from '@/lib/format';
import { ore } from '@/lib/money';
import { currentApplicationEvent } from '@/lib/vendor/server';
import { setAvailability } from '../actions';
import { NoVendor } from '../no-vendor';

export const metadata: Metadata = { robots: { index: false } };

/** Products on sale at the current event, with sold-out toggles (CAT-02). */
export default async function AvailabilityPage({
  params,
}: PageProps<'/[locale]/vendor/products/availability'>) {
  initRequestLocale((await params).locale);
  const t = await getTranslations('Catalogue');
  const vendor = await myVendor();
  const event = await currentApplicationEvent();
  const title = t('availability.title', { event: event?.name ?? '' });
  if (!vendor) return <NoVendor title={title} />;
  const participation = event ? await myParticipation(vendor.id, event.id) : null;
  const approved = participation?.status === 'approved';
  const products = approved
    ? (await listMyProducts(vendor.id, participation.id)).filter((p) => !p.archived_at)
    : [];

  return (
    <div className="grid gap-6">
      <header className="grid gap-1">
        <h1 className="font-display text-display-md font-semibold">{title}</h1>
        <p className="text-body text-muted-foreground">{t('availability.intro')}</p>
      </header>
      <CatalogueNav active="availability" />
      {!approved ? (
        <p className="rounded-xl border border-border bg-card p-6 text-body text-muted-foreground">
          {t('availability.noEvent')}
        </p>
      ) : products.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-6 py-10 text-center text-muted-foreground">
          {t('availability.empty')}
        </p>
      ) : (
        <ClientIntl namespaces={CATALOGUE_NAMESPACES}>
          <AvailabilityList
            items={products.map((p) => ({
              id: p.id,
              name: p.name,
              price: formatNok(ore(p.price_ore)),
              onSale: p.onSale,
              soldOut: p.soldOut,
            }))}
            update={setAvailability}
          />
        </ClientIntl>
      )}
    </div>
  );
}
