'use client';

import NextLink from 'next/link';
import { usePathname as useNextPathname } from 'next/navigation';
import type { ComponentProps } from 'react';
import { localizePath, splitLocale } from './paths';
import type { Locale } from './routing';

/**
 * Locale-aware links without next-intl's client runtime, which keeps public pages within
 * the JS budget (NFR-01). The current locale is read from the URL.
 */
export function useLocalePath() {
  return splitLocale(useNextPathname());
}

/** Like next/link, but `href` is locale-free ("/vendor"); `locale` switches language. */
export function Link({
  href,
  locale,
  ...props
}: Omit<ComponentProps<typeof NextLink>, 'href' | 'locale'> & { href: string; locale?: Locale }) {
  const current = useLocalePath();
  const target = locale ?? current.locale;
  return (
    <NextLink
      href={localizePath(href, target)}
      hrefLang={locale && locale !== current.locale ? locale : undefined}
      {...props}
    />
  );
}
