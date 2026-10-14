import { use } from 'react';
import { LocaleSwitcher } from '@/components/locale-switcher';
import { Brand } from '@/components/shells/brand';
import { ThemeToggle } from '@/components/theme-toggle';
import { initRequestLocale } from '@/i18n/server';

// Sign-in, sign-up, MFA and other account pages: a calm, centred layout.
export default function AuthLayout({ children, params }: LayoutProps<'/[locale]'>) {
  initRequestLocale(use(params).locale);
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 sm:px-6">
          <Brand />
          <div className="ml-auto flex items-center gap-2">
            <LocaleSwitcher />
            <ThemeToggle />
          </div>
        </div>
      </header>
      <main id="main" className="flex flex-1 items-start justify-center px-4 py-12 sm:py-20">
        <div className="w-full max-w-md">{children}</div>
      </main>
    </div>
  );
}
