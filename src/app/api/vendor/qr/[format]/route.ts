import { NextResponse, type NextRequest } from 'next/server';
import { myParticipation, myVendor } from '@/lib/catalogue/server';
import { publicObjectUrl } from '@/lib/storage';
import { qrPng, qrTableSign, storefrontUrl } from '@/lib/storefront/qr';
import { currentApplicationEvent } from '@/lib/vendor/server';

/** The signed-in vendor's QR code (QR-01): /api/vendor/qr/png or /api/vendor/qr/pdf. */
export async function GET(_: NextRequest, { params }: RouteContext<'/api/vendor/qr/[format]'>) {
  const { format } = await params;
  if (format !== 'png' && format !== 'pdf') return new NextResponse(null, { status: 404 });
  const [vendor, event] = await Promise.all([myVendor(), currentApplicationEvent()]);
  if (!vendor || !event) return new NextResponse(null, { status: 403 });
  const participation = await myParticipation(vendor.id, event.id);
  if (participation?.status !== 'approved') return new NextResponse(null, { status: 403 });

  const url = storefrontUrl(event.slug, vendor.slug);
  const filename = `qr-${event.slug}-${vendor.display_name
    .normalize('NFKD')
    .replace(/[^\w-]+/g, '-')
    .toLowerCase()}`;
  if (format === 'png') {
    return new NextResponse(new Uint8Array(await qrPng(url)), {
      headers: {
        'content-type': 'image/png',
        'content-disposition': `inline; filename="${filename}.png"`,
        'cache-control': 'private, max-age=300',
      },
    });
  }
  let logo: { bytes: Uint8Array; type: 'png' | 'jpg' } | null = null;
  const logoUrl = publicObjectUrl('vendor-media', vendor.logo_path);
  const type = vendor.logo_path?.match(/\.(png|jpe?g)$/i)?.[1]?.toLowerCase();
  if (logoUrl && type) {
    try {
      const response = await fetch(logoUrl);
      if (response.ok)
        logo = {
          bytes: new Uint8Array(await response.arrayBuffer()),
          type: type === 'png' ? 'png' : 'jpg',
        };
    } catch {
      logo = null;
    }
  }
  const pdf = await qrTableSign({
    url,
    vendorName: vendor.display_name,
    eventName: event.name,
    logo,
  });
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `attachment; filename="${filename}.pdf"`,
      'cache-control': 'private, no-store',
    },
  });
}
