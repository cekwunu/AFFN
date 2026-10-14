import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { requireSupabasePublicConfig } from '@/lib/env';
import type { Database } from './database.types';

/**
 * Supabase client for Server Components, Server Actions and Route Handlers.
 * Runs as the signed-in user, under RLS. Create one per request.
 */
export async function createClient() {
  const { url, anonKey } = requireSupabasePublicConfig();
  const cookieStore = await cookies();

  return createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Server Components cannot set cookies; the proxy refreshes the session instead.
        }
      },
    },
  });
}
