import { NextIntlClientProvider, useMessages } from 'next-intl';
import type { ReactNode } from 'react';
import { CLIENT_NAMESPACES, pickMessages } from '@/i18n/client-messages';

/**
 * Provides translations to client components below it. Not used on public pages: their
 * client islands receive translated strings as props, so they ship no next-intl client
 * runtime (NFR-01). Use it in areas whose client components call useTranslations.
 */
export function ClientIntl({
  children,
  namespaces = CLIENT_NAMESPACES,
}: {
  children: ReactNode;
  namespaces?: readonly string[];
}) {
  const messages = pickMessages(useMessages(), namespaces);
  return <NextIntlClientProvider messages={messages}>{children}</NextIntlClientProvider>;
}
