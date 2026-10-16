import { describe, expect, it } from 'vitest';
import {
  parseSettings,
  validBankAccount,
  validOrgNumber,
  type SettingsInput,
} from './organization';

const valid: SettingsInput = {
  legalName: 'African Food Festival Norway AS',
  orgNumber: '923 456 783',
  vatRegistered: true,
  addressLine: 'Tøyengata 1',
  postalCode: '0578',
  city: 'Oslo',
  bankAccount: '1234.56.78903',
  invoiceEmail: 'faktura@affn.no',
  invoiceDueDays: '14',
  stallFeeMva: '25',
  sponsorMva: '25',
};

describe('organization settings', () => {
  it('checks org numbers and bank accounts with their mod-11 check digit', () => {
    expect(validOrgNumber('923456783')).toBe(true);
    expect(validOrgNumber('923 456 784')).toBe(false);
    expect(validOrgNumber('12345678')).toBe(false);
    expect(validBankAccount('12345678903')).toBe(true);
    expect(validBankAccount('1234.56.78903')).toBe(true);
    expect(validBankAccount('12345678904')).toBe(false);
    expect(validBankAccount('1234567890')).toBe(false);
  });

  it('stores digits only and the mva rate in basis points', () => {
    const result = parseSettings({ ...valid, stallFeeMva: '12,5' });
    expect(result).toEqual({
      ok: true,
      organization: {
        legal_name: 'African Food Festival Norway AS',
        org_number: '923456783',
        vat_registered: true,
        address_line: 'Tøyengata 1',
        postal_code: '0578',
        city: 'Oslo',
        bank_account: '12345678903',
        invoice_email: 'faktura@affn.no',
        invoice_due_days: 14,
      },
      stallFeeMvaBp: 1250,
      sponsorMvaBp: 2500,
    });
  });

  it('needs a legal name and a valid org number; optional fields may be empty', () => {
    expect(parseSettings({ ...valid, legalName: ' ', orgNumber: '923456784' })).toEqual({
      ok: false,
      errors: { legalName: 'required', orgNumber: 'invalid' },
    });
    const minimal = parseSettings({
      ...valid,
      addressLine: '',
      postalCode: '',
      city: '',
      bankAccount: '',
      invoiceEmail: '',
    });
    expect(minimal.ok).toBe(true);
    expect(
      parseSettings({
        ...valid,
        postalCode: '578',
        bankAccount: '1',
        stallFeeMva: '120',
        invoiceDueDays: 'x',
      }),
    ).toEqual({
      ok: false,
      errors: {
        postalCode: 'invalid',
        bankAccount: 'invalid',
        invoiceDueDays: 'invalid',
        stallFeeMva: 'invalid',
      },
    });
  });
});
