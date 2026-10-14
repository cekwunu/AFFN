import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/** Signed links expire quickly: documents are private (VEN-03). */
const SIGNED_URL_SECONDS = 5 * 60;

/**
 * Opens a vendor document through a short-lived signed URL. Row-level security decides who may
 * see the document row and the file (the vendor itself and staff of its events).
 */
export async function GET(_: NextRequest, { params }: RouteContext<'/api/vendor/documents/[id]'>) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: doc } = await supabase
    .from('vendor_documents')
    .select('storage_path')
    .eq('id', id)
    .maybeSingle();
  if (!doc) return new NextResponse(null, { status: 404 });

  const { data, error } = await supabase.storage
    .from('vendor-documents')
    .createSignedUrl(doc.storage_path, SIGNED_URL_SECONDS);
  if (error || !data) return new NextResponse(null, { status: 404 });
  return NextResponse.redirect(data.signedUrl, { headers: { 'cache-control': 'no-store' } });
}
