import { ArrowLeft } from 'lucide-react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { ClientIntl } from '@/components/client-intl';
import { CATALOGUE_NAMESPACES, CatalogueNav } from '@/components/vendor/catalogue-nav';
import { ProductForm } from '@/components/vendor/product-form';
import { Link } from '@/i18n/link';
import { initRequestLocale } from '@/i18n/server';
import { getMyProduct, myVendor, productCategories } from '@/lib/catalogue/server';
import { publicObjectUrl } from '@/lib/storage';
import { saveProduct } from '../actions';
import { NoVendor } from '../no-vendor';

export const metadata: Metadata = { robots: { index: false } };

/** Øre as the kroner text a person types ("185" or "89,50"). */
const kroner = (amount: number) =>
  amount % 100 === 0
    ? String(amount / 100)
    : `${Math.floor(amount / 100)},${String(amount % 100).padStart(2, '0')}`;

export default async function EditProductPage({
  params,
  searchParams,
}: PageProps<'/[locale]/vendor/products/[id]'>) {
  const { locale: raw, id } = await params;
  const locale = initRequestLocale(raw);
  const t = await getTranslations('Catalogue.form');
  const vendor = await myVendor();
  if (!vendor) return <NoVendor title={t('editTitle', { name: '' })} />;
  const product = await getMyProduct(vendor.id, id);
  if (!product) notFound();
  const categories = await productCategories(vendor.organization_id);
  const created = (await searchParams).created === '1';

  return (
    <div className="grid gap-6">
      <Link
        href="/vendor/products"
        className="inline-flex w-fit items-center gap-1.5 text-body-sm font-medium text-primary underline-offset-4 hover:underline"
      >
        <ArrowLeft aria-hidden className="size-4" />
        {t('back')}
      </Link>
      <h1 className="font-display text-display-md font-semibold">
        {t('editTitle', { name: product.name })}
      </h1>
      <CatalogueNav active={null} />
      <ClientIntl namespaces={CATALOGUE_NAMESPACES}>
        <ProductForm
          action={saveProduct}
          vendorId={vendor.id}
          mvaRegistered={vendor.mva_registered}
          created={created}
          categories={categories.map((c) => ({
            id: c.id,
            name: locale === 'en' ? c.name_en : c.name_nb,
          }))}
          initial={{
            id: product.id,
            name: product.name,
            description: product.description ?? '',
            price: kroner(product.price_ore),
            categoryId: product.category_id ?? '',
            mvaRateBp: String(product.mva_rate_bp),
            dietaryTags: product.dietary_tags,
            allergens: product.allergens,
            noAllergens: product.allergens.length === 0,
            imagePath: product.image_path,
            imageUrl: publicObjectUrl('vendor-media', product.image_path),
          }}
        />
      </ClientIntl>
    </div>
  );
}
