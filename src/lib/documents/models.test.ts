import { createTranslator } from 'next-intl';
import { describe, expect, it } from 'vitest';
import en from '../../../messages/en.json';
import nb from '../../../messages/nb.json';
import { renderPdf } from '@/lib/pdf/kit';
import {
  customerReceiptModel,
  feeReceiptModel,
  invoiceModel,
  MissingSellerDetails,
  requireSeller,
  statementModel,
  type Seller,
  type Translate,
} from './models';

// Field checklist (SET-04, PRD §6, bokføringsforskriften § 5-1-1): each document is rendered to
// a real PDF and its text read back; every required field must be printed.

const tr = (locale: 'nb' | 'en'): Translate =>
  createTranslator({
    locale,
    messages: locale === 'nb' ? nb : en,
    namespace: 'Documents',
  }) as unknown as Translate;

/** All text of a PDF, whitespace (incl. non-breaking spaces) collapsed. */
async function pdfText(bytes: Uint8Array): Promise<string> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: bytes.slice(), useSystemFonts: false }).promise;
  const parts: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const content = await (await doc.getPage(i)).getTextContent();
    for (const item of content.items) if ('str' in item) parts.push(item.str);
  }
  return normalise(parts.join(' '));
}
const normalise = (s: string) => s.replace(/[\s  ]+/g, ' ');
const expectFields = (text: string, fields: string[]) => {
  const missing = fields.filter((f) => !text.includes(normalise(f)));
  expect(missing).toEqual([]);
};

const seller: Seller = {
  legalName: 'African Food Festival Norway AS',
  orgNumber: '912345678',
  vatRegistered: true,
  addressLine: 'Tøyengata 1',
  postalCode: '0578',
  city: 'Oslo',
  bankAccount: '12345678903',
  invoiceEmail: 'faktura@affn.no',
};
const vendor = { name: 'Mama Afrika Kjøkken', legalName: 'Mama Afrika AS', orgNumber: '923456783' };

describe('commission invoice', () => {
  const data = {
    seller,
    buyer: vendor,
    kind: 'commission' as const,
    number: 1042,
    issuedAt: '2027-06-14T10:00:00Z',
    dueAt: '2027-06-14T10:00:00Z',
    eventName: 'AFFN 2027',
    periodFrom: null,
    periodTo: '2027-06-13T21:00:00Z',
    lines: [
      { description: 'Provisjon på salg', amount: 5_700, mva: 1_425 },
      { description: 'Tilbakeført provisjon ved refusjoner', amount: -450, mva: -113 },
    ],
    subtotal: 5_250,
    mva: 1_312,
    total: 6_562,
    mvaRateBp: 2500,
    settledByDeduction: true,
    status: 'paid' as const,
  };

  it('prints every required field (nb)', async () => {
    const text = await pdfText(await renderPdf(invoiceModel(data, tr('nb'), 'nb')));
    expectFields(text, [
      'Faktura',
      'African Food Festival Norway AS', // seller legal name
      'Org.nr. 912 345 678 MVA', // seller org number with "MVA"
      'Tøyengata 1',
      '0578 Oslo',
      'Fakturanr. 1042', // sequential number
      'Fakturadato 14. juni 2027', // invoice date
      'Mama Afrika AS', // buyer
      'Org.nr. 923 456 783', // buyer org number
      'Provisjon AFFN 2027', // description
      'Til og med 13. juni 2027', // period
      'kr 52,50', // commission (net)
      'Mva 25 %', // 25 % mva
      'kr 13,12',
      'kr 65,62', // total
      'Gjort opp ved trekk i utbetaling', // settled by deduction
      'Side 1 av 1',
    ]);
  });

  it('is available in English', async () => {
    const text = await pdfText(await renderPdf(invoiceModel(data, tr('en'), 'en')));
    expectFields(text, [
      'Invoice',
      'Org. no. 912 345 678 MVA',
      'Invoice no. 1042',
      'Commission AFFN 2027',
      'Settled by deduction from payout',
      'kr 65,62',
    ]);
  });

  it('refuses to render without AFFN’s legal name and org number', () => {
    expect(() => requireSeller({ legalName: 'AFFN', orgNumber: null as never })).toThrow(
      MissingSellerDetails,
    );
    expect(() => requireSeller(null)).toThrow(MissingSellerDetails);
    expect(requireSeller(seller)).toBe(seller);
  });
});

describe('stall fee invoice and receipt', () => {
  it('invoice: number, due date, mva rate, how to pay', async () => {
    const text = await pdfText(
      await renderPdf(
        invoiceModel(
          {
            seller,
            buyer: vendor,
            kind: 'stall_fee',
            number: 7,
            issuedAt: '2027-04-02T08:00:00Z',
            dueAt: '2027-04-16T08:00:00Z',
            eventName: 'AFFN 2027',
            periodFrom: null,
            periodTo: null,
            lines: [
              { description: 'Standleie AFFN 2027 – Standard', amount: 250_000, mva: 37_500 },
            ],
            subtotal: 250_000,
            mva: 37_500,
            total: 287_500,
            mvaRateBp: 1500,
            settledByDeduction: false,
            status: 'issued',
          },
          tr('nb'),
          'nb',
        ),
      ),
    );
    expectFields(text, [
      'Faktura',
      'Fakturanr. 7',
      'Forfall 16. apr. 2027',
      'Org.nr. 912 345 678 MVA',
      'Standleie AFFN 2027',
      'Mva 15 %', // the event's configurable rate
      'kr 2 500,00',
      'kr 375,00',
      'kr 2 875,00',
      'Kontonummer 1234.56.78903',
      'fakturanr. 7',
    ]);
  });

  it('receipt: paid amount, date and reference', async () => {
    const text = await pdfText(
      await renderPdf(
        feeReceiptModel(
          {
            seller,
            buyer: vendor,
            eventName: 'AFFN 2027',
            invoiceNumber: 7,
            paidAt: '2027-04-03T12:15:00Z',
            amount: 312_500,
            mva: 62_500,
            mvaRateBp: null,
            providerReference: 'fee_abc123',
          },
          tr('nb'),
          'nb',
        ),
      ),
    );
    expectFields(text, [
      'Kvittering',
      'Org.nr. 912 345 678 MVA',
      'Mama Afrika AS',
      'Fakturanr. 7',
      '3. apr. 2027',
      'fee_abc123',
      'Mva 25 %',
      'kr 625,00',
      'kr 3 125,00',
    ]);
  });
});

describe('vendor statement', () => {
  it('gross, refunds, commission, mva, adjustments and net payout add up', async () => {
    const line = {
      gross: 76_000,
      refunds: 4_021,
      commission: 7_600,
      mva: 1_900,
      adjustments: 5_000,
      net: 67_479,
    };
    expect(line.gross - line.refunds - line.commission - line.mva + line.adjustments).toBe(
      line.net,
    );
    const text = await pdfText(
      await renderPdf(
        statementModel(
          {
            seller,
            vendor,
            eventName: 'AFFN 2027',
            settlementId: '96000000-0000-4000-8000-000000000001',
            periodFrom: null,
            periodTo: '2027-06-13T21:00:00Z',
            issuedAt: '2027-06-14T10:00:00Z',
            line,
            adjustments: [{ reason: 'Kompensasjon strømbrudd', amount: 5_000 }],
            payouts: [
              {
                reference: 'po_123',
                amount: 67_479,
                status: 'paid',
                paidAt: '2027-06-14T10:05:00Z',
              },
            ],
          },
          tr('nb'),
          'nb',
        ),
      ),
    );
    expectFields(text, [
      'Oppgjørsoppstilling',
      'Mama Afrika AS',
      'Org.nr. 923 456 783',
      'AFFN 2027',
      'Brutto salg kr 760,00',
      'Refusjoner (din andel) kr -40,21',
      'Provisjon kr -76,00',
      'Mva på provisjon (25 %) kr -19,00',
      'Justeringer kr 50,00',
      'Til utbetaling kr 674,79',
      'Kompensasjon strømbrudd',
      'po_123',
      'CSV',
    ]);
  });
});

describe('customer receipt', () => {
  it('has the digital receipt’s content: vendor, org number, items, mva, method', async () => {
    const text = await pdfText(
      await renderPdf(
        customerReceiptModel(
          {
            vendor,
            eventName: 'AFFN 2027',
            marketplace: 'AFF Marketplace',
            orderCode: 'B·A1-007',
            orderNumber: 7,
            paidAt: '2027-06-12T12:30:00Z',
            createdAt: '2027-06-12T12:29:00Z',
            method: 'vipps',
            items: [
              { name: 'Jollof med kylling', quantity: 2, unitPrice: 18_500, lineTotal: 37_000 },
              { name: 'Bissap', quantity: 1, unitPrice: 4_500, lineTotal: 4_500 },
            ],
            total: 41_500,
            mvaByRate: [],
            refunded: 4_500,
            customerName: 'Ada',
          },
          tr('nb'),
          'nb',
        ),
      ),
    );
    expectFields(text, [
      'Kvittering',
      'Mama Afrika AS',
      'Org.nr. 923 456 783',
      'B·A1-007',
      'Jollof med kylling',
      'kr 370,00',
      'Bissap',
      'Betalt med Vipps',
      'selger er ikke mva-registrert',
      'Refundert kr -45,00',
      'Totalt betalt kr 370,00',
    ]);
  });

  it('renders the same bytes for the same content (unchanged documents are not stored twice)', async () => {
    const model = () =>
      customerReceiptModel(
        {
          vendor,
          eventName: 'AFFN 2027',
          marketplace: 'AFF Marketplace',
          orderCode: 'B·A1-007',
          orderNumber: 7,
          paidAt: '2027-06-12T12:30:00Z',
          createdAt: '2027-06-12T12:29:00Z',
          method: 'card',
          items: [{ name: 'Bissap', quantity: 1, unitPrice: 4_500, lineTotal: 4_500 }],
          total: 4_500,
          mvaByRate: [[1500, 587]],
          refunded: 0,
          customerName: null,
        },
        tr('en'),
        'en',
      );
    const [a, b] = await Promise.all([renderPdf(model()), renderPdf(model())]);
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
    expectFields(await pdfText(a), ['Receipt', 'Incl. mva 15 %', 'kr 5,87', 'Paid with Card']);
  });
});
