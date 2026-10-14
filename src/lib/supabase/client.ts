import { createBrowserClient } from '@supabase/ssr';
import { requireSupabasePublicConfig } from '@/lib/env';
import type { Database } from './database.types';

/** Supabase client for Client Components. Runs as the signed-in user, under RLS. */
export function createClient() {
  const { url, anonKey } = requireSupabasePublicConfig();
  return createBrowserClient<Database>(url, anonKey);
}
