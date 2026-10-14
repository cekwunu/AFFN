'use client';

import { useLocale, useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';
import { cn } from '@/lib/utils';

export function LocaleSwitcher({ className }: { className?: string }) {
  const t = useTranslations('LocaleSwitcher');
  const locale = useLocale();
  const pathname = usePathname();

  return (
    <nav aria-label={t('label')} className={className}>
      <ul className="flex items-center rounded-md border border-border p-0.5 text-body-sm">
        {routing.locales.map((option) => (
          <li key={option}>
            <Link
              href={pathname}
              locale={option}
              lang={option}
              aria-current={option === locale ? 'true' : undefined}
              className={cn(
                'inline-flex h-9 items-center rounded-sm px-3 font-medium text-muted-foreground transition-colors hover:text-foreground',
                option === locale && 'bg-muted text-foreground',
              )}
            >
              {t(option)}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
