import { getTranslations } from 'next-intl/server';
import { getCurrentUser } from '@/lib/auth/server';
import { toCsv } from '@/lib/exports/csv';
import { EXPORT_COLUMNS, EXPORT_KINDS, exportRows, type ExportKind } from '@/lib/exports/server';
import { osloLocalToUtc } from '@/lib/format';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const nextDay = (d: string) =>
  new Date(Date.parse(`${d}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

/**
 * CSV export for the accountant (TRX-03): ?kind=transactions|ledger|settlements|invoices&event=
 * &from=yyyy-mm-dd&to=yyyy-mm-dd&locale=nb|en. Organization staff of the event's organization;
 * rows are read under the user's own RLS.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const kind = EXPORT_KINDS.find((k) => k === url.searchParams.get('kind')) as
    ExportKind | undefined;
  const eventId = url.searchParams.get('event') ?? '';
  const fromDay = url.searchParams.get('from') ?? '';
  const toDay = url.searchParams.get('to') ?? '';
  const locale = url.searchParams.get('locale') === 'en' ? 'en' : 'nb';
  if (!kind || !/^[0-9a-f-]{36}$/.test(eventId) || !DAY.test(fromDay) || !DAY.test(toDay)) {
    return new Response('Bad request', { status: 400 });
  }
  const user = await getCurrentUser();
  if (!user) return new Response('Unauthorized', { status: 401 });
  const supabase = await createClient();
  const { data: event } = await supabase
    .from('events')
    .select('id, slug, organization_id')
    .eq('id', eventId)
    .maybeSingle();
  const staff = user.access.roles.some(
    (r) =>
      r.org === event?.organization_id &&
      (r.role === 'org_admin' || r.role === 'event_admin') &&
      r.status === 'active',
  );
  if (!event || !staff) return new Response('Forbidden', { status: 403 });

  const from = osloLocalToUtc(`${fromDay}T00:00`)!;
  const to = osloLocalToUtc(`${nextDay(toDay)}T00:00`)!;
  if (from >= to) return new Response('Bad request', { status: 400 });
  const t = await getTranslations({ locale, namespace: 'Exports' });
  const label = (group: string, key: string) => t(`values.${group}.${key}` as 'values.yesNo.yes');
  const rows = await exportRows(kind, event.id, from, to, label);
  const headers = EXPORT_COLUMNS[kind].map((c) => t(`columns.${kind}.${c}` as 'columns.ledger.id'));
  const filename = `affn-${kind}-${event.slug}-${fromDay}-${toDay}.csv`;
  return new Response(toCsv(headers, rows), {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${filename}"`,
      'cache-control': 'no-store',
    },
  });
}
