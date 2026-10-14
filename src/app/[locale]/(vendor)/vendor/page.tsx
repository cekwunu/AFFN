import { ClipboardList, Sparkles } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { buttonVariants } from '@/components/ui/button-variants';
import { EmptyState } from '@/components/ui/empty-state';
import { Link } from '@/i18n/link';
import { initRequestLocale } from '@/i18n/server';
import { currentApplicationEvent, getMyApplication } from '@/lib/vendor/server';

export default async function VendorHomePage({ params }: PageProps<'/[locale]/vendor'>) {
  initRequestLocale((await params).locale);
  const t = await getTranslations('Areas');
  const ta = await getTranslations('Application');
  const event = await currentApplicationEvent();
  const application = event ? await getMyApplication(event.id) : null;

  return (
    <div className="grid gap-6">
      <h1 className="font-display text-display-md font-semibold">{t('vendor')}</h1>
      {!application ? (
        <EmptyState
          icon={<Sparkles />}
          title={t('pendingVendorTitle')}
          description={t('pendingVendorText')}
          headingLevel="h2"
          action={
            event ? (
              <Link href="/vendor/apply" className={buttonVariants({ size: 'lg' })}>
                {ta('start')}
              </Link>
            ) : undefined
          }
        />
      ) : (
        <section className="grid gap-3 rounded-xl border border-border bg-card p-6">
          <h2 className="flex items-center gap-2 text-heading-md font-semibold">
            <ClipboardList className="size-5 text-primary" aria-hidden="true" />
            {ta('event', { event: event!.name })}
          </h2>
          <p className="text-body">
            {ta('statusLabel')}: <strong>{ta(`status.${application.status}`)}</strong>
          </p>
          <Link
            href={application.status === 'draft' ? '/vendor/apply' : '/vendor/application'}
            className={buttonVariants({ size: 'lg', className: 'w-fit' })}
          >
            {application.status === 'draft' ? ta('continue') : ta('view')}
          </Link>
        </section>
      )}
    </div>
  );
}
