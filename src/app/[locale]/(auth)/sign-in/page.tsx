import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { AuthCard } from '@/components/auth/auth-card';
import { AuthForm } from '@/components/auth/auth-form';
import { Link } from '@/i18n/link';
import { initRequestLocale } from '@/i18n/server';
import { authErrors } from '@/lib/auth/form-messages';
import { safeNextPath } from '@/lib/auth/roles';
import { signIn } from '../actions';

export async function generateMetadata({
  params,
}: PageProps<'/[locale]/sign-in'>): Promise<Metadata> {
  const t = await getTranslations({
    locale: initRequestLocale((await params).locale),
    namespace: 'Auth.signIn',
  });
  return { title: t('title'), robots: { index: false } };
}

export default async function SignInPage({ params, searchParams }: PageProps<'/[locale]/sign-in'>) {
  const locale = initRequestLocale((await params).locale);
  const query = await searchParams;
  const t = await getTranslations('Auth');
  const next = safeNextPath(query.next);

  return (
    <AuthCard
      title={t('signIn.title')}
      intro={t('signIn.intro')}
      footer={
        <>
          <Link href="/forgot-password" className="w-fit text-link hover:underline">
            {t('signIn.forgot')}
          </Link>
          <p className="text-muted-foreground">
            {t('signIn.noAccount')}{' '}
            <Link href="/sign-up?role=vendor" className="text-link hover:underline">
              {t('signIn.signUpVendor')}
            </Link>{' '}
            {t('common.or')}{' '}
            <Link href="/sign-up?role=sponsor" className="text-link hover:underline">
              {t('signIn.signUpSponsor')}
            </Link>
          </p>
        </>
      }
    >
      <AuthForm
        action={signIn}
        hidden={{ locale, next: next ?? '' }}
        initialError={query.error === 'link_invalid' ? 'link_invalid' : undefined}
        fields={[
          {
            name: 'email',
            label: t('common.email'),
            type: 'email',
            autoComplete: 'email',
            required: true,
          },
          {
            name: 'password',
            label: t('common.password'),
            type: 'password',
            autoComplete: 'current-password',
            required: true,
          },
        ]}
        submitLabel={t('signIn.submit')}
        workingLabel={t('common.working')}
        messages={await authErrors('signIn')}
      />
    </AuthCard>
  );
}
