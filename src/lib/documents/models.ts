/**
 * Document contents (SET-04, PRD §6, QR-05) as plain models for src/lib/pdf/kit.ts. Pure: data
 * and a translator in, model out, so the field checklist tests run without a database. Every
 * text comes from the "Documents" messages (bokmål default, English on request).
 */
import type { Locale } from '@/i18n/routing';
import { formatDateOslo, formatDateTimeOslo } from '@/lib/format';
import { formatOre, ore } from '@/lib/money';
import type { DocumentModel } from '@/lib/pdf/kit';

export type Translate = (key: string, values?: Record<string, string | number>) => string;

const kr = (value: number) => formatOre(ore(value));

/** "923 456 783" */
export const formatOrgNumber = (value: string) =>
  value.replace(/^(\d{3})(\d{3})(\d{3})$/, '$1 $2 $3');
/** "1234.56.78903" (Norwegian bank account) */
export const formatBankAccount = (value: string) =>
  value.replace(/^(\d{4})(\d{2})(\d{5})$/, '$1.$2.$3');
/** "25 %", "12,5 %" from basis points. */
export const formatRate = (bp: number, locale: Locale) =>
  `${new Intl.NumberFormat(locale === 'nb' ? 'nb-NO' : 'en-GB', { maximumFractionDigits: 2 }).format(bp / 100)} %`;

/** AFFN as issuer (organization settings). */
export type Seller = {
  legalName: string;
  orgNumber: string;
  vatRegistered: boolean;
  addressLine: string | null;
  postalCode: string | null;
  city: string | null;
  bankAccount: string | null;
  invoiceEmail: string | null;
};

export type Business = { name: string; legalName?: string | null; orgNumber: string | null };

export class MissingSellerDetails extends Error {
  constructor() {
    super('organization_details_missing');
  }
}

/** The seller block requires a legal name and org number (bokføringsforskriften § 5-1-1). */
export function requireSeller(seller: Partial<Seller> | null): Seller {
  if (!seller?.legalName?.trim() || !seller.orgNumber?.match(/^\d{9}$/)) {
    throw new MissingSellerDetails();
  }
  return seller as Seller;
}

const sellerOrg = (seller: Seller, t: Translate) =>
  t('orgNumber', { number: formatOrgNumber(seller.orgNumber) }) +
  (seller.vatRegistered ? ' MVA' : '');

const sellerLines = (seller: Seller, t: Translate) =>
  [
    seller.legalName,
    sellerOrg(seller, t),
    seller.addressLine,
    [seller.postalCode, seller.city].filter(Boolean).join(' ') || null,
    seller.invoiceEmail,
  ].filter((l): l is string => !!l);

const buyerLines = (buyer: Business, t: Translate) =>
  [
    buyer.legalName || buyer.name,
    buyer.legalName && buyer.legalName !== buyer.name ? buyer.name : null,
    buyer.orgNumber ? t('orgNumber', { number: formatOrgNumber(buyer.orgNumber) }) : null,
  ].filter((l): l is string => !!l);

const footer = (seller: Seller, t: Translate) =>
  [
    seller.legalName,
    sellerOrg(seller, t),
    [seller.addressLine, [seller.postalCode, seller.city].filter(Boolean).join(' ')]
      .filter(Boolean)
      .join(', '),
    seller.bankAccount
      ? t('bankAccount', { account: formatBankAccount(seller.bankAccount) })
      : null,
  ]
    .filter(Boolean)
    .join(' · ');

const base = (
  t: Translate,
  locale: Locale,
  date: Date,
  brand: string,
  title: string,
  subject: string,
): Pick<DocumentModel, 'brand' | 'title' | 'pageLabel' | 'info'> => ({
  brand,
  title,
  pageLabel: (page, pages) => t('page', { page, pages }),
  info: { title, subject, language: locale === 'nb' ? 'nb-NO' : 'en-GB', date },
});

// Vendor statement -------------------------------------------------------------------------------

export type StatementData = {
  seller: Seller;
  vendor: Business;
  eventName: string;
  settlementId: string;
  periodFrom: string | null;
  periodTo: string;
  issuedAt: string;
  line: {
    gross: number;
    refunds: number;
    commission: number;
    mva: number;
    adjustments: number;
    net: number;
  };
  adjustments: { reason: string; amount: number }[];
  payouts: { reference: string | null; amount: number; status: string; paidAt: string | null }[];
};

export function statementModel(data: StatementData, t: Translate, locale: Locale): DocumentModel {
  const date = new Date(data.issuedAt);
  const title = t('statement.title');
  const { line } = data;
  const period = data.periodFrom
    ? t('period', {
        from: formatDateOslo(data.periodFrom, locale),
        to: formatDateTimeOslo(data.periodTo, locale),
      })
    : t('periodUntil', { to: formatDateTimeOslo(data.periodTo, locale) });
  return {
    ...base(
      t,
      locale,
      date,
      data.seller.legalName,
      title,
      `${data.eventName} – ${data.vendor.name}`,
    ),
    meta: [
      [t('statement.reference'), data.settlementId.slice(0, 8).toUpperCase()],
      [t('date'), formatDateOslo(date, locale)],
    ],
    blocks: [
      {
        type: 'parties',
        parties: [
          { title: t('from'), lines: sellerLines(data.seller, t) },
          { title: t('vendor'), lines: buyerLines(data.vendor, t) },
        ],
      },
      {
        type: 'facts',
        rows: [
          [t('event'), data.eventName],
          [t('periodLabel'), period],
        ],
      },
      {
        type: 'table',
        columns: [
          { label: t('statement.item'), width: 3 },
          { label: t('amount'), align: 'right', width: 1 },
        ],
        rows: [
          [t('statement.gross'), kr(line.gross)],
          [t('statement.refunds'), kr(-line.refunds)],
          [t('statement.commission'), kr(-line.commission)],
          [t('statement.mva'), kr(-line.mva)],
          [t('statement.adjustments'), kr(line.adjustments)],
        ],
        totals: [[t('statement.net'), kr(line.net)]],
      },
      ...(data.adjustments.length
        ? [
            { type: 'heading' as const, text: t('statement.adjustmentsHeading') },
            {
              type: 'table' as const,
              columns: [
                { label: t('reason'), width: 3 },
                { label: t('amount'), align: 'right' as const, width: 1 },
              ],
              rows: data.adjustments.map((a) => [a.reason, kr(a.amount)]),
            },
          ]
        : []),
      ...(data.payouts.length
        ? [
            { type: 'heading' as const, text: t('statement.payoutsHeading') },
            {
              type: 'table' as const,
              columns: [
                { label: t('statement.payoutReference'), width: 2 },
                { label: t('status'), width: 1 },
                { label: t('amount'), align: 'right' as const, width: 1 },
              ],
              rows: data.payouts.map((p) => [
                p.reference ?? '–',
                t(`payoutStatus.${p.status}`) +
                  (p.paidAt ? ` ${formatDateOslo(p.paidAt, locale)}` : ''),
                kr(p.amount),
              ]),
            },
          ]
        : []),
      { type: 'paragraph', text: t('statement.csvNote'), tone: 'muted' },
      { type: 'paragraph', text: t('statement.invoiceNote'), tone: 'muted' },
    ],
    footer: footer(data.seller, t),
  };
}

// Invoices ---------------------------------------------------------------------------------------

export type InvoiceData = {
  seller: Seller;
  buyer: Business;
  kind: 'commission' | 'stall_fee';
  number: number;
  issuedAt: string;
  dueAt: string | null;
  eventName: string;
  /** Commission: the settlement period. */
  periodFrom: string | null;
  periodTo: string | null;
  /** Printed lines; amounts in øre excl. mva. */
  lines: { description: string; amount: number; mva: number }[];
  subtotal: number;
  mva: number;
  total: number;
  /** Mva rate charged; when unknown (older rows) derived from the totals. */
  mvaRateBp: number | null;
  settledByDeduction: boolean;
  status: 'issued' | 'paid' | 'credited';
};

export function invoiceModel(data: InvoiceData, t: Translate, locale: Locale): DocumentModel {
  const date = new Date(data.issuedAt);
  const title = t('invoice.title');
  const rate =
    data.mvaRateBp ?? (data.subtotal > 0 ? Math.round((data.mva * 100) / data.subtotal) * 100 : 0);
  const description =
    data.kind === 'commission'
      ? t('invoice.commissionDescription', { event: data.eventName })
      : t('invoice.stallFeeDescription', { event: data.eventName });
  const facts: [string, string][] = [[t('invoice.description'), description]];
  if (data.periodTo) {
    facts.push([
      t('periodLabel'),
      data.periodFrom
        ? t('period', {
            from: formatDateOslo(data.periodFrom, locale),
            to: formatDateOslo(data.periodTo, locale),
          })
        : t('periodUntil', { to: formatDateOslo(data.periodTo, locale) }),
    ]);
  }
  const blocks: DocumentModel['blocks'] = [
    {
      type: 'parties',
      parties: [
        { title: t('from'), lines: sellerLines(data.seller, t) },
        { title: t('to'), lines: buyerLines(data.buyer, t) },
      ],
    },
    { type: 'facts', rows: facts },
    {
      type: 'table',
      columns: [
        { label: t('invoice.line'), width: 3 },
        { label: t('invoice.net'), align: 'right', width: 1 },
        {
          label: t('invoice.mvaLine', { rate: formatRate(rate, locale) }),
          align: 'right',
          width: 1,
        },
      ],
      rows: data.lines.map((l) => [l.description, kr(l.amount), kr(l.mva)]),
      totals: [
        [t('invoice.subtotal'), kr(data.subtotal)],
        [t('invoice.mvaTotal', { rate: formatRate(rate, locale) }), kr(data.mva)],
        [
          data.settledByDeduction || data.status === 'paid'
            ? t('invoice.totalInclMva')
            : t('invoice.total'),
          kr(data.total),
        ],
      ],
    },
  ];
  if (data.settledByDeduction) {
    blocks.push({ type: 'paragraph', text: t('invoice.settledByDeduction'), tone: 'strong' });
  } else if (data.status === 'paid') {
    blocks.push({ type: 'paragraph', text: t('invoice.paid'), tone: 'strong' });
  } else {
    blocks.push({
      type: 'paragraph',
      text: [
        t('invoice.payBy', { date: data.dueAt ? formatDateOslo(data.dueAt, locale) : '–' }),
        data.seller.bankAccount
          ? t('invoice.payTo', {
              account: formatBankAccount(data.seller.bankAccount),
              number: data.number,
            })
          : null,
        data.kind === 'stall_fee' ? t('invoice.payLink') : null,
      ]
        .filter(Boolean)
        .join('\n'),
      tone: 'strong',
    });
  }
  return {
    ...base(t, locale, date, data.seller.legalName, title, description),
    meta: [
      [t('invoice.number'), String(data.number)],
      [t('invoice.date'), formatDateOslo(date, locale)],
      ...(data.dueAt && !data.settledByDeduction
        ? ([[t('invoice.due'), formatDateOslo(data.dueAt, locale)]] as [string, string][])
        : []),
    ],
    blocks,
    footer: footer(data.seller, t),
  };
}

// Stall fee receipt --------------------------------------------------------------------------------

export type FeeReceiptData = {
  seller: Seller;
  buyer: Business;
  eventName: string;
  invoiceNumber: number | null;
  paidAt: string;
  amount: number;
  mva: number;
  mvaRateBp: number | null;
  providerReference: string | null;
};

export function feeReceiptModel(data: FeeReceiptData, t: Translate, locale: Locale): DocumentModel {
  const date = new Date(data.paidAt);
  const title = t('feeReceipt.title');
  const rate =
    data.mvaRateBp ??
    (data.amount - data.mva > 0
      ? Math.round((data.mva * 100) / (data.amount - data.mva)) * 100
      : 0);
  return {
    ...base(
      t,
      locale,
      date,
      data.seller.legalName,
      title,
      t('invoice.stallFeeDescription', { event: data.eventName }),
    ),
    meta: [
      [t('feeReceipt.paid'), formatDateOslo(date, locale)],
      ...(data.invoiceNumber
        ? ([[t('invoice.number'), String(data.invoiceNumber)]] as [string, string][])
        : []),
    ],
    blocks: [
      {
        type: 'parties',
        parties: [
          { title: t('from'), lines: sellerLines(data.seller, t) },
          { title: t('to'), lines: buyerLines(data.buyer, t) },
        ],
      },
      {
        type: 'facts',
        rows: [
          [t('invoice.description'), t('invoice.stallFeeDescription', { event: data.eventName })],
          [t('feeReceipt.paidAt'), formatDateTimeOslo(date, locale)],
          ...(data.providerReference
            ? ([[t('feeReceipt.reference'), data.providerReference]] as [string, string][])
            : []),
        ],
      },
      {
        type: 'table',
        columns: [
          { label: t('invoice.line'), width: 3 },
          { label: t('amount'), align: 'right', width: 1 },
        ],
        rows: [
          [t('invoice.stallFeeDescription', { event: data.eventName }), kr(data.amount - data.mva)],
        ],
        totals: [
          [t('invoice.mvaTotal', { rate: formatRate(rate, locale) }), kr(data.mva)],
          [t('feeReceipt.total'), kr(data.amount)],
        ],
      },
      { type: 'paragraph', text: t('feeReceipt.thanks'), tone: 'muted' },
    ],
    footer: footer(data.seller, t),
  };
}

// Customer receipt (same content as /o/[token]) ----------------------------------------------------

export type CustomerReceiptData = {
  vendor: Business;
  eventName: string;
  marketplace: string;
  orderCode: string | null;
  orderNumber: number;
  paidAt: string | null;
  createdAt: string;
  method: string | null;
  items: { name: string; quantity: number; unitPrice: number; lineTotal: number }[];
  total: number;
  mvaByRate: [number, number][];
  refunded: number;
  customerName: string | null;
};

export function customerReceiptModel(
  data: CustomerReceiptData,
  t: Translate,
  locale: Locale,
): DocumentModel {
  const date = new Date(data.paidAt ?? data.createdAt);
  const title = t('receipt.title');
  const totals: [string, string][] = [];
  for (const [bp, amount] of data.mvaByRate) {
    totals.push([t('receipt.mvaIncluded', { rate: formatRate(bp, locale) }), kr(amount)]);
  }
  if (!data.mvaByRate.length) totals.push([t('receipt.noMva'), kr(0)]);
  if (data.refunded > 0) totals.push([t('receipt.refunded'), kr(-data.refunded)]);
  totals.push([t('receipt.total'), kr(data.total - data.refunded)]);
  return {
    ...base(t, locale, date, data.vendor.legalName || data.vendor.name, title, data.eventName),
    meta: [
      [t('receipt.order'), data.orderCode ?? String(data.orderNumber)],
      [t('date'), formatDateTimeOslo(date, locale)],
    ],
    blocks: [
      {
        type: 'parties',
        parties: [
          { title: t('receipt.seller'), lines: buyerLines(data.vendor, t) },
          {
            title: t('receipt.details'),
            lines: [
              data.eventName,
              data.method ? t('receipt.method', { method: t(`methods.${data.method}`) }) : '',
              data.customerName ? t('receipt.customer', { name: data.customerName }) : '',
            ].filter(Boolean),
          },
        ],
      },
      {
        type: 'table',
        columns: [
          { label: t('receipt.item'), width: 3 },
          { label: t('receipt.quantity'), align: 'right', width: 1 },
          { label: t('receipt.unitPrice'), align: 'right', width: 1.2 },
          { label: t('amount'), align: 'right', width: 1.2 },
        ],
        rows: data.items.map((i) => [i.name, String(i.quantity), kr(i.unitPrice), kr(i.lineTotal)]),
        totals,
      },
      {
        type: 'paragraph',
        text: t('receipt.sellerOfRecord', { marketplace: data.marketplace }),
        tone: 'muted',
      },
    ],
    footer: [
      data.vendor.legalName || data.vendor.name,
      data.vendor.orgNumber
        ? t('orgNumber', { number: formatOrgNumber(data.vendor.orgNumber) })
        : null,
      data.marketplace,
    ]
      .filter(Boolean)
      .join(' · '),
  };
}
