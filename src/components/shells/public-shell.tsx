import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { LocaleSwitcher } from '@/components/locale-switcher';
import { Motif } from '@/components/motif';
import { ThemeToggle } from '@/components/theme-toggle';
import { Link } from '@/i18n/link';
import { cn } from '@/lib/utils';
import { Brand } from './brand';
import { MobileNav } from './mobile-nav';
import type { NavItem } from './types';

/**
 * Public site: header (brand, nav, language, theme, mobile menu) and footer.
 * `embedded` renders without page landmarks, for previews inside another page.
 */
export function PublicShell({
  children,
  embedded = false,
  className,
}: {
  children: ReactNode;
  embedded?: boolean;
  className?: string;
}) {
  const t = useTranslations('Shell');
  const nav: NavItem[] = [
    { href: '/', label: t('public.home') },
    { href: '/become-a-vendor', label: t('public.forVendors') },
    { href: '/sponsor', label: t('public.forSponsors') },
  ];
  const Header = embedded ? 'div' : 'header';
  const Main = embedded ? 'div' : 'main';
  const Footer = embedded ? 'div' : 'footer';

  return (
    <div className={cn('flex min-h-dvh flex-col bg-background', className)}>
      <Header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-8 px-4 sm:px-6">
          <Brand />
          <nav aria-label={t('public.navLabel')} className="hidden md:block">
            <ul className="flex items-center gap-1">
              {nav.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="inline-flex h-10 items-center rounded-md px-3 text-body-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <Link
              href="/sign-in"
              className="hidden h-10 items-center rounded-md px-3 text-body-sm font-medium text-foreground hover:bg-accent sm:inline-flex"
            >
              {t('public.signIn')}
            </Link>
            <LocaleSwitcher className="hidden sm:block" />
            <ThemeToggle />
            <MobileNav
              items={nav}
              label={t('public.navLabel')}
              openLabel={t('openMenu')}
              closeLabel={t('closeMenu')}
              className="md:hidden"
              footer={<LocaleSwitcher />}
            />
          </div>
        </div>
      </Header>

      <Main id={embedded ? undefined : 'main'} className="flex-1">
        {children}
      </Main>

      <Footer className="border-t border-border bg-card">
        <Motif className="opacity-60" />
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:px-6 md:grid-cols-[2fr_1fr_1fr]">
          <div className="grid gap-3">
            <Brand className="w-fit" />
            <p className="max-w-sm text-body-sm text-muted-foreground">{t('footer.tagline')}</p>
          </div>
          <div className="grid content-start gap-2">
            <p className="text-caption font-semibold tracking-wide text-muted-foreground uppercase">
              {t('footer.festival')}
            </p>
            <Link href="/" className="text-body-sm hover:text-link">
              {t('public.home')}
            </Link>
            <Link href="/become-a-vendor" className="text-body-sm hover:text-link">
              {t('public.forVendors')}
            </Link>
            <Link href="/sponsor" className="text-body-sm hover:text-link">
              {t('public.forSponsors')}
            </Link>
          </div>
          <div className="grid content-start gap-3">
            <p className="text-caption font-semibold tracking-wide text-muted-foreground uppercase">
              {t('footer.language')}
            </p>
            <LocaleSwitcher className="w-fit" />
          </div>
        </div>
        <div className="border-t border-border">
          <p className="mx-auto max-w-6xl px-4 py-6 text-caption text-muted-foreground sm:px-6">
            {t('footer.copyright', { year: new Date().getFullYear() })}
          </p>
        </div>
      </Footer>
    </div>
  );
}
