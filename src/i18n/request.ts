import { hasLocale } from 'next-intl';
import { getRequestConfig } from 'next-intl/server';
import { OSLO_TIME_ZONE } from '@/lib/format';
import { routing } from './routing';

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;

  return {
    locale,
    timeZone: OSLO_TIME_ZONE,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
