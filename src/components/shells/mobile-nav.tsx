'use client';

import { Menu, X } from 'lucide-react';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { clsx } from 'clsx';
import { buttonVariants } from '@/components/ui/button-variants';
import { Link, useLocalePath } from '@/i18n/link';
import type { NavItem } from './types';

export function isActive(pathname: string, href: string) {
  return href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);
}

// Public client island: uses clsx (not cn/tailwind-merge) and the light Link to stay within
// the public JS budget. Avoid conflicting classes in className overrides here.

/** Navigation list shared by the mobile menu and the portal sidebar. */
export function NavList({
  items,
  onNavigate,
  className,
}: {
  items: NavItem[];
  onNavigate?: () => void;
  className?: string;
}) {
  const { path: pathname } = useLocalePath();
  return (
    <ul className={clsx('grid gap-1', className)}>
      {items.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <li key={item.href + item.label}>
            <Link
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? 'page' : undefined}
              className={clsx(
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

/**
 * Small-screen menu as a disclosure: the button reveals the nav panel under the header.
 * Escape, a click outside or choosing a link closes it. Must sit inside a positioned
 * (e.g. sticky) header, which the panel is anchored to.
 */
export function MobileNav({
  items,
  label,
  openLabel,
  closeLabel,
  footer,
  className,
}: {
  items: NavItem[];
  /** Accessible name of the navigation. */
  label: string;
  openLabel: string;
  closeLabel: string;
  footer?: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!panelRef.current?.contains(target) && !buttonRef.current?.contains(target)) {
        setOpen(false);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [open]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={open ? closeLabel : openLabel}
        onClick={() => setOpen((value) => !value)}
        className={clsx(buttonVariants({ variant: 'ghost', size: 'icon' }), className)}
      >
        {open ? <X /> : <Menu />}
      </button>
      <div
        ref={panelRef}
        id={panelId}
        hidden={!open}
        className={clsx(
          'absolute inset-x-0 top-full border-b border-border bg-background shadow-md motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-top-1',
          className,
        )}
      >
        <nav aria-label={label} className="p-3">
          <NavList items={items} onNavigate={() => setOpen(false)} />
        </nav>
        {footer && <div className="border-t border-border px-6 py-4">{footer}</div>}
      </div>
    </>
  );
}
