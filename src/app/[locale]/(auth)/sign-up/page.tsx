import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { AuthCard } from '@/components/auth/auth-card';
import { AuthForm } from '@/components/auth/auth-form';
import { Link } from '@/i18n/link';
import { initRequestLocale } from '@/i18n/server';
import { authErrors } from '@/lib/auth/form-messages';
import { findInvitation } from '@/lib/auth/invitations';
import { signUp } from '../actions';

export async function generateMetadata({
  params,
}: PageProps<'/[locale]/sign-up'>): Promise<Metadata> {
  const t = await getTranslations({
    locale: initRequestLocale((await params).locale),
    namespace: 'Auth.signUp',
  });
  return { title: t('titleVendor'), robots: { index: false } };
}

export default async function SignUpPage({ params, searchParams }: PageProps<'/[locale]/sign-up'>) {
  const locale = initRequestLocale((await params).locale);
  const query = await searchParams;
  const t = await getTranslations('Auth');

  // Invited Event Admins sign up with the invited address and get no self-service role.
  const inviteToken = typeof query.invite === 'string' ? query.invite : undefined;
  const invite = inviteToken ? await findInvitation(inviteToken) : null;
  const invited = invite?.state === 'open' ? invite.invitation : null;
  const role = query.role === 'sponsor' ? 'sponsor' : 'vendor';

  const title = invited
    ? t('signUp.titleInvite')
    : role === 'sponsor'
      ? t('signUp.titleSponsor')
      : t('signUp.titleVendor');
  const intro = invited
    ? t('signUp.introInvite')
    : role === 'sponsor'
      ? t('signUp.introSponsor')
      : t('signUp.introVendor');

  return (
    <AuthCard
      title={title}
      intro={intro}
      footer={
        <>
          <p className="text-muted-foreground">
            {t('signUp.haveAccount')}{' '}
            <Link
              href={
                invited
                  ? `/sign-in?next=${encodeURIComponent(`/invite/${inviteToken}`)}`
                  : '/sign-in'
              }
              className="text-link hover:underline"
            >
              {t('signUp.signIn')}
            </Link>
          </p>
          {!invited && (
            <Link
              href={`/sign-up?role=${role === 'vendor' ? 'sponsor' : 'vendor'}`}
              className="w-fit text-link hover:underline"
            >
              {role === 'vendor' ? t('signUp.switchToSponsor') : t('signUp.switchToVendor')}
            </Link>
          )}
        </>
      }
    >
      <AuthForm
        action={signUp}
        hidden={invited ? { locale, invite: inviteToken! } : { locale, role }}
        fields={[
          {
            name: 'name',
            label: t('signUp.name'),
            type: 'text',
            autoComplete: 'name',
            required: true,
          },
          {
            name: 'email',
            label: t('common.email'),
            type: 'email',
            autoComplete: 'email',
            required: true,
            defaultValue: invited?.email,
            readOnly: !!invited,
          },
          {
            name: 'password',
            label: t('common.password'),
            type: 'password',
            autoComplete: 'new-password',
            hint: t('signUp.passwordHint'),
            required: true,
          },
          { name: 'terms', label: t('signUp.terms'), type: 'checkbox', required: true },
        ]}
        submitLabel={t('signUp.submit')}
        workingLabel={t('common.working')}
        messages={await authErrors('signUp')}
      />
    </AuthCard>
  );
}
