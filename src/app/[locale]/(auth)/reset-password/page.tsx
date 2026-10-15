import { getTranslations } from 'next-intl/server';
import { AuthCard } from '@/components/auth/auth-card';
import { AuthForm } from '@/components/auth/auth-form';
import { Link } from '@/i18n/link';
import { initRequestLocale } from '@/i18n/server';
import { authErrors } from '@/lib/auth/form-messages';
import { getCurrentUser } from '@/lib/auth/server';
import { resetPassword } from '../actions';

// Reached from the password-reset email: the link signs the user in for this purpose.
export default async function ResetPasswordPage({ params }: PageProps<'/[locale]/reset-password'>) {
  const locale = initRequestLocale((await params).locale);
  const t = await getTranslations('Auth');
  const user = await getCurrentUser();

  if (!user) {
    return (
      <AuthCard
        title={t('reset.title')}
        intro={t('reset.errors.session')}
        footer={
          <Link href="/forgot-password" className="w-fit text-link hover:underline">
            {t('forgot.title')}
          </Link>
        }
      />
    );
  }

  return (
    <AuthCard title={t('reset.title')} intro={t('reset.intro')}>
      <AuthForm
        action={resetPassword}
        hidden={{ locale }}
        fields={[
          {
            name: 'email',
            label: t('common.email'),
            type: 'email',
            autoComplete: 'username',
            defaultValue: user.email,
            readOnly: true,
          },
          {
            name: 'password',
            label: t('reset.password'),
            type: 'password',
            autoComplete: 'new-password',
            hint: t('signUp.passwordHint'),
            required: true,
          },
          {
            name: 'confirm',
            label: t('reset.confirm'),
            type: 'password',
            autoComplete: 'new-password',
            required: true,
          },
        ]}
        submitLabel={t('reset.submit')}
        workingLabel={t('common.working')}
        messages={await authErrors('reset')}
      />
    </AuthCard>
  );
}
