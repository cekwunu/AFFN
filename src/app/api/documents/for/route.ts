import { getTranslations } from 'next-intl/server';
import type { Locale } from '@/i18n/routing';
import { getCurrentUser } from '@/lib/auth/server';
import { MissingSellerDetails } from '@/lib/documents/models';
import { documentResponse } from '@/lib/documents/respond';
import { ensureDocument, type DocumentKind } from '@/lib/documents/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const RELEASED = ['releasing', 'completed', 'completed_with_failures'];

/**
 * The current document for a subject the user may see: ?kind=&id=&lang=nb|en. Generated and
 * stored on first request (and when its content changed), so English is available on request.
 * Access is checked by reading the subject under the user's own row-level security.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const kind = url.searchParams.get('kind') as DocumentKind | null;
  const id = url.searchParams.get('id') ?? '';
  const locale: Locale = url.searchParams.get('lang') === 'en' ? 'en' : 'nb';
  if (!kind || !/^[0-9a-f-]{36}$/.test(id)) return new Response(null, { status: 400 });
  const user = await getCurrentUser();
  if (!user) return new Response(null, { status: 401 });
  const supabase = await createClient();

  let allowed = false;
  switch (kind) {
    case 'vendor_statement':
    case 'statement_orders_csv': {
      const { data } = await supabase
        .from('settlement_lines')
        .select(
          'settlement:settlements!settlement_lines_settlement_id_organization_id_fkey(status)',
        )
        .eq('id', id)
        .maybeSingle();
      allowed = !!data && RELEASED.includes(data.settlement.status);
      break;
    }
    case 'commission_invoice':
    case 'stall_fee_invoice': {
      const { data } = await supabase.from('invoices').select('kind').eq('id', id).maybeSingle();
      allowed = data?.kind === (kind === 'commission_invoice' ? 'commission' : 'stall_fee');
      break;
    }
    case 'stall_fee_receipt': {
      const { data } = await supabase.from('fee_payments').select('id').eq('id', id).maybeSingle();
      allowed = !!data;
      break;
    }
    case 'sponsor_invoice': {
      const { data } = await supabase
        .from('sponsor_invoices')
        .select('id')
        .eq('id', id)
        .maybeSingle();
      allowed = !!data;
      break;
    }
    case 'sponsor_report_pdf':
    case 'sponsor_report_csv': {
      const { data } = await supabase
        .from('sponsorships')
        .select('status')
        .eq('id', id)
        .maybeSingle();
      allowed = !!data && ['confirmed', 'invoiced', 'paid'].includes(data.status);
      break;
    }
    default:
      allowed = false;
  }
  if (!allowed) return new Response(null, { status: 404 });

  try {
    const document = await ensureDocument({ kind, id }, locale, user.id);
    return documentResponse(document);
  } catch (e) {
    const t = await getTranslations({ locale, namespace: 'Documents' });
    if (e instanceof MissingSellerDetails) {
      return new Response(t('errors.sellerMissing'), {
        status: 409,
        headers: { 'content-type': 'text/plain; charset=utf-8' },
      });
    }
    console.error('Document generation failed', e);
    return new Response(t('errors.failed'), {
      status: 500,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  }
}
