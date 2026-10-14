'use server';

import { getLocale, getTranslations } from 'next-intl/server';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import type { Locale } from '@/i18n/routing';
import { localizePath } from '@/i18n/paths';
import { getPaymentProvider } from '@/lib/payments/provider';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

export interface PayState {
  error?: 'failed';
}

/**
 * Opens a payment link for the vendor's stall fee (STL-04). The fee is read under RLS, so a
 * vendor can only pay their own; the money goes to AFFN's own account, never the vendor ledger.
 */
export async function payStallFee(_: PayState, formData: FormData): Promise<PayState> {
  const id = String(formData.get('stallFeeId') ?? '');
  const locale = (await getLocale()) as Locale;
  const t = await getTranslations('VendorStall');
  const supabase = await createClient();
  const { data: fee } = await supabase
    .from('stall_fees')
    .select('id, total_ore, status, event:events(name)')
    .eq('id', id)
    .maybeSingle();
  if (!fee || !['open', 'invoiced'].includes(fee.status)) return { error: 'failed' };

  const h = await headers();
  const origin =
    h.get('origin') ??
    `${h.get('x-forwarded-proto') ?? 'http'}://${h.get('x-forwarded-host') ?? h.get('host')}`;
  let url: string;
  try {
    const provider = getPaymentProvider();
    ({ url } = await provider.createPaymentLink({
      kind: 'stall_fee',
      reference: fee.id,
      amountOre: fee.total_ore,
      description: t('paymentDescription', { event: fee.event?.name ?? '' }).trim(),
      returnUrl: `${origin}${localizePath('/vendor/stall', locale)}`,
    }));
    // The link is kept with the fee so staff can see what was sent; written by the server.
    await createAdminClient().from('stall_fees').update({ payment_link_url: url }).eq('id', fee.id);
  } catch {
    return { error: 'failed' };
  }
  redirect(url);
}
