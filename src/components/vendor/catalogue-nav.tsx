import { clsx } from 'clsx';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/link';
import { CLIENT_NAMESPACES } from '@/i18n/client-messages';

/** Messages the catalogue's client components read with useTranslations. */
export const CATALOGUE_NAMESPACES = [...CLIENT_NAMESPACES, 'Catalogue', 'Allergens', 'Dietary'];

const PAGES = [
  { key: 'products', href: '/vendor/products' },
  { key: 'availability', href: '/vendor/products/availability' },
  { key: 'new', href: '/vendor/products/new' },
] as const;

export async function CatalogueNav({ active }: { active: (typeof PAGES)[number]['key'] | null }) {
  const t = await getTranslations('Catalogue.nav');
  return (
    <nav aria-label={t('label')}>
      <ul className="flex flex-wrap gap-2 border-b border-border">
        {PAGES.map((page) => (
          <li key={page.key}>
            <Link
              href={page.href}
              aria-current={page.key === active ? 'page' : undefined}
              className={clsx(
                '-mb-px inline-flex min-h-11 items-center border-b-2 px-3 text-body-sm font-medium transition-colors',
                page.key === active
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              {t(page.key)}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
