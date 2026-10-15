'use server';

import { getLocale, getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { localizePath } from '@/i18n/paths';
import type { Locale } from '@/i18n/routing';
import { requestOrigin } from '@/lib/http/origin';
import { getPaymentProvider } from '@/lib/payments';
import { PAYMENT_METHODS } from '@/lib/payments/provider';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

export interface PayState {
  error?: 'failed';
}

/**
 * Pays the vendor's stall fee (STL-04) through the payment provider, into AFFN's own account:
 * the whole amount is AFFN's revenue and never enters the vendor ledger. The fee is read under
 * RLS, so a vendor can only pay their own. One payment per fee (idempotency key).
 */
export async function payStallFee(_: PayState, formData: FormData): Promise<PayState> {
  const id = String(formData.get('stallFeeId') ?? '');
  const locale = (await getLocale()) as Locale;
  const t = await getTranslations('VendorStall');
  const supabase = await createClient();
  const { data: fee } = await supabase
    .from('stall_fees')
    .select('id, organization_id, total_ore, status, event:events(name)')
    .eq('id', id)
    .maybeSingle();
  if (!fee || !['open', 'invoiced'].includes(fee.status)) return { error: 'failed' };

  const back = `${await requestOrigin()}${localizePath('/vendor/stall', locale)}`;
  let url: string;
  try {
    const payment = await getPaymentProvider().createPayment({
      amountOre: fee.total_ore,
      platformFeeOre: fee.total_ore,
      account: { kind: 'platform' },
      idempotencyKey: `stall-fee-${fee.id}`,
      methods: PAYMENT_METHODS,
      description: t('paymentDescription', { event: fee.event?.name ?? '' }).trim(),
      returnUrl: back,
      cancelUrl: back,
      metadata: { kind: 'stall_fee', reference: fee.id, organizationId: fee.organization_id },
    });
    url = payment.redirectUrl;
    // Kept with the fee so staff can see what was sent; written by the server.
    await createAdminClient().from('stall_fees').update({ payment_link_url: url }).eq('id', fee.id);
  } catch {
    return { error: 'failed' };
  }
  redirect(url);
}
