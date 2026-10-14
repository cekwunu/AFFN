import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { AuthCard } from '@/components/auth/auth-card';
import { AuthForm } from '@/components/auth/auth-form';
import { localizePath } from '@/i18n/paths';
import { initRequestLocale } from '@/i18n/server';
import { authErrors } from '@/lib/auth/form-messages';
import { safeNextPath } from '@/lib/auth/roles';
import { getCurrentUser, homePath } from '@/lib/auth/server';
import { createClient } from '@/lib/supabase/server';
import { signOut, verifyMfa } from '../actions';

export const metadata: Metadata = { robots: { index: false } };

// TOTP enrolment (first time) or challenge (AUTH-04).
export default async function MfaPage({ params, searchParams }: PageProps<'/[locale]/mfa'>) {
  const locale = initRequestLocale((await params).locale);
  const next = safeNextPath((await searchParams).next);
  const user = await getCurrentUser();
  if (!user) redirect(localizePath(`/sign-in?next=${encodeURIComponent('/mfa')}`, locale));
  if (user.aal === 'aal2') redirect(localizePath(next ?? homePath(user), locale));

  const t = await getTranslations('Auth');
  const supabase = await createClient();
  const { data: factors } = await supabase.auth.mfa.listFactors();
  const verified = factors?.totp.find((f) => f.status === 'verified');

  let factorId = verified?.id;
  let enrolment: { qr: string; secret: string } | null = null;
  if (!verified) {
    // Start a fresh enrolment; unfinished ones cannot show their secret again.
    for (const factor of factors?.all ?? []) {
      if (factor.factor_type === 'totp' && factor.status !== 'verified') {
        await supabase.auth.mfa.unenroll({ factorId: factor.id });
      }
    }
    // A unique name: two renders at once (e.g. prefetch + navigation) must not collide.
    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: 'totp',
      friendlyName: `AFF Marketplace ${new Date().toISOString()}`,
    });
    if (error) throw error;
    factorId = data.id;
    enrolment = { qr: data.totp.qr_code, secret: data.totp.secret };
  }

  return (
    <AuthCard
      title={enrolment ? t('mfa.enrolTitle') : t('mfa.challengeTitle')}
      intro={enrolment ? t('mfa.enrolIntro') : t('mfa.challengeIntro')}
      footer={
        <form action={signOut}>
          <input type="hidden" name="locale" value={locale} />
          <button type="submit" className="cursor-pointer text-link hover:underline">
            {t('common.signOut')}
          </button>
        </form>
      }
    >
      {enrolment && (
        <div className="grid gap-4 rounded-xl border border-border bg-card p-5">
          {/* eslint-disable-next-line @next/next/no-img-element -- data URI from Supabase */}
          <img
            src={enrolment.qr}
            alt={t('mfa.qrAlt')}
            width={180}
            height={180}
            className="mx-auto rounded-md bg-card"
          />
          <p className="text-body-sm text-muted-foreground">{t('mfa.manual')}</p>
          <code
            data-testid="totp-secret"
            className="rounded-md bg-muted px-3 py-2 text-center font-mono text-body-sm break-all"
          >
            {enrolment.secret}
          </code>
        </div>
      )}
      <AuthForm
        action={verifyMfa}
        hidden={{ locale, factorId: factorId!, next: next ?? '' }}
        fields={[
          {
            name: 'code',
            label: t('mfa.code'),
            type: 'code',
            autoComplete: 'one-time-code',
            required: true,
          },
        ]}
        submitLabel={t('mfa.submit')}
        workingLabel={t('common.working')}
        messages={await authErrors('mfa')}
      />
    </AuthCard>
  );
}
