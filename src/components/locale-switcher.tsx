'use client';

import { useLocale, useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';

export function LocaleSwitcher() {
  const t = useTranslations('LocaleSwitcher');
  const locale = useLocale();
  const pathname = usePathname();

  return (
    <nav aria-label={t('label')}>
      <ul className="flex gap-1 text-sm">
        {routing.locales.map((option) => (
          <li key={option}>
            <Link
              href={pathname}
              locale={option}
              lang={option}
              aria-current={option === locale ? 'true' : undefined}
              className="rounded-control px-3 py-2 text-ink-muted hover:text-ink aria-[current]:font-semibold aria-[current]:text-ink"
            >
              {t(option)}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
