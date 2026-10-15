import { CircleAlert } from 'lucide-react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { AddToCart } from '@/components/storefront/add-to-cart';
import { CartSheet } from '@/components/storefront/cart-sheet';
import { initRequestLocale } from '@/i18n/server';
import { sortAllergens } from '@/lib/catalogue/products';
import { formatNok } from '@/lib/format';
import { ore } from '@/lib/money';
import { getPaymentProvider } from '@/lib/payments';
import { publicObjectUrl } from '@/lib/storage';
import { getStorefront } from '@/lib/storefront/server';
import { cuisineCountryOptions } from '@/lib/vendor/application';
import { checkout } from './actions';

export async function generateMetadata({
  params,
}: PageProps<'/[locale]/e/[event]/[vendor]'>): Promise<Metadata> {
  const { event, vendor } = await params;
  const store = await getStorefront(event, vendor);
  if (!store) return {};
  return {
    title: `${store.vendor.display_name} · ${store.event.name}`,
    description: store.vendor.description ?? undefined,
  };
}

/**
 * The vendor page a visitor reaches by scanning the QR code (QR-02): server-rendered, menu
 * within one screen on a phone, two small client islands (add buttons and the cart).
 */
export default async function VendorStorefrontPage({
  params,
  searchParams,
}: PageProps<'/[locale]/e/[event]/[vendor]'>) {
  const { locale: rawLocale, event: eventSlug, vendor: vendorSlug } = await params;
  const locale = initRequestLocale(rawLocale);
  const store = await getStorefront(eventSlug, vendorSlug);
  if (!store) notFound();
  const t = await getTranslations('Storefront');
  const tA = await getTranslations('Allergens');
  const tD = await getTranslations('Dietary');
  const { vendor, event, menu, categories, blocked } = store;
  const paymentFailed = (await searchParams).payment === 'failed';
  const cartKey = store.eventVendorId;
  const cover = publicObjectUrl('vendor-media', vendor.cover_image_path);
  const logo = publicObjectUrl('vendor-media', vendor.logo_path);
  const country = cuisineCountryOptions(locale).find((c) => c.value === vendor.cuisine_country);

  // Menu sections in category order; uncategorised products last.
  const sections = [
    ...categories.map((c) => ({
      id: c.id,
      name: locale === 'en' ? c.name_en : c.name_nb,
      items: menu.filter((p) => p.category_id === c.id),
    })),
    { id: 'other', name: t('other'), items: menu.filter((p) => !p.category_id) },
  ].filter((s) => s.items.length > 0);

  return (
    <div className="mx-auto grid w-full max-w-3xl gap-5 px-4 pt-4 pb-28 sm:px-6">
      <header className="grid gap-3">
        {cover && (
          <div className="relative h-28 overflow-hidden rounded-xl bg-muted sm:h-44">
            <Image
              src={cover}
              alt={t('coverAlt', { name: vendor.display_name })}
              fill
              priority
              sizes="(min-width: 768px) 720px, 100vw"
              className="object-cover"
            />
          </div>
        )}
        <div className="flex items-center gap-3">
          {logo && (
            <Image
              src={logo}
              alt={t('logoAlt', { name: vendor.display_name })}
              width={56}
              height={56}
              className="size-14 shrink-0 rounded-full border border-border object-cover"
            />
          )}
          <div className="grid min-w-0">
            <p className="text-caption font-semibold tracking-wide text-primary uppercase">
              {event.name}
            </p>
            <h1 className="font-display text-heading-lg leading-tight font-semibold sm:text-display-md">
              {vendor.display_name}
            </h1>
            {country && (
              <p className="text-body-sm text-muted-foreground">
                {t('cuisine', { country: country.label })}
              </p>
            )}
          </div>
        </div>
        {vendor.description && (
          <p className="line-clamp-2 text-body text-muted-foreground">{vendor.description}</p>
        )}
      </header>

      {blocked && (
        <p
          role="status"
          className="flex gap-3 rounded-lg bg-warning-subtle p-4 text-body-sm text-warning-subtle-foreground"
        >
          <CircleAlert aria-hidden className="size-5 shrink-0" />
          {t(`blocked.${blocked}`, { name: vendor.display_name, event: event.name })}
        </p>
      )}
      {paymentFailed && !blocked && (
        <p
          role="alert"
          className="flex gap-3 rounded-lg bg-danger-subtle p-4 text-body-sm text-danger-subtle-foreground"
        >
          <CircleAlert aria-hidden className="size-5 shrink-0" />
          {t('paymentFailed')}
        </p>
      )}

      {sections.length > 1 && (
        <nav
          aria-label={t('categories')}
          className="sticky top-0 z-30 -mx-4 overflow-x-auto border-b border-border bg-background/95 px-4 py-2 backdrop-blur sm:-mx-6 sm:px-6"
        >
          <ul className="flex gap-2">
            {sections.map((s) => (
              <li key={s.id}>
                <a
                  href={`#c-${s.id}`}
                  className="inline-flex h-9 items-center rounded-full border border-border bg-card px-3.5 text-body-sm font-medium whitespace-nowrap hover:bg-accent"
                >
                  {s.name}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      )}

      <div className="grid gap-6">
        <h2 className="sr-only">{t('menu')}</h2>
        {sections.map((section) => (
          <section
            key={section.id}
            id={`c-${section.id}`}
            aria-labelledby={`h-${section.id}`}
            className="grid scroll-mt-16 gap-3"
          >
            <h2 id={`h-${section.id}`} className="font-display text-heading-md font-semibold">
              {section.name}
            </h2>
            <ul className="grid gap-3">
              {section.items.map((item, index) => {
                const image = publicObjectUrl('vendor-media', item.image_path);
                const allergens = sortAllergens(item.allergens);
                return (
                  <li
                    key={item.id}
                    data-testid="storefront-item"
                    className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 rounded-xl border border-border bg-card p-3.5"
                  >
                    <div className="grid content-start gap-1">
                      <h3 className="text-body font-semibold">{item.name}</h3>
                      {item.description && (
                        <p className="line-clamp-2 text-body-sm text-muted-foreground">
                          {item.description}
                        </p>
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
                        <p className="flex flex-wrap gap-1">
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
                      <p className="text-caption text-muted-foreground">
                        <span className="font-semibold">{t('allergens')}: </span>
                        {allergens.length
                          ? allergens.map((a) => tA(a)).join(', ')
                          : t('noAllergens')}
                      </p>
                      <div className="mt-1.5">
                        {item.soldOut ? (
                          <span className="inline-flex h-9 items-center rounded-full bg-warning-subtle px-3 text-body-sm font-semibold text-warning-subtle-foreground">
                            {t('soldOut')}
                          </span>
                        ) : (
                          !blocked && (
                            <AddToCart
                              cartKey={cartKey}
                              productId={item.id}
                              labels={{
                                add: t('add'),
                                addNamed: t('addNamed', { name: item.name }),
                                decrease: t('decrease', { name: item.name }),
                                increase: t('increase', { name: item.name }),
                              }}
                            />
                          )
                        )}
                      </div>
                    </div>
                    {image && (
                      <Image
                        src={image}
                        alt={item.name}
                        width={112}
                        height={112}
                        sizes="112px"
                        loading={index < 2 && section === sections[0] ? 'eager' : 'lazy'}
                        className={`size-24 rounded-lg object-cover sm:size-28 ${item.soldOut ? 'opacity-50 grayscale' : ''}`}
                      />
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>

      {vendor.story && (
        <details className="rounded-xl border border-border bg-card p-4">
          <summary className="cursor-pointer text-body font-semibold">
            {t('about', { name: vendor.display_name })}
          </summary>
          <p className="mt-3 text-body whitespace-pre-line">{vendor.story}</p>
        </details>
      )}

      {!blocked && (
        <CartSheet
          cartKey={cartKey}
          products={menu
            .filter((p) => !p.soldOut)
            .map((p) => ({ id: p.id, name: p.name, priceOre: p.price_ore }))}
          event={eventSlug}
          vendor={vendorSlug}
          locale={locale}
          testMode={getPaymentProvider().testMode}
          action={checkout}
          labels={{
            open: t('cart.open', { total: '{total}' }),
            itemOne: t('cart.itemOne', { count: '{count}' }),
            itemOther: t('cart.itemOther', { count: '{count}' }),
            title: t('cart.title'),
            close: t('cart.close'),
            empty: t('cart.empty'),
            total: t('cart.total'),
            name: t('cart.name'),
            nameHint: t('cart.nameHint'),
            note: t('cart.note'),
            noteHint: t('cart.noteHint'),
            pay: t('cart.pay', { total: '{total}' }),
            paying: t('cart.paying'),
            methods: t('cart.methods'),
            testMode: t('cart.testMode'),
            decrease: t('decrease', { name: '{name}' }),
            increase: t('increase', { name: '{name}' }),
            errors: {
              empty: t('cart.errors.empty'),
              unavailable: t('cart.errors.unavailable'),
              price_changed: t('cart.errors.price_changed'),
              not_selling: t('cart.errors.not_selling'),
              rate_limited: t('cart.errors.rate_limited'),
              failed: t('cart.errors.failed'),
            },
          }}
        />
      )}
    </div>
  );
}
