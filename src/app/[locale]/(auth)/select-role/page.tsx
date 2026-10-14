import { ArrowRight, Building2, Handshake, LayoutDashboard, Store } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { AuthCard } from '@/components/auth/auth-card';
import { Link } from '@/i18n/link';
import { localizePath } from '@/i18n/paths';
import { initRequestLocale } from '@/i18n/server';
import { getCurrentUser } from '@/lib/auth/server';

const ICONS = { platform: Building2, admin: LayoutDashboard, vendor: Store, sponsor: Handshake };

export default async function SelectRolePage({ params }: PageProps<'/[locale]/select-role'>) {
  const locale = initRequestLocale((await params).locale);
  const user = await getCurrentUser();
  if (!user) redirect(localizePath('/sign-in', locale));
  const t = await getTranslations();

  return (
    <AuthCard title={t('Auth.selectRole.title')} intro={t('Auth.selectRole.intro')}>
      <ul className="grid gap-3">
        {user.portals.map((portal) => {
          const Icon = ICONS[portal];
          return (
            <li key={portal}>
              <Link
                href={`/${portal}`}
                className="flex min-h-14 items-center gap-4 rounded-xl border border-border bg-card px-4 font-medium transition-colors hover:bg-accent"
              >
                <Icon className="size-5 text-primary" aria-hidden="true" />
                <span className="flex-1">{t(`Shell.portal.areas.${portal}`)}</span>
                <ArrowRight className="size-4 text-muted-foreground" aria-hidden="true" />
              </Link>
            </li>
          );
        })}
      </ul>
    </AuthCard>
  );
}
