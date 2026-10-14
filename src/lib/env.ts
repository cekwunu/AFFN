import { z } from 'zod';

/**
 * Public variables are read with literal `process.env.NEXT_PUBLIC_*` references so
 * Next.js can inline them into client bundles. Server-only variables live in
 * ./env.server.ts, which cannot be imported from client code.
 */
const publicSchema = z.object({
  NEXT_PUBLIC_SITE_URL: z.url().default('http://localhost:3000'),
  NEXT_PUBLIC_SUPABASE_URL: z.url().optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1).optional(),
});

export const publicEnv = publicSchema.parse({
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL || undefined,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || undefined,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || undefined,
});

/** Supabase URL and anon key, or null when Supabase is not configured (e.g. a fresh clone). */
export function supabasePublicConfig(): { url: string; anonKey: string } | null {
  const { NEXT_PUBLIC_SUPABASE_URL: url, NEXT_PUBLIC_SUPABASE_ANON_KEY: anonKey } = publicEnv;
  return url && anonKey ? { url, anonKey } : null;
}

export function requireSupabasePublicConfig(): { url: string; anonKey: string } {
  const config = supabasePublicConfig();
  if (!config) {
    throw new Error(
      'Supabase is not configured: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (see .env.example).',
    );
  }
  return config;
}
