'use server';

import { getLocale } from 'next-intl/server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { localizePath } from '@/i18n/paths';
import type { Locale } from '@/i18n/routing';
import { currentOrganization, getCurrentUser } from '@/lib/auth/server';
import { osloLocalToUtc } from '@/lib/format';
import { runReconciliation } from '@/lib/reconciliation/server';
import { createClient } from '@/lib/supabase/server';

const text = (formData: FormData, name: string) => {
  const value = formData.get(name);
  return typeof value === 'string' ? value.trim() : '';
};

async function back(query: string, anchor = ''): Promise<never> {
  revalidatePath('/admin/reconciliation');
  redirect(localizePath(`/admin/reconciliation?${query}${anchor}`, (await getLocale()) as Locale));
}

async function staffOnly() {
  const user = await getCurrentUser();
  const organization = await currentOrganization();
  const ok = user?.access.roles.some(
    (r) =>
      r.org === organization.id &&
      (r.role === 'org_admin' || r.role === 'event_admin') &&
      r.status === 'active',
  );
  return ok ? user : null;
}

/** "Run now" (TRX-02): the chosen Oslo days, or the last 7 days. */
export async function runNow(formData: FormData) {
  const user = await staffOnly();
  if (!user) return back('error=forbidden');
  const day = (name: string) =>
    /^\d{4}-\d{2}-\d{2}$/.test(text(formData, name)) ? text(formData, name) : null;
  // Whole Oslo days: from the start of `from` to the end of `to`.
  const nextDay = (d: string) =>
    new Date(Date.parse(`${d}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
  const toDay = day('to');
  const fromDay = day('from');
  const to = toDay ? osloLocalToUtc(`${nextDay(toDay)}T00:00`)! : new Date();
  const from = fromDay
    ? osloLocalToUtc(`${fromDay}T00:00`)!
    : new Date(to.getTime() - 7 * 86_400_000);
  if (from >= to) return back('error=range');
  try {
    const result = await runReconciliation({ from, to, userId: user.id });
    return back(`notice=ran&matched=${result.matched}&mismatches=${result.mismatches}`);
  } catch {
    return back('error=failed');
  }
}

/** Assign a mismatch to someone (or to me), add a comment, resolve with a reason, or reopen. */
export async function updateItem(formData: FormData) {
  const user = await staffOnly();
  if (!user) return back('error=forbidden');
  const id = text(formData, 'item');
  const action = text(formData, 'action');
  const supabase = await createClient();
  const anchor = `#item-${id}`;
  if (action === 'comment') {
    const body = text(formData, 'body').slice(0, 2000);
    if (!body) return back('error=comment', anchor);
    const organization = await currentOrganization();
    const { error } = await supabase.from('reconciliation_comments').insert({
      organization_id: organization.id,
      item_id: id,
      author_id: user.id,
      body,
    });
    return back(error ? 'error=failed' : 'notice=commented', anchor);
  }
  let change: Record<string, string | null>;
  if (action === 'assign') {
    const to = text(formData, 'assignee') || user.id;
    change = { status: 'assigned', assigned_to: to };
  } else if (action === 'resolve') {
    const reason = text(formData, 'reason').slice(0, 500);
    if (reason.length < 3) return back('error=reason', anchor);
    change = { status: 'resolved', resolution_reason: reason };
  } else if (action === 'reopen') {
    change = { status: 'open', assigned_to: null };
  } else {
    return back('error=failed', anchor);
  }
  const { data, error } = await supabase
    .from('reconciliation_items')
    .update(change as never)
    .eq('id', id)
    .select('id');
  if (error || !data?.length) return back('error=failed', anchor);
  return back(`notice=${action}`, anchor);
}
