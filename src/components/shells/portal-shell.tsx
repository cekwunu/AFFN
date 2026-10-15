'use client';

import { ArrowLeftRight, CircleUserRound, LayoutDashboard, LogOut, Settings } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { LocaleSwitcher } from '@/components/locale-switcher';
import { ThemeToggle } from '@/components/theme-toggle';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Toaster } from '@/components/ui/toast';
import { cn } from '@/lib/utils';
import { Link } from '@/i18n/link';
import type { Portal } from '@/lib/auth/roles';
import { Brand } from './brand';
import { MobileNav, NavList } from './mobile-nav';
import type { NavItem } from './types';

export type PortalArea = Portal;

export interface PortalAccount {
  email: string;
  /** Every portal the user may open; others than the current one appear in the switcher. */
  portals: Portal[];
  signOut: (formData: FormData) => Promise<void>;
}

/**
 * Signed-in areas: sidebar (sheet on mobile) and top bar.
 * `nav` defaults to the area's overview until feature pages exist.
 */
export function PortalShell({
  area,
  nav,
  account,
  children,
  embedded = false,
  className,
}: {
  area: PortalArea;
  nav?: NavItem[];
  account?: PortalAccount;
  children: ReactNode;
  embedded?: boolean;
  className?: string;
}) {
  const t = useTranslations('Shell');
  const locale = useLocale();
  const otherPortals = account?.portals.filter((portal) => portal !== area) ?? [];
  const items = nav ?? [
    { href: `/${area}`, label: t('portal.overview'), icon: <LayoutDashboard /> },
  ];
  const areaName = t(`portal.areas.${area}`);
  const Aside = embedded ? 'div' : 'aside';
  const Header = embedded ? 'div' : 'header';
  const Main = embedded ? 'div' : 'main';

  return (
    <div className={cn('flex min-h-dvh bg-background', className)}>
      <Aside className="hidden w-64 shrink-0 flex-col border-r border-border bg-card lg:flex">
        <div className="flex h-16 items-center border-b border-border px-5">
          <Brand />
        </div>
        <nav aria-label={t('portal.navLabel', { area: areaName })} className="flex-1 p-3">
          <NavList items={items} />
        </nav>
        <div className="border-t border-border p-4">
          <Badge variant="secondary">{areaName}</Badge>
        </div>
      </Aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <Header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-background/90 px-4 backdrop-blur sm:px-6">
          <MobileNav
            items={items}
            label={t('portal.navLabel', { area: areaName })}
            openLabel={t('openMenu')}
            closeLabel={t('closeMenu')}
            className="lg:hidden"
          />
          <span className="text-body-sm font-semibold">{areaName}</span>
          <div className="ml-auto flex items-center gap-2">
            <LocaleSwitcher className="hidden sm:block" />
            <ThemeToggle />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label={t('portal.account')}>
                  <CircleUserRound />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-60">
                <DropdownMenuLabel className="grid gap-0.5">
                  {account ? (
                    <>
                      <span>{t('portal.signedInAs')}</span>
                      <span className="truncate text-body-sm font-medium text-foreground">
                        {account.email}
                      </span>
                    </>
                  ) : (
                    t('portal.account')
                  )}
                </DropdownMenuLabel>
                {otherPortals.length > 0 && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel>{t('portal.switchTo')}</DropdownMenuLabel>
                    {otherPortals.map((portal) => (
                      <DropdownMenuItem key={portal} asChild>
                        <Link href={`/${portal}`}>
                          <ArrowLeftRight aria-hidden="true" /> {t(`portal.areas.${portal}`)}
                        </Link>
                      </DropdownMenuItem>
                    ))}
                  </>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem disabled>
                  <Settings aria-hidden="true" /> {t('portal.settings')}
                </DropdownMenuItem>
                {account ? (
                  <DropdownMenuItem asChild>
                    <button type="submit" form="portal-sign-out" className="w-full">
                      <LogOut aria-hidden="true" /> {t('portal.signOut')}
                    </button>
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem disabled>
                    <LogOut aria-hidden="true" /> {t('portal.signOut')}
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </Header>
        <Main id={embedded ? undefined : 'main'} className="flex-1 p-4 sm:p-6 lg:p-8">
          {children}
        </Main>
      </div>
      <Toaster />
      {account && (
        // Outside the menu (which renders in a portal); the menu item submits it by id.
        <form id="portal-sign-out" action={account.signOut} hidden>
          <input type="hidden" name="locale" value={locale} />
        </form>
      )}
    </div>
  );
}
