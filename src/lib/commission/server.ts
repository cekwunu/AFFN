import 'server-only';
import { resolveCommissionRule, type CommissionRule } from '@/lib/money/commission';
import { createClient } from '@/lib/supabase/server';

/** Every commission rule of the organization, newest first, with readable targets (COM-01). */
export async function listCommissionRules(organizationId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('commission_rules')
    .select(
      `id, scope, type, rate_bp, fixed_ore, effective_from, reason, created_at, event_id, category_id, vendor_id,
       event:events!commission_rules_event_id_organization_id_fkey(name),
       category:product_categories!commission_rules_category_id_organization_id_fkey(name_nb, name_en),
       vendor:vendors(display_name)`,
    )
    .eq('organization_id', organizationId)
    .order('effective_from', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}
export type CommissionRuleRow = Awaited<ReturnType<typeof listCommissionRules>>[number];

export const toRule = (r: CommissionRuleRow): CommissionRule & { id: string } => ({
  id: r.id,
  scope: r.scope,
  type: r.type,
  rateBp: r.rate_bp,
  fixedOre: r.fixed_ore,
  eventId: r.event_id,
  categoryId: r.category_id,
  vendorId: r.vendor_id,
  effectiveFrom: r.effective_from,
});

/** The rule in force now for each level, for the overview cards. */
export function inForce(rules: CommissionRuleRow[], eventId: string, now = new Date()) {
  const all = rules.map(toRule);
  const at = (scope: CommissionRule['scope'], key?: { vendorId?: string; categoryId?: string }) =>
    resolveCommissionRule(
      all.filter((r) => r.scope === scope),
      {
        vendorId: key?.vendorId ?? '',
        categoryIds: key?.categoryId ? [key.categoryId] : [],
        eventId,
        at: now,
      },
    );
  const ids = (field: 'vendor_id' | 'category_id') => [
    ...new Set(rules.map((r) => r[field]).filter((v): v is string => !!v)),
  ];
  return {
    organization: at('organization'),
    event: at('event'),
    categories: ids('category_id')
      .map((categoryId) => at('category', { categoryId }))
      .filter((r) => r !== null),
    vendors: ids('vendor_id')
      .map((vendorId) => at('vendor', { vendorId }))
      .filter((r) => r !== null),
  };
}

/** Choices for the rule form: events, product categories and vendors of the organization. */
export async function ruleTargets(organizationId: string) {
  const supabase = await createClient();
  const [events, categories, vendors] = await Promise.all([
    supabase
      .from('events')
      .select('id, name')
      .eq('organization_id', organizationId)
      .order('starts_at'),
    supabase
      .from('product_categories')
      .select('id, name_nb, name_en')
      .eq('organization_id', organizationId)
      .order('sort_order'),
    supabase
      .from('vendors')
      .select('id, display_name')
      .eq('organization_id', organizationId)
      .order('display_name'),
  ]);
  for (const r of [events, categories, vendors]) if (r.error) throw r.error;
  return { events: events.data!, categories: categories.data!, vendors: vendors.data! };
}
