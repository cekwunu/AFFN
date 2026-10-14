import { defaultLocale, locales, type Locale } from './routing';

function isLocale(value: string | undefined): value is Locale {
  return locales.includes(value as Locale);
}

/**
 * Splits a browser pathname into its locale and the locale-free path.
 * "/en/vendor" → { locale: 'en', path: '/vendor' }; "/vendor" → { locale: 'nb', path: '/vendor' }.
 */
export function splitLocale(pathname: string): { locale: Locale; path: string } {
  const [, first, ...rest] = pathname.split('/');
  if (isLocale(first)) return { locale: first, path: `/${rest.join('/')}` };
  return { locale: defaultLocale, path: pathname || '/' };
}

/**
 * Adds the locale prefix to an internal path (`localePrefix: 'as-needed'`: bokmål has none).
 * Hash-only and external links are returned unchanged.
 */
export function localizePath(path: string, locale: Locale): string {
  if (!path.startsWith('/') || path.startsWith('//')) return path;
  if (locale === defaultLocale) return path;
  return path === '/' ? `/${locale}` : `/${locale}${path}`;
}
