import { hasLocale } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { routing, type Locale } from './routing';

/** Validates the [locale] segment and enables static rendering for this request. */
export function initRequestLocale(locale: string): Locale {
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  return locale;
}
