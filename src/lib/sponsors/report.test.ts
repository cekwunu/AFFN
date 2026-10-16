import { createTranslator } from 'next-intl';
import { describe, expect, it } from 'vitest';
import nb from '../../../messages/nb.json';
import type { Translate } from '@/lib/documents/models';
import { renderPdf } from '@/lib/pdf/kit';
import { normaliseText, pdfText } from '@/lib/pdf/test-text';
import { aggregate, reportCsv, reportModel, type ReportData } from './report';

const t = createTranslator({
  locale: 'nb',
  messages: nb,
  namespace: 'Documents',
}) as unknown as Translate;

// Summer time: Oslo = UTC + 2. Saturday 12 June and Sunday 13 June 2027.
const data: ReportData = {
  issuer: { legalName: 'African Food Festival Norway AS', orgNumber: '987654325' },
  sponsor: { name: 'Nordlys Bank', legalName: 'NORDLYS BANK ASA', orgNumber: '967890123' },
  eventName: 'AFFN 2027',
  packageName: 'Gull',
  priceOre: 15_000_000,
  deliverables: [
    { title: 'Logo på hovedscenen', status: 'delivered' },
    { title: 'Rapport etter festivalen', status: 'in_progress' },
  ],
  hits: [
    { at: '2027-06-12T10:05:00Z', kind: 'qr', label: 'QR 1' }, // 12:05 Oslo
    { at: '2027-06-12T10:55:00Z', kind: 'qr', label: 'QR 1' }, // 12:55
    { at: '2027-06-12T21:59:00Z', kind: 'qr', label: 'QR 2' }, // 23:59 on the 12th
    { at: '2027-06-12T22:01:00Z', kind: 'link', label: 'Link' }, // 00:01 on the 13th
    { at: '2027-06-13T10:30:00Z', kind: 'link', label: 'Link' }, // 12:30 on the 13th
  ],
  pageViews: ['2027-06-12T09:00:00Z', '2027-06-13T09:00:00Z', '2027-06-13T15:00:00Z'],
  festival: { orders: 1234, vendors: 42, grossOre: 98_765_400 },
  date: '2027-06-13T20:00:00Z',
};

describe('sponsor report (SPO-04)', () => {
  it('counts scans and clicks per Oslo day and hour, and page views per day', () => {
    const totals = aggregate(data.hits, data.pageViews);
    expect([totals.scans, totals.clicks, totals.pageViews]).toEqual([3, 2, 3]);
    expect(totals.byDay).toEqual([
      { day: '2027-06-12', scans: 3, clicks: 0, pageViews: 1 },
      { day: '2027-06-13', scans: 0, clicks: 2, pageViews: 2 },
    ]);
    expect(totals.byHour).toEqual([
      { hour: 0, scans: 0, clicks: 1 },
      { hour: 12, scans: 2, clicks: 1 },
      { hour: 23, scans: 1, clicks: 0 },
    ]);
    // Every hit is in exactly one day and one hour.
    const sum = (rows: { scans: number; clicks: number }[]) =>
      rows.reduce((s, r) => s + r.scans + r.clicks, 0);
    expect(sum(totals.byDay)).toBe(5);
    expect(sum(totals.byHour)).toBe(5);
    expect(totals.byLink).toEqual([
      { label: 'Link', kind: 'link', count: 2 },
      { label: 'QR 1', kind: 'qr', count: 2 },
      { label: 'QR 2', kind: 'qr', count: 1 },
    ]);
  });

  it('PDF: package, deliverables, reach, festival totals', async () => {
    const text = await pdfText(await renderPdf(reportModel(data, t, 'nb')));
    for (const field of [
      'Sponsorrapport',
      'Nordlys Bank',
      'Gull',
      'kr 150 000,00',
      'Logo på hovedscenen Levert',
      'Rapport etter festivalen Pågår',
      'QR-skanninger 3',
      'Klikk på lenker 2',
      'Visninger av sponsorsiden 3',
      '12:00–12:59 2 1',
      'Betalte bestillinger 1 234',
      'Leverandører 42',
      'kr 987 654,00',
      'ingen IP-adresser',
    ]) {
      expect(text).toContain(normaliseText(field));
    }
  });

  it('CSV: per day and hour, totals and festival figures', () => {
    const lines = reportCsv(data, t).slice(1).split('\r\n');
    expect(lines[0]).toBe('Periode;Når;QR-skanninger;Klikk;Sidevisninger');
    expect(lines).toContain('Dag;2027-06-12;3;0;1');
    expect(lines).toContain('Time;12:00–12:59;2;1;');
    expect(lines).toContain('Totalt;;3;2;3');
    expect(lines).toContain('Festivalen: omsetning (kr);;987654,00;;');
  });
});
