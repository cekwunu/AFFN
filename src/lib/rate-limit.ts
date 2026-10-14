import 'server-only';
import { headers } from 'next/headers';
import { serverEnv } from '@/lib/env.server';
import { createAdminClient } from '@/lib/supabase/admin';
import { clientIp, rateLimitKey } from './rate-limit-keys';

/** Limits per bucket (NFR-06). `perIp` limits are scaled by RATE_LIMIT_IP_SCALE. */
export const RATE_LIMITS = {
  signInAccount: { limit: 5, windowSeconds: 15 * 60, perIp: false },
  signInIp: { limit: 20, windowSeconds: 15 * 60, perIp: true },
  resetAccount: { limit: 3, windowSeconds: 60 * 60, perIp: false },
  resetIp: { limit: 10, windowSeconds: 60 * 60, perIp: true },
  signUpIp: { limit: 10, windowSeconds: 60 * 60, perIp: true },
  // Brønnøysund lookups per signed-in user (VEN-02).
  brregLookupUser: { limit: 30, windowSeconds: 60 * 60, perIp: false },
} as const;
export type RateLimitBucket = keyof typeof RATE_LIMITS;

function secret(): string {
  if (serverEnv.RATE_LIMIT_SECRET) return serverEnv.RATE_LIMIT_SECRET;
  if (process.env.NODE_ENV === 'production') throw new Error('RATE_LIMIT_SECRET is not set.');
  return 'development-only';
}

function settings(bucket: RateLimitBucket) {
  const { limit, windowSeconds, perIp } = RATE_LIMITS[bucket];
  return {
    p_limit: perIp ? Math.ceil(limit * serverEnv.RATE_LIMIT_IP_SCALE) : limit,
    p_window_seconds: windowSeconds,
  };
}

export async function requestIp(): Promise<string> {
  return clientIp(await headers());
}

/** True while the key is under its limit; does not count a hit. */
export async function withinLimit(bucket: RateLimitBucket, value: string): Promise<boolean> {
  const { data, error } = await createAdminClient().rpc('rate_limit_check', {
    p_key: rateLimitKey(bucket, value, secret()),
    ...settings(bucket),
  });
  if (error) throw error;
  return data;
}

/** Counts a hit; returns false once the limit is exceeded. */
export async function hitLimit(bucket: RateLimitBucket, value: string): Promise<boolean> {
  const { data, error } = await createAdminClient().rpc('rate_limit_hit', {
    p_key: rateLimitKey(bucket, value, secret()),
    ...settings(bucket),
  });
  if (error) throw error;
  return data;
}
