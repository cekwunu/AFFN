import { describe, expect, it } from 'vitest';
import { fitWithin } from '@/lib/images/compress';
import { ALLERGENS, duplicateName, productSchema, sortAllergens } from './products';

const valid = {
  name: 'Jollof',
  description: '',
  price: '185',
  categoryId: '',
  dietaryTags: ['spicy', 'halal'],
  allergens: [],
  noAllergens: 'on',
  mvaRateBp: '0',
};

describe('productSchema (CAT-01)', () => {
  const schema = productSchema({ mvaRegistered: false });

  it('converts kroner to øre and orders tags', () => {
    expect(schema.parse({ ...valid, price: '1 234,50' })).toEqual({
      name: 'Jollof',
      description: '',
      price: 123450,
      categoryId: null,
      dietaryTags: ['halal', 'spicy'],
      allergens: [],
      mvaRateBp: 0,
    });
  });

  it('rejects bad prices', () => {
    for (const price of ['', '0', '-5', '12,345', 'abc', '20000']) {
      const result = schema.safeParse({ ...valid, price });
      expect(result.success, price).toBe(false);
    }
  });

  it('requires allergens to be declared, or confirmed absent, but not both', () => {
    const missing = schema.safeParse({ ...valid, noAllergens: undefined });
    expect(missing.error?.issues[0]).toMatchObject({ path: ['allergens'], message: 'allergens' });
    const both = schema.safeParse({ ...valid, allergens: ['milk'] });
    expect(both.error?.issues[0]?.message).toBe('allergensConflict');
    const single = schema.parse({ ...valid, noAllergens: undefined, allergens: 'sesame' });
    expect(single.allergens).toEqual(['sesame']);
    expect(schema.safeParse({ ...valid, allergens: ['peanut'] }).success).toBe(false);
  });

  it('allows mva above 0 % only for mva-registered vendors', () => {
    expect(schema.safeParse({ ...valid, mvaRateBp: '1500' }).error?.issues[0]?.message).toBe(
      'mvaNotRegistered',
    );
    const registered = productSchema({ mvaRegistered: true });
    expect(registered.parse({ ...valid, mvaRateBp: '1500' }).mvaRateBp).toBe(1500);
    expect(registered.safeParse({ ...valid, mvaRateBp: '1200' }).success).toBe(false);
  });
});

describe('allergens', () => {
  it('lists the 14 EU allergens and sorts in the regulation’s order', () => {
    expect(ALLERGENS).toHaveLength(14);
    expect(sortAllergens(['sesame', 'milk', 'gluten', 'milk', 'x'])).toEqual([
      'gluten',
      'milk',
      'sesame',
    ]);
  });
});

describe('duplicateName', () => {
  it('prefixes and keeps the name within 80 characters', () => {
    expect(duplicateName('Suya', 'Kopi av')).toBe('Kopi av Suya');
    expect(duplicateName('x'.repeat(80), 'Kopi av')).toHaveLength(80);
  });
});

describe('fitWithin', () => {
  it('scales down to the longest side and never enlarges', () => {
    expect(fitWithin(4032, 3024, 1200)).toEqual({ width: 1200, height: 900 });
    expect(fitWithin(3000, 4000, 1200)).toEqual({ width: 900, height: 1200 });
    expect(fitWithin(800, 600, 1200)).toEqual({ width: 800, height: 600 });
  });
});
