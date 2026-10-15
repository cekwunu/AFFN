import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import type { Json } from '@/lib/supabase/database.types';
import { getPaymentProvider, type ProviderName } from './provider';

export type WebhookResult = 'processed' | 'duplicate' | 'ignored' | 'invalid' | 'failed';

/**
 * Handles a payment provider webhook (CLAUDE.md): verify the signature, store the raw event,
 * then process it idempotently. Every processing attempt is recorded.
 */
export async function handlePaymentWebhook(
  providerName: ProviderName,
  rawBody: string,
  signature: string | null,
): Promise<WebhookResult> {
  const provider = getPaymentProvider(providerName);
  const event = await provider.verifyWebhook(rawBody, signature);
  const admin = createAdminClient();

  let payload: NonNullable<Json>;
  try {
    payload = (JSON.parse(rawBody) as Json) ?? { raw: rawBody };
  } catch {
    payload = { raw: rawBody };
  }
  const providerEventId = (
    event?.id ??
    (payload as { id?: unknown })?.id ??
    `unsigned_${Date.now()}`
  ).toString();

  // The organization the payment belongs to, known before storing (the table is append-only).
  const { data: fee } = event
    ? await admin
        .from('stall_fees')
        .select('organization_id')
        .eq('id', event.reference)
        .maybeSingle()
    : { data: null };

  // Store the raw event exactly as received; a repeat delivery hits the unique key.
  const { data: stored, error: storeError } = await admin
    .from('psp_webhook_events')
    .insert({
      organization_id: fee?.organization_id ?? null,
      provider: providerName,
      provider_event_id: providerEventId,
      event_type: event?.type ?? 'unknown',
      signature_valid: !!event,
      payload,
    })
    .select('id')
    .single();
  if (storeError) {
    if (storeError.code === '23505') return 'duplicate';
    throw storeError;
  }
  if (!event) return 'invalid';

  const attempt = async (
    outcome: 'processed' | 'ignored' | 'failed',
    error?: string,
    org?: string,
  ) =>
    admin.from('psp_webhook_attempts').insert({
      webhook_event_id: stored.id,
      outcome,
      error: error ?? null,
      organization_id: org ?? null,
    });

  if (event.type !== 'payment_link.paid' || event.kind !== 'stall_fee') {
    await attempt('ignored');
    return 'ignored';
  }

  const { error } = await admin.rpc('record_fee_payment', {
    p_stall_fee_id: event.reference,
    p_provider: providerName,
    p_provider_payment_id: event.providerPaymentId,
    p_amount_ore: event.amountOre,
  });
  if (error) {
    await attempt('failed', error.message, fee?.organization_id);
    return 'failed';
  }
  await attempt('processed', undefined, fee?.organization_id);
  return 'processed';
}
