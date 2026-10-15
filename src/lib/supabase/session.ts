import { createServerClient } from '@supabase/ssr';
import type { NextRequest, NextResponse } from 'next/server';
import { supabasePublicConfig } from '@/lib/env';
import type { Database } from './database.types';

/**
 * Refreshes the Supabase auth session on every page request and writes any updated
 * cookies onto `response`. Returns the verified JWT claims (null when signed out or when
 * Supabase is not configured).
 */
export async function updateSession(
  request: NextRequest,
  response: NextResponse,
): Promise<{ response: NextResponse; claims: Record<string, unknown> | null }> {
  const config = supabasePublicConfig();
  if (!config) return { response, claims: null };

  const supabase = createServerClient<Database>(config.url, config.anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
        Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
      },
    },
  });

  // Validates the JWT and refreshes it if needed. Do not remove.
  const { data } = await supabase.auth.getClaims();
  return { response, claims: (data?.claims as Record<string, unknown> | undefined) ?? null };
}
