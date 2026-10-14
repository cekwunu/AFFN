import { NextResponse, type NextRequest } from 'next/server';
import type { ProviderName } from '@/lib/payments/provider';
import { handlePaymentWebhook } from '@/lib/payments/webhooks';

const PROVIDERS: ProviderName[] = ['mock', 'stripe', 'swedbank'];
const STATUS = { processed: 200, duplicate: 200, ignored: 200, invalid: 400, failed: 500 } as const;

/**
 * Payment provider webhooks. The raw body is read as text so the signature can be verified on
 * exactly what was sent.
 */
export async function POST(
  request: NextRequest,
  { params }: RouteContext<'/api/webhooks/[provider]'>,
) {
  const { provider } = await params;
  if (!PROVIDERS.includes(provider as ProviderName)) return new NextResponse(null, { status: 404 });
  const rawBody = await request.text();
  const signature = request.headers.get('x-affn-signature');
  try {
    const result = await handlePaymentWebhook(provider as ProviderName, rawBody, signature);
    return NextResponse.json({ result }, { status: STATUS[result] });
  } catch {
    return NextResponse.json({ result: 'failed' }, { status: 500 });
  }
}
