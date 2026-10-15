import { getTranslations } from 'next-intl/server';
import { AuthCard } from '@/components/auth/auth-card';
import { AuthForm } from '@/components/auth/auth-form';
import { Link } from '@/i18n/link';
import { initRequestLocale } from '@/i18n/server';
import { authErrors } from '@/lib/auth/form-messages';
import { forgotPassword } from '../actions';

export default async function ForgotPasswordPage({
  params,
}: PageProps<'/[locale]/forgot-password'>) {
  const locale = initRequestLocale((await params).locale);
  const t = await getTranslations('Auth');
  return (
    <AuthCard
      title={t('forgot.title')}
      intro={t('forgot.intro')}
      footer={
        <Link href="/sign-in" className="w-fit text-link hover:underline">
          {t('forgot.back')}
        </Link>
      }
    >
      <AuthForm
        action={forgotPassword}
        hidden={{ locale }}
        fields={[
          {
            name: 'email',
            label: t('common.email'),
            type: 'email',
            autoComplete: 'email',
            required: true,
          },
        ]}
        submitLabel={t('forgot.submit')}
        workingLabel={t('common.working')}
        messages={await authErrors('forgot')}
      />
    </AuthCard>
  );
}
