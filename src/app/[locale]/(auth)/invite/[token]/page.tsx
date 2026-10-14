import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { AuthCard } from '@/components/auth/auth-card';
import { Link } from '@/i18n/link';
import { initRequestLocale } from '@/i18n/server';
import { findInvitation } from '@/lib/auth/invitations';
import { getCurrentUser } from '@/lib/auth/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { acceptInvitation, signOut } from '../../actions';

export const metadata: Metadata = { robots: { index: false } };

const primaryLink =
  'inline-flex h-11 items-center justify-center rounded-md bg-primary px-5 text-body-sm font-medium text-primary-foreground hover:bg-primary-hover';
const secondaryLink =
  'inline-flex h-11 items-center justify-center rounded-md border border-input bg-card px-5 text-body-sm font-medium hover:bg-accent';

export default async function InvitationPage({ params }: PageProps<'/[locale]/invite/[token]'>) {
  const { locale: raw, token } = await params;
  const locale = initRequestLocale(raw);
  const t = await getTranslations('Auth');
  const { state, invitation } = await findInvitation(token);

  if (state !== 'open' || !invitation) {
    return (
      <AuthCard
        title={t('invite.title')}
        intro={t(`invite.${state === 'open' ? 'invalid' : state}`)}
      />
    );
  }

  const inviter = await createAdminClient().auth.admin.getUserById(invitation.invited_by);
  const values = {
    inviter:
      (inviter.data.user?.user_metadata?.full_name as string | undefined) ?? t('invite.someone'),
    organization: invitation.organizations?.name ?? '',
    event: invitation.events?.name ?? '',
  };
  const intro = invitation.event_id ? t('invite.introEvent', values) : t('invite.intro', values);
  const user = await getCurrentUser();
  const next = encodeURIComponent(`/invite/${token}`);

  if (!user) {
    return (
      <AuthCard title={t('invite.title')} intro={intro}>
        <p className="text-body-sm text-muted-foreground">
          {t('invite.signInPrompt', { email: invitation.email })}
        </p>
        <div className="flex flex-wrap gap-3">
          <Link href={`/sign-in?next=${next}`} className={primaryLink}>
            {t('invite.signIn')}
          </Link>
          <Link href={`/sign-up?invite=${token}`} className={secondaryLink}>
            {t('invite.createAccount')}
          </Link>
        </div>
      </AuthCard>
    );
  }

  if (user.email.toLowerCase() !== invitation.email) {
    return (
      <AuthCard
        title={t('invite.title')}
        intro={t('invite.wrongAccount', { current: user.email, email: invitation.email })}
      >
        <form action={signOut}>
          <input type="hidden" name="locale" value={locale} />
          <button type="submit" className={secondaryLink}>
            {t('common.signOut')}
          </button>
        </form>
      </AuthCard>
    );
  }

  return (
    <AuthCard title={t('invite.title')} intro={intro}>
      <form action={acceptInvitation}>
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="token" value={token} />
        <button type="submit" className={`${primaryLink} w-full cursor-pointer`}>
          {t('invite.accept')}
        </button>
      </form>
    </AuthCard>
  );
}
