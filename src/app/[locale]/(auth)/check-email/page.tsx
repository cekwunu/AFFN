import { MailCheck } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { AuthCard } from '@/components/auth/auth-card';
import { Link } from '@/i18n/link';
import { initRequestLocale } from '@/i18n/server';

export default async function CheckEmailPage({
  params,
  searchParams,
}: PageProps<'/[locale]/check-email'>) {
  initRequestLocale((await params).locale);
  const kind = (await searchParams).kind === 'reset' ? 'reset' : 'signup';
  const t = await getTranslations('Auth.checkEmail');
  return (
    <AuthCard
      title={t('title')}
      intro={t(kind)}
      footer={
        <Link href="/sign-in" className="w-fit text-link hover:underline">
          {t('back')}
        </Link>
      }
    >
      <p className="flex items-center gap-3 rounded-lg border border-border bg-card p-4 text-body-sm text-muted-foreground">
        <MailCheck className="size-5 shrink-0 text-primary" aria-hidden="true" />
        {t('tip')}
      </p>
    </AuthCard>
  );
}
