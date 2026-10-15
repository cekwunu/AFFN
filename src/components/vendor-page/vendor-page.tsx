import { Globe, Mail, Phone, UtensilsCrossed } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import type { Locale } from '@/i18n/routing';
import { sortAllergens } from '@/lib/catalogue/products';
import { formatNok } from '@/lib/format';
import { ore } from '@/lib/money';
import { publicObjectUrl } from '@/lib/storage';
import { cuisineCountryOptions } from '@/lib/vendor/application';

export interface VendorPageData {
  vendor: {
    display_name: string;
    description: string | null;
    story: string | null;
    logo_path: string | null;
    cover_image_path: string | null;
    cuisine_country: string | null;
    public_email: string | null;
    public_phone: string | null;
    website_url: string | null;
    instagram_handle: string | null;
    facebook_url: string | null;
    tiktok_handle: string | null;
    offers_catering: boolean;
    catering_offer: string | null;
  };
  gallery: { id: string; storage_path: string; alt_text: string }[];
  menu: {
    id: string;
    name: string;
    description: string | null;
    price_ore: number;
    mva_rate_bp: number;
    image_path: string | null;
    dietary_tags: string[];
    allergens: string[];
    soldOut: boolean;
  }[];
}

/**
 * The vendor page as visitors see it (VIS-02, QR-02): server-rendered, no client JavaScript.
 * Used by the vendor's preview now and by the public page (Prompt 10).
 */
export async function VendorPage({ data, locale }: { data: VendorPageData; locale: Locale }) {
  const t = await getTranslations('VendorPage');
  const tA = await getTranslations('Allergens');
  const tD = await getTranslations('Dietary');
  const { vendor, gallery, menu } = data;
  const cover = publicObjectUrl('vendor-media', vendor.cover_image_path);
  const logo = publicObjectUrl('vendor-media', vendor.logo_path);
  const country = cuisineCountryOptions(locale).find((c) => c.value === vendor.cuisine_country);
  const social = [
    vendor.instagram_handle && {
      label: 'Instagram',
      href: `https://www.instagram.com/${vendor.instagram_handle}`,
    },
    vendor.facebook_url && { label: 'Facebook', href: vendor.facebook_url },
    vendor.tiktok_handle && {
      label: 'TikTok',
      href: `https://www.tiktok.com/@${vendor.tiktok_handle}`,
    },
  ].filter(Boolean) as { label: string; href: string }[];
  const heading = 'font-display text-heading-lg font-semibold';

  return (
    <article className="grid gap-8">
      <header className="grid gap-4">
        {cover && (
          // eslint-disable-next-line @next/next/no-img-element -- user upload from Supabase Storage
          <img
            src={cover}
            alt={t('coverAlt', { name: vendor.display_name })}
            className="aspect-[16/7] w-full rounded-xl object-cover"
          />
        )}
        <div className="flex items-center gap-4">
          {logo && (
            // eslint-disable-next-line @next/next/no-img-element -- user upload from Supabase Storage
            <img
              src={logo}
              alt={t('logoAlt', { name: vendor.display_name })}
              className="size-16 rounded-full border border-border object-cover"
            />
          )}
          <div className="grid gap-1">
            <h2 className="font-display text-display-md font-semibold">{vendor.display_name}</h2>
            {country && (
              <p className="text-body-sm font-medium text-primary">
                {t('cuisine', { country: country.label })}
              </p>
            )}
          </div>
        </div>
        {vendor.description && <p className="max-w-prose text-body-lg">{vendor.description}</p>}
      </header>

      <section aria-labelledby="menu" className="grid gap-4">
        <h3 id="menu" className={heading}>
          {t('menu')}
        </h3>
        {menu.length === 0 ? (
          <p className="text-body text-muted-foreground">{t('menuEmpty')}</p>
        ) : (
          <ul className="grid gap-3" data-testid="menu">
            {menu.map((item) => {
              const image = publicObjectUrl('vendor-media', item.image_path);
              const allergens = sortAllergens(item.allergens);
              return (
                <li
                  key={item.id}
                  data-testid="menu-item"
                  className="grid grid-cols-[minmax(0,1fr)_auto] gap-4 rounded-xl border border-border bg-card p-4"
                >
                  <div className="grid content-start gap-1.5">
                    <h4 className="text-heading-sm font-semibold">
                      {item.name}
                      {item.soldOut && (
                        <span className="ml-2 rounded-full bg-warning-subtle px-2 py-0.5 align-middle text-caption font-semibold text-warning-subtle-foreground">
                          {t('soldOut')}
                        </span>
                      )}
                    </h4>
                    {item.description && (
                      <p className="text-body-sm text-muted-foreground">{item.description}</p>
                    )}
                    <p className="text-body font-semibold tabular-nums">
                      {formatNok(ore(item.price_ore))}
                      {item.mva_rate_bp > 0 && (
                        <span className="ml-1.5 text-caption font-normal text-muted-foreground">
                          {t('mvaIncluded', { rate: item.mva_rate_bp / 100 })}
                        </span>
                      )}
                    </p>
                    {item.dietary_tags.length > 0 && (
                      <p className="flex flex-wrap gap-1.5">
                        {item.dietary_tags.map((tag) => (
                          <span
                            key={tag}
                            className="rounded-full bg-secondary px-2 py-0.5 text-caption font-medium text-secondary-foreground"
                          >
                            {tD(tag as 'vegan')}
                          </span>
                        ))}
                      </p>
                    )}
                    <p className="text-caption" data-testid="allergens">
                      <span className="font-semibold">{tA('title')}: </span>
                      {allergens.length ? allergens.map((a) => tA(a)).join(', ') : tA('none')}
                    </p>
                  </div>
                  {image && (
                    // eslint-disable-next-line @next/next/no-img-element -- user upload from Supabase Storage
                    <img
                      src={image}
                      alt={t('productImageAlt', { name: item.name })}
                      loading="lazy"
                      className="size-24 rounded-lg object-cover sm:size-28"
                    />
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {vendor.story && (
        <section aria-labelledby="about" className="grid gap-3">
          <h3 id="about" className={heading}>
            {t('about')}
          </h3>
          <p className="max-w-prose text-body whitespace-pre-line">{vendor.story}</p>
        </section>
      )}

      {gallery.length > 0 && (
        <section aria-labelledby="gallery" className="grid gap-3">
          <h3 id="gallery" className={heading}>
            {t('gallery')}
          </h3>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {gallery.map((g) => (
              <li key={g.id}>
                {/* eslint-disable-next-line @next/next/no-img-element -- user upload from Supabase Storage */}
                <img
                  src={publicObjectUrl('vendor-media', g.storage_path)!}
                  alt={g.alt_text}
                  loading="lazy"
                  className="aspect-square w-full rounded-lg object-cover"
                />
              </li>
            ))}
          </ul>
        </section>
      )}

      {vendor.offers_catering && (
        <section aria-labelledby="catering" className="grid gap-3 rounded-xl bg-muted p-5">
          <h3 id="catering" className={`${heading} flex items-center gap-2`}>
            <UtensilsCrossed aria-hidden className="size-5 text-primary" />
            {t('catering')}
          </h3>
          <p className="max-w-prose text-body whitespace-pre-line">
            {vendor.catering_offer || t('cateringAvailable')}
          </p>
        </section>
      )}

      {(vendor.public_email || vendor.public_phone || vendor.website_url || social.length > 0) && (
        <section aria-labelledby="contact" className="grid gap-3">
          <h3 id="contact" className={heading}>
            {t('contact')}
          </h3>
          <ul className="grid gap-2 text-body">
            {vendor.public_email && (
              <li className="flex items-center gap-2">
                <Mail aria-hidden className="size-4 text-muted-foreground" />
                <a
                  href={`mailto:${vendor.public_email}`}
                  className="text-link underline-offset-4 hover:underline"
                >
                  {vendor.public_email}
                </a>
              </li>
            )}
            {vendor.public_phone && (
              <li className="flex items-center gap-2">
                <Phone aria-hidden className="size-4 text-muted-foreground" />
                <a
                  href={`tel:${vendor.public_phone.replace(/\s/g, '')}`}
                  className="text-link underline-offset-4 hover:underline"
                >
                  {vendor.public_phone}
                </a>
              </li>
            )}
            {vendor.website_url && (
              <li className="flex items-center gap-2">
                <Globe aria-hidden className="size-4 text-muted-foreground" />
                <a
                  href={vendor.website_url}
                  rel="noopener"
                  className="text-link underline-offset-4 hover:underline"
                >
                  {t('website')}
                </a>
              </li>
            )}
          </ul>
          {social.length > 0 && (
            <p className="flex flex-wrap gap-x-4 gap-y-1 text-body">
              <span className="font-medium">{t('follow')}:</span>
              {social.map((s) => (
                <a
                  key={s.label}
                  href={s.href}
                  rel="noopener"
                  className="text-link underline-offset-4 hover:underline"
                >
                  {s.label}
                </a>
              ))}
            </p>
          )}
        </section>
      )}
    </article>
  );
}
