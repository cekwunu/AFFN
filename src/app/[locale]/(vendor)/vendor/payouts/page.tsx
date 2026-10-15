import { CircleCheck, CircleDashed, CircleAlert, Clock } from 'lucide-react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ClientIntl } from '@/components/client-intl';
import { Badge } from '@/components/ui/badge';
import { StartPayouts } from '@/components/vendor/start-payouts';
import { CLIENT_NAMESPACES } from '@/i18n/client-messages';
import { initRequestLocale } from '@/i18n/server';
import { myParticipation, myVendor } from '@/lib/catalogue/server';
import { getPaymentProvider } from '@/lib/payments';
import { toDbStatus } from '@/lib/payments/provider';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { currentApplicationEvent } from '@/lib/vendor/server';
import { NoVendor } from '../products/no-vendor';
import { startPayoutSetup } from './actions';

export const metadata: Metadata = { robots: { index: false } };

const ICON = {
  not_started: CircleDashed,
  pending: Clock,
  restricted: CircleAlert,
  eligible: CircleCheck,
} as const;
const VARIANT = {
  not_started: 'neutral',
  pending: 'info',
  restricted: 'warning',
  eligible: 'success',
} as const;

/** Vendor payment onboarding (VEN-06): status and "Set up payouts". */
export default async function PayoutsPage({
  params,
  searchParams,
}: PageProps<'/[locale]/vendor/payouts'>) {
  initRequestLocale((await params).locale);
  const t = await getTranslations('Payouts');
  const vendor = await myVendor();
  if (!vendor) return <NoVendor title={t('title')} />;
  const event = await currentApplicationEvent();
  const participation = event ? await myParticipation(vendor.id, event.id) : null;
  const provider = getPaymentProvider();

  if (participation?.status !== 'approved') {
    return (
      <div className="mx-auto grid w-full max-w-3xl gap-6">
        <h1 className="font-display text-display-md font-semibold">{t('title')}</h1>
        <p className="rounded-xl border border-border bg-card p-6 text-body text-muted-foreground">
          {t('notApproved')}
        </p>
      </div>
    );
  }

  const supabase = await createClient();
  const read = async () =>
    (
      await supabase
        .from('event_vendors')
        .select('psp_account_id, psp_account_status')
        .eq('id', participation.id)
        .single()
    ).data!;
  let account = await read();
  // Back from the provider's hosted page: ask the provider, in case its webhook is still on the way.
  if ((await searchParams).returned && account.psp_account_id) {
    try {
      const live = await provider.getVendorStatus(account.psp_account_id);
      await createAdminClient().rpc('set_payment_account_status', {
        p_account_id: account.psp_account_id,
        p_status: toDbStatus(live.status),
      });
      account = await read();
    } catch {
      // The webhook will bring the status; show what we have.
    }
  }
  const status = account.psp_account_status;
  const Icon = ICON[status];
  const action = {
    not_started: t('start'),
    pending: t('resume'),
    restricted: t('fix'),
    eligible: null,
  }[status];

  return (
    <div className="mx-auto grid w-full max-w-3xl gap-6">
      <header className="grid gap-2">
        {provider.testMode && (
          <p className="w-fit rounded-full bg-warning px-3 py-1 text-caption font-bold tracking-wide text-warning-foreground">
            {t('testMode')}
          </p>
        )}
        <h1 className="font-display text-display-md font-semibold">{t('title')}</h1>
        <p className="max-w-prose text-body text-muted-foreground">{t('intro')}</p>
      </header>
      <section
        aria-labelledby="payout-status"
        className="grid gap-4 rounded-xl border border-border bg-card p-6"
      >
        <h2 id="payout-status" className="flex items-center gap-2 text-heading-md font-semibold">
          <Icon aria-hidden className="size-6 text-primary" />
          {t('status')}:{' '}
          <Badge variant={VARIANT[status]} data-testid="payout-status">
            {t(`statuses.${status}`)}
          </Badge>
        </h2>
        <p className="text-body">{t(`explain.${status}`)}</p>
        {status !== 'eligible' && (
          <p className="text-body-sm font-medium text-warning-subtle-foreground">
            {t('cannotSell')}
          </p>
        )}
        {action && (
          <ClientIntl namespaces={[...CLIENT_NAMESPACES, 'Payouts']}>
            <StartPayouts action={startPayoutSetup} label={action} />
          </ClientIntl>
        )}
        {provider.testMode && (
          <p className="text-caption text-muted-foreground">{t('testModeHint')}</p>
        )}
      </section>
    </div>
  );
}
