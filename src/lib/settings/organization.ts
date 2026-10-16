/**
 * AFFN's own company details for its invoices (bokføringsforskriften § 5-1-1) and the mva rate on
 * stall fees (PRD §12), as edited on /admin/settings. Pure validation, shared by the action and
 * its tests.
 */
import { isValidOrgNumber, normalizeOrgNumber } from '@/lib/brreg';
import { parsePercent } from '@/lib/money/commission';

export type SettingsInput = Record<
  | 'legalName'
  | 'orgNumber'
  | 'addressLine'
  | 'postalCode'
  | 'city'
  | 'bankAccount'
  | 'invoiceEmail'
  | 'invoiceDueDays'
  | 'stallFeeMva'
  | 'sponsorMva',
  string
> & { vatRegistered: boolean };

export type SettingsErrors = Partial<Record<keyof SettingsInput, 'required' | 'invalid'>>;

const digits = (value: string) => value.replace(/[\s.]/g, '');

/** Norwegian org numbers end in a mod-11 check digit (shared with the Brønnøysund check). */
export const validOrgNumber = (value: string) => isValidOrgNumber(normalizeOrgNumber(value));

/** Norwegian bank account numbers (11 digits) end in a mod-11 check digit. */
export function validBankAccount(value: string): boolean {
  const n = digits(value);
  if (!/^\d{11}$/.test(n)) return false;
  const sum = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2].reduce((s, w, i) => s + w * Number(n[i]), 0);
  const check = 11 - (sum % 11);
  if (check === 10) return false;
  return (check === 11 ? 0 : check) === Number(n[10]);
}

export type OrganizationSettings = {
  legal_name: string;
  org_number: string;
  vat_registered: boolean;
  address_line: string | null;
  postal_code: string | null;
  city: string | null;
  bank_account: string | null;
  invoice_email: string | null;
  invoice_due_days: number;
};

/** Validates the form; returns the database values or the errors per field. */
export function parseSettings(
  input: SettingsInput,
):
  | { ok: true; organization: OrganizationSettings; stallFeeMvaBp: number; sponsorMvaBp: number }
  | { ok: false; errors: SettingsErrors } {
  const errors: SettingsErrors = {};
  const trimmed = Object.fromEntries(
    Object.entries(input).map(([k, v]) => [k, typeof v === 'string' ? v.trim() : v]),
  ) as SettingsInput;
  if (!trimmed.legalName) errors.legalName = 'required';
  if (!trimmed.orgNumber) errors.orgNumber = 'required';
  else if (!validOrgNumber(trimmed.orgNumber)) errors.orgNumber = 'invalid';
  if (trimmed.postalCode && !/^\d{4}$/.test(trimmed.postalCode)) errors.postalCode = 'invalid';
  if (trimmed.bankAccount && !validBankAccount(trimmed.bankAccount)) errors.bankAccount = 'invalid';
  if (trimmed.invoiceEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed.invoiceEmail)) {
    errors.invoiceEmail = 'invalid';
  }
  const due = Number(trimmed.invoiceDueDays);
  if (!/^\d{1,2}$/.test(trimmed.invoiceDueDays) || due > 90) errors.invoiceDueDays = 'invalid';
  const mva = parsePercent(trimmed.stallFeeMva);
  if (mva === null || mva > 10_000) errors.stallFeeMva = 'invalid';
  const sponsorMva = parsePercent(trimmed.sponsorMva);
  if (sponsorMva === null || sponsorMva > 10_000) errors.sponsorMva = 'invalid';
  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    organization: {
      legal_name: trimmed.legalName,
      org_number: digits(trimmed.orgNumber),
      vat_registered: trimmed.vatRegistered,
      address_line: trimmed.addressLine || null,
      postal_code: trimmed.postalCode || null,
      city: trimmed.city || null,
      bank_account: trimmed.bankAccount ? digits(trimmed.bankAccount) : null,
      invoice_email: trimmed.invoiceEmail || null,
      invoice_due_days: due,
    },
    stallFeeMvaBp: mva!,
    sponsorMvaBp: sponsorMva!,
  };
}
