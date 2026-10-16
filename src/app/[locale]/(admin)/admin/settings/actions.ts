'use server';

import { revalidatePath } from 'next/cache';
import { currentOrganization, getCurrentUser } from '@/lib/auth/server';
import { parseSettings, type SettingsErrors } from '@/lib/settings/organization';
import { createClient } from '@/lib/supabase/server';
import { currentApplicationEvent } from '@/lib/vendor/server';

export interface SettingsState {
  ok?: boolean;
  at?: number;
  error?: 'forbidden' | 'failed';
  errors?: SettingsErrors;
}

/**
 * Saves AFFN's company details for invoices and the current event's mva rate on stall fees.
 * Organization Admins only (RLS, MFA); both changes are audited by the database.
 */
export async function saveSettings(_: SettingsState, formData: FormData): Promise<SettingsState> {
  const user = await getCurrentUser();
  const organization = await currentOrganization();
  const isOrgAdmin = user?.access.roles.some(
    (r) => r.org === organization.id && r.role === 'org_admin' && r.status === 'active',
  );
  if (!user || !isOrgAdmin) return { error: 'forbidden' };
  const value = (name: string) => {
    const v = formData.get(name);
    return typeof v === 'string' ? v : '';
  };
  const parsed = parseSettings({
    legalName: value('legalName'),
    orgNumber: value('orgNumber'),
    vatRegistered: formData.get('vatRegistered') === 'on',
    addressLine: value('addressLine'),
    postalCode: value('postalCode'),
    city: value('city'),
    bankAccount: value('bankAccount'),
    invoiceEmail: value('invoiceEmail'),
    invoiceDueDays: value('invoiceDueDays'),
    stallFeeMva: value('stallFeeMva'),
  });
  if (!parsed.ok) return { errors: parsed.errors };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('organizations')
    .update(parsed.organization)
    .eq('id', organization.id)
    .select('id');
  if (error || !data?.length) return { error: 'failed' };
  const event = await currentApplicationEvent();
  if (event) {
    const { error: eventError } = await supabase
      .from('events')
      .update({ stall_fee_mva_bp: parsed.stallFeeMvaBp })
      .eq('id', event.id);
    if (eventError) return { error: 'failed' };
  }
  revalidatePath('/admin/settings');
  return { ok: true, at: Date.now() };
}
