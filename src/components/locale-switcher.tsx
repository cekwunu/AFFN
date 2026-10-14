import { useTranslations } from 'next-intl';
import { LocaleSwitcherLinks } from './locale-switcher-links';

/**
 * Translates on the server (or in the client tree when used inside a client component)
 * and hands plain strings to the client island.
 */
export function LocaleSwitcher({ className }: { className?: string }) {
  const t = useTranslations('LocaleSwitcher');
  return (
    <LocaleSwitcherLinks
      label={t('label')}
      names={{ nb: t('nb'), en: t('en') }}
      className={className}
    />
  );
}
