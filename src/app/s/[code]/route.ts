import { publicEnv } from '@/lib/env';
import { deviceClass } from '@/lib/sponsors/device';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

/**
 * Sponsor QR codes and tracked links (SPO-03): counts the scan or click with its time and a
 * coarse device type — no IP address, no cookies — and sends the visitor on.
 */
export async function GET(request: Request, { params }: RouteContext<'/s/[code]'>) {
  const { code } = await params;
  const site = publicEnv.NEXT_PUBLIC_SITE_URL;
  if (!/^[a-z0-9-]{4,64}$/.test(code)) return Response.redirect(new URL('/', site), 302);
  const { data: target } = await createAdminClient().rpc('record_link_hit', {
    p_slug: code,
    p_device_class: deviceClass(request.headers.get('user-agent')),
  });
  const location = target ? new URL(target, site) : new URL('/', site);
  return new Response(null, {
    status: 302,
    headers: {
      location: location.toString(),
      'cache-control': 'no-store',
      'referrer-policy': 'no-referrer',
    },
  });
}
