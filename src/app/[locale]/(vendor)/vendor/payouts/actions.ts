'use server';

import { getLocale } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { localizePath } from '@/i18n/paths';
import type { Locale } from '@/i18n/routing';
import { getCurrentUser } from '@/lib/auth/server';
import { myParticipation, myVendor } from '@/lib/catalogue/server';
import { requestOrigin } from '@/lib/http/origin';
import { getPaymentProvider } from '@/lib/payments';
import { createAdminClient } from '@/lib/supabase/admin';
import { currentApplicationEvent } from '@/lib/vendor/server';

export interface PayoutState {
  error?: 'failed' | 'notApproved';
}

/**
 * "Set up payouts" (VEN-06): creates (or resumes) the vendor's account with the payment provider
 * and sends the vendor to the provider's hosted onboarding. The account is linked to the
 * participation by server code only, and the change is audited with the vendor as actor.
 */
export async function startPayoutSetup(): Promise<PayoutState> {
  const [user, vendor, event] = await Promise.all([
    getCurrentUser(),
    myVendor(),
    currentApplicationEvent(),
  ]);
  if (!user || !vendor || !event) return { error: 'failed' };
  const participation = await myParticipation(vendor.id, event.id);
  if (participation?.status !== 'approved') return { error: 'notApproved' };

  const admin = createAdminClient();
  const [{ data: ev }, { data: contact }] = await Promise.all([
    admin.from('event_vendors').select('psp_account_id').eq('id', participation.id).single(),
    admin.from('vendor_contacts').select('contact_email').eq('vendor_id', vendor.id).maybeSingle(),
  ]);
  const locale = (await getLocale()) as Locale;
  let url: string;
  try {
    const result = await getPaymentProvider().onboardVendor({
      eventVendorId: participation.id,
      existingAccountId: ev?.psp_account_id ?? null,
      businessName: vendor.legal_name,
      orgNumber: vendor.org_number,
      email: contact?.contact_email ?? null,
      returnUrl: `${await requestOrigin()}${localizePath('/vendor/payouts', locale)}`,
    });
    const { error } = await admin.rpc('set_payment_account', {
      p_event_vendor_id: participation.id,
      p_account_id: result.accountId,
      p_status: 'pending',
      p_actor: user.id,
    });
    if (error) throw error;
    url = result.onboardingUrl;
  } catch {
    return { error: 'failed' };
  }
  redirect(url);
}
