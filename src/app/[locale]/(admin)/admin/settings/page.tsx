import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { SettingsForm } from '@/components/admin/settings-form';
import { ClientIntl } from '@/components/client-intl';
import { initRequestLocale } from '@/i18n/server';
import { currentOrganization, getCurrentUser } from '@/lib/auth/server';
import { formatBankAccount, formatOrgNumber, formatRate } from '@/lib/documents/models';
import { createClient } from '@/lib/supabase/server';
import { currentApplicationEvent } from '@/lib/vendor/server';
import { saveSettings } from './actions';

export const metadata: Metadata = { robots: { index: false } };

/**
 * Organization settings: AFFN's company details printed on its invoices, receipts and
 * statements (SET-04), and the mva rate on stall fees until the accountant confirms it (PRD §12).
 * Organization Admins edit; Event Admins see the values.
 */
export default async function SettingsPage({ params }: PageProps<'/[locale]/admin/settings'>) {
  const locale = initRequestLocale((await params).locale);
  const t = await getTranslations('Settings');
  const user = (await getCurrentUser())!;
  const organization = await currentOrganization();
  const event = await currentApplicationEvent();
  const supabase = await createClient();
  const [{ data: org }, { data: eventRow }] = await Promise.all([
    supabase
      .from('organizations')
      .select(
        'legal_name, org_number, vat_registered, address_line, postal_code, city, bank_account, invoice_email, invoice_due_days',
      )
      .eq('id', organization.id)
      .single(),
    event
      ? supabase
          .from('events')
          .select('name, stall_fee_mva_bp, sponsor_mva_bp')
          .eq('id', event.id)
          .single()
      : Promise.resolve({ data: null }),
  ]);
  const canEdit = user.access.roles.some(
    (r) => r.org === organization.id && r.role === 'org_admin' && r.status === 'active',
  );
  const ready = !!org?.legal_name && !!org.org_number;
  return (
    <div className="grid max-w-3xl gap-6">
      <header className="grid gap-1">
        <h1 className="font-display text-display-md font-semibold">{t('title')}</h1>
        <p className="text-body text-muted-foreground">{t('intro')}</p>
      </header>
      {!ready && (
        <p
          role="status"
          data-testid="settings-missing"
          className="rounded-lg bg-warning-subtle px-4 py-3 text-body-sm font-medium text-warning-subtle-foreground"
        >
          {t('missing')}
        </p>
      )}
      {!canEdit && <p className="text-body-sm text-muted-foreground">{t('readOnly')}</p>}
      <ClientIntl namespaces={['Settings']}>
        <SettingsForm
          action={saveSettings}
          canEdit={canEdit}
          values={{
            legalName: org?.legal_name ?? '',
            orgNumber: org?.org_number ? formatOrgNumber(org.org_number) : '',
            vatRegistered: org?.vat_registered ?? true,
            addressLine: org?.address_line ?? '',
            postalCode: org?.postal_code ?? '',
            city: org?.city ?? '',
            bankAccount: org?.bank_account ? formatBankAccount(org.bank_account) : '',
            invoiceEmail: org?.invoice_email ?? '',
            invoiceDueDays: String(org?.invoice_due_days ?? 14),
            stallFeeMva: formatRate(eventRow?.stall_fee_mva_bp ?? 2500, locale).replace(' %', ''),
            sponsorMva: formatRate(eventRow?.sponsor_mva_bp ?? 2500, locale).replace(' %', ''),
          }}
        />
      </ClientIntl>
      {eventRow && (
        <p className="text-caption text-muted-foreground">
          {t('mvaEvent', { event: eventRow.name })}
        </p>
      )}
    </div>
  );
}
