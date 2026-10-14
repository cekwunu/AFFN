'use client';

import { CircleUserRound, LayoutDashboard, LogOut, Settings } from 'lucide-react';
import { useTranslations } from 'next-intl';
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
import { Brand } from './brand';
import { MobileNav, NavList } from './mobile-nav';
import type { NavItem } from './types';

export type PortalArea = 'vendor' | 'sponsor' | 'admin' | 'platform';

/**
 * Signed-in areas: sidebar (sheet on mobile) and top bar.
 * `nav` defaults to the area's overview until feature pages exist.
 */
export function PortalShell({
  area,
  nav,
  children,
  embedded = false,
  className,
}: {
  area: PortalArea;
  nav?: NavItem[];
  children: ReactNode;
  embedded?: boolean;
  className?: string;
}) {
  const t = useTranslations('Shell');
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
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>{t('portal.account')}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem disabled>
                  <Settings aria-hidden="true" /> {t('portal.settings')}
                </DropdownMenuItem>
                <DropdownMenuItem disabled>
                  <LogOut aria-hidden="true" /> {t('portal.signOut')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </Header>
        <Main id={embedded ? undefined : 'main'} className="flex-1 p-4 sm:p-6 lg:p-8">
          {children}
        </Main>
      </div>
      <Toaster />
    </div>
  );
}
