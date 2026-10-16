import { NextResponse, type NextRequest } from 'next/server';
import { publicEnv } from '@/lib/env';
import { qrPng, qrTableSign } from '@/lib/storefront/qr';
import { createClient } from '@/lib/supabase/server';

/**
 * A sponsor QR code (SPO-03) as PNG or a print-ready A5 PDF: ?format=png|pdf. It points at
 * /s/[code], which counts the scan. The sponsor itself and event staff (RLS).
 */
export async function GET(request: NextRequest, { params }: RouteContext<'/api/sponsor/qr/[id]'>) {
  const { id } = await params;
  const format = request.nextUrl.searchParams.get('format') === 'pdf' ? 'pdf' : 'png';
  if (!/^[0-9a-f-]{36}$/.test(id)) return new NextResponse(null, { status: 404 });
  const supabase = await createClient();
  const { data: link } = await supabase
    .from('tracked_links')
    .select(
      'slug, label, sponsor:sponsors(name), event:events!tracked_links_event_id_organization_id_fkey(name)',
    )
    .eq('id', id)
    .not('sponsor_id', 'is', null)
    .maybeSingle();
  if (!link) return new NextResponse(null, { status: 404 });
  const url = new URL(`/s/${link.slug}`, publicEnv.NEXT_PUBLIC_SITE_URL).toString();
  const filename = `qr-${link.slug}`;
  if (format === 'png') {
    return new NextResponse(new Uint8Array(await qrPng(url)), {
      headers: {
        'content-type': 'image/png',
        'content-disposition': `inline; filename="${filename}.png"`,
        'cache-control': 'private, max-age=300',
      },
    });
  }
  const pdf = await qrTableSign({
    url,
    vendorName: link.sponsor?.name ?? '',
    eventName: link.event.name,
    logo: null,
  });
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `attachment; filename="${filename}.pdf"`,
      'cache-control': 'private, no-store',
    },
  });
}
