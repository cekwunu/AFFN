'use server';

import { redirect } from 'next/navigation';
import { getMockProvider } from '@/lib/payments';
import { PAYMENT_METHODS, type PaymentMethod } from '@/lib/payments/provider';
import { processWebhook } from '@/lib/payments/webhooks';

/** Back into the app only: keep the path and query of a provider return URL. */
function withinApp(url: string, extra: string): string {
  const target = new URL(url);
  return `${target.pathname}${target.search ? `${target.search}&` : '?'}${extra}`;
}

/**
 * The mock provider's hosted pages: each action produces the signed webhook a real provider
 * would send and delivers it through the same processing path as /api/webhooks/mock.
 */
export async function completeMockOnboarding(formData: FormData): Promise<void> {
  const token = String(formData.get('token') ?? '');
  const outcome = formData.get('outcome') === 'action_required' ? 'action_required' : 'enabled';
  const result = await getMockProvider().completeOnboarding(token, outcome);
  if (!result) redirect('?error=invalid');
  const processed = await processWebhook('mock', result.delivery.rawBody, result.delivery.headers);
  if (processed === 'failed' || processed === 'invalid') redirect('?error=failed');
  redirect(withinApp(result.returnUrl, 'returned=1'));
}

export async function completeMockPayment(formData: FormData): Promise<void> {
  const token = String(formData.get('token') ?? '');
  const method = String(formData.get('method') ?? '') as PaymentMethod;
  const outcome = formData.get('result') === 'failed' ? 'failed' : 'succeeded';
  if (!PAYMENT_METHODS.includes(method)) redirect('?error=method');
  const result = await getMockProvider().completePayment(token, { result: outcome, method });
  if (!result) redirect('?error=invalid');
  const processed = await processWebhook('mock', result.delivery.rawBody, result.delivery.headers);
  if (processed === 'failed' || processed === 'invalid') redirect('?error=failed');
  redirect(withinApp(result.returnUrl, outcome === 'succeeded' ? 'paid=1' : 'payment=failed'));
}
