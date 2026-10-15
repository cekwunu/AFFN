import { Eye } from 'lucide-react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { ClientIntl } from '@/components/client-intl';
import { buttonVariants } from '@/components/ui/button-variants';
import { GalleryEditor } from '@/components/vendor/gallery-editor';
import { ProfileForm } from '@/components/vendor/profile-form';
import { MediaUpload } from '@/components/vendor/uploads';
import { Link } from '@/i18n/link';
import { CLIENT_NAMESPACES } from '@/i18n/client-messages';
import { initRequestLocale } from '@/i18n/server';
import { myGallery, myVendor } from '@/lib/catalogue/server';
import { publicObjectUrl } from '@/lib/storage';
import { MEDIA_ACCEPT, MEDIA_MAX_BYTES } from '@/lib/vendor/application';
import { GALLERY_MAX } from '@/lib/vendor/profile';
import { NoVendor } from '../products/no-vendor';
import {
  addGalleryImage,
  moveGalleryImage,
  removeGalleryImage,
  saveProfile,
  setProfileMedia,
} from './actions';

export const metadata: Metadata = { robots: { index: false } };

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="grid gap-4 rounded-xl border border-border bg-card p-5">
      <div className="grid gap-1">
        <h2 className="text-heading-sm font-semibold">{title}</h2>
        {hint && <p className="text-body-sm text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

/** Business profile editor (VIS-02): story, gallery, contact, social links, catering. */
export default async function ProfilePage({ params }: PageProps<'/[locale]/vendor/profile'>) {
  initRequestLocale((await params).locale);
  const t = await getTranslations('Profile');
  const tApply = await getTranslations('Apply.profile');
  const vendor = await myVendor();
  if (!vendor) return <NoVendor title={t('title')} />;
  const gallery = await myGallery(vendor.id);
  const mediaLabels = (kind: string) => ({
    uploading: tApply('uploading'),
    uploaded: tApply('uploaded'),
    failed: t('errors.unknown'),
    alt: tApply('imageAlt', { kind }),
  });

  return (
    <ClientIntl namespaces={[...CLIENT_NAMESPACES, 'Profile', 'Apply']}>
      <div className="grid gap-6">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div className="grid gap-1">
            <h1 className="font-display text-display-md font-semibold">{t('title')}</h1>
            <p className="text-body text-muted-foreground">{t('intro')}</p>
          </div>
          <Link href="/vendor/preview" className={buttonVariants({ variant: 'outline' })}>
            <Eye aria-hidden />
            {t('preview')}
          </Link>
        </header>

        <ProfileForm
          action={saveProfile}
          initial={{
            displayName: vendor.display_name,
            description: vendor.description ?? '',
            story: vendor.story ?? '',
            publicEmail: vendor.public_email ?? '',
            publicPhone: vendor.public_phone ?? '',
            websiteUrl: vendor.website_url ?? '',
            instagramHandle: vendor.instagram_handle ?? '',
            facebookUrl: vendor.facebook_url ?? '',
            tiktokHandle: vendor.tiktok_handle ?? '',
            offersCatering: vendor.offers_catering,
            cateringOffer: vendor.catering_offer ?? '',
            profilePublished: vendor.profile_published,
          }}
        />

        <Section title={tApply('mediaTitle')}>
          <div className="grid gap-6 md:grid-cols-2">
            <MediaUpload
              vendorId={vendor.id}
              kind="logo"
              label={tApply('logo')}
              hint={tApply('logoHint')}
              currentUrl={publicObjectUrl('vendor-media', vendor.logo_path)}
              accept={MEDIA_ACCEPT}
              maxSizeBytes={MEDIA_MAX_BYTES}
              save={setProfileMedia}
              labels={mediaLabels(tApply('logo'))}
            />
            <MediaUpload
              vendorId={vendor.id}
              kind="cover"
              label={tApply('cover')}
              hint={tApply('coverHint')}
              currentUrl={publicObjectUrl('vendor-media', vendor.cover_image_path)}
              accept={MEDIA_ACCEPT}
              maxSizeBytes={MEDIA_MAX_BYTES}
              save={setProfileMedia}
              labels={mediaLabels(tApply('cover'))}
            />
          </div>
        </Section>

        <Section title={t('galleryTitle')} hint={t('galleryHint')}>
          <GalleryEditor
            vendorId={vendor.id}
            max={GALLERY_MAX}
            images={gallery.map((g) => ({
              id: g.id,
              url: publicObjectUrl('vendor-media', g.storage_path)!,
              alt: g.alt_text,
            }))}
            add={addGalleryImage}
            remove={removeGalleryImage}
            move={moveGalleryImage}
          />
        </Section>
      </div>
    </ClientIntl>
  );
}
