import 'server-only';
import { serverEnv } from '@/lib/env.server';
import { createAdminClient } from '@/lib/supabase/admin';
import type { Json } from '@/lib/supabase/database.types';
import { isValidOrgNumber, parseBrregResponse, type BrregResult } from './brreg';

/** Answers are cached: a day for found businesses, an hour for "not found" and similar. */
const MAX_AGE_ACTIVE = 24 * 60 * 60;
const MAX_AGE_OTHER = 60 * 60;
const TIMEOUT_MS = 8000;

/** Looks up an org number in Enhetsregisteret, using the cache (VEN-02). */
export async function lookupOrgNumber(orgNumber: string): Promise<BrregResult> {
  if (!isValidOrgNumber(orgNumber)) return { status: 'invalid' };
  const admin = createAdminClient();

  const { data: cached } = await admin.rpc('brreg_cache_get', {
    p_org_number: orgNumber,
    p_max_age_seconds: MAX_AGE_ACTIVE,
  });
  if (cached && typeof cached === 'object' && !Array.isArray(cached)) {
    const hit = cached as { status: string; payload: BrregResult | null; fetched_at: string };
    const age = (Date.now() - new Date(hit.fetched_at).getTime()) / 1000;
    if (hit.payload && (hit.status === 'active' || age < MAX_AGE_OTHER)) return hit.payload;
  }

  let result: BrregResult;
  try {
    const response = await fetch(`${serverEnv.BRREG_API_URL}/enheter/${orgNumber}`, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: 'no-store',
    });
    const body: unknown = await response.json().catch(() => null);
    result = parseBrregResponse(response.status, body);
  } catch {
    result = { status: 'unavailable' };
  }

  // Never cache an outage: the next try should ask the registry again.
  if (result.status !== 'unavailable') {
    await admin.rpc('brreg_cache_put', {
      p_org_number: orgNumber,
      p_status: result.status,
      p_payload: result as unknown as Json,
    });
  }
  return result;
}
