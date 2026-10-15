import { timingSafeEqual } from 'node:crypto';
import { serverEnv } from '@/lib/env.server';
import { runReconciliation } from '@/lib/reconciliation/server';

export const dynamic = 'force-dynamic';

const HOURS = 48;

/**
 * Daily reconciliation (TRX-02), called by Vercel Cron with `Authorization: Bearer CRON_SECRET`.
 * Compares the last 48 hours, so a late transaction is still caught the next day.
 */
export async function GET(request: Request) {
  const secret = serverEnv.CRON_SECRET;
  const given = request.headers.get('authorization') ?? '';
  const expected = `Bearer ${secret}`;
  if (
    !secret ||
    given.length !== expected.length ||
    !timingSafeEqual(Buffer.from(given), Buffer.from(expected))
  ) {
    return new Response('Unauthorized', { status: 401 });
  }
  const to = new Date();
  const from = new Date(to.getTime() - HOURS * 3_600_000);
  const result = await runReconciliation({ from, to, userId: null });
  return Response.json(result);
}
