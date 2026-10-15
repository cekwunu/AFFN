import 'server-only';
import { getTranslations } from 'next-intl/server';
import type { Locale } from '@/i18n/routing';
import { formatOrgNumber } from '@/lib/brreg';
import { formatCommissionTerms } from '@/lib/money/commission';
import { formatNok } from '@/lib/format';
import { ore } from '@/lib/money';
import { commissionRuleFor, stallTypesFor, type ApplicationEvent } from './server';

/**
 * Version of the vendor agreement text (VEN-05). Bump it whenever the wording in the Agreement
 * messages changes; acceptances record the version they were given for.
 */
export const AGREEMENT_VERSION = '2027.1-draft';

export interface AgreementSection {
  title: string;
  body: string;
}

/** The agreement for one application, in the reader's language, plus the terms to snapshot. */
export async function buildAgreement({
  locale,
  event,
  organizer,
  vendor,
  stallTypeId,
}: {
  locale: Locale;
  event: ApplicationEvent;
  organizer: string;
  vendor: { id: string; legal_name: string; org_number: string };
  stallTypeId: string | null;
}) {
  const t = await getTranslations({ locale, namespace: 'Agreement' });
  const [rule, stallTypes] = await Promise.all([
    commissionRuleFor(event.id, vendor.id),
    stallTypesFor(event.id),
  ]);
  const stallType = stallTypes.find((s) => s.id === stallTypeId) ?? null;
  if (!rule || !stallType) return null;

  const commissionTerms = formatCommissionTerms(rule, locale === 'en' ? 'per order' : 'per ordre');
  const stall = `${locale === 'en' ? stallType.name_en : stallType.name_nb} (${stallType.size_label})`;
  const stallFeeTerms = t('stallFee', { stall, fee: formatNok(ore(Number(stallType.fee_ore))) });
  const settlementTerms = t('settlement');

  const sections: AgreementSection[] = [
    { title: t('sellerTitle'), body: t('seller') },
    { title: t('commissionTitle'), body: t('commission', { terms: commissionTerms }) },
    { title: t('stallFeeTitle'), body: stallFeeTerms },
    { title: t('settlementTitle'), body: settlementTerms },
    { title: t('refundsTitle'), body: t('refunds') },
    { title: t('rulesTitle'), body: t('rules') },
  ];
  return {
    version: AGREEMENT_VERSION,
    title: t('title', { event: event.name }),
    parties: t('parties', {
      vendor: vendor.legal_name,
      orgNumber: formatOrgNumber(vendor.org_number),
      organizer,
    }),
    sections,
    snapshot: {
      terms_version: AGREEMENT_VERSION,
      commission_terms: commissionTerms,
      stall_fee_terms: stallFeeTerms,
      settlement_terms: settlementTerms,
    },
  };
}
