import 'server-only';
import { createHash } from 'node:crypto';
import { getTranslations } from 'next-intl/server';
import type { Locale } from '@/i18n/routing';
import { money, text, time, toCsv } from '@/lib/exports/csv';
import { renderPdf } from '@/lib/pdf/kit';
import { createAdminClient } from '@/lib/supabase/admin';
import type { Database } from '@/lib/supabase/database.types';
import { reportCsv, reportModel, type ReportData } from '@/lib/sponsors/report';
import {
  customerReceiptModel,
  feeReceiptModel,
  invoiceModel,
  requireSeller,
  statementModel,
  type Business,
  type Translate,
} from './models';

export type DocumentKind = Database['public']['Enums']['document_kind'];
export type StoredDocument = Database['public']['Tables']['documents']['Row'];

/**
 * What a document is about: the settlement line (statement and its order CSV), the invoice,
 * the stall fee payment (receipt) or the order (customer receipt).
 */
export type DocumentSubject = { kind: DocumentKind; id: string };

type Built = {
  bytes: Uint8Array;
  contentType: 'application/pdf' | 'text/csv';
  refs: {
    organization_id: string;
    event_id: string | null;
    settlement_id?: string | null;
    vendor_id?: string | null;
    invoice_id?: string | null;
    order_id?: string | null;
    fee_payment_id?: string | null;
    sponsor_id?: string | null;
    sponsorship_id?: string | null;
  };
};

const translator = async (locale: Locale) =>
  (await getTranslations({ locale, namespace: 'Documents' })) as unknown as Translate;

async function seller(organizationId: string) {
  const { data } = await createAdminClient()
    .from('organizations')
    .select(
      'legal_name, org_number, vat_registered, address_line, postal_code, city, bank_account, invoice_email',
    )
    .eq('id', organizationId)
    .single();
  return requireSeller(
    data && {
      legalName: data.legal_name ?? '',
      orgNumber: data.org_number ?? '',
      vatRegistered: data.vat_registered,
      addressLine: data.address_line,
      postalCode: data.postal_code,
      city: data.city,
      bankAccount: data.bank_account,
      invoiceEmail: data.invoice_email,
    },
  );
}

async function business(vendorId: string): Promise<Business> {
  const { data } = await createAdminClient()
    .from('vendors')
    .select('display_name, legal_name, org_number')
    .eq('id', vendorId)
    .single();
  return { name: data!.display_name, legalName: data!.legal_name, orgNumber: data!.org_number };
}

async function eventName(eventId: string) {
  const { data } = await createAdminClient()
    .from('events')
    .select('name')
    .eq('id', eventId)
    .single();
  return data!.name;
}

// Builders ---------------------------------------------------------------------------------------

async function settlementLine(lineId: string) {
  const { data, error } = await createAdminClient()
    .from('settlement_lines')
    .select(
      `id, organization_id, event_id, settlement_id, vendor_id, gross_sales_ore, refunds_ore, commission_ore,
       commission_mva_ore, adjustments_ore, net_payout_ore, period_start, cutoff_at,
       settlement:settlements!settlement_lines_settlement_id_organization_id_fkey(status, approved_at, released_at, cutoff_at),
       payouts:payouts!payouts_settlement_line_id_organization_id_fkey(provider_payout_id, amount_ore, status, paid_at, attempt)`,
    )
    .eq('id', lineId)
    .single();
  if (error) throw error;
  return data;
}

async function buildStatement(lineId: string, locale: Locale): Promise<Built> {
  const line = await settlementLine(lineId);
  const admin = createAdminClient();
  const [s, vendor, event, t, { data: adjustments }] = await Promise.all([
    seller(line.organization_id),
    business(line.vendor_id),
    eventName(line.event_id),
    translator(locale),
    admin
      .from('settlement_adjustments')
      .select('reason, amount_ore')
      .eq('settlement_id', line.settlement_id)
      .eq('vendor_id', line.vendor_id)
      .not('approved_by', 'is', null)
      .order('created_at'),
  ]);
  const cutoff = line.cutoff_at ?? line.settlement.cutoff_at;
  const model = statementModel(
    {
      seller: s,
      vendor,
      eventName: event,
      settlementId: line.settlement_id,
      periodFrom: line.period_start,
      periodTo: cutoff,
      issuedAt: line.settlement.released_at ?? line.settlement.approved_at ?? cutoff,
      line: {
        gross: line.gross_sales_ore,
        refunds: line.refunds_ore,
        commission: line.commission_ore,
        mva: line.commission_mva_ore,
        adjustments: line.adjustments_ore,
        net: line.net_payout_ore,
      },
      adjustments: (adjustments ?? []).map((a) => ({ reason: a.reason, amount: a.amount_ore })),
      payouts: [...line.payouts]
        .sort((a, b) => a.attempt - b.attempt)
        .map((p) => ({
          reference: p.provider_payout_id,
          amount: p.amount_ore,
          status: p.status,
          paidAt: p.paid_at,
        })),
    },
    t,
    locale,
  );
  return {
    bytes: await renderPdf(model),
    contentType: 'application/pdf',
    refs: {
      organization_id: line.organization_id,
      event_id: line.event_id,
      settlement_id: line.settlement_id,
      vendor_id: line.vendor_id,
    },
  };
}

/** Order-level detail for a statement (PRD §6): one row per order with ledger movements. */
async function buildStatementCsv(lineId: string, locale: Locale): Promise<Built> {
  const line = await settlementLine(lineId);
  const admin = createAdminClient();
  const cutoff = line.cutoff_at ?? line.settlement.cutoff_at;
  let query = admin
    .from('ledger_entries')
    .select('order_id, entry_type, account, direction, amount_ore, created_at')
    .eq('event_id', line.event_id)
    .eq('vendor_id', line.vendor_id)
    .not('order_id', 'is', null)
    .lte('created_at', cutoff)
    .order('created_at')
    .order('id');
  if (line.period_start) query = query.gt('created_at', line.period_start);
  const [{ data: entries, error }, t] = await Promise.all([query, translator(locale)]);
  if (error) throw error;
  type Row = {
    at: string;
    gross: number;
    refunded: number;
    commission: number;
    mva: number;
    vendor: number;
  };
  const byOrder = new Map<string, Row>();
  for (const e of entries ?? []) {
    const row =
      byOrder.get(e.order_id!) ??
      byOrder
        .set(e.order_id!, {
          at: e.created_at,
          gross: 0,
          refunded: 0,
          commission: 0,
          mva: 0,
          vendor: 0,
        })
        .get(e.order_id!)!;
    const signed = e.direction === 'credit' ? e.amount_ore : -e.amount_ore;
    if (e.account === 'psp_clearing' && e.entry_type === 'sale') row.gross += e.amount_ore;
    if (e.account === 'psp_clearing' && e.entry_type === 'refund') row.refunded += e.amount_ore;
    if (e.account === 'commission_revenue') row.commission += signed;
    if (e.account === 'mva_payable') row.mva += signed;
    if (e.account === 'vendor_payable') row.vendor += signed;
  }
  const ids = [...byOrder.keys()];
  const { data: orders } = ids.length
    ? await admin.from('orders').select('id, order_code, order_number').in('id', ids)
    : { data: [] };
  const code = new Map((orders ?? []).map((o) => [o.id, o.order_code ?? String(o.order_number)]));
  const csv = toCsv(
    ['time', 'order', 'gross', 'refunded', 'commission', 'mva', 'vendorShare'].map((k) =>
      t(`csv.${k}`),
    ),
    ids.map((id) => {
      const r = byOrder.get(id)!;
      return [
        time(r.at),
        text(code.get(id) ?? id),
        money(r.gross),
        money(-r.refunded),
        money(r.commission),
        money(r.mva),
        money(r.vendor),
      ];
    }),
  );
  return {
    bytes: new TextEncoder().encode(csv),
    contentType: 'text/csv',
    refs: {
      organization_id: line.organization_id,
      event_id: line.event_id,
      settlement_id: line.settlement_id,
      vendor_id: line.vendor_id,
    },
  };
}

async function buildInvoice(invoiceId: string, locale: Locale): Promise<Built> {
  const admin = createAdminClient();
  const { data: invoice, error } = await admin
    .from('invoices')
    .select(
      `id, organization_id, event_id, kind, invoice_number, vendor_id, settlement_id, stall_fee_id, subtotal_ore,
       mva_ore, total_ore, mva_rate_bp, status, settled_by_deduction, issued_at, due_at, period_from, period_to, lines`,
    )
    .eq('id', invoiceId)
    .single();
  if (error) throw error;
  const [s, buyer, event, t] = await Promise.all([
    seller(invoice.organization_id),
    business(invoice.vendor_id!),
    eventName(invoice.event_id),
    translator(locale),
  ]);
  let lines: { description: string; amount: number; mva: number }[];
  if (invoice.kind === 'stall_fee') {
    const { data: fee } = await admin
      .from('stall_fees')
      .select(
        'event_vendor:event_vendors!stall_fees_event_vendor_id_organization_id_fkey(stall_type:stall_types(name_nb, name_en))',
      )
      .eq('id', invoice.stall_fee_id!)
      .single();
    const type = fee?.event_vendor?.stall_type;
    const name = type ? (locale === 'nb' ? type.name_nb : type.name_en) : null;
    lines = [
      {
        description: [t('invoice.stallFeeDescription', { event }), name]
          .filter(Boolean)
          .join(' – '),
        amount: invoice.subtotal_ore,
        mva: invoice.mva_ore,
      },
    ];
  } else {
    lines = (invoice.lines as { key: string; amount_ore: number; mva_ore: number }[]).map((l) => ({
      description: t(`invoice.lines.${l.key}`),
      amount: l.amount_ore,
      mva: l.mva_ore,
    }));
    if (!lines.length) {
      lines = [
        {
          description: t('invoice.lines.commission'),
          amount: invoice.subtotal_ore,
          mva: invoice.mva_ore,
        },
      ];
    }
  }
  const model = invoiceModel(
    {
      seller: s,
      buyer,
      kind: invoice.kind as 'commission' | 'stall_fee',
      number: invoice.invoice_number,
      issuedAt: invoice.issued_at,
      dueAt: invoice.due_at,
      eventName: event,
      periodFrom: invoice.period_from,
      periodTo: invoice.period_to,
      lines,
      subtotal: invoice.subtotal_ore,
      mva: invoice.mva_ore,
      total: invoice.total_ore,
      mvaRateBp: invoice.mva_rate_bp,
      settledByDeduction: invoice.settled_by_deduction,
      status: invoice.status,
    },
    t,
    locale,
  );
  return {
    bytes: await renderPdf(model),
    contentType: 'application/pdf',
    refs: {
      organization_id: invoice.organization_id,
      event_id: invoice.event_id,
      settlement_id: invoice.settlement_id,
      vendor_id: invoice.vendor_id,
      invoice_id: invoice.id,
    },
  };
}

async function buildFeeReceipt(feePaymentId: string, locale: Locale): Promise<Built> {
  const admin = createAdminClient();
  const { data: payment, error } = await admin
    .from('fee_payments')
    .select(
      'id, organization_id, event_id, vendor_id, stall_fee_id, amount_ore, paid_at, provider_payment_id',
    )
    .eq('id', feePaymentId)
    .single();
  if (error) throw error;
  const [s, buyer, event, t, { data: fee }, { data: invoice }] = await Promise.all([
    seller(payment.organization_id),
    business(payment.vendor_id),
    eventName(payment.event_id),
    translator(locale),
    admin.from('stall_fees').select('mva_ore').eq('id', payment.stall_fee_id).single(),
    admin
      .from('invoices')
      .select('invoice_number, mva_rate_bp')
      .eq('stall_fee_id', payment.stall_fee_id)
      .order('issued_at')
      .limit(1)
      .maybeSingle(),
  ]);
  const model = feeReceiptModel(
    {
      seller: s,
      buyer,
      eventName: event,
      invoiceNumber: invoice?.invoice_number ?? null,
      paidAt: payment.paid_at,
      amount: payment.amount_ore,
      mva: fee?.mva_ore ?? 0,
      mvaRateBp: invoice?.mva_rate_bp ?? null,
      providerReference: payment.provider_payment_id,
    },
    t,
    locale,
  );
  return {
    bytes: await renderPdf(model),
    contentType: 'application/pdf',
    refs: {
      organization_id: payment.organization_id,
      event_id: payment.event_id,
      vendor_id: payment.vendor_id,
      fee_payment_id: payment.id,
    },
  };
}

async function buildCustomerReceipt(orderId: string, locale: Locale): Promise<Built> {
  const admin = createAdminClient();
  const { data: order, error } = await admin
    .from('orders')
    .select(
      `id, organization_id, event_id, vendor_id, order_code, order_number, total_ore, customer_name, paid_at, created_at,
       items:order_items!order_items_order_id_organization_id_fkey(product_name, unit_price_ore, quantity, line_total_ore, mva_rate_bp, mva_ore, id),
       payments!payments_order_id_organization_id_fkey(method, status),
       refunds!refunds_order_id_vendor_id_fkey(amount_ore, status)`,
    )
    .eq('id', orderId)
    .single();
  if (error) throw error;
  const [vendor, event, t, { data: organization }] = await Promise.all([
    business(order.vendor_id),
    eventName(order.event_id),
    translator(locale),
    admin.from('organizations').select('name').eq('id', order.organization_id).single(),
  ]);
  const mvaByRate = new Map<number, number>();
  for (const item of order.items) {
    if (item.mva_rate_bp > 0)
      mvaByRate.set(item.mva_rate_bp, (mvaByRate.get(item.mva_rate_bp) ?? 0) + item.mva_ore);
  }
  const model = customerReceiptModel(
    {
      vendor,
      eventName: event,
      marketplace: organization?.name ?? 'AFF Marketplace',
      orderCode: order.order_code,
      orderNumber: order.order_number,
      paidAt: order.paid_at,
      createdAt: order.created_at,
      method: order.payments.find((p) => p.status === 'succeeded')?.method ?? null,
      items: [...order.items]
        .sort((a, b) => a.id.localeCompare(b.id))
        .map((i) => ({
          name: i.product_name,
          quantity: i.quantity,
          unitPrice: i.unit_price_ore,
          lineTotal: i.line_total_ore,
        })),
      total: order.total_ore,
      mvaByRate: [...mvaByRate].sort(([a], [b]) => a - b),
      refunded: order.refunds
        .filter((r) => r.status === 'succeeded')
        .reduce((sum, r) => sum + r.amount_ore, 0),
      customerName: order.customer_name,
    },
    t,
    locale,
  );
  return {
    bytes: await renderPdf(model),
    contentType: 'application/pdf',
    refs: {
      organization_id: order.organization_id,
      event_id: order.event_id,
      vendor_id: order.vendor_id,
      order_id: order.id,
    },
  };
}

async function sponsorBusiness(sponsorId: string): Promise<Business> {
  const { data } = await createAdminClient()
    .from('sponsors')
    .select('name, legal_name, org_number')
    .eq('id', sponsorId)
    .single();
  return { name: data!.name, legalName: data!.legal_name, orgNumber: data!.org_number };
}

/** AFFN's invoice to a sponsor (AFFN revenue, paid by bank transfer). */
async function buildSponsorInvoice(invoiceId: string, locale: Locale): Promise<Built> {
  const { data: invoice, error } = await createAdminClient()
    .from('sponsor_invoices')
    .select('*')
    .eq('id', invoiceId)
    .single();
  if (error) throw error;
  const [s, buyer, event, t] = await Promise.all([
    seller(invoice.organization_id),
    sponsorBusiness(invoice.sponsor_id),
    eventName(invoice.event_id),
    translator(locale),
  ]);
  const description = t('invoice.sponsorDescription', { package: invoice.description, event });
  const model = invoiceModel(
    {
      seller: s,
      buyer,
      kind: 'sponsorship',
      packageName: invoice.description,
      number: invoice.invoice_number,
      issuedAt: invoice.issued_at,
      dueAt: invoice.due_at,
      eventName: event,
      periodFrom: null,
      periodTo: null,
      lines: [{ description, amount: invoice.subtotal_ore, mva: invoice.mva_ore }],
      subtotal: invoice.subtotal_ore,
      mva: invoice.mva_ore,
      total: invoice.total_ore,
      mvaRateBp: invoice.mva_rate_bp,
      settledByDeduction: false,
      status: invoice.status,
    },
    t,
    locale,
  );
  return {
    bytes: await renderPdf(model),
    contentType: 'application/pdf',
    refs: {
      organization_id: invoice.organization_id,
      event_id: invoice.event_id,
      sponsor_id: invoice.sponsor_id,
      sponsorship_id: invoice.sponsorship_id,
    },
  };
}

/** The post-event report (SPO-04), as PDF or CSV, from the sponsorship's links and views. */
async function buildSponsorReport(
  sponsorshipId: string,
  locale: Locale,
  csv: boolean,
): Promise<Built> {
  const admin = createAdminClient();
  const { data: sponsorship, error } = await admin
    .from('sponsorships')
    .select(
      `id, organization_id, event_id, sponsor_id, agreed_price_ore,
       package:sponsor_packages!sponsorships_package_id_organization_id_fkey(name, price_ore),
       event:events!sponsorships_event_id_organization_id_fkey(name, ends_at)`,
    )
    .eq('id', sponsorshipId)
    .single();
  if (error) throw error;
  const [
    { data: org },
    { data: sponsor },
    { data: deliverables },
    { data: links },
    { data: views },
    t,
  ] = await Promise.all([
    admin
      .from('organizations')
      .select('legal_name, org_number')
      .eq('id', sponsorship.organization_id)
      .single(),
    admin
      .from('sponsors')
      .select('name, legal_name, org_number')
      .eq('id', sponsorship.sponsor_id)
      .single(),
    admin
      .from('sponsorship_deliverables')
      .select('title, status')
      .eq('sponsorship_id', sponsorship.id)
      .order('position'),
    admin
      .from('tracked_links')
      .select('id, kind, label, qr_scans(scanned_at)')
      .eq('sponsorship_id', sponsorship.id),
    admin
      .from('page_views')
      .select('viewed_at')
      .eq('sponsor_id', sponsorship.sponsor_id)
      .eq('event_id', sponsorship.event_id)
      .order('viewed_at'),
    translator(locale),
  ]);
  const festival = await festivalTotals(sponsorship.event_id);
  const issuer = requireSeller(
    org && {
      legalName: org.legal_name ?? '',
      orgNumber: org.org_number ?? '',
      vatRegistered: true,
      addressLine: null,
      postalCode: null,
      city: null,
      bankAccount: null,
      invoiceEmail: null,
    },
  );
  const hits = (links ?? [])
    .flatMap((l) => l.qr_scans.map((s) => ({ at: s.scanned_at, kind: l.kind, label: l.label })))
    .sort((a, b) => a.at.localeCompare(b.at));
  const pageViews = (views ?? []).map((v) => v.viewed_at);
  const last = [hits.at(-1)?.at, pageViews.at(-1)].filter(Boolean).sort().at(-1);
  const end = sponsorship.event.ends_at ?? new Date(0).toISOString();
  const data: ReportData = {
    issuer,
    sponsor: {
      name: sponsor!.name,
      legalName: sponsor!.legal_name,
      orgNumber: sponsor!.org_number,
    },
    eventName: sponsorship.event.name,
    packageName: sponsorship.package.name,
    priceOre: sponsorship.agreed_price_ore ?? sponsorship.package.price_ore,
    deliverables: deliverables ?? [],
    hits,
    pageViews,
    festival,
    date: last && last > end ? last : end,
  };
  const refs = {
    organization_id: sponsorship.organization_id,
    event_id: sponsorship.event_id,
    sponsor_id: sponsorship.sponsor_id,
    sponsorship_id: sponsorship.id,
  };
  if (csv) {
    return { bytes: new TextEncoder().encode(reportCsv(data, t)), contentType: 'text/csv', refs };
  }
  return {
    bytes: await renderPdf(reportModel(data, t, locale)),
    contentType: 'application/pdf',
    refs,
  };
}

/** Festival totals for context in sponsor reports: paid orders, vendors, gross sales. */
export async function festivalTotals(eventId: string) {
  const admin = createAdminClient();
  const [orders, vendors, { data: totals }] = await Promise.all([
    admin
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('event_id', eventId)
      .not('paid_at', 'is', null),
    admin
      .from('event_vendors')
      .select('id', { count: 'exact', head: true })
      .eq('event_id', eventId)
      .eq('status', 'approved'),
    admin.rpc('event_money_totals', { p_event_id: eventId }),
  ]);
  const ledger = (totals ?? []).find((r) => r.source === 'orders');
  return {
    orders: orders.count ?? 0,
    vendors: vendors.count ?? 0,
    grossOre: ledger?.gross_ore ?? 0,
  };
}

function build({ kind, id }: DocumentSubject, locale: Locale): Promise<Built> {
  switch (kind) {
    case 'vendor_statement':
      return buildStatement(id, locale);
    case 'statement_orders_csv':
      return buildStatementCsv(id, locale);
    case 'commission_invoice':
    case 'stall_fee_invoice':
      return buildInvoice(id, locale);
    case 'stall_fee_receipt':
      return buildFeeReceipt(id, locale);
    case 'customer_receipt':
      return buildCustomerReceipt(id, locale);
    case 'sponsor_invoice':
      return buildSponsorInvoice(id, locale);
    case 'sponsor_report_pdf':
    case 'sponsor_report_csv':
      return buildSponsorReport(id, locale, kind === 'sponsor_report_csv');
  }
}

// Storage ------------------------------------------------------------------------------------------

const BUCKET = 'documents';

async function latest(subject: DocumentSubject, locale: Locale) {
  const { data } = await createAdminClient()
    .from('documents')
    .select('*')
    .eq('kind', subject.kind)
    .eq('subject_key', subject.id)
    .eq('locale', locale)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

/**
 * Renders the document and stores it as a new version (never overwriting one). Unless `force`,
 * an unchanged document (same bytes as the latest version) is not stored again.
 */
async function store(
  subject: DocumentSubject,
  locale: Locale,
  userId: string | null,
  force: boolean,
): Promise<StoredDocument> {
  const built = await build(subject, locale);
  const sha256 = createHash('sha256').update(built.bytes).digest('hex');
  const admin = createAdminClient();
  for (let attempt = 0; attempt < 5; attempt++) {
    const current = await latest(subject, locale);
    if (current && !force && current.sha256 === sha256) return current;
    const version = (current?.version ?? 0) + 1;
    const extension = built.contentType === 'text/csv' ? 'csv' : 'pdf';
    const path = `${built.refs.organization_id}/${subject.kind}/${subject.id}/${locale}/v${version}.${extension}`;
    const upload = await admin.storage
      .from(BUCKET)
      .upload(path, built.bytes, { contentType: built.contentType, upsert: false });
    if (upload.error) {
      // Someone stored this version first: take the next one.
      if (/exists|duplicate/i.test(upload.error.message)) continue;
      throw upload.error;
    }
    const { data, error } = await admin
      .from('documents')
      .insert({
        ...built.refs,
        kind: subject.kind,
        subject_key: subject.id,
        locale,
        version,
        storage_path: path,
        content_type: built.contentType,
        byte_size: built.bytes.byteLength,
        sha256,
        created_by: userId,
      })
      .select('*')
      .single();
    if (error?.code === '23505') continue;
    if (error) throw error;
    return data;
  }
  throw new Error('Could not store the document');
}

/** The current document, generated (and stored) when missing or out of date. */
export const ensureDocument = (subject: DocumentSubject, locale: Locale, userId: string | null) =>
  store(subject, locale, userId, false);

/** A new version, even when nothing changed (staff "Regenerate"). */
export const regenerateDocument = (
  subject: DocumentSubject,
  locale: Locale,
  userId: string | null,
) => store(subject, locale, userId, true);

export async function documentBytes(document: Pick<StoredDocument, 'storage_path'>) {
  const { data, error } = await createAdminClient()
    .storage.from(BUCKET)
    .download(document.storage_path);
  if (error) throw error;
  return new Uint8Array(await data.arrayBuffer());
}

/** A file name for the download, e.g. "faktura-1042.pdf". */
export async function documentFileName(document: StoredDocument) {
  const t = await translator(document.locale as Locale);
  const extension = document.content_type === 'text/csv' ? 'csv' : 'pdf';
  let suffix = document.subject_key.slice(0, 8);
  if (document.invoice_id) {
    const { data } = await createAdminClient()
      .from('invoices')
      .select('invoice_number')
      .eq('id', document.invoice_id)
      .single();
    if (data) suffix = String(data.invoice_number);
  }
  return `${t(`fileNames.${document.kind}`)}-${suffix}-v${document.version}.${extension}`;
}

/**
 * Documents for a released settlement (SET-04): the commission invoices are issued, then each
 * vendor's statement, order CSV and invoice are stored (bokmål). Safe to run again.
 */
export async function issueSettlementDocuments(settlementId: string, userId: string | null) {
  const admin = createAdminClient();
  const { error } = await admin.rpc('issue_commission_invoices', { p_settlement_id: settlementId });
  if (error) throw error;
  const [{ data: lines }, { data: invoices }] = await Promise.all([
    admin.from('settlement_lines').select('id').eq('settlement_id', settlementId),
    admin.from('invoices').select('id').eq('settlement_id', settlementId).eq('kind', 'commission'),
  ]);
  for (const line of lines ?? []) {
    await ensureDocument({ kind: 'vendor_statement', id: line.id }, 'nb', userId);
    await ensureDocument({ kind: 'statement_orders_csv', id: line.id }, 'nb', userId);
  }
  for (const invoice of invoices ?? []) {
    await ensureDocument({ kind: 'commission_invoice', id: invoice.id }, 'nb', userId);
  }
}
