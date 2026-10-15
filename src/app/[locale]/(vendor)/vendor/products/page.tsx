import { clsx } from 'clsx';
import { Plus } from 'lucide-react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ClientIntl } from '@/components/client-intl';
import { buttonVariants } from '@/components/ui/button-variants';
import { CATALOGUE_NAMESPACES, CatalogueNav } from '@/components/vendor/catalogue-nav';
import { ProductList } from '@/components/vendor/product-list';
import { Link } from '@/i18n/link';
import { initRequestLocale } from '@/i18n/server';
import { allergenSummary } from '@/lib/catalogue/labels';
import { listMyProducts, myParticipation, myVendor } from '@/lib/catalogue/server';
import { formatNok } from '@/lib/format';
import { ore } from '@/lib/money';
import { publicObjectUrl } from '@/lib/storage';
import { currentApplicationEvent } from '@/lib/vendor/server';
import { deleteProduct, duplicateProduct, reorderProducts, setArchived } from './actions';
import { NoVendor } from './no-vendor';

export const metadata: Metadata = { robots: { index: false } };

const DONE = ['duplicated', 'archived', 'restored', 'deleted'] as const;
const ERRORS = ['ordered', 'forbidden'] as const;

/** The vendor's menu (CAT-01, CAT-03). */
export default async function ProductsPage({
  params,
  searchParams,
}: PageProps<'/[locale]/vendor/products'>) {
  initRequestLocale((await params).locale);
  const t = await getTranslations('Catalogue');
  const vendor = await myVendor();
  if (!vendor) return <NoVendor title={t('title')} />;
  const query = await searchParams;
  const archived = query.show === 'archived';
  const event = await currentApplicationEvent();
  const participation = event ? await myParticipation(vendor.id, event.id) : null;
  const all = await listMyProducts(vendor.id, participation?.id ?? null);
  const summary = await allergenSummary();
  const products = all.filter((p) => !!p.archived_at === archived);
  const done = DONE.find((d) => d === query.done);
  const error = ERRORS.find((e) => e === query.error);
  const tab = (active: boolean) =>
    clsx(
      'inline-flex min-h-10 items-center rounded-full border px-3.5 text-body-sm font-medium',
      active
        ? 'border-primary bg-primary text-primary-foreground'
        : 'border-border bg-card hover:bg-accent',
    );

  return (
    <div className="grid gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="grid gap-1">
          <h1 className="font-display text-display-md font-semibold">{t('title')}</h1>
          <p className="text-body text-muted-foreground">{t('intro')}</p>
        </div>
        <Link href="/vendor/products/new" className={buttonVariants({ size: 'lg' })}>
          <Plus aria-hidden />
          {t('add')}
        </Link>
      </header>
      <CatalogueNav active="products" />

      <nav aria-label={t('title')} className="flex gap-2">
        <Link
          href="/vendor/products"
          aria-current={!archived ? 'page' : undefined}
          className={tab(!archived)}
        >
          {t('showActive')} ({all.filter((p) => !p.archived_at).length})
        </Link>
        <Link
          href="/vendor/products?show=archived"
          aria-current={archived ? 'page' : undefined}
          className={tab(archived)}
        >
          {t('showArchived')} ({all.filter((p) => p.archived_at).length})
        </Link>
      </nav>

      {done && (
        <p
          role="status"
          className="rounded-lg bg-success-subtle px-4 py-3 text-body-sm text-success-subtle-foreground"
        >
          {t(done)}
        </p>
      )}
      {error && (
        <p
          role="alert"
          className="rounded-lg bg-danger-subtle px-4 py-3 text-body-sm text-danger-subtle-foreground"
        >
          {t(`errors.${error}`)}
        </p>
      )}

      {products.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-6 py-10 text-center text-muted-foreground">
          {archived ? t('emptyArchived') : t('empty')}
        </p>
      ) : (
        <ClientIntl namespaces={CATALOGUE_NAMESPACES}>
          <ProductList
            key={`${archived}-${products.map((p) => p.id).join()}`}
            archived={archived}
            items={products.map((p) => ({
              id: p.id,
              name: p.name,
              price: formatNok(ore(p.price_ore)),
              imageUrl: publicObjectUrl('vendor-media', p.image_path),
              allergens: summary(p.allergens),
              onSale: p.onSale,
              soldOut: p.soldOut,
              ordered: p.ordered,
            }))}
            reorder={reorderProducts}
            duplicate={duplicateProduct}
            setArchived={setArchived}
            remove={deleteProduct}
          />
        </ClientIntl>
      )}
    </div>
  );
}
