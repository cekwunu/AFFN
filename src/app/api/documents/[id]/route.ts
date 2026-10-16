import { documentResponse } from '@/lib/documents/respond';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * One stored document version. Row-level security decides who may read the row (the vendor
 * itself, staff of the event); the file is then read with the service role.
 */
export async function GET(request: Request, { params }: RouteContext<'/api/documents/[id]'>) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response(null, { status: 404 });
  const supabase = await createClient();
  const { data: document } = await supabase
    .from('documents')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (!document) return new Response(null, { status: 404 });
  return documentResponse(document, new URL(request.url).searchParams.has('download'));
}
