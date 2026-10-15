import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ClientIntl } from '@/components/client-intl';
import { CATALOGUE_NAMESPACES, CatalogueNav } from '@/components/vendor/catalogue-nav';
import { ProductForm } from '@/components/vendor/product-form';
import { initRequestLocale } from '@/i18n/server';
import { myVendor, productCategories } from '@/lib/catalogue/server';
import { saveProduct } from '../actions';
import { NoVendor } from '../no-vendor';

export const metadata: Metadata = { robots: { index: false } };

export default async function NewProductPage({
  params,
}: PageProps<'/[locale]/vendor/products/new'>) {
  const locale = initRequestLocale((await params).locale);
  const t = await getTranslations('Catalogue.form');
  const vendor = await myVendor();
  if (!vendor) return <NoVendor title={t('newTitle')} />;
  const categories = await productCategories(vendor.organization_id);

  return (
    <div className="grid gap-6">
      <h1 className="font-display text-display-md font-semibold">{t('newTitle')}</h1>
      <CatalogueNav active="new" />
      <ClientIntl namespaces={CATALOGUE_NAMESPACES}>
        <ProductForm
          action={saveProduct}
          vendorId={vendor.id}
          mvaRegistered={vendor.mva_registered}
          categories={categories.map((c) => ({
            id: c.id,
            name: locale === 'en' ? c.name_en : c.name_nb,
          }))}
          initial={{
            name: '',
            description: '',
            price: '',
            categoryId: '',
            mvaRateBp: '0',
            dietaryTags: [],
            allergens: [],
            noAllergens: false,
            imagePath: null,
            imageUrl: null,
          }}
        />
      </ClientIntl>
    </div>
  );
}
