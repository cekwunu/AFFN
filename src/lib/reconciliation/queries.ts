import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

/** Recent reconciliation runs and the mismatches to act on (TRX-02). Read under RLS. */
export async function reconciliationOverview(organizationId: string, show: 'open' | 'resolved') {
  const supabase = await createClient();
  const [runs, items, comments] = await Promise.all([
    supabase
      .from('reconciliation_runs')
      .select(
        'id, provider, period_from, period_to, provider_count, matched_count, mismatch_count, triggered_by, created_at',
      )
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })
      .limit(10),
    (show === 'open'
      ? supabase.from('reconciliation_items').select('*').neq('status', 'resolved')
      : supabase.from('reconciliation_items').select('*').eq('status', 'resolved')
    )
      .eq('organization_id', organizationId)
      .order('occurred_at', { ascending: false })
      .limit(100),
    supabase
      .from('reconciliation_comments')
      .select('id, item_id, author_id, body, created_at')
      .eq('organization_id', organizationId)
      .order('created_at'),
  ]);
  for (const r of [runs, items, comments]) if (r.error) throw r.error;
  return {
    runs: runs.data!,
    items: items.data!.map((i) => ({
      ...i,
      comments: comments.data!.filter((c) => c.item_id === i.id),
    })),
  };
}
export type ReconciliationItem = Awaited<
  ReturnType<typeof reconciliationOverview>
>['items'][number];

/** Organization and Event Admins who can be assigned a mismatch, with their emails. */
export async function staffDirectory(organizationId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from('memberships')
    .select('user_id')
    .eq('organization_id', organizationId)
    .in('role', ['org_admin', 'event_admin'])
    .eq('status', 'active');
  const ids = [...new Set((data ?? []).map((m) => m.user_id))];
  const admin = createAdminClient();
  const entries = await Promise.all(
    ids.map(async (id) => {
      const { data: user } = await admin.auth.admin.getUserById(id);
      return [id, user.user?.email ?? '—'] as const;
    }),
  );
  return new Map(entries);
}
