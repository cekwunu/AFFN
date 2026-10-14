import { defineRouting } from 'next-intl/routing';

export const locales = ['nb', 'en'] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = 'nb';

export const routing = defineRouting({
  locales,
  defaultLocale,
  // Bokmål has no prefix ("/vendor"); English lives under "/en/vendor".
  localePrefix: 'as-needed',
  // Bokmål is the default for everyone; English is chosen with the locale switcher,
  // not inferred from the browser's Accept-Language.
  localeDetection: false,
});
