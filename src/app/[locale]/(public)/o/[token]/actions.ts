'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { localizePath } from '@/i18n/paths';
import type { Locale } from '@/i18n/routing';
import { receiptEmail } from '@/lib/email/templates';
import { sendEmail } from '@/lib/email/send';
import { formatDateTimeOslo, formatNok } from '@/lib/format';
import { requestOrigin } from '@/lib/http/origin';
import { ore } from '@/lib/money';
import { formatPercent } from '@/lib/money/commission';
import { hitLimit, requestIp } from '@/lib/rate-limit';
import { getReceipt } from '@/lib/storefront/receipt';
import { createAdminClient } from '@/lib/supabase/admin';

const METHOD: Record<string, Record<Locale, string>> = {
  vipps: { nb: 'Vipps', en: 'Vipps' },
  card: { nb: 'Kort', en: 'Card' },
  apple_pay: { nb: 'Apple Pay', en: 'Apple Pay' },
  google_pay: { nb: 'Google Pay', en: 'Google Pay' },
};

/** Emails a copy of the receipt (QR-05). The address is kept on the order (personal data). */
export async function sendReceipt(formData: FormData): Promise<void> {
  const token = String(formData.get('token') ?? '');
  const locale: Locale = formData.get('locale') === 'en' ? 'en' : 'nb';
  const back = (query: string) => redirect(`${localizePath(`/o/${token}`, locale)}?${query}`);
  const email = z
    .email()
    .max(254)
    .safeParse(String(formData.get('email') ?? '').trim());
  if (!email.success) back('email=invalid');
  if (!(await hitLimit('receiptEmailIp', await requestIp()))) back('email=limited');

  const receipt = await getReceipt(token);
  if (!receipt || !receipt.paidAt) back('email=invalid');
  const { data: saved } = await createAdminClient().rpc('set_receipt_email', {
    p_tracking_token: token,
    p_email: email.data!,
  });
  if (!saved) back('email=invalid');

  const r = receipt!;
  await sendEmail(
    receiptEmail({
      to: email.data!.toLowerCase(),
      locale,
      orderNumber: r.order_number,
      vendorName: r.vendor.display_name,
      sellerName: r.vendor.legal_name,
      sellerOrgNumber: r.vendor.org_number,
      platformName: r.organization.name,
      lines: r.items.map((i) => ({
        name: i.product_name,
        quantity: i.quantity,
        total: formatNok(ore(i.line_total_ore)),
      })),
      mva: r.mvaByRate.map(([rate, amount]) => ({
        rate: formatPercent(rate),
        amount: formatNok(ore(amount)),
      })),
      total: formatNok(ore(r.total_ore)),
      method: r.method ? METHOD[r.method]![locale] : null,
      time: formatDateTimeOslo(r.paidAt!, locale),
      link: `${await requestOrigin()}${localizePath(`/o/${token}`, locale)}`,
    }),
  );
  back(`email=sent`);
}
