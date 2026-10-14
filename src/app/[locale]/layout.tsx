import type { Metadata } from 'next';
import { hasLocale, NextIntlClientProvider } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { Providers } from '@/components/providers';
import { routing } from '@/i18n/routing';
import { initRequestLocale } from '@/i18n/server';
import { fraunces, inter } from '@/lib/fonts';
import { cn } from '@/lib/utils';
import '@/styles/globals.css';

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: LayoutProps<'/[locale]'>): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: 'Metadata' });
  return {
    title: { default: t('title'), template: `%s · ${t('title')}` },
    description: t('description'),
  };
}

export default async function LocaleLayout({
  children,
  params,
}: LayoutProps<'/[locale]'> & { children: ReactNode }) {
  const locale = initRequestLocale((await params).locale);
  const t = await getTranslations('Layout');

  return (
    <html lang={locale} className={cn(inter.variable, fraunces.variable)} suppressHydrationWarning>
      <body className="min-h-dvh">
        <a
          href="#main"
          className="sr-only z-50 rounded-md bg-card px-4 py-2 font-medium focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:shadow-lg"
        >
          {t('skipToContent')}
        </a>
        <NextIntlClientProvider>
          <Providers>{children}</Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
