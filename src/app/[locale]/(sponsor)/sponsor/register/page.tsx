import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { ClientIntl } from '@/components/client-intl';
import { SponsorRegisterForm } from '@/components/sponsor/register-form';
import { localizePath } from '@/i18n/paths';
import { initRequestLocale } from '@/i18n/server';
import { getCurrentUser } from '@/lib/auth/server';
import { formatNok } from '@/lib/format';
import { ore } from '@/lib/money';
import { publicPackages } from '@/lib/sponsors/server';
import { createClient } from '@/lib/supabase/server';
import { currentApplicationEvent } from '@/lib/vendor/server';
import { registerSponsor } from '../actions';

export const metadata: Metadata = { robots: { index: false } };

/** Sponsor registration after sign-up (SPO-01). A registered sponsor goes to the portal. */
export default async function SponsorRegisterPage({
  params,
}: PageProps<'/[locale]/sponsor/register'>) {
  const locale = initRequestLocale((await params).locale);
  const t = await getTranslations('SponsorPortal.register');
  const user = (await getCurrentUser())!;
  const supabase = await createClient();
  const { data: memberships } = await supabase
    .from('memberships')
    .select('sponsor_id, status')
    .eq('user_id', user.id)
    .eq('role', 'sponsor');
  if (memberships?.some((m) => m.sponsor_id)) redirect(localizePath('/sponsor', locale));
  const event = await currentApplicationEvent();
  const packages = event ? await publicPackages(event.id) : [];

  return (
    <div className="mx-auto grid w-full max-w-3xl gap-8">
      <header className="grid gap-1">
        {event && <p className="text-body-sm font-semibold text-primary">{event.name}</p>}
        <h1 className="font-display text-display-md font-semibold">{t('title')}</h1>
        <p className="text-body text-muted-foreground">{t('intro')}</p>
      </header>
      {packages.length === 0 ? (
        <p className="rounded-xl border border-border bg-card p-6 text-body text-muted-foreground">
          {t('noPackages')}
        </p>
      ) : (
        <ClientIntl namespaces={['SponsorPortal']}>
          <SponsorRegisterForm
            action={registerSponsor}
            packages={packages.map((p) => ({
              id: p.id,
              name: p.name,
              price: formatNok(ore(p.price_ore)),
              deliverables: p.deliverables,
            }))}
            defaults={{ contactName: user.name ?? '', contactEmail: user.email ?? '' }}
          />
        </ClientIntl>
      )}
    </div>
  );
}
