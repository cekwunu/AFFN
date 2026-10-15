import { createTranslator } from 'next-intl';
import type { Locale } from '@/i18n/routing';
import en from '../../../messages/en.json';
import nb from '../../../messages/nb.json';
import type { EmailMessage } from './send';
import { EMAIL_COLOURS as C } from './theme';

const MESSAGES = { nb, en } as const;

const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );

/** Shared email layout. Inline styles because email clients ignore stylesheets. */
function layout(locale: Locale, body: string): string {
  return `<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:32px 16px;background:${C.canvas};font-family:Inter,Segoe UI,Helvetica,Arial,sans-serif;color:${C.ink};">
<div style="max-width:520px;margin:0 auto;background:${C.card};border:1px solid ${C.line};border-radius:12px;padding:32px;font-size:16px;line-height:1.6;">
<p style="margin:0 0 16px;font-family:Georgia,serif;font-size:20px;font-weight:600;">◆ AFF Marketplace</p>
${body}
</div>
<p style="text-align:center;margin:16px 0 0;font-size:12px;color:${C.muted};">African Food Festival Norway</p>
</body></html>`;
}

export function invitationEmail(input: {
  to: string;
  locale: Locale;
  organizationName: string;
  eventName?: string | null;
  inviterName?: string | null;
  link: string;
}): EmailMessage {
  const t = createTranslator({
    locale: input.locale,
    messages: MESSAGES[input.locale],
    namespace: 'Email.invitation',
  });
  const values = {
    organization: input.organizationName,
    event: input.eventName ?? '',
    inviter: input.inviterName ?? t('someone'),
  };
  const intro = input.eventName ? t('introEvent', values) : t('intro', values);
  const subject = t('subject', values);
  const html = layout(
    input.locale,
    `<h1 style="margin:0 0 12px;font-size:22px;">${escapeHtml(t('title'))}</h1>
<p style="margin:0;">${escapeHtml(intro)}</p>
<p style="margin:24px 0;"><a href="${escapeHtml(input.link)}" style="display:inline-block;background:${C.primary};color:${C.onPrimary};text-decoration:none;font-weight:600;padding:12px 20px;border-radius:8px;">${escapeHtml(t('cta'))}</a></p>
<p style="margin:0 0 8px;font-size:14px;color:${C.muted};">${escapeHtml(t('expiry'))}</p>
<p style="margin:0;font-size:12px;color:${C.muted};word-break:break-all;">${escapeHtml(t('linkHint'))} ${escapeHtml(input.link)}</p>`,
  );
  const text = `${t('title')}\n\n${intro}\n\n${t('cta')}: ${input.link}\n\n${t('expiry')}`;
  return { to: input.to, subject, html, text };
}

export type DecisionEmailKind = 'approved' | 'rejected' | 'waitlisted' | 'more_info_requested';

/**
 * Tells the vendor about a review decision (REV-02). Rejections and information requests carry
 * the reviewer's note; approvals and waitlisting do not (their notes stay in the review log).
 */
export function decisionEmail(input: {
  to: string;
  locale: Locale;
  decision: DecisionEmailKind;
  vendorName: string;
  eventName: string;
  note?: string | null;
  link: string;
}): EmailMessage {
  const t = createTranslator({
    locale: input.locale,
    messages: MESSAGES[input.locale],
    namespace: 'Email.decision',
  });
  const values = { vendor: input.vendorName, event: input.eventName };
  const withNote = input.decision === 'rejected' || input.decision === 'more_info_requested';
  const note = withNote && input.note?.trim() ? input.note.trim() : null;
  const subject = t(`${input.decision}.subject`, values);
  const title = t(`${input.decision}.title`, values);
  const body = t(`${input.decision}.body`, values);
  const html = layout(
    input.locale,
    `<h1 style="margin:0 0 12px;font-size:22px;">${escapeHtml(title)}</h1>
<p style="margin:0;">${escapeHtml(body)}</p>
${
  note
    ? `<div style="margin:20px 0 0;padding:16px;border-left:3px solid ${C.primary};background:${C.canvas};">
<p style="margin:0 0 6px;font-weight:600;">${escapeHtml(t('noteTitle'))}</p>
<p style="margin:0;white-space:pre-line;">${escapeHtml(note)}</p></div>`
    : ''
}
<p style="margin:24px 0 0;"><a href="${escapeHtml(input.link)}" style="display:inline-block;background:${C.primary};color:${C.onPrimary};text-decoration:none;font-weight:600;padding:12px 20px;border-radius:8px;">${escapeHtml(t('cta'))}</a></p>`,
  );
  const text = [
    title,
    '',
    body,
    ...(note ? ['', t('noteTitle'), note] : []),
    '',
    `${t('cta')}: ${input.link}`,
  ].join('\n');
  return { to: input.to, subject, html, text };
}

/** A copy of the digital receipt (QR-05): the vendor is the seller, AFFN the platform. */
export function receiptEmail(input: {
  to: string;
  locale: Locale;
  orderNumber: string;
  vendorName: string;
  sellerName: string;
  sellerOrgNumber: string;
  platformName: string;
  lines: { name: string; quantity: number; total: string }[];
  mva: { rate: string; amount: string }[];
  total: string;
  method: string | null;
  time: string;
  link: string;
}): EmailMessage {
  const t = createTranslator({
    locale: input.locale,
    messages: MESSAGES[input.locale],
    namespace: 'Email.receipt',
  });
  const r = createTranslator({
    locale: input.locale,
    messages: MESSAGES[input.locale],
    namespace: 'Receipt',
  });
  const subject = t('subject', { vendor: input.vendorName, number: input.orderNumber });
  const row = (left: string, right: string, strong = false) =>
    `<tr><td style="padding:4px 0;${strong ? 'font-weight:600;' : ''}">${escapeHtml(left)}</td><td style="padding:4px 0;text-align:right;white-space:nowrap;${strong ? 'font-weight:600;' : ''}">${escapeHtml(right)}</td></tr>`;
  const html = layout(
    input.locale,
    `<h1 style="margin:0 0 12px;font-size:22px;">${escapeHtml(r('title', { number: input.orderNumber }))}</h1>
<p style="margin:0 0 16px;">${escapeHtml(t('intro'))}</p>
<p style="margin:0 0 4px;"><strong>${escapeHtml(r('seller'))}:</strong> ${escapeHtml(input.sellerName)}, ${escapeHtml(r('orgNumber', { number: input.sellerOrgNumber }))}</p>
<p style="margin:0 0 16px;"><strong>${escapeHtml(r('platform'))}:</strong> ${escapeHtml(input.platformName)}</p>
<table style="width:100%;border-collapse:collapse;border-top:1px solid ${C.line};border-bottom:1px solid ${C.line};margin:0 0 16px;">
${input.lines.map((l) => row(`${l.quantity} × ${l.name}`, l.total)).join('')}
${input.mva.map((m) => row(r('mva', { rate: m.rate }), m.amount)).join('')}
${row(r('total'), input.total, true)}
</table>
<p style="margin:0;">${input.method ? `${escapeHtml(r('method'))}: ${escapeHtml(input.method)} · ` : ''}${escapeHtml(input.time)}</p>
<p style="margin:16px 0 0;font-size:13px;color:${C.muted};">${escapeHtml(t('footer', { platform: input.platformName }))}</p>
<p style="margin:16px 0 0;"><a href="${escapeHtml(input.link)}" style="color:${C.primary};">${escapeHtml(input.link)}</a></p>`,
  );
  const text = [
    r('title', { number: input.orderNumber }),
    '',
    `${r('seller')}: ${input.sellerName}, ${r('orgNumber', { number: input.sellerOrgNumber })}`,
    `${r('platform')}: ${input.platformName}`,
    '',
    ...input.lines.map((l) => `${l.quantity} × ${l.name}  ${l.total}`),
    ...input.mva.map((m) => `${r('mva', { rate: m.rate })}  ${m.amount}`),
    `${r('total')}  ${input.total}`,
    '',
    `${input.method ? `${r('method')}: ${input.method} · ` : ''}${input.time}`,
    '',
    input.link,
  ].join('\n');
  return { to: input.to, subject, html, text };
}
