'use server';

import { revalidatePath } from 'next/cache';
import { currentOrganization, getCurrentUser } from '@/lib/auth/server';
import { osloLocalToUtc } from '@/lib/format';
import { kronerToOre } from '@/lib/money';
import { calculateCommission, parsePercent } from '@/lib/money/commission';
import { createClient } from '@/lib/supabase/server';

export interface RuleState {
  ok?: boolean;
  at?: number;
  error?: 'forbidden' | 'failed';
  errors?: Partial<Record<'target' | 'rate' | 'fixed' | 'effectiveFrom' | 'reason', string>>;
  values?: Record<string, string>;
}

const SCOPES = ['organization', 'event', 'category', 'vendor'] as const;
const TYPES = ['percentage', 'fixed', 'hybrid'] as const;

/**
 * Adds a commission rule (COM-01, COM-03). Rules are never edited: a change is a new rule with
 * its own effective-from date. Only Organization Admins (RLS, MFA); the reason is stored on the
 * rule and in the audit log.
 */
export async function createCommissionRule(_: RuleState, formData: FormData): Promise<RuleState> {
  const user = await getCurrentUser();
  const organization = await currentOrganization();
  const isOrgAdmin = user?.access.roles.some(
    (r) => r.org === organization.id && r.role === 'org_admin' && r.status === 'active',
  );
  if (!user || !isOrgAdmin) return { error: 'forbidden' };

  const values = Object.fromEntries(
    [...formData.entries()].map(([k, v]) => [k, typeof v === 'string' ? v : '']),
  );
  const scope = SCOPES.find((s) => s === values.scope) ?? 'organization';
  const type = TYPES.find((t) => t === values.type) ?? 'percentage';
  const errors: RuleState['errors'] = {};

  const target = scope === 'organization' ? null : values[`${scope}Id`]?.trim() || null;
  if (scope !== 'organization' && !target) errors.target = 'required';
  const eventForCategory = scope === 'category' ? values.categoryEventId?.trim() || null : null;

  const rateBp = type === 'fixed' ? null : parsePercent(values.rate ?? '');
  if (type !== 'fixed' && rateBp === null) errors.rate = 'invalid';
  let fixedOre: number | null = null;
  if (type !== 'percentage') {
    try {
      fixedOre = kronerToOre(values.fixed?.trim() || '');
      if (fixedOre < 0) errors.fixed = 'invalid';
    } catch {
      errors.fixed = 'invalid';
    }
  }
  const effectiveFrom = values.effectiveFrom ? osloLocalToUtc(values.effectiveFrom) : new Date();
  if (!effectiveFrom || effectiveFrom.getTime() < Date.now() - 5 * 60_000) {
    errors.effectiveFrom = 'past';
  }
  const reason = values.reason?.trim() ?? '';
  if (reason.length < 3) errors.reason = 'required';
  // A fee that could exceed a small sale is allowed (checkout refuses those orders), but the
  // rule itself must make sense for the 500 kr example.
  if (!errors.rate && !errors.fixed) {
    try {
      calculateCommission(50_000 as never, { type, rateBp, fixedOre });
    } catch {
      errors.fixed = 'tooHigh';
    }
  }
  if (Object.keys(errors).length) return { errors, values, at: Date.now() };

  const supabase = await createClient();
  const { error } = await supabase.from('commission_rules').insert({
    organization_id: organization.id,
    scope,
    event_id: scope === 'event' ? target : eventForCategory,
    category_id: scope === 'category' ? target : null,
    vendor_id: scope === 'vendor' ? target : null,
    type,
    rate_bp: rateBp,
    fixed_ore: fixedOre,
    effective_from: effectiveFrom!.toISOString(),
    reason,
    created_by: user.id,
  });
  if (error)
    return { error: error.code === '42501' ? 'forbidden' : 'failed', values, at: Date.now() };
  revalidatePath('/admin/commission');
  return { ok: true, at: Date.now() };
}
