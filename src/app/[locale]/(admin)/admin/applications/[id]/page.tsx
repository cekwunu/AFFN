import { ArrowLeft, CircleAlert } from 'lucide-react';
import type { Metadata } from 'next';
import { getMessages, getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { DecisionForm, DocumentViewer, NoteForm } from '@/components/admin/review-forms';
import { Badge } from '@/components/ui/badge';
import { Link } from '@/i18n/link';
import type { Locale } from '@/i18n/routing';
import { initRequestLocale } from '@/i18n/server';
import { getCurrentUser } from '@/lib/auth/server';
import { formatOrgNumber } from '@/lib/brreg';
import { formatCommissionTerms } from '@/lib/commission';
import { formatDateOslo, formatDateTimeOslo, formatNok } from '@/lib/format';
import { ore } from '@/lib/money';
import { expiryWarning } from '@/lib/review/queue';
import { getApplicationForReview } from '@/lib/review/server';
import { STATUS_VARIANT } from '@/lib/review/status';
import { cuisineCountryOptions, documentsComplete } from '@/lib/vendor/application';
import { commissionRuleFor } from '@/lib/vendor/server';
import { addNote, decide } from '../actions';

export const metadata: Metadata = { robots: { index: false } };

type ReviewMessages = (typeof import('../../../../../../../messages/nb.json'))['Review'];

/** Moves a reviewer can make from each status (mirrors private.review_application). */
const NEXT: Record<string, string[]> = {
  submitted: ['under_review', 'approved', 'more_info_requested', 'waitlisted', 'rejected'],
  under_review: ['approved', 'more_info_requested', 'waitlisted', 'rejected'],
  waitlisted: ['approved', 'more_info_requested', 'rejected'],
};
const ACTION_LABEL: Record<string, string> = {
  under_review: 'startReview',
  approved: 'approve',
  more_info_requested: 'moreInfo',
  waitlisted: 'waitlist',
  rejected: 'reject',
};

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="grid gap-3 rounded-xl border border-border bg-card p-5">
      <h2 className="text-heading-sm font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Facts({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="grid gap-2 sm:grid-cols-[11rem_1fr] sm:gap-x-6">
      {rows.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-body-sm text-muted-foreground">{label}</dt>
          <dd className="text-body break-words">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Application detail for reviewers (REV-01 … REV-03). */
export default async function ApplicationDetailPage({
  params,
}: PageProps<'/[locale]/admin/applications/[id]'>) {
  const { locale: rawLocale, id } = await params;
  const locale = initRequestLocale(rawLocale) as Locale;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const app = await getApplicationForReview(id);
  if (!app) notFound();

  const t = await getTranslations('Review.detail');
  const ta = await getTranslations('Review.actions');
  const tn = await getTranslations('Review.notes');
  const tStatus = await getTranslations('Application.status');
  const tCategory = await getTranslations('Apply.categories');
  const tDoc = await getTranslations('Apply.documentTypes');
  const tDocStatus = await getTranslations('Apply.documents.status');
  const review = ((await getMessages()) as unknown as { Review: ReviewMessages }).Review;
  const messages: Record<string, string> = {
    ...review.errors,
    ...Object.fromEntries(Object.entries(review.actions.done).map(([k, v]) => [`done.${k}`, v])),
  };

  const user = (await getCurrentUser())!;
  const canOverride = user.access.roles.some(
    (r) => r.org === app.organization_id && r.role === 'org_admin' && r.status === 'active',
  );
  const rule = await commissionRuleFor(app.event_id, app.vendor.id);
  const terms = rule
    ? formatCommissionTerms(rule, locale === 'en' ? 'per order' : 'per ordre')
    : '—';

  const v = app.vendor;
  const none = t('none');
  const yesNo = (value: boolean) => (value ? t('yes') : t('no'));
  const date = (value: string) => formatDateOslo(value, locale);
  const person = (uid: string | null | undefined) => (uid ? (app.people.get(uid) ?? '—') : '—');
  const address = [v.business_address, [v.postal_code, v.city].filter(Boolean).join(' ')]
    .filter(Boolean)
    .join(', ');
  const country = cuisineCountryOptions(locale).find((c) => c.value === v.cuisine_country)?.label;
  const links = [
    v.website_url,
    v.instagram_handle && `instagram.com/${v.instagram_handle}`,
    v.facebook_url,
    v.tiktok_handle && `tiktok.com/@${v.tiktok_handle}`,
  ].filter(Boolean);
  const docsOk = documentsComplete(v.category, app.documents);
  const options = (NEXT[app.status] ?? []).map((value) => ({
    value,
    label: ta(ACTION_LABEL[value] as 'approve'),
  }));

  const history: { at: string; label: string; detail?: string | null; who?: string }[] = [
    ...(app.submitted_at ? [{ at: app.submitted_at, label: t('historySubmitted') }] : []),
    ...(app.agreement
      ? [
          {
            at: app.agreement.accepted_at,
            label: t('historyAgreement'),
            who: person(app.agreement.accepted_by),
          },
        ]
      : []),
    ...app.reviews.map((r) => ({
      at: r.created_at,
      label: t('historyReview', {
        from: r.from_status ? tStatus(r.from_status) : '—',
        to: tStatus(r.to_status),
      }),
      detail: r.note,
      who: person(r.actor_id),
    })),
  ].sort((a, b) => a.at.localeCompare(b.at));

  return (
    <div className="grid gap-6">
      <Link
        href="/admin/applications"
        className="inline-flex w-fit items-center gap-2 text-body-sm font-medium text-link hover:underline"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        {t('back')}
      </Link>
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="font-display text-display-md font-semibold">{v.display_name}</h1>
        <Badge variant={STATUS_VARIANT[app.status]} data-testid="review-status">
          {tStatus(app.status)}
        </Badge>
        <p className="w-full text-body-sm text-muted-foreground tabular-nums">
          {t('orgNumber', { number: formatOrgNumber(v.org_number) })} · {app.event.name}
        </p>
      </header>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="grid gap-4">
          <Section title={t('business')}>
            <Facts
              rows={[
                [t('legalName'), v.legal_name],
                [t('form'), v.business_form ?? none],
                [t('address'), address || none],
                [
                  t('registry'),
                  v.brreg_verified_at
                    ? `${v.brreg_status === 'active' ? t('active') : (v.brreg_status ?? none)} · ${t('registryVerified', { date: date(v.brreg_verified_at) })}`
                    : none,
                ],
              ]}
            />
          </Section>
          <Section title={t('contact')}>
            <Facts
              rows={[
                [t('contact'), app.contact?.contact_name ?? none],
                [t('email'), app.contact?.contact_email ?? none],
                [t('phone'), app.contact?.contact_phone ?? none],
              ]}
            />
          </Section>
          <Section title={t('profile')}>
            <Facts
              rows={[
                [t('displayName'), v.display_name],
                [t('category'), v.category ? tCategory(v.category as 'other') : none],
                [t('cuisine'), country ?? none],
                [t('description'), v.description ?? none],
                [t('links'), links.length ? links.join(' · ') : none],
              ]}
            />
          </Section>
          <Section title={t('stall')}>
            <Facts
              rows={[
                [
                  t('stallType'),
                  app.stall_type
                    ? `${locale === 'en' ? app.stall_type.name_en : app.stall_type.name_nb} (${app.stall_type.size_label}), ${formatNok(ore(Number(app.stall_type.fee_ore)))}`
                    : none,
                ],
                [t('power'), yesNo(app.needs_power)],
                [t('water'), yesNo(app.needs_water)],
                [t('zone'), app.preferred_zone ?? none],
                ...(app.stallFee
                  ? ([
                      [
                        t('stallFee'),
                        app.stallFee.invoice
                          ? t('invoice', {
                              number: app.stallFee.invoice.invoice_number,
                              total: formatNok(ore(Number(app.stallFee.total_ore))),
                              status: t(`feeStatus.${app.stallFee.status}`),
                            })
                          : formatNok(ore(Number(app.stallFee.total_ore))),
                      ],
                    ] as [string, ReactNode][])
                  : []),
              ]}
            />
          </Section>
          <Section title={t('agreement')}>
            {app.agreement ? (
              <Facts
                rows={[
                  [
                    t('agreement'),
                    t('agreementAccepted', {
                      date: formatDateTimeOslo(app.agreement.accepted_at, locale),
                      email: person(app.agreement.accepted_by),
                      version: app.agreement.terms_version,
                    }),
                  ],
                  [t('commissionTerms'), app.agreement.commission_terms],
                  [t('stallFeeTerms'), app.agreement.stall_fee_terms],
                  [t('settlementTerms'), app.agreement.settlement_terms],
                ]}
              />
            ) : (
              <p className="text-body text-danger">{t('agreementMissing')}</p>
            )}
          </Section>
          <Section title={t('history')}>
            <ol className="grid gap-3 border-l-2 border-border pl-4">
              {history.map((item, index) => (
                <li key={index} className="grid gap-0.5">
                  <p className="text-body-sm font-semibold">{item.label}</p>
                  <p className="text-caption text-muted-foreground">
                    {formatDateTimeOslo(item.at, locale)}
                    {item.who ? ` · ${t('by', { name: item.who })}` : ''}
                  </p>
                  {item.detail && <p className="text-body-sm whitespace-pre-line">{item.detail}</p>}
                </li>
              ))}
            </ol>
          </Section>
        </div>

        <div className="grid gap-4 xl:sticky xl:top-20">
          <Section title={t('documents')}>
            {!docsOk && (
              <p className="flex gap-2 rounded-md bg-warning-subtle px-3 py-2 text-body-sm text-warning-subtle-foreground">
                <CircleAlert className="size-4 shrink-0" aria-hidden="true" />
                {t('mattilsynetMissing')}
              </p>
            )}
            {app.documents.length === 0 ? (
              <p className="text-body text-muted-foreground">{t('noDocuments')}</p>
            ) : (
              <DocumentViewer
                documents={app.documents.map((doc) => {
                  const warning = expiryWarning(doc.expires_on, app.event.ends_at);
                  return {
                    id: doc.id,
                    label: `${tDoc(doc.document_type)}${doc.description ? ` – ${doc.description}` : ''}`,
                    fileName: doc.file_name,
                    meta: `${doc.expires_on ? t('expires', { date: date(doc.expires_on) }) : t('noExpiry')} · ${tDocStatus(doc.status)}`,
                    warning:
                      warning === 'expired'
                        ? t('expired')
                        : warning === 'beforeEvent'
                          ? t('expiresBeforeEvent')
                          : null,
                  };
                })}
                labels={{
                  preview: t('preview'),
                  openNewTab: t('openNewTab'),
                  previewOf: t('previewOf', { name: '{name}' }),
                }}
              />
            )}
          </Section>

          <Section title={ta('title')}>
            {options.length > 0 ? (
              <DecisionForm
                action={decide}
                id={app.id}
                options={options}
                canOverride={canOverride}
                messages={messages}
                labels={{
                  decision: ta('decision'),
                  note: ta('note'),
                  noteHint: ta('noteHint'),
                  submit: ta('choose'),
                  working: ta('working'),
                  commission: ta('commission'),
                  commissionDefault: ta('commissionDefault', { terms }),
                  overrideRate: ta('overrideRate'),
                  overrideRateHint: ta('overrideRateHint'),
                  overrideReason: ta('overrideReason'),
                }}
              />
            ) : (
              <p className="text-body text-muted-foreground">
                {ta('final', { status: tStatus(app.status) })}
              </p>
            )}
          </Section>

          <Section title={tn('title')}>
            <p className="text-caption text-muted-foreground">{tn('hint')}</p>
            {app.notes.length === 0 ? (
              <p className="text-body-sm text-muted-foreground">{tn('empty')}</p>
            ) : (
              <ul className="grid gap-3" data-testid="internal-notes">
                {app.notes.map((note) => (
                  <li key={note.id} className="grid gap-0.5 rounded-md bg-muted px-3 py-2">
                    <p className="text-body-sm whitespace-pre-line">{note.body}</p>
                    <p className="text-caption text-muted-foreground">
                      {person(note.author_id)} · {formatDateTimeOslo(note.created_at, locale)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
            <NoteForm
              action={addNote}
              id={app.id}
              messages={messages}
              labels={{ label: tn('label'), add: tn('add'), working: tn('working') }}
            />
          </Section>
        </div>
      </div>
    </div>
  );
}
