import { CircleAlert, FileText } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button-variants';
import { BusinessLookup } from '@/components/vendor/business-lookup';
import { StepForm, type StepField, type StepFormLabels } from '@/components/vendor/step-form';
import { DocumentUpload, MediaUpload } from '@/components/vendor/uploads';
import { Link } from '@/i18n/link';
import type { Locale } from '@/i18n/routing';
import { currentOrganization } from '@/lib/auth/server';
import { formatOrgNumber } from '@/lib/brreg';
import { requireSupabasePublicConfig } from '@/lib/env';
import { formatDateOslo, formatDateTimeOslo, formatNok } from '@/lib/format';
import { ore } from '@/lib/money';
import { buildAgreement } from '@/lib/vendor/agreement';
import {
  CATEGORIES,
  DOCUMENT_ACCEPT,
  DOCUMENT_MAX_BYTES,
  DOCUMENT_TYPES,
  MEDIA_ACCEPT,
  MEDIA_MAX_BYTES,
  STEPS,
  cuisineCountryOptions,
  applicationFacts,
  documentsComplete,
  isFoodCategory,
  missingSteps,
  type Step,
} from '@/lib/vendor/application';
import { createClient } from '@/lib/supabase/server';
import { applyErrors } from '@/lib/vendor/messages';
import {
  stallTypesFor,
  zonesFor,
  type ApplicationEvent,
  type MyApplication,
} from '@/lib/vendor/server';
import {
  acceptAgreement,
  addDocument,
  deleteDocument,
  lookupBusiness,
  saveDraft,
  saveStep,
  setMedia,
  startApplication,
  startEventApplication,
  submitApplication,
} from './actions';

export interface StepProps {
  locale: Locale;
  event: ApplicationEvent;
  application: MyApplication | null;
  /** The signed-in user's email, to pre-fill the contact step. */
  email: string;
}

const mediaUrl = (path: string | null) =>
  path
    ? `${requireSupabasePublicConfig().url}/storage/v1/object/public/vendor-media/${path}`
    : null;

async function formLabels(autosave: boolean): Promise<StepFormLabels> {
  const t = await getTranslations('Apply');
  return {
    submit: t('continue'),
    working: t('working'),
    optional: t('optional'),
    autosave: autosave
      ? {
          idle: t('autosave.idle'),
          saving: t('autosave.saving'),
          saved: t('autosave.saved'),
          error: t('autosave.error'),
        }
      : undefined,
  };
}

async function BackLink({ step }: { step: Step }) {
  const t = await getTranslations('Apply');
  const previous = STEPS[STEPS.indexOf(step) - 1];
  if (!previous) return null;
  return (
    <Link href={`/vendor/apply/${previous}`} className="font-medium text-link hover:underline">
      {t('back')}
    </Link>
  );
}

async function ContinueLink({ step }: { step: Step }) {
  const t = await getTranslations('Apply');
  const next = STEPS[STEPS.indexOf(step) + 1]!;
  return (
    <div className="flex flex-col-reverse gap-4 border-t border-border pt-6 sm:flex-row sm:items-center sm:justify-between">
      <BackLink step={step} />
      <Link
        href={`/vendor/apply/${next}`}
        className={buttonVariants({ size: 'lg', className: 'w-full sm:w-auto' })}
      >
        {t('continue')}
      </Link>
    </div>
  );
}

const draftOf = (application: MyApplication, step: Step) => application.progress.drafts?.[step];

// 1. Business --------------------------------------------------------------------------------------

export async function BusinessStep({ locale, event, application }: StepProps) {
  const t = await getTranslations('Apply.business');
  if (!application) {
    return (
      <div className="grid gap-6">
        <p className="text-body-lg text-muted-foreground">{t('intro')}</p>
        <RegisteredVendorStart locale={locale} event={event} />
        <BusinessLookup
          lookup={lookupBusiness}
          start={startApplication}
          locale={locale}
          messages={await applyErrors()}
          labels={{
            orgNumber: t('orgNumber'),
            orgNumberHint: t('orgNumberHint'),
            lookup: t('lookup'),
            looking: t('looking'),
            found: t('found'),
            confirmIntro: t('confirmIntro'),
            confirm: t('confirm'),
            starting: t('starting'),
            tryAnother: t('tryAnother'),
            name: t('name'),
            form: t('form'),
            address: t('address'),
            orgNumberLabel: t('orgNumberLabel'),
          }}
        />
      </div>
    );
  }
  const v = application.vendor;
  const address = [v.business_address, [v.postal_code, v.city].filter(Boolean).join(' ')]
    .filter(Boolean)
    .join(', ');
  return (
    <div className="grid gap-6">
      <section className="grid gap-4 rounded-xl border border-border bg-card p-5 sm:p-6">
        <h2 className="text-heading-md font-semibold">{t('registered')}</h2>
        <dl className="grid gap-3 sm:grid-cols-[auto_1fr] sm:gap-x-8">
          <dt className="text-body-sm text-muted-foreground">{t('name')}</dt>
          <dd className="font-medium">{v.legal_name}</dd>
          <dt className="text-body-sm text-muted-foreground">{t('orgNumberLabel')}</dt>
          <dd className="tabular-nums">{formatOrgNumber(v.org_number)}</dd>
          <dt className="text-body-sm text-muted-foreground">{t('form')}</dt>
          <dd>{v.business_form}</dd>
          {address && (
            <>
              <dt className="text-body-sm text-muted-foreground">{t('address')}</dt>
              <dd>{address}</dd>
            </>
          )}
        </dl>
        {v.brreg_verified_at && (
          <p className="text-body-sm text-muted-foreground">
            {t('verified', { date: formatDateOslo(v.brreg_verified_at, locale) })}
          </p>
        )}
      </section>
      <ContinueLink step="business" />
    </div>
  );
}

/** A vendor registered in an earlier year starts a new application without a new lookup. */
async function RegisteredVendorStart({
  locale,
  event,
}: {
  locale: Locale;
  event: ApplicationEvent;
}) {
  const supabase = await createClient();
  const { data } = await supabase
    .from('memberships')
    .select('vendor_id')
    .eq('role', 'vendor')
    .eq('status', 'active')
    .not('vendor_id', 'is', null)
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  const t = await getTranslations('Apply.business');
  return (
    <form
      action={startEventApplication}
      className="grid gap-3 rounded-xl border border-border bg-card p-5"
    >
      <input type="hidden" name="locale" value={locale} />
      <h2 className="text-heading-md font-semibold">{t('newEventTitle', { event: event.name })}</h2>
      <p className="text-body text-muted-foreground">{t('newEventText', { event: event.name })}</p>
      <button type="submit" className={buttonVariants({ size: 'lg', className: 'w-fit' })}>
        {t('newEventButton')}
      </button>
    </form>
  );
}

// 2. Contact ---------------------------------------------------------------------------------------

export async function ContactStep({
  locale,
  application,
  email,
}: StepProps & { application: MyApplication }) {
  const t = await getTranslations('Apply.contact');
  const c = application.contact;
  const fields: StepField[] = [
    { kind: 'text', name: 'contactName', label: t('name'), autoComplete: 'name', maxLength: 120 },
    {
      kind: 'email',
      name: 'contactEmail',
      label: t('email'),
      autoComplete: 'email',
      inputMode: 'email',
    },
    {
      kind: 'tel',
      name: 'contactPhone',
      label: t('phone'),
      hint: t('phoneHint'),
      autoComplete: 'tel-national',
      inputMode: 'tel',
      maxLength: 20,
    },
  ];
  return (
    <div className="grid gap-6">
      <p className="text-body-lg text-muted-foreground">{t('intro')}</p>
      <StepForm
        action={saveStep.bind(null, 'contact')}
        autosave={saveDraft.bind(null, 'contact')}
        fields={fields}
        values={
          draftOf(application, 'contact') ?? {
            contactName: c?.contact_name ?? '',
            contactEmail: c?.contact_email ?? email,
            contactPhone: c?.contact_phone ?? '',
          }
        }
        hidden={{ locale }}
        labels={await formLabels(true)}
        messages={await applyErrors()}
        secondary={<BackLink step="contact" />}
      />
    </div>
  );
}

// 3. Profile ---------------------------------------------------------------------------------------

export async function ProfileStep({
  locale,
  application,
}: StepProps & { application: MyApplication }) {
  const t = await getTranslations('Apply.profile');
  const tc = await getTranslations('Apply.categories');
  const te = await getTranslations('Apply.errors');
  const v = application.vendor;
  const fields: StepField[] = [
    {
      kind: 'text',
      name: 'displayName',
      label: t('displayName'),
      hint: t('displayNameHint'),
      autoComplete: 'organization',
      maxLength: 80,
    },
    {
      kind: 'select',
      name: 'category',
      label: t('category'),
      placeholder: t('categoryPlaceholder'),
      options: CATEGORIES.map((c) => ({ value: c, label: tc(c) })),
    },
    {
      kind: 'select',
      name: 'cuisineCountry',
      label: t('cuisineCountry'),
      hint: t('cuisineCountryHint'),
      placeholder: t('cuisineCountryPlaceholder'),
      optional: !isFoodCategory(v.category),
      options: cuisineCountryOptions(locale),
    },
    {
      kind: 'textarea',
      name: 'description',
      label: t('description'),
      hint: t('descriptionHint'),
      maxLength: 600,
    },
    { kind: 'heading', label: t('linksTitle') },
    {
      kind: 'url',
      name: 'websiteUrl',
      label: t('website'),
      optional: true,
      inputMode: 'url',
      autoComplete: 'url',
    },
    {
      kind: 'text',
      name: 'instagramHandle',
      label: t('instagram'),
      optional: true,
      placeholder: '@',
    },
    { kind: 'url', name: 'facebookUrl', label: t('facebook'), optional: true, inputMode: 'url' },
    { kind: 'text', name: 'tiktokHandle', label: t('tiktok'), optional: true, placeholder: '@' },
  ];
  const mediaLabels = (kind: string) => ({
    uploading: t('uploading'),
    uploaded: t('uploaded'),
    failed: te('upload_failed'),
    alt: t('imageAlt', { kind }),
  });
  return (
    <div className="grid gap-6">
      <p className="text-body-lg text-muted-foreground">{t('intro')}</p>
      <StepForm
        action={saveStep.bind(null, 'profile')}
        autosave={saveDraft.bind(null, 'profile')}
        fields={fields}
        values={
          draftOf(application, 'profile') ?? {
            displayName: v.display_name ?? '',
            category: v.category ?? '',
            cuisineCountry: v.cuisine_country ?? '',
            description: v.description ?? '',
            websiteUrl: v.website_url ?? '',
            instagramHandle: v.instagram_handle ? `@${v.instagram_handle}` : '',
            facebookUrl: v.facebook_url ?? '',
            tiktokHandle: v.tiktok_handle ? `@${v.tiktok_handle}` : '',
          }
        }
        hidden={{ locale }}
        labels={await formLabels(true)}
        messages={await applyErrors()}
        secondary={<BackLink step="profile" />}
      >
        <section className="grid gap-5">
          <h2 className="pt-2 text-heading-md font-semibold">{t('mediaTitle')}</h2>
          <div className="grid gap-6 md:grid-cols-2">
            <MediaUpload
              vendorId={v.id}
              kind="logo"
              label={`${t('logo')} (${(await getTranslations('Apply'))('optional')})`}
              hint={t('logoHint')}
              currentUrl={mediaUrl(v.logo_path)}
              accept={MEDIA_ACCEPT}
              maxSizeBytes={MEDIA_MAX_BYTES}
              save={setMedia}
              labels={mediaLabels(t('logo').toLowerCase())}
            />
            <MediaUpload
              vendorId={v.id}
              kind="cover"
              label={`${t('cover')} (${(await getTranslations('Apply'))('optional')})`}
              hint={t('coverHint')}
              currentUrl={mediaUrl(v.cover_image_path)}
              accept={MEDIA_ACCEPT}
              maxSizeBytes={MEDIA_MAX_BYTES}
              save={setMedia}
              labels={mediaLabels(t('cover').toLowerCase())}
            />
          </div>
        </section>
      </StepForm>
    </div>
  );
}

// 4. Stall ------------------------------------------------------------------------------------------

export async function StallStep({
  locale,
  event,
  application,
}: StepProps & { application: MyApplication }) {
  const t = await getTranslations('Apply.stall');
  const [types, zones] = await Promise.all([stallTypesFor(event.id), zonesFor(event.id)]);
  const fields: StepField[] = [
    {
      kind: 'cards',
      name: 'stallTypeId',
      label: t('type'),
      options: types.map((type) => ({
        value: type.id,
        label: locale === 'en' ? type.name_en : type.name_nb,
        meta: type.size_label,
        description: [
          locale === 'en' ? type.description_en : type.description_nb,
          t('fee', { fee: formatNok(ore(Number(type.fee_ore))) }),
        ]
          .filter(Boolean)
          .join(' '),
      })),
    },
    { kind: 'heading', label: t('needs') },
    { kind: 'checkbox', name: 'needsPower', label: t('power') },
    { kind: 'checkbox', name: 'needsWater', label: t('water') },
    {
      kind: 'select',
      name: 'preferredZone',
      label: t('zone'),
      optional: true,
      placeholder: t('zoneNone'),
      options: zones.map((z) => ({ value: z, label: z })),
    },
  ];
  const completed = application.progress.completed?.includes('stall');
  return (
    <div className="grid gap-6">
      <p className="text-body-lg text-muted-foreground">{t('intro')}</p>
      <StepForm
        action={saveStep.bind(null, 'stall')}
        autosave={saveDraft.bind(null, 'stall')}
        fields={fields}
        values={
          draftOf(application, 'stall') ?? {
            stallTypeId: application.stall_type_id ?? '',
            needsPower: completed && application.needs_power ? 'on' : '',
            needsWater: completed && application.needs_water ? 'on' : '',
            preferredZone: application.preferred_zone ?? '',
          }
        }
        hidden={{ locale }}
        labels={await formLabels(true)}
        messages={await applyErrors()}
        secondary={<BackLink step="stall" />}
      />
    </div>
  );
}

// 5. Documents ---------------------------------------------------------------------------------------

export async function DocumentsStep({
  locale,
  application,
}: StepProps & { application: MyApplication }) {
  const t = await getTranslations('Apply.documents');
  const tt = await getTranslations('Apply.documentTypes');
  const food = isFoodCategory(application.vendor.category);
  const complete = documentsComplete(application.vendor.category, application.documents);
  return (
    <div className="grid gap-6">
      <p className="text-body-lg text-muted-foreground">{t('intro')}</p>
      {food && (
        <p
          className={
            complete
              ? 'rounded-md bg-info-subtle px-4 py-3 text-body-sm text-info-subtle-foreground'
              : 'flex gap-2 rounded-md bg-warning-subtle px-4 py-3 text-body-sm text-warning-subtle-foreground'
          }
        >
          {!complete && <CircleAlert className="size-5 shrink-0" aria-hidden="true" />}
          {complete
            ? t('mattilsynetRequired')
            : `${t('mattilsynetRequired')} ${t('mattilsynetMissing')}`}
        </p>
      )}

      <section aria-labelledby="documents-list" className="grid gap-3">
        <h2 id="documents-list" className="text-heading-md font-semibold">
          {t('listTitle')}
        </h2>
        {application.documents.length === 0 ? (
          <p className="text-body text-muted-foreground">{t('none')}</p>
        ) : (
          <ul className="grid gap-3">
            {application.documents.map((doc) => (
              <li
                key={doc.id}
                className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 sm:flex-row sm:items-center"
              >
                <FileText
                  className="hidden size-6 shrink-0 text-muted-foreground sm:block"
                  aria-hidden="true"
                />
                <div className="grid min-w-0 flex-1 gap-1">
                  <p className="font-medium">
                    {tt(doc.document_type)}
                    {doc.description ? ` – ${doc.description}` : ''}
                  </p>
                  <p className="truncate text-body-sm text-muted-foreground">
                    {doc.file_name} ·{' '}
                    {doc.expires_on
                      ? t('expiresOn', { date: formatDateOslo(doc.expires_on, locale) })
                      : t('noExpiry')}
                  </p>
                </div>
                <Badge
                  variant={
                    doc.status === 'accepted'
                      ? 'success'
                      : doc.status === 'rejected'
                        ? 'danger'
                        : 'neutral'
                  }
                >
                  {t(`status.${doc.status}`)}
                </Badge>
                <div className="flex gap-2">
                  <a
                    href={`/api/vendor/documents/${doc.id}`}
                    target="_blank"
                    rel="noopener"
                    className={buttonVariants({ variant: 'outline', size: 'sm' })}
                  >
                    {t('view')}
                  </a>
                  {doc.status === 'pending' && (
                    <form action={deleteDocument}>
                      <input type="hidden" name="id" value={doc.id} />
                      <button
                        type="submit"
                        aria-label={t('deleteLabel', { name: doc.file_name })}
                        className={buttonVariants({ variant: 'ghost', size: 'sm' })}
                      >
                        {t('delete')}
                      </button>
                    </form>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <DocumentUpload
        vendorId={application.vendor.id}
        types={DOCUMENT_TYPES.map((type) => ({ value: type, label: tt(type) }))}
        defaultType={food && !complete ? 'mattilsynet_registration' : 'insurance'}
        accept={DOCUMENT_ACCEPT}
        acceptLabel="PDF, JPG, PNG"
        maxSizeBytes={DOCUMENT_MAX_BYTES}
        add={addDocument}
        messages={await applyErrors()}
        labels={{
          title: t('addTitle'),
          type: t('type'),
          expires: t('expires'),
          expiresHint: t('expiresHint'),
          description: t('description'),
          file: t('file'),
          add: t('add'),
          adding: t('adding'),
        }}
      />
      <ContinueLink step="documents" />
    </div>
  );
}

// 6. Agreement ----------------------------------------------------------------------------------------

export async function AgreementStep({
  locale,
  event,
  application,
}: StepProps & { application: MyApplication }) {
  const t = await getTranslations('Apply.agreement');
  const te = await getTranslations('Apply.errors');
  const agreement = await buildAgreement({
    locale,
    event,
    organizer: (await currentOrganization()).name,
    vendor: application.vendor,
    stallTypeId: application.stall_type_id,
  });
  if (!agreement) {
    return (
      <div className="grid gap-6">
        <p className="rounded-md bg-warning-subtle px-4 py-3 text-body text-warning-subtle-foreground">
          {te('stall_first')}
        </p>
        <Link
          href="/vendor/apply/stall"
          className={buttonVariants({ size: 'lg', className: 'w-fit' })}
        >
          {(await getTranslations('Apply.steps'))('stall')}
        </Link>
      </div>
    );
  }
  const accepted = application.agreement;
  return (
    <div className="grid gap-6">
      <p className="text-body-lg text-muted-foreground">{t('intro', { event: event.name })}</p>
      <article
        aria-labelledby="agreement-title"
        className="grid max-h-[32rem] gap-4 overflow-y-auto rounded-xl border border-border bg-card p-5 sm:p-6"
        tabIndex={0}
      >
        <p className="text-caption font-semibold tracking-wide text-muted-foreground uppercase">
          {t('draftNotice')}
        </p>
        <h2 id="agreement-title" className="text-heading-lg font-semibold">
          {agreement.title}
        </h2>
        <p className="text-body">{agreement.parties}</p>
        {agreement.sections.map((section) => (
          <section key={section.title} className="grid gap-1">
            <h3 className="text-heading-sm font-semibold">{section.title}</h3>
            <p className="text-body">{section.body}</p>
          </section>
        ))}
        <p className="text-caption text-muted-foreground">{agreement.version}</p>
      </article>
      {accepted ? (
        <>
          <p
            role="status"
            className="rounded-md bg-success-subtle px-4 py-3 text-body text-success-subtle-foreground"
          >
            {t('accepted', {
              date: formatDateTimeOslo(accepted.accepted_at, locale),
              version: accepted.terms_version,
            })}
          </p>
          <ContinueLink step="agreement" />
        </>
      ) : (
        <StepForm
          action={acceptAgreement}
          fields={[{ kind: 'checkbox', name: 'accept', label: t('accept') }]}
          hidden={{ locale }}
          labels={{
            ...(await formLabels(false)),
            submit: t('acceptButton'),
            working: t('accepting'),
          }}
          messages={await applyErrors()}
          secondary={<BackLink step="agreement" />}
        />
      )}
    </div>
  );
}

// 7. Review and submit ----------------------------------------------------------------------------------

export async function ReviewStep({
  locale,
  event,
  application,
}: StepProps & { application: MyApplication }) {
  const t = await getTranslations('Apply.review');
  const ts = await getTranslations('Apply.steps');
  const tc = await getTranslations('Apply.categories');
  const tp = await getTranslations('Apply.profile');
  const tst = await getTranslations('Apply.stall');
  const tco = await getTranslations('Apply.contact');
  const v = application.vendor;
  const types = await stallTypesFor(event.id);
  const stallType = types.find((s) => s.id === application.stall_type_id);
  const missing = missingSteps(application.progress, applicationFacts(application));
  const none = t('none');
  const countries = cuisineCountryOptions(locale);

  const sections: { step: Step; rows: [string, ReactNode][] }[] = [
    {
      step: 'business',
      rows: [
        [(await getTranslations('Apply.business'))('name'), v.legal_name],
        [
          (await getTranslations('Apply.business'))('orgNumberLabel'),
          formatOrgNumber(v.org_number),
        ],
      ],
    },
    {
      step: 'contact',
      rows: [
        [tco('name'), application.contact?.contact_name ?? none],
        [tco('email'), application.contact?.contact_email ?? none],
        [tco('phone'), application.contact?.contact_phone ?? none],
      ],
    },
    {
      step: 'profile',
      rows: [
        [tp('displayName'), v.display_name],
        [tp('category'), v.category ? tc(v.category as (typeof CATEGORIES)[number]) : none],
        [tp('cuisineCountry'), countries.find((c) => c.value === v.cuisine_country)?.label ?? none],
        [tp('description'), v.description ?? none],
      ],
    },
    {
      step: 'stall',
      rows: [
        [
          tst('type'),
          stallType
            ? `${locale === 'en' ? stallType.name_en : stallType.name_nb} (${stallType.size_label}), ${formatNok(ore(Number(stallType.fee_ore)))}`
            : none,
        ],
        [tst('power'), application.needs_power ? t('yes') : t('no')],
        [tst('water'), application.needs_water ? t('yes') : t('no')],
        [tst('zone'), application.preferred_zone ?? tst('zoneNone')],
      ],
    },
    {
      step: 'documents',
      rows: [[ts('documents'), t('documentsCount', { count: application.documents.length })]],
    },
    {
      step: 'agreement',
      rows: [
        [
          ts('agreement'),
          application.agreement
            ? t('agreementAccepted', {
                date: formatDateTimeOslo(application.agreement.accepted_at, locale),
              })
            : t('agreementMissing'),
        ],
      ],
    },
  ];

  return (
    <div className="grid gap-6">
      <p className="text-body-lg text-muted-foreground">{t('intro')}</p>
      {missing.length > 0 && (
        <section
          aria-labelledby="missing"
          className="grid gap-2 rounded-md bg-warning-subtle px-4 py-3 text-warning-subtle-foreground"
        >
          <h2 id="missing" className="font-semibold">
            {t('missingTitle')}
          </h2>
          <ul className="grid list-disc gap-1 pl-5 text-body-sm">
            {missing.map((step) => (
              <li key={step}>
                <Link href={`/vendor/apply/${step}`} className="underline">
                  {ts(step)}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      <div className="grid gap-4">
        {sections.map((section) => (
          <section
            key={section.step}
            aria-labelledby={`review-${section.step}`}
            className="grid gap-3 rounded-xl border border-border bg-card p-5"
          >
            <div className="flex items-center justify-between gap-3">
              <h2 id={`review-${section.step}`} className="text-heading-sm font-semibold">
                {ts(section.step)}
              </h2>
              {section.step !== 'business' && (
                <Link
                  href={`/vendor/apply/${section.step}`}
                  aria-label={t('editLabel', { section: ts(section.step) })}
                  className="text-body-sm font-medium text-link hover:underline"
                >
                  {t('edit')}
                </Link>
              )}
            </div>
            <dl className="grid gap-2 sm:grid-cols-[12rem_1fr] sm:gap-x-6">
              {section.rows.map(([label, value]) => (
                <div key={label} className="contents">
                  <dt className="text-body-sm text-muted-foreground">{label}</dt>
                  <dd className="text-body break-words">{value}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
      <StepForm
        action={submitApplication}
        fields={[]}
        hidden={{ locale }}
        labels={{
          ...(await formLabels(false)),
          submit: application.status === 'more_info_requested' ? t('resubmit') : t('submit'),
          working: t('submitting'),
        }}
        messages={await applyErrors()}
        secondary={<BackLink step="review" />}
      />
    </div>
  );
}
