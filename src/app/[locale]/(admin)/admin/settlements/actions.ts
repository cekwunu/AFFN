'use server';

import { getLocale } from 'next-intl/server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { localizePath } from '@/i18n/paths';
import type { Locale } from '@/i18n/routing';
import { getCurrentUser } from '@/lib/auth/server';
import { osloLocalToUtc } from '@/lib/format';
import { kronerToOre } from '@/lib/money';
import { MissingSellerDetails } from '@/lib/documents/models';
import { issueSettlementDocuments, regenerateDocument } from '@/lib/documents/server';
import { getMockProvider, getPaymentProvider } from '@/lib/payments';
import { processWebhook } from '@/lib/payments/webhooks';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { currentApplicationEvent } from '@/lib/vendor/server';

const UUID = /^[0-9a-f-]{36}$/;
const text = (formData: FormData, name: string) => {
  const value = formData.get(name);
  return typeof value === 'string' ? value.trim() : '';
};

/** Back to a batch page with a message (?notice=… or ?error=…). */
async function back(id: string, query: string): Promise<never> {
  revalidatePath('/admin/settlements');
  redirect(localizePath(`/admin/settlements/${id}?${query}`, (await getLocale()) as Locale));
}

export interface NewSettlementState {
  error?: 'cutoff' | 'vendors' | 'failed';
}

/**
 * New batch (SET-02): the chosen vendors (or all) and a cut-off; the lines are snapshotted from
 * the ledger at once. Event staff only (RLS and the database function).
 */
export async function createSettlement(
  _: NewSettlementState,
  formData: FormData,
): Promise<NewSettlementState> {
  const event = await currentApplicationEvent();
  if (!event) return { error: 'failed' };
  const cutoffText = text(formData, 'cutoff');
  const cutoff = cutoffText ? osloLocalToUtc(cutoffText) : new Date();
  if (!cutoff || cutoff.getTime() > Date.now() + 60_000) return { error: 'cutoff' };
  const all = formData.get('scope') !== 'some';
  const vendors = formData
    .getAll('vendor')
    .filter((v): v is string => typeof v === 'string' && UUID.test(v));
  if (!all && vendors.length === 0) return { error: 'vendors' };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('settlements')
    .insert({
      organization_id: event.organization_id,
      event_id: event.id,
      cutoff_at: cutoff.toISOString(),
      notes: text(formData, 'notes').slice(0, 500) || null,
    })
    .select('id')
    .single();
  if (error || !data) return { error: 'failed' };
  const { error: linesError } = await supabase.rpc('prepare_settlement_lines', {
    p_settlement_id: data.id,
    p_vendor_ids: all ? (null as never) : vendors,
  });
  return back(data.id, linesError ? 'error=failed' : 'notice=created');
}

/** Recompute a draft's lines from the ledger (after an adjustment is approved). */
export async function refreshLines(formData: FormData) {
  const id = text(formData, 'id');
  const supabase = await createClient();
  const { error } = await supabase.rpc('prepare_settlement_lines', {
    p_settlement_id: id,
    p_vendor_ids: null as never,
  });
  return back(id, error ? 'error=failed' : 'notice=refreshed');
}

/**
 * Workflow steps by people: send for approval, back to draft, approve, cancel. The database
 * enforces who may do what (four eyes, Organization Admin, blockers).
 */
export async function setSettlementStatus(formData: FormData) {
  const id = text(formData, 'id');
  const to = text(formData, 'to');
  if (!['prepared', 'draft', 'approved', 'cancelled'].includes(to)) return back(id, 'error=failed');
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('settlements')
    .update({ status: to as 'prepared' })
    .eq('id', id)
    .select('id');
  if (error) {
    const reason = error.message.includes('settlement_blocked')
      ? 'blocked'
      : error.message.includes('check constraint') || error.code === '23514'
        ? error.message.includes('cannot move')
          ? 'failed'
          : 'same_person'
        : error.code === '42501'
          ? 'forbidden'
          : 'failed';
    return back(id, `error=${reason}`);
  }
  if (!data?.length) return back(id, 'error=forbidden');
  return back(id, `notice=${to}`);
}

/** Manual credit (+) or debit (−) for a vendor in a draft batch, with a reason (SET-05). */
export async function addAdjustment(formData: FormData) {
  const id = text(formData, 'id');
  const user = await getCurrentUser();
  const vendorId = text(formData, 'vendor');
  const reason = text(formData, 'reason');
  let amount: number;
  try {
    amount = kronerToOre(text(formData, 'amount'));
  } catch {
    return back(id, 'error=amount#adjustments');
  }
  if (!user || !UUID.test(vendorId) || amount <= 0) return back(id, 'error=amount#adjustments');
  if (reason.length < 3) return back(id, 'error=reason#adjustments');
  const supabase = await createClient();
  const { data: settlement } = await supabase
    .from('settlements')
    .select('organization_id, event_id')
    .eq('id', id)
    .maybeSingle();
  if (!settlement) return back(id, 'error=forbidden');
  const { error } = await supabase.from('settlement_adjustments').insert({
    organization_id: settlement.organization_id,
    event_id: settlement.event_id,
    settlement_id: id,
    vendor_id: vendorId,
    amount_ore: text(formData, 'direction') === 'debit' ? -amount : amount,
    reason: reason.slice(0, 300),
    created_by: user.id,
  });
  return back(id, error ? 'error=failed#adjustments' : 'notice=adjustment#adjustments');
}

/** Approval by an Organization Admin other than the creator (RLS + check); lines refreshed. */
export async function approveAdjustment(formData: FormData) {
  const id = text(formData, 'id');
  const adjustmentId = text(formData, 'adjustment');
  const user = await getCurrentUser();
  if (!user) return back(id, 'error=forbidden');
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('settlement_adjustments')
    .update({ approved_by: user.id, approved_at: new Date().toISOString() })
    .eq('id', adjustmentId)
    .select('id');
  if (error || !data?.length) {
    const reason = error?.message.includes('check constraint') ? 'same_person' : 'forbidden';
    return back(id, `error=${reason}#adjustments`);
  }
  await supabase.rpc('prepare_settlement_lines', {
    p_settlement_id: id,
    p_vendor_ids: null as never,
  });
  return back(id, 'notice=adjustmentApproved#adjustments');
}

export async function deleteAdjustment(formData: FormData) {
  const id = text(formData, 'id');
  const supabase = await createClient();
  const { error } = await supabase
    .from('settlement_adjustments')
    .delete()
    .eq('id', text(formData, 'adjustment'));
  return back(id, error ? 'error=failed#adjustments' : 'notice=adjustmentDeleted#adjustments');
}

/**
 * Release (SET-03): one payout per vendor through the payment provider; results recorded and
 * posted to the ledger. Also retries the failed ones of a partially failed batch.
 */
export async function releaseSettlement(formData: FormData) {
  const id = text(formData, 'id');
  // Staff of the event only: they can read the batch under RLS.
  const supabase = await createClient();
  const { data: settlement } = await supabase
    .from('settlements')
    .select('id, status')
    .eq('id', id)
    .maybeSingle();
  if (
    !settlement ||
    !['approved', 'completed_with_failures', 'releasing'].includes(settlement.status)
  ) {
    return back(id, 'error=forbidden');
  }
  const admin = createAdminClient();
  const { data: payouts, error } = await admin.rpc('begin_settlement_release', {
    p_settlement_id: id,
  });
  if (error) return back(id, 'error=failed');
  const provider = getPaymentProvider();
  let failed = 0;
  for (const payout of payouts ?? []) {
    let providerId: string | null = null;
    let status: 'paid' | 'in_transit' | 'failed' = 'failed';
    let reason: string | null = null;
    try {
      if (!payout.psp_account_id) throw new Error('No payout account');
      const result = await provider.releasePayout({
        accountId: payout.psp_account_id,
        amountOre: Number(payout.amount_ore),
        idempotencyKey: `payout-${payout.payout_id}`,
        reference: payout.payout_id,
      });
      providerId = result.providerPayoutId;
      status = result.status;
    } catch (e) {
      reason = e instanceof Error ? e.message.slice(0, 200) : 'failed';
    }
    if (status === 'failed') failed++;
    await admin.rpc('record_payout', {
      p_payout_id: payout.payout_id,
      p_provider_payout_id: providerId as never,
      p_status: status,
      p_reason: reason as never,
    });
  }
  revalidatePath('/vendor/settlements');
  // Statements, order CSVs and commission invoices (SET-04). A missing AFFN detail does not undo
  // the release: the batch page asks for it and the documents are made afterwards.
  let documents = '';
  try {
    const user = await getCurrentUser();
    await issueSettlementDocuments(id, user?.id ?? null);
  } catch (e) {
    documents = e instanceof MissingSellerDetails ? '&documents=seller' : '&documents=failed';
    if (!(e instanceof MissingSellerDetails)) console.error('Settlement documents failed', e);
  }
  return back(
    id,
    (failed ? `error=payouts_failed&count=${failed}` : 'notice=released') + documents,
  );
}

/**
 * Documents for a released batch: make the missing ones, or a new version of every statement,
 * order CSV and invoice ("regenerate", never overwriting). Event staff (read under RLS).
 */
export async function makeSettlementDocuments(formData: FormData) {
  const id = text(formData, 'id');
  const supabase = await createClient();
  const { data: settlement } = await supabase
    .from('settlements')
    .select('id, status')
    .eq('id', id)
    .maybeSingle();
  if (
    !settlement ||
    !['releasing', 'completed', 'completed_with_failures'].includes(settlement.status)
  ) {
    return back(id, 'error=forbidden');
  }
  const user = await getCurrentUser();
  try {
    if (formData.get('mode') !== 'regenerate') {
      await issueSettlementDocuments(id, user?.id ?? null);
    } else {
      const admin = createAdminClient();
      const { error } = await admin.rpc('issue_commission_invoices', { p_settlement_id: id });
      if (error) throw error;
      const [{ data: lines }, { data: invoices }] = await Promise.all([
        admin.from('settlement_lines').select('id').eq('settlement_id', id),
        admin.from('invoices').select('id').eq('settlement_id', id).eq('kind', 'commission'),
      ]);
      for (const line of lines ?? []) {
        await regenerateDocument({ kind: 'vendor_statement', id: line.id }, 'nb', user?.id ?? null);
        await regenerateDocument(
          { kind: 'statement_orders_csv', id: line.id },
          'nb',
          user?.id ?? null,
        );
      }
      for (const invoice of invoices ?? []) {
        await regenerateDocument(
          { kind: 'commission_invoice', id: invoice.id },
          'nb',
          user?.id ?? null,
        );
      }
    }
  } catch (e) {
    if (e instanceof MissingSellerDetails) return back(id, 'error=seller');
    console.error('Settlement documents failed', e);
    return back(id, 'error=documents');
  }
  revalidatePath('/vendor/settlements');
  return back(id, `notice=${formData.get('mode') === 'regenerate' ? 'regenerated' : 'documents'}`);
}

/**
 * TEST MODE only: the mock PSP reports a dispute on the vendor's latest paid order, or closes
 * it, through the real webhook path.
 */
export async function simulateDispute(formData: FormData) {
  const id = text(formData, 'id');
  const provider = getPaymentProvider();
  if (!provider.testMode || provider.name !== 'mock') return back(id, 'error=forbidden');
  const supabase = await createClient();
  const { data: settlement } = await supabase
    .from('settlements')
    .select('event_id')
    .eq('id', id)
    .maybeSingle();
  if (!settlement) return back(id, 'error=forbidden');
  const outcome = text(formData, 'outcome') as 'open' | 'won' | 'lost';
  const { data: payment } = await createAdminClient()
    .from('payments')
    .select('provider_payment_id, amount_ore')
    .eq('event_id', settlement.event_id)
    .eq('vendor_id', text(formData, 'vendor'))
    .eq('status', 'succeeded')
    .eq('provider', 'mock')
    .not('provider_payment_id', 'is', null)
    .order('succeeded_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!payment || !['open', 'won', 'lost'].includes(outcome)) return back(id, 'error=failed');
  const delivery = getMockProvider().simulateDispute({
    providerPaymentId: payment.provider_payment_id!,
    amountOre: payment.amount_ore,
    outcome,
  });
  await processWebhook('mock', delivery.rawBody, delivery.headers);
  return back(id, `notice=dispute_${outcome}`);
}
