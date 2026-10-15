import { Eye } from 'lucide-react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { buttonVariants } from '@/components/ui/button-variants';
import { VendorPage } from '@/components/vendor-page/vendor-page';
import { Link } from '@/i18n/link';
import { initRequestLocale } from '@/i18n/server';
import { listMyProducts, myGallery, myParticipation, myVendor } from '@/lib/catalogue/server';
import { currentApplicationEvent } from '@/lib/vendor/server';
import { NoVendor } from '../products/no-vendor';

export const metadata: Metadata = { robots: { index: false } };

/** The public vendor page as guests will see it at the current event. */
export default async function PreviewPage({ params }: PageProps<'/[locale]/vendor/preview'>) {
  const locale = initRequestLocale((await params).locale);
  const t = await getTranslations('VendorPreview');
  const vendor = await myVendor();
  if (!vendor) return <NoVendor title={t('title')} />;
  const event = await currentApplicationEvent();
  const participation = event ? await myParticipation(vendor.id, event.id) : null;
  const [products, gallery] = await Promise.all([
    listMyProducts(vendor.id, participation?.id ?? null),
    myGallery(vendor.id),
  ]);
  const menu = products.filter((p) => p.onSale && !p.archived_at);

  return (
    <div className="mx-auto grid w-full max-w-3xl gap-6">
      <header className="grid gap-3">
        <h1 className="font-display text-display-md font-semibold">{t('title')}</h1>
        <p className="flex gap-3 rounded-lg bg-info-subtle p-4 text-body-sm text-info-subtle-foreground">
          <Eye aria-hidden className="size-5 shrink-0" />
          <span>
            {t('banner', { event: event?.name ?? '' })}
            {!vendor.profile_published && <> {t('notPublished')}</>}
          </span>
        </p>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/vendor/profile"
            className={buttonVariants({ variant: 'outline', size: 'sm' })}
          >
            {t('edit')}
          </Link>
          <Link
            href="/vendor/products"
            className={buttonVariants({ variant: 'outline', size: 'sm' })}
          >
            {t('editMenu')}
          </Link>
        </div>
      </header>
      <div className="rounded-2xl border border-border bg-background p-4 sm:p-6">
        <VendorPage locale={locale} data={{ vendor, gallery, menu }} />
      </div>
    </div>
  );
}
