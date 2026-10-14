import { describe, expect, it } from 'vitest';
import {
  contactSchema,
  cuisineCountryOptions,
  documentsComplete,
  fieldErrors,
  isFoodCategory,
  missingSteps,
  normalizeHandle,
  normalizePhone,
  normalizeUrl,
  profileSchema,
  resumeStep,
  stallSchema,
} from './application';

describe('phone numbers (+47)', () => {
  it('normalises Norwegian numbers', () => {
    expect(normalizePhone('40000001')).toBe('+47 400 00 001');
    expect(normalizePhone('+47 400 00 001')).toBe('+47 400 00 001');
    expect(normalizePhone('0047 22-33-44-55')).toBe('+47 223 34 455');
    expect(normalizePhone('(+47) 91 23 45 67')).toBe('+47 912 34 567');
  });

  it('rejects other numbers', () => {
    expect(normalizePhone('4000000')).toBeNull(); // 7 digits
    expect(normalizePhone('+46 70 123 45 67')).toBeNull(); // Swedish
    expect(normalizePhone('10000000')).toBeNull(); // cannot start with 0 or 1
    expect(normalizePhone('4000000a')).toBeNull();
  });
});

describe('links and handles', () => {
  it('adds https and rejects non-addresses', () => {
    expect(normalizeUrl('mamaafrika.no')).toBe('https://mamaafrika.no/');
    expect(normalizeUrl('http://example.com/menu')).toBe('http://example.com/menu');
    expect(normalizeUrl('javascript:alert(1)')).toBeNull();
    expect(normalizeUrl('not a site')).toBeNull();
    expect(normalizeUrl('')).toBeNull();
  });

  it('accepts @handles and profile links', () => {
    expect(normalizeHandle('@mama.afrika')).toBe('mama.afrika');
    expect(normalizeHandle('https://www.instagram.com/mama_afrika/')).toBe('mama_afrika');
    expect(normalizeHandle('has space')).toBeNull();
  });
});

describe('step schemas', () => {
  it('contact: name, email and +47 phone', () => {
    const ok = contactSchema.safeParse({
      contactName: ' Ada Okafor ',
      contactEmail: 'Ada@Example.no',
      contactPhone: '400 00 001',
    });
    expect(ok.success && ok.data).toEqual({
      contactName: 'Ada Okafor',
      contactEmail: 'ada@example.no',
      contactPhone: '+47 400 00 001',
    });
    const bad = contactSchema.safeParse({ contactName: 'A', contactEmail: 'x', contactPhone: '1' });
    expect(bad.success).toBe(false);
    expect(fieldErrors(bad.error!)).toEqual({
      contactName: 'too_short',
      contactEmail: 'email',
      contactPhone: 'phone',
    });
  });

  it('profile: cuisine country is required for food vendors only', () => {
    const base = {
      displayName: 'Mama Afrika',
      description: 'Hjemmelaget nigeriansk mat fra Lagos.',
      websiteUrl: '',
      instagramHandle: '@mama',
      facebookUrl: '',
      tiktokHandle: '',
      cuisineCountry: '',
    };
    const food = profileSchema.safeParse({ ...base, category: 'hot-food' });
    expect(food.success).toBe(false);
    expect(fieldErrors(food.error!)).toEqual({ cuisineCountry: 'required' });
    const crafts = profileSchema.safeParse({ ...base, category: 'fashion-crafts' });
    expect(crafts.success && crafts.data.instagramHandle).toBe('mama');
    expect(
      profileSchema.safeParse({ ...base, category: 'hot-food', cuisineCountry: 'NO' }).success,
    ).toBe(false);
  });

  it('stall: checkboxes and optional zone', () => {
    const ok = stallSchema.safeParse({
      stallTypeId: '52000000-0000-4000-8000-000000000001',
      needsPower: 'on',
      preferredZone: '',
    });
    expect(ok.success && ok.data).toEqual({
      stallTypeId: '52000000-0000-4000-8000-000000000001',
      needsPower: true,
      needsWater: false,
    });
  });
});

describe('progress', () => {
  const facts = { hasAgreement: false, documentsOk: false };

  it('resumes at the first unfinished step', () => {
    expect(resumeStep({ completed: ['business'] }, facts)).toBe('contact');
    expect(resumeStep({ completed: ['business', 'contact', 'profile', 'stall'] }, facts)).toBe(
      'documents',
    );
    expect(
      resumeStep(
        { completed: ['business', 'contact', 'profile', 'stall'] },
        { hasAgreement: true, documentsOk: true },
      ),
    ).toBe('review');
    expect(missingSteps({}, facts)).toEqual([
      'business',
      'contact',
      'profile',
      'stall',
      'documents',
      'agreement',
    ]);
  });

  it('food vendors need a Mattilsynet document that is not rejected', () => {
    expect(isFoodCategory('street-food')).toBe(true);
    expect(isFoodCategory('fashion-crafts')).toBe(false);
    expect(documentsComplete('fashion-crafts', [])).toBe(true);
    expect(documentsComplete('hot-food', [{ document_type: 'insurance', status: 'pending' }])).toBe(
      false,
    );
    expect(
      documentsComplete('hot-food', [
        { document_type: 'mattilsynet_registration', status: 'rejected' },
      ]),
    ).toBe(false);
    expect(
      documentsComplete('hot-food', [
        { document_type: 'mattilsynet_registration', status: 'pending' },
      ]),
    ).toBe(true);
  });

  it('lists cuisine countries by name in the chosen language', () => {
    const nb = cuisineCountryOptions('nb');
    expect(nb).toHaveLength(54);
    expect(nb.find((c) => c.value === 'NG')?.label).toBe('Nigeria');
    expect(nb.find((c) => c.value === 'ET')?.label).toBe('Etiopia');
    expect(cuisineCountryOptions('en').find((c) => c.value === 'ET')?.label).toBe('Ethiopia');
  });
});
