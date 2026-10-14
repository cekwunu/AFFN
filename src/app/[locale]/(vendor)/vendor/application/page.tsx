import { MessageSquareText } from 'lucide-react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button-variants';
import { Link } from '@/i18n/link';
import { initRequestLocale } from '@/i18n/server';
import { formatDateOslo, formatDateTimeOslo } from '@/lib/format';
import { isEditable } from '@/lib/vendor/application';
import { currentApplicationEvent, getMyApplication } from '@/lib/vendor/server';

export const metadata: Metadata = { robots: { index: false } };

type Status =
  | 'draft'
  | 'submitted'
  | 'under_review'
  | 'more_info_requested'
  | 'approved'
  | 'rejected'
  | 'waitlisted'
  | 'withdrawn';

const statusVariant: Record<Status, 'neutral' | 'info' | 'warning' | 'success' | 'danger'> = {
  draft: 'neutral',
  submitted: 'info',
  under_review: 'info',
  more_info_requested: 'warning',
  approved: 'success',
  rejected: 'danger',
  waitlisted: 'warning',
  withdrawn: 'neutral',
};

/** Application status with what happens next (VEN-04). */
export default async function ApplicationStatusPage({
  params,
}: PageProps<'/[locale]/vendor/application'>) {
  const locale = initRequestLocale((await params).locale);
  const t = await getTranslations('Application');
  const event = await currentApplicationEvent();
  const application = event ? await getMyApplication(event.id) : null;

  if (!event || !application) {
    return (
      <div className="mx-auto grid w-full max-w-3xl gap-6">
        <h1 className="font-display text-display-md font-semibold">{t('title')}</h1>
        {event && (
          <section className="grid gap-4 rounded-xl border border-border bg-card p-6">
            <h2 className="text-heading-md font-semibold">
              {t('noApplicationTitle', { event: event.name })}
            </h2>
            <p className="text-body text-muted-foreground">{t('noApplicationText')}</p>
            <Link
              href="/vendor/apply"
              className={buttonVariants({ size: 'lg', className: 'w-fit' })}
            >
              {t('start')}
            </Link>
          </section>
        )}
      </div>
    );
  }

  const status = application.status as Status;
  const date = (value: string | null) => (value ? formatDateOslo(value, locale, 'long') : '');
  const next = (() => {
    switch (status) {
      case 'draft':
        return event.application_deadline
          ? t('next.draft', { deadline: date(event.application_deadline) })
          : t('next.draftNoDeadline');
      case 'submitted':
        return t('next.submitted', { date: date(application.submitted_at) });
      case 'under_review':
        return event.decisions_by
          ? t('next.under_review', { decisions: date(event.decisions_by) })
          : t('next.under_reviewNoDate');
      default:
        return t(`next.${status}`);
    }
  })();
  // The admin's latest message when more information is requested (REV-02).
  const request =
    status === 'more_info_requested'
      ? application.reviews.find((r) => r.to_status === 'more_info_requested')
      : undefined;

  return (
    <div className="mx-auto grid w-full max-w-3xl gap-6">
      <header className="grid gap-1">
        <p className="text-body-sm font-semibold text-primary">
          {t('event', { event: event.name })}
        </p>
        <h1 className="font-display text-display-md font-semibold">{t('title')}</h1>
      </header>

      <section
        aria-labelledby="status-heading"
        className="grid gap-4 rounded-xl border border-border bg-card p-5 sm:p-6"
      >
        <div className="flex flex-wrap items-center gap-3">
          <h2 id="status-heading" className="text-heading-md font-semibold">
            {t('statusLabel')}
          </h2>
          <Badge variant={statusVariant[status]} data-testid="application-status">
            {t(`status.${status}`)}
          </Badge>
        </div>
        <p className="text-body">{next}</p>
        {application.submitted_at && status !== 'draft' && (
          <p className="text-body-sm text-muted-foreground">
            {t('submittedAt', { date: formatDateTimeOslo(application.submitted_at, locale) })}
          </p>
        )}
      </section>

      {request && (
        <section
          aria-labelledby="message-heading"
          className="grid gap-3 rounded-xl border border-warning bg-warning-subtle p-5 text-warning-subtle-foreground sm:p-6"
        >
          <h2
            id="message-heading"
            className="flex items-center gap-2 text-heading-sm font-semibold"
          >
            <MessageSquareText className="size-5" aria-hidden="true" />
            {t('messageTitle')}
          </h2>
          <p className="text-body whitespace-pre-line">{request.note}</p>
          <p className="text-body-sm">
            {t('messageDate', { date: formatDateTimeOslo(request.created_at, locale) })}
          </p>
        </section>
      )}

      {isEditable(status) && (
        <Link href="/vendor/apply" className={buttonVariants({ size: 'lg', className: 'w-fit' })}>
          {status === 'more_info_requested' ? t('edit') : t('continue')}
        </Link>
      )}
    </div>
  );
}
