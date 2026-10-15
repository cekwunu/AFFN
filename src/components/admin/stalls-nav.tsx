import { clsx } from 'clsx';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/link';

const PAGES = [
  { key: 'inventory', href: '/admin/stalls' },
  { key: 'assign', href: '/admin/stalls/assign' },
  { key: 'layout', href: '/admin/stalls/layout' },
] as const;

/** Sub-navigation between the stall pages. */
export async function StallsNav({ active }: { active: (typeof PAGES)[number]['key'] }) {
  const t = await getTranslations('Stalls.nav');
  return (
    <nav aria-label={t('label')}>
      <ul className="flex flex-wrap gap-2 border-b border-border">
        {PAGES.map((page) => (
          <li key={page.key}>
            <Link
              href={page.href}
              aria-current={page.key === active ? 'page' : undefined}
              className={clsx(
                '-mb-px inline-flex min-h-11 items-center border-b-2 px-3 text-body-sm font-medium transition-colors',
                page.key === active
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              {t(page.key)}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** Status and error messages for the stall forms. */
export async function stallMessages(): Promise<Record<string, string>> {
  const t = await getTranslations('Stalls');
  const keys = [
    'required',
    'number',
    'fee',
    'duplicate',
    'boolean',
    'forbidden',
    'taken',
    'conflict',
    'upload',
    'unknown',
    'columns',
    'empty',
  ] as const;
  return {
    ...Object.fromEntries(keys.map((k) => [k, t(`errors.${k}`)])),
    saved: t('inventory.saved'),
    imported: t('inventory.imported', { count: '{count}' }),
    assigned: t('assign.assigned'),
    released: t('assign.released'),
  };
}
