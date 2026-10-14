import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { notFound, redirect } from 'next/navigation';
import { ApplicationProgress } from '@/components/vendor/application-progress';
import { localizePath } from '@/i18n/paths';
import { initRequestLocale } from '@/i18n/server';
import { getCurrentUser } from '@/lib/auth/server';
import {
  STEPS,
  applicationFacts,
  isEditable,
  isStep,
  missingSteps,
} from '@/lib/vendor/application';
import { currentApplicationEvent, getMyApplication } from '@/lib/vendor/server';
import {
  AgreementStep,
  BusinessStep,
  ContactStep,
  DocumentsStep,
  ProfileStep,
  ReviewStep,
  StallStep,
} from '../_steps';

export const metadata: Metadata = { robots: { index: false } };

export default async function ApplicationStepPage({
  params,
}: PageProps<'/[locale]/vendor/apply/[step]'>) {
  const { locale: rawLocale, step } = await params;
  const locale = initRequestLocale(rawLocale);
  if (!isStep(step)) notFound();
  const go = (path: string) => redirect(localizePath(path, locale));

  const t = await getTranslations('Apply');
  const event = await currentApplicationEvent();
  if (!event) go('/vendor');
  const [user, application] = await Promise.all([getCurrentUser(), getMyApplication(event!.id)]);
  if (!application && step !== 'business') go('/vendor/apply/business');
  if (application && !isEditable(application.status)) go('/vendor/application');

  // Progress: steps before the first unfinished one can be opened directly.
  const facts = application
    ? applicationFacts(application)
    : { hasAgreement: false, documentsOk: false };
  const missing = application ? missingSteps(application.progress, facts) : [...STEPS];
  const firstOpen = missing[0] ? STEPS.indexOf(missing[0]) : STEPS.length - 1;
  const current = STEPS.indexOf(step);
  const steps = STEPS.map((key, index) => ({
    key,
    label: t(`steps.${key}`),
    href: `/vendor/apply/${key}`,
    done: key === 'review' ? false : !missing.includes(key),
    reachable: !!application && (index <= firstOpen || !missing.includes(key)),
  }));

  const props = { locale, event: event!, application, email: user?.email ?? '' };
  const content = (() => {
    if (step === 'business' || !application) return <BusinessStep {...props} />;
    const withApp = { ...props, application };
    switch (step) {
      case 'contact':
        return <ContactStep {...withApp} />;
      case 'profile':
        return <ProfileStep {...withApp} />;
      case 'stall':
        return <StallStep {...withApp} />;
      case 'documents':
        return <DocumentsStep {...withApp} />;
      case 'agreement':
        return <AgreementStep {...withApp} />;
      case 'review':
        return <ReviewStep {...withApp} />;
    }
  })();

  return (
    <div className="mx-auto grid w-full max-w-3xl gap-8">
      <header className="grid gap-1">
        <p className="text-body-sm font-semibold text-primary">
          {t('subtitle', { event: event!.name })}
        </p>
        <h1 className="font-display text-display-md font-semibold">{t(`steps.${step}`)}</h1>
        <p className="sr-only">
          {t('title')} – {t('stepOf', { current: current + 1, total: STEPS.length })}
        </p>
      </header>
      <ApplicationProgress
        steps={steps}
        current={current}
        label={t('progressLabel')}
        stepOf={t('stepOf', { current: current + 1, total: STEPS.length })}
      />
      {content}
    </div>
  );
}
