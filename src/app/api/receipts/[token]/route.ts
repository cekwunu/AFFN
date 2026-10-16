import { documentResponse } from '@/lib/documents/respond';
import { ensureDocument } from '@/lib/documents/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

/**
 * The customer's receipt as PDF (QR-05): the same content as /o/[token]. Visitors have no
 * account; the secret tracking token is the key. Stored once per content (a refund makes a new
 * version), ?lang=en for English.
 */
export async function GET(request: Request, { params }: RouteContext<'/api/receipts/[token]'>) {
  const { token } = await params;
  if (!/^[0-9a-f]{64}$/.test(token)) return new Response(null, { status: 404 });
  const { data: order } = await createAdminClient()
    .from('orders')
    .select('id, paid_at')
    .eq('tracking_token', token)
    .maybeSingle();
  if (!order?.paid_at) return new Response(null, { status: 404 });
  const locale = new URL(request.url).searchParams.get('lang') === 'en' ? 'en' : 'nb';
  const document = await ensureDocument({ kind: 'customer_receipt', id: order.id }, locale, null);
  return documentResponse(document);
}
