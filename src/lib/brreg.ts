/**
 * Brønnøysundregistrene, Enhetsregisteret (VEN-02): org-number checks and mapping of the open
 * API's answer (GET /enheter/{orgnr}) to what the application needs. Pure; the fetch and the
 * cache live in brreg.server.ts.
 */

export type BusinessForm = 'ENK' | 'AS' | 'NUF' | 'ANS' | 'DA' | 'SA' | 'other';

export interface BrregEntity {
  orgNumber: string;
  name: string;
  /** Registry code, e.g. "AS", "ENK", "FLI". */
  formCode: string;
  form: BusinessForm;
  formDescription: string | null;
  address: string | null;
  postalCode: string | null;
  city: string | null;
}

export type BrregResult =
  | { status: 'active'; entity: BrregEntity }
  | { status: 'invalid' | 'not_found' | 'deleted' | 'bankrupt' | 'dissolving' | 'unavailable' };

export type BrregStatus = BrregResult['status'];

const WEIGHTS = [3, 2, 7, 6, 5, 4, 3, 2];

/** Removes spaces and dots people type ("923 456 781"). */
export function normalizeOrgNumber(input: string): string {
  return input.replace(/[\s. ]/g, '');
}

/** Nine digits with a valid modulus-11 check digit. */
export function isValidOrgNumber(orgNumber: string): boolean {
  if (!/^[89][0-9]{8}$/.test(orgNumber)) return false;
  const digits = [...orgNumber].map(Number);
  const sum = WEIGHTS.reduce((total, weight, i) => total + weight * digits[i]!, 0);
  const rest = sum % 11;
  const check = rest === 0 ? 0 : 11 - rest;
  return check !== 10 && check === digits[8];
}

/** "923 456 781" for display. */
export function formatOrgNumber(orgNumber: string): string {
  return orgNumber.replace(/^(\d{3})(\d{3})(\d{3})$/, '$1 $2 $3');
}

const FORMS: readonly BusinessForm[] = ['ENK', 'AS', 'NUF', 'ANS', 'DA', 'SA'];

interface BrregAddress {
  adresse?: string[];
  postnummer?: string;
  poststed?: string;
}

interface BrregEnhet {
  organisasjonsnummer?: string;
  navn?: string;
  organisasjonsform?: { kode?: string; beskrivelse?: string };
  forretningsadresse?: BrregAddress;
  postadresse?: BrregAddress;
  konkurs?: boolean;
  underAvvikling?: boolean;
  underTvangsavviklingEllerTvangsopplosning?: boolean;
  slettedato?: string;
}

/** Maps the HTTP status and body of GET /enheter/{orgnr} to a result. */
export function parseBrregResponse(httpStatus: number, body: unknown): BrregResult {
  if (httpStatus === 404) return { status: 'not_found' };
  if (httpStatus === 410) return { status: 'deleted' };
  if (httpStatus !== 200 || !body || typeof body !== 'object') return { status: 'unavailable' };

  const enhet = body as BrregEnhet;
  if (enhet.slettedato) return { status: 'deleted' };
  if (enhet.konkurs) return { status: 'bankrupt' };
  if (enhet.underAvvikling || enhet.underTvangsavviklingEllerTvangsopplosning) {
    return { status: 'dissolving' };
  }
  if (!enhet.organisasjonsnummer || !enhet.navn) return { status: 'unavailable' };

  const address = enhet.forretningsadresse ?? enhet.postadresse;
  const formCode = enhet.organisasjonsform?.kode ?? '';
  return {
    status: 'active',
    entity: {
      orgNumber: enhet.organisasjonsnummer,
      name: enhet.navn,
      formCode,
      form: (FORMS as readonly string[]).includes(formCode) ? (formCode as BusinessForm) : 'other',
      formDescription: enhet.organisasjonsform?.beskrivelse ?? null,
      address: address?.adresse?.filter(Boolean).join(', ') || null,
      postalCode:
        address?.postnummer && /^\d{4}$/.test(address.postnummer) ? address.postnummer : null,
      city: address?.poststed ? titleCase(address.poststed) : null,
    },
  };
}

const LEGAL_SUFFIX = /\s+(AS|ASA|ANS|DA|NUF|SA|ENK)$/i;
const KEEP_UPPER = new Set(['AS', 'ASA', 'ANS', 'DA', 'NUF', 'SA', 'ENK']);

/** "OSLO" → "Oslo", "MAMA AFRIKA KJØKKEN" → "Mama Afrika Kjøkken". */
export function titleCase(value: string): string {
  return value
    .toLocaleLowerCase('nb')
    .replace(
      /(^|[\s\-/&(])(\p{L})/gu,
      (_, sep: string, letter: string) => sep + letter.toLocaleUpperCase('nb'),
    )
    .split(' ')
    .map((word) => (KEEP_UPPER.has(word.toUpperCase()) ? word.toUpperCase() : word))
    .join(' ');
}

/** A friendly default for the public name: registry name in title case, without "AS" etc. */
export function suggestDisplayName(registryName: string): string {
  return titleCase(registryName.trim().replace(LEGAL_SUFFIX, ''));
}
