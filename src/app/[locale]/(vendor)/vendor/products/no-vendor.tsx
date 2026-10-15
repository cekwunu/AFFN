import { Sparkles } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { buttonVariants } from '@/components/ui/button-variants';
import { EmptyState } from '@/components/ui/empty-state';
import { Link } from '@/i18n/link';

/** Shown on catalogue and profile pages before the user has started an application. */
export async function NoVendor({ title }: { title: string }) {
  const t = await getTranslations('Areas');
  const ta = await getTranslations('Application');
  return (
    <div className="grid gap-6">
      <h1 className="font-display text-display-md font-semibold">{title}</h1>
      <EmptyState
        icon={<Sparkles />}
        title={t('pendingVendorTitle')}
        description={t('pendingVendorText')}
        headingLevel="h2"
        action={
          <Link href="/vendor/apply" className={buttonVariants({ size: 'lg' })}>
            {ta('start')}
          </Link>
        }
      />
    </div>
  );
}
