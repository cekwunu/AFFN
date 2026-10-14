import { ShoppingBag } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { Motif } from '@/components/motif';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/link';
import { cn } from '@/lib/utils';
import { LocaleSwitcher } from '@/components/locale-switcher';

/**
 * Mobile-first storefront opened from a vendor QR code: compact vendor header,
 * content, and a sticky cart bar. A single centred column on larger screens.
 */
export function StorefrontShell({
  vendorName,
  details,
  cart,
  children,
  embedded = false,
  className,
}: {
  vendorName: string;
  /** e.g. "Stand 14 · Nigeriansk". */
  details?: string;
  cart?: { count: number; totalLabel: string; href: string };
  children: ReactNode;
  embedded?: boolean;
  className?: string;
}) {
  const t = useTranslations('Shell.storefront');
  const Header = embedded ? 'div' : 'header';
  const Main = embedded ? 'div' : 'main';

  return (
    <div className={cn('flex min-h-dvh flex-col bg-background', className)}>
      <Header className="sticky top-0 z-30 border-b border-border bg-card">
        <div className="mx-auto flex max-w-xl items-center gap-3 px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-heading-md font-semibold">{vendorName}</p>
            {details && <p className="truncate text-caption text-muted-foreground">{details}</p>}
          </div>
          <LocaleSwitcher />
        </div>
        <Motif className="h-2 opacity-50" />
      </Header>
      <Main
        id={embedded ? undefined : 'main'}
        className="mx-auto w-full max-w-xl flex-1 px-4 py-6 pb-28"
      >
        {children}
      </Main>
      {cart && cart.count > 0 && (
        <div className="sticky bottom-0 z-30 border-t border-border bg-card/95 backdrop-blur">
          <div className="mx-auto max-w-xl px-4 py-3">
            <Button asChild size="lg" className="w-full justify-between">
              <Link href={cart.href}>
                <span className="inline-flex items-center gap-2">
                  <ShoppingBag />
                  {t('viewCart', { count: cart.count })}
                </span>
                <span className="tabular-nums">{cart.totalLabel}</span>
              </Link>
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
