import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import type { Json } from '@/lib/supabase/database.types';
import { getPaymentProvider } from './index';
import { toDbStatus, type ProviderName, type WebhookEvent } from './provider';

export type WebhookResult = 'processed' | 'duplicate' | 'ignored' | 'invalid' | 'failed';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** The organization an event belongs to, known before storing it (the table is append-only). */
async function organizationOf(event: WebhookEvent): Promise<string | null> {
  const admin = createAdminClient();
  switch (event.type) {
    case 'payment.succeeded':
    case 'payment.failed':
      return UUID.test(event.metadata?.organizationId ?? '') ? event.metadata.organizationId : null;
    case 'account.updated': {
      const { data } = await admin
        .from('event_vendors')
        .select('organization_id')
        .eq('psp_account_id', event.accountId)
        .maybeSingle();
      return data?.organization_id ?? null;
    }
    case 'refund.succeeded':
    case 'refund.failed': {
      const { data } = await admin
        .from('refunds')
        .select('organization_id')
        .eq('provider_refund_id', event.providerRefundId)
        .maybeSingle();
      return data?.organization_id ?? null;
    }
    case 'dispute.opened':
    case 'dispute.closed': {
      const { data } = await createAdminClient()
        .from('payments')
        .select('organization_id')
        .eq('provider_payment_id', event.providerPaymentId)
        .maybeSingle();
      return data?.organization_id ?? null;
    }
    case 'payout.paid':
    case 'payout.failed': {
      const { data } = await admin
        .from('payouts')
        .select('organization_id')
        .eq('provider_payout_id', event.providerPayoutId)
        .maybeSingle();
      return data?.organization_id ?? null;
    }
  }
}

/** Applies a verified event. Every step is idempotent in the database. */
async function apply(
  provider: ProviderName,
  event: WebhookEvent,
): Promise<'processed' | 'ignored'> {
  const admin = createAdminClient();
  const check = <T>(result: { data: T; error: { message: string } | null }) => {
    if (result.error) throw new Error(result.error.message);
    return result.data;
  };
  switch (event.type) {
    case 'payment.succeeded':
    case 'payment.failed': {
      const { kind, reference } = event.metadata;
      if (kind === 'stall_fee') {
        if (event.type === 'payment.failed') return 'ignored';
        check(
          await admin.rpc('record_fee_payment', {
            p_stall_fee_id: reference,
            p_provider: provider,
            p_provider_payment_id: event.providerPaymentId,
            p_amount_ore: event.amountOre,
          }),
        );
        return 'processed';
      }
      check(
        await admin.rpc('record_order_payment', {
          p_provider: provider,
          p_provider_payment_id: event.providerPaymentId,
          p_succeeded: event.type === 'payment.succeeded',
          p_method: event.type === 'payment.succeeded' ? event.method : (null as never),
          p_amount_ore: event.type === 'payment.succeeded' ? event.amountOre : 0,
          p_platform_fee_ore: event.type === 'payment.succeeded' ? event.platformFeeOre : 0,
          p_reason: event.type === 'payment.failed' ? event.reason : (null as never),
          // Posts the ledger (PRD §5) with the provider's reported fee.
          p_psp_fee_ore: event.type === 'payment.succeeded' ? event.pspFeeOre : (null as never),
        }),
      );
      return 'processed';
    }
    case 'account.updated':
      check(
        await admin.rpc('set_payment_account_status', {
          p_account_id: event.accountId,
          p_status: toDbStatus(event.status),
        }),
      );
      return 'processed';
    case 'refund.succeeded':
    case 'refund.failed':
      return check(
        await admin.rpc('record_refund_result', {
          p_provider_refund_id: event.providerRefundId,
          p_succeeded: event.type === 'refund.succeeded',
        }),
      )
        ? 'processed'
        : 'ignored';
    case 'dispute.opened':
    case 'dispute.closed':
      check(
        await admin.rpc('record_dispute', {
          p_provider: provider,
          p_provider_dispute_id: event.providerDisputeId,
          p_provider_payment_id: event.providerPaymentId,
          p_amount_ore: event.amountOre,
          p_reason: event.reason ?? (null as never),
          p_status: event.outcome,
        }),
      );
      return 'processed';
    case 'payout.paid':
    case 'payout.failed':
      return check(
        await admin.rpc('record_payout_result', {
          p_provider_payout_id: event.providerPayoutId,
          p_paid: event.type === 'payout.paid',
          p_reason: event.reason ?? (null as never),
        }),
      )
        ? 'processed'
        : 'ignored';
  }
}

/**
 * Handles a payment provider webhook (CLAUDE.md): verify the signature, store the raw event
 * exactly as received, then process it idempotently. An event that was already processed is
 * never processed again; one whose processing failed is retried on the next delivery. Every
 * attempt is recorded.
 */
export async function processWebhook(
  providerName: ProviderName,
  rawBody: string,
  headers: Headers,
): Promise<WebhookResult> {
  const provider = getPaymentProvider(providerName);
  const event = await provider.handleWebhook(rawBody, headers);
  const admin = createAdminClient();

  let payload: NonNullable<Json>;
  try {
    payload = (JSON.parse(rawBody) as Json) ?? { raw: rawBody };
  } catch {
    payload = { raw: rawBody };
  }
  // Unverified events get their own id space, so a forged event can never claim a real id.
  const claimedId = (payload as { id?: unknown })?.id;
  const providerEventId = event
    ? event.id
    : `unverified:${typeof claimedId === 'string' ? claimedId : crypto.randomUUID()}:${crypto.randomUUID()}`;
  const organizationId = event ? await organizationOf(event) : null;

  let storedId: string;
  const { data: stored, error: storeError } = await admin
    .from('psp_webhook_events')
    .insert({
      organization_id: organizationId,
      provider: providerName,
      provider_event_id: providerEventId,
      event_type: event?.type ?? 'unknown',
      signature_valid: !!event,
      payload,
    })
    .select('id')
    .single();
  if (storeError) {
    if (storeError.code !== '23505' || !event) throw storeError;
    // A repeat delivery: skip it if the first one was handled.
    const { data: existing } = await admin
      .from('psp_webhook_events')
      .select('id, attempts:psp_webhook_attempts(outcome)')
      .eq('provider', providerName)
      .eq('provider_event_id', providerEventId)
      .single();
    if (!existing) throw storeError;
    if (existing.attempts.some((a) => a.outcome !== 'failed')) return 'duplicate';
    storedId = existing.id;
  } else {
    storedId = stored.id;
  }
  if (!event) return 'invalid';

  const attempt = (outcome: 'processed' | 'ignored' | 'failed', error?: string) =>
    admin.from('psp_webhook_attempts').insert({
      webhook_event_id: storedId,
      outcome,
      error: error ?? null,
      organization_id: organizationId,
    });

  try {
    const outcome = await apply(providerName, event);
    await attempt(outcome);
    return outcome;
  } catch (error) {
    await attempt('failed', error instanceof Error ? error.message : String(error));
    return 'failed';
  }
}
