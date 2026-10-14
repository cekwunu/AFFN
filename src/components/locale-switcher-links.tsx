'use client';

import { clsx } from 'clsx';
import { Link, useLocalePath } from '@/i18n/link';
import { routing, type Locale } from '@/i18n/routing';

/**
 * Client island: receives translated labels and uses the light Link, so public pages load
 * neither next-intl's client runtime nor tailwind-merge.
 */
export function LocaleSwitcherLinks({
  label,
  names,
  className,
}: {
  label: string;
  names: Record<Locale, string>;
  className?: string;
}) {
  const { locale, path } = useLocalePath();

  return (
    <nav aria-label={label} className={className}>
      <ul className="flex items-center rounded-md border border-border p-0.5 text-body-sm">
        {routing.locales.map((option) => (
          <li key={option}>
            <Link
              href={path}
              locale={option}
              lang={option}
              aria-current={option === locale ? 'true' : undefined}
              className={clsx(
                'inline-flex h-9 items-center rounded-sm px-3 font-medium text-muted-foreground transition-colors hover:text-foreground',
                option === locale && 'bg-muted text-foreground',
              )}
            >
              {names[option]}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
