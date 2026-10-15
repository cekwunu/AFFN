import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { AuthCard } from '@/components/auth/auth-card';
import { localizePath } from '@/i18n/paths';
import { initRequestLocale } from '@/i18n/server';
import { getCurrentUser, homePath } from '@/lib/auth/server';

// Where sign-in, email confirmation and "go to your portal" links land (AUTH-02).
export default async function PortalRouterPage({ params }: PageProps<'/[locale]/portal'>) {
  const locale = initRequestLocale((await params).locale);
  const user = await getCurrentUser();
  if (!user) redirect(localizePath('/sign-in', locale));
  const home = homePath(user);
  if (home !== '/portal') redirect(localizePath(home, locale));

  const t = await getTranslations('Auth.portal');
  return <AuthCard title={t('noAccessTitle')} intro={t('noAccessText')} />;
}
