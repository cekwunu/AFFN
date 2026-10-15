import { redirect } from 'next/navigation';
import { localizePath } from '@/i18n/paths';
import { initRequestLocale } from '@/i18n/server';
import { applicationFacts, isEditable, resumeStep } from '@/lib/vendor/application';
import { currentApplicationEvent, getMyApplication } from '@/lib/vendor/server';

/** Resumes the application at the first unfinished step (VEN-04). */
export default async function ApplyPage({ params }: PageProps<'/[locale]/vendor/apply'>) {
  const locale = initRequestLocale((await params).locale);
  const event = await currentApplicationEvent();
  const application = event ? await getMyApplication(event.id) : null;
  if (!application) redirect(localizePath('/vendor/apply/business', locale));
  if (!isEditable(application.status)) redirect(localizePath('/vendor/application', locale));
  const step = resumeStep(application.progress, applicationFacts(application));
  redirect(localizePath(`/vendor/apply/${step}`, locale));
}
