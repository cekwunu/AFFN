'use server';

import { redirect } from 'next/navigation';
import { readMockLink, mockSecret } from '@/lib/payments/mock';
import { sign } from '@/lib/payments/mock-signing';
import type { VerifiedWebhookEvent } from '@/lib/payments/provider';
import { handlePaymentWebhook } from '@/lib/payments/webhooks';

/**
 * "Pays" a mock payment link: sends the signed webhook the provider would send, through the same
 * handler as /api/webhooks/mock, then returns to the app. The payment id is fixed per link, so
 * paying twice records one payment.
 */
export async function completeMockPayment(formData: FormData): Promise<void> {
  const token = String(formData.get('token') ?? '');
  const link = readMockLink(token);
  if (!link) redirect('?error=invalid');

  const event: VerifiedWebhookEvent = {
    id: `evt_mock_${crypto.randomUUID()}`,
    type: 'payment_link.paid',
    kind: link.kind,
    reference: link.reference,
    providerPaymentId: `mock_pay_${link.reference}`,
    amountOre: link.amountOre,
  };
  const rawBody = JSON.stringify(event);
  const result = await handlePaymentWebhook('mock', rawBody, sign(rawBody, mockSecret()));
  if (result === 'failed' || result === 'invalid') redirect('?error=failed');

  // Only ever return within the app.
  const back = new URL(link.returnUrl);
  redirect(`${back.pathname}${back.search ? `${back.search}&` : '?'}paid=1`);
}
