import { useTranslations } from 'next-intl';
import { MotifMark } from '@/components/motif';
import { Link } from '@/i18n/link';
import { cn } from '@/lib/utils';

export function Brand({ className }: { className?: string }) {
  const t = useTranslations('Layout');
  return (
    <Link
      href="/"
      className={cn('inline-flex items-center gap-2.5 rounded-md text-foreground', className)}
    >
      <MotifMark />
      <span className="font-display text-heading-md font-semibold tracking-tight">
        {t('brand')}
      </span>
    </Link>
  );
}
