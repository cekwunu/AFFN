/**
 * The post-event sponsor report (SPO-04): package and deliverables, scans (QR) and clicks
 * (tracked links) by day and by hour in Oslo time, sponsor page views, and festival totals for
 * context. Pure: aggregation and the PDF/CSV models, so totals are unit-tested.
 */
import type { Locale } from '@/i18n/routing';
import type { Translate } from '@/lib/documents/models';
import { formatOrgNumber } from '@/lib/documents/models';
import { money, text, toCsv } from '@/lib/exports/csv';
import { formatDateOslo, OSLO_TIME_ZONE, osloDateKey } from '@/lib/format';
import { formatOre, ore } from '@/lib/money';
import type { DocumentModel } from '@/lib/pdf/kit';

export type Hit = { at: string; kind: 'qr' | 'link'; label: string | null };

export type ReportData = {
  issuer: { legalName: string; orgNumber: string };
  sponsor: { name: string; legalName: string | null; orgNumber: string | null };
  eventName: string;
  packageName: string;
  priceOre: number;
  deliverables: { title: string; status: 'pending' | 'in_progress' | 'delivered' }[];
  hits: Hit[];
  pageViews: string[];
  festival: { orders: number; vendors: number; grossOre: number };
  /** The report's date (the end of the event, or the last activity after it). */
  date: string;
};

const osloHour = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit',
  hourCycle: 'h23',
  timeZone: OSLO_TIME_ZONE,
});

export type Aggregate = {
  scans: number;
  clicks: number;
  pageViews: number;
  byDay: { day: string; scans: number; clicks: number; pageViews: number }[];
  byHour: { hour: number; scans: number; clicks: number }[];
  byLink: { label: string; kind: 'qr' | 'link'; count: number }[];
};

/** Counts per Oslo day and per hour of day (all days together), and per link. */
export function aggregate(hits: Hit[], pageViews: string[]): Aggregate {
  const days = new Map<string, { scans: number; clicks: number; pageViews: number }>();
  const hours = new Map<number, { scans: number; clicks: number }>();
  const links = new Map<string, { label: string; kind: 'qr' | 'link'; count: number }>();
  const day = (key: string) =>
    days.get(key) ?? days.set(key, { scans: 0, clicks: 0, pageViews: 0 }).get(key)!;
  for (const hit of hits) {
    const field = hit.kind === 'qr' ? 'scans' : 'clicks';
    day(osloDateKey(hit.at))[field]++;
    const hour = Number(osloHour.format(new Date(hit.at)));
    const h = hours.get(hour) ?? hours.set(hour, { scans: 0, clicks: 0 }).get(hour)!;
    h[field]++;
    const label = hit.label ?? hit.kind;
    const key = `${hit.kind}:${label}`;
    const l = links.get(key) ?? links.set(key, { label, kind: hit.kind, count: 0 }).get(key)!;
    l.count++;
  }
  for (const view of pageViews) day(osloDateKey(view)).pageViews++;
  return {
    scans: hits.filter((h) => h.kind === 'qr').length,
    clicks: hits.filter((h) => h.kind === 'link').length,
    pageViews: pageViews.length,
    byDay: [...days].sort(([a], [b]) => a.localeCompare(b)).map(([d, v]) => ({ day: d, ...v })),
    byHour: [...hours].sort(([a], [b]) => a - b).map(([hour, v]) => ({ hour, ...v })),
    byLink: [...links.values()].sort(
      (a, b) => a.kind.localeCompare(b.kind) || a.label.localeCompare(b.label),
    ),
  };
}

const hourLabel = (hour: number) =>
  `${String(hour).padStart(2, '0')}:00–${String(hour).padStart(2, '0')}:59`;

export function reportModel(data: ReportData, t: Translate, locale: Locale): DocumentModel {
  const totals = aggregate(data.hits, data.pageViews);
  const title = t('report.title');
  const count = (n: number) => new Intl.NumberFormat(locale === 'nb' ? 'nb-NO' : 'en-GB').format(n);
  const dayLabel = (key: string) => formatDateOslo(`${key}T12:00:00Z`, locale);
  return {
    brand: data.issuer.legalName,
    title,
    meta: [
      [t('report.sponsor'), data.sponsor.name],
      [t('date'), formatDateOslo(data.date, locale)],
    ],
    pageLabel: (page, pages) => t('page', { page, pages }),
    info: {
      title,
      subject: `${data.eventName} – ${data.sponsor.name}`,
      language: locale === 'nb' ? 'nb-NO' : 'en-GB',
      date: new Date(data.date),
    },
    blocks: [
      {
        type: 'facts',
        rows: [
          [t('event'), data.eventName],
          [t('report.package'), data.packageName],
          [t('report.price'), formatOre(ore(data.priceOre))],
          [
            t('report.sponsorLabel'),
            [
              data.sponsor.legalName || data.sponsor.name,
              data.sponsor.orgNumber
                ? t('orgNumber', { number: formatOrgNumber(data.sponsor.orgNumber) })
                : null,
            ]
              .filter(Boolean)
              .join(', '),
          ],
        ],
      },
      { type: 'heading', text: t('report.deliverables') },
      {
        type: 'table',
        columns: [
          { label: t('report.deliverable'), width: 3 },
          { label: t('status'), width: 1 },
        ],
        rows: data.deliverables.map((d) => [d.title, t(`report.deliverableStatus.${d.status}`)]),
      },
      { type: 'heading', text: t('report.reach') },
      {
        type: 'facts',
        rows: [
          [t('report.scans'), count(totals.scans)],
          [t('report.clicks'), count(totals.clicks)],
          [t('report.pageViews'), count(totals.pageViews)],
        ],
      },
      ...(totals.byDay.length
        ? [
            {
              type: 'table' as const,
              columns: [
                { label: t('report.day'), width: 2 },
                { label: t('report.scans'), align: 'right' as const, width: 1 },
                { label: t('report.clicks'), align: 'right' as const, width: 1 },
                { label: t('report.pageViews'), align: 'right' as const, width: 1 },
              ],
              rows: totals.byDay.map((d) => [
                dayLabel(d.day),
                count(d.scans),
                count(d.clicks),
                count(d.pageViews),
              ]),
            },
          ]
        : []),
      ...(totals.byHour.length
        ? [
            { type: 'heading' as const, text: t('report.byHour') },
            {
              type: 'table' as const,
              columns: [
                { label: t('report.hour'), width: 2 },
                { label: t('report.scans'), align: 'right' as const, width: 1 },
                { label: t('report.clicks'), align: 'right' as const, width: 1 },
              ],
              rows: totals.byHour.map((h) => [hourLabel(h.hour), count(h.scans), count(h.clicks)]),
            },
          ]
        : []),
      ...(totals.byLink.length
        ? [
            { type: 'heading' as const, text: t('report.byLink') },
            {
              type: 'table' as const,
              columns: [
                { label: t('report.link'), width: 2 },
                { label: t('report.kind'), width: 1 },
                { label: t('report.count'), align: 'right' as const, width: 1 },
              ],
              rows: totals.byLink.map((l) => [
                l.label,
                t(`report.kinds.${l.kind}`),
                count(l.count),
              ]),
            },
          ]
        : []),
      { type: 'heading', text: t('report.festival') },
      {
        type: 'facts',
        rows: [
          [t('report.orders'), count(data.festival.orders)],
          [t('report.vendors'), count(data.festival.vendors)],
          [t('report.sales'), formatOre(ore(data.festival.grossOre))],
        ],
      },
      { type: 'paragraph', text: t('report.privacy'), tone: 'muted' },
    ],
    footer: [
      data.issuer.legalName,
      t('orgNumber', { number: formatOrgNumber(data.issuer.orgNumber) }),
    ].join(' · '),
  };
}

/** The same figures as CSV for the sponsor's own analysis (Norwegian Excel format). */
export function reportCsv(data: ReportData, t: Translate): string {
  const totals = aggregate(data.hits, data.pageViews);
  const rows: string[][] = [
    ...totals.byDay.map((d) => [
      text(t('report.csv.day')),
      text(d.day),
      String(d.scans),
      String(d.clicks),
      String(d.pageViews),
    ]),
    ...totals.byHour.map((h) => [
      text(t('report.csv.hour')),
      text(hourLabel(h.hour)),
      String(h.scans),
      String(h.clicks),
      '',
    ]),
    [
      text(t('report.csv.total')),
      '',
      String(totals.scans),
      String(totals.clicks),
      String(totals.pageViews),
    ],
    [text(t('report.csv.festivalOrders')), '', String(data.festival.orders), '', ''],
    [text(t('report.csv.festivalVendors')), '', String(data.festival.vendors), '', ''],
    [text(t('report.csv.festivalSales')), '', money(data.festival.grossOre), '', ''],
  ];
  return toCsv(
    ['period', 'when', 'scans', 'clicks', 'pageViews'].map((k) => t(`report.csv.columns.${k}`)),
    rows,
  );
}
