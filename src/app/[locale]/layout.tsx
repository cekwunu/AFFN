import type { Metadata } from 'next';
import { hasLocale, NextIntlClientProvider } from 'next-intl';
import { initRequestLocale } from '@/i18n/server';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { LocaleSwitcher } from '@/components/locale-switcher';
import { Link } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';
import '@/styles/globals.css';

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: LayoutProps<'/[locale]'>): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: 'Metadata' });
  return { title: t('title'), description: t('description') };
}

export default async function LocaleLayout({
  children,
  params,
}: LayoutProps<'/[locale]'> & { children: ReactNode }) {
  const locale = initRequestLocale((await params).locale);
  const t = await getTranslations('Layout');

  return (
    <html lang={locale}>
      <body className="min-h-screen">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:m-2 focus:bg-surface focus:p-2"
        >
          {t('skipToContent')}
        </a>
        <NextIntlClientProvider>
          <header className="border-b border-line bg-surface">
            <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
              <Link href="/" className="font-semibold tracking-tight">
                {t('brand')}
              </Link>
              <LocaleSwitcher />
            </div>
          </header>
          <main id="main" className="mx-auto max-w-5xl px-6 py-12">
            {children}
          </main>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
