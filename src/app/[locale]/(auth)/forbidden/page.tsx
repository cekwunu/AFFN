import { ShieldX } from 'lucide-react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { AuthCard } from '@/components/auth/auth-card';
import { Link } from '@/i18n/link';
import { initRequestLocale } from '@/i18n/server';
import { signOut } from '../actions';

export const metadata: Metadata = { robots: { index: false } };

// Shown (with HTTP 403 from the proxy) when a signed-in user opens a portal they have no role for.
export default async function ForbiddenPage({ params }: PageProps<'/[locale]/forbidden'>) {
  const locale = initRequestLocale((await params).locale);
  const t = await getTranslations('Auth');
  return (
    <AuthCard
      title={t('forbidden.title')}
      intro={t('forbidden.text')}
      footer={
        <form action={signOut}>
          <input type="hidden" name="locale" value={locale} />
          <button type="submit" className="cursor-pointer text-link hover:underline">
            {t('common.signOut')}
          </button>
        </form>
      }
    >
      <div className="flex items-center gap-4">
        <ShieldX className="size-8 text-danger" aria-hidden="true" />
        <Link
          href="/portal"
          className="inline-flex h-11 items-center rounded-md bg-primary px-5 text-body-sm font-medium text-primary-foreground hover:bg-primary-hover"
        >
          {t('forbidden.goToPortal')}
        </Link>
      </div>
    </AuthCard>
  );
}
