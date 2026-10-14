'use client';

import { Menu } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Link, usePathname } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import type { NavItem } from './types';

export function isActive(pathname: string, href: string) {
  return href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);
}

/** Navigation list shared by the mobile sheet and the portal sidebar. */
export function NavList({
  items,
  onNavigate,
  className,
}: {
  items: NavItem[];
  onNavigate?: () => void;
  className?: string;
}) {
  const pathname = usePathname();
  return (
    <ul className={cn('grid gap-1', className)}>
      {items.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <li key={item.href + item.label}>
            <Link
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex min-h-11 items-center gap-3 rounded-md px-3 text-body-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground [&_svg]:size-4.5 [&_svg]:shrink-0',
                active && 'bg-accent text-foreground',
              )}
            >
              {item.icon}
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function MobileNav({
  items,
  title,
  side = 'right',
  footer,
  className,
}: {
  items: NavItem[];
  title: string;
  side?: 'left' | 'right';
  footer?: ReactNode;
  className?: string;
}) {
  const t = useTranslations('Shell');
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={t('openMenu')} className={className}>
          <Menu />
        </Button>
      </SheetTrigger>
      <SheetContent side={side} aria-describedby={undefined}>
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
        </SheetHeader>
        <SheetBody>
          <nav aria-label={title}>
            <NavList items={items} onNavigate={() => setOpen(false)} />
          </nav>
        </SheetBody>
        {footer && <div className="border-t border-border p-6">{footer}</div>}
      </SheetContent>
    </Sheet>
  );
}
