import { useTranslations } from 'next-intl';
import { ThemeToggleButton } from './theme-toggle-button';

export function ThemeToggle() {
  const t = useTranslations('Theme');
  return <ThemeToggleButton toDark={t('toDark')} toLight={t('toLight')} />;
}
