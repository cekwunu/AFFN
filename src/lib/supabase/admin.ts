import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { requireSupabasePublicConfig } from '@/lib/env';
import { requireServiceRoleKey } from '@/lib/env.server';
import type { Database } from './database.types';

/**
 * Service-role client: bypasses RLS. Server code only (webhooks, scheduled jobs,
 * settlement). Never pass its results to the client without scoping them.
 */
export function createAdminClient() {
  const { url } = requireSupabasePublicConfig();
  return createClient<Database>(url, requireServiceRoleKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
