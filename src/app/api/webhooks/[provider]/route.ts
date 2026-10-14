import { NextResponse } from 'next/server';

/**
 * PSP webhooks land here. When implemented this must go through the PaymentProvider
 * adapter (src/lib/payments/provider.ts): verify the signature, store the raw event in
 * psp_webhook_events, then process idempotently. Not implemented yet.
 */
export async function POST(
  _request: Request,
  { params }: RouteContext<'/api/webhooks/[provider]'>,
) {
  const { provider } = await params;
  return NextResponse.json({ error: 'not_implemented', provider }, { status: 501 });
}
