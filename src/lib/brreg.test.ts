import { describe, expect, it } from 'vitest';
import {
  formatOrgNumber,
  isValidOrgNumber,
  normalizeOrgNumber,
  parseBrregResponse,
  suggestDisplayName,
  titleCase,
} from './brreg';

const active = {
  organisasjonsnummer: '923456783',
  navn: 'MAMA AFRIKA KJØKKEN AS',
  organisasjonsform: { kode: 'AS', beskrivelse: 'Aksjeselskap' },
  forretningsadresse: { adresse: ['Storgata 1', ''], postnummer: '0155', poststed: 'OSLO' },
  konkurs: false,
  underAvvikling: false,
  underTvangsavviklingEllerTvangsopplosning: false,
};

describe('org numbers', () => {
  it('checks the modulus-11 check digit', () => {
    expect(isValidOrgNumber('923456783')).toBe(true);
    expect(isValidOrgNumber('974000008')).toBe(true);
    expect(isValidOrgNumber('923456789')).toBe(false); // wrong check digit
    expect(isValidOrgNumber('91234567')).toBe(false); // eight digits
    expect(isValidOrgNumber('123456785')).toBe(false); // must start with 8 or 9
    expect(isValidOrgNumber('91234567x')).toBe(false);
  });

  it('accepts the spaces people type and formats for display', () => {
    expect(normalizeOrgNumber(' 923 456 783 ')).toBe('923456783');
    expect(normalizeOrgNumber('923.456.783')).toBe('923456783');
    expect(formatOrgNumber('923456783')).toBe('923 456 783');
  });
});

describe('parseBrregResponse', () => {
  it('pre-fills name, form and address of an active business', () => {
    expect(parseBrregResponse(200, active)).toEqual({
      status: 'active',
      entity: {
        orgNumber: '923456783',
        name: 'MAMA AFRIKA KJØKKEN AS',
        formCode: 'AS',
        form: 'AS',
        formDescription: 'Aksjeselskap',
        address: 'Storgata 1',
        postalCode: '0155',
        city: 'Oslo',
      },
    });
  });

  it('falls back to the postal address and maps unknown forms to "other"', () => {
    const result = parseBrregResponse(200, {
      ...active,
      organisasjonsform: { kode: 'FLI', beskrivelse: 'Forening/lag/innretning' },
      forretningsadresse: undefined,
      postadresse: { adresse: ['Postboks 5'], postnummer: '0101', poststed: 'OSLO' },
    });
    expect(result).toMatchObject({
      status: 'active',
      entity: { form: 'other', formCode: 'FLI', address: 'Postboks 5' },
    });
  });

  it('rejects deleted, bankrupt, dissolving and unknown businesses', () => {
    expect(parseBrregResponse(404, null)).toEqual({ status: 'not_found' });
    expect(parseBrregResponse(410, { slettedato: '2020-01-01' })).toEqual({ status: 'deleted' });
    expect(parseBrregResponse(200, { ...active, slettedato: '2020-01-01' })).toEqual({
      status: 'deleted',
    });
    expect(parseBrregResponse(200, { ...active, konkurs: true })).toEqual({ status: 'bankrupt' });
    expect(parseBrregResponse(200, { ...active, underAvvikling: true })).toEqual({
      status: 'dissolving',
    });
    expect(
      parseBrregResponse(200, { ...active, underTvangsavviklingEllerTvangsopplosning: true }),
    ).toEqual({ status: 'dissolving' });
  });

  it('treats server errors and odd bodies as "unavailable" (try again later)', () => {
    expect(parseBrregResponse(500, null)).toEqual({ status: 'unavailable' });
    expect(parseBrregResponse(200, 'not json')).toEqual({ status: 'unavailable' });
    expect(parseBrregResponse(200, {})).toEqual({ status: 'unavailable' });
  });
});

describe('names', () => {
  it('suggests a friendly display name', () => {
    expect(suggestDisplayName('MAMA AFRIKA KJØKKEN AS')).toBe('Mama Afrika Kjøkken');
    expect(suggestDisplayName('ADDIS INJERA TESFAYE')).toBe('Addis Injera Tesfaye');
    expect(titleCase('SØR-ODAL')).toBe('Sør-Odal');
    expect(titleCase('JOLLOF & CO DA')).toBe('Jollof & Co DA');
  });
});
