/**
 * Product catalogue rules shared by forms, server actions and the public menu (CAT-01).
 */
import { z } from 'zod';
import { kronerToOre } from '@/lib/money';

/** The 14 allergens of EU regulation 1169/2011 annex II, in the regulation's order. */
export const ALLERGENS = [
  'gluten',
  'crustaceans',
  'eggs',
  'fish',
  'peanuts',
  'soybeans',
  'milk',
  'nuts',
  'celery',
  'mustard',
  'sesame',
  'sulphites',
  'lupin',
  'molluscs',
] as const;
export type Allergen = (typeof ALLERGENS)[number];

export const DIETARY_TAGS = [
  'vegetarian',
  'vegan',
  'halal',
  'gluten_free',
  'dairy_free',
  'spicy',
] as const;
export type DietaryTag = (typeof DIETARY_TAGS)[number];

/** Mva rates in basis points: 0 % (default, vendors not registered), 15 % food, 25 %. */
export const MVA_RATES = [0, 1500, 2500] as const;

export const PRODUCT_NAME_MAX = 80;
export const PRODUCT_IMAGE_MAX_PX = 1200;

/** Allergens in the regulation's order, duplicates and unknown values removed. */
export function sortAllergens(values: readonly string[]): Allergen[] {
  return ALLERGENS.filter((a) => values.includes(a));
}

/** "Kopi av Jollof" for a duplicated product, kept within the name limit. */
export function duplicateName(name: string, prefix: string): string {
  return `${prefix} ${name}`.slice(0, PRODUCT_NAME_MAX).trim();
}

const list = <T extends readonly [string, ...string[]]>(values: T) =>
  z.preprocess(
    (value) => (Array.isArray(value) ? value : value == null || value === '' ? [] : [value]),
    z.array(z.enum(values, 'invalid')),
  );

/**
 * Product form. Every product declares its allergens, or confirms it contains none of the 14
 * (food safety: allergens on every product). Mva above 0 % only for mva-registered vendors.
 */
export function productSchema({ mvaRegistered }: { mvaRegistered: boolean }) {
  return z
    .object({
      name: z.string().trim().min(2, 'too_short').max(PRODUCT_NAME_MAX, 'too_long'),
      description: z.string().trim().max(400, 'too_long'),
      price: z.string().transform((value, ctx) => {
        try {
          const ore = kronerToOre(value.trim());
          if (ore <= 0 || ore > 10_000_00) throw new RangeError('range');
          return ore;
        } catch {
          ctx.addIssue({ code: 'custom', message: 'price' });
          return z.NEVER;
        }
      }),
      categoryId: z.preprocess((v) => (v === '' ? null : v), z.uuid('required').nullable()),
      dietaryTags: list(DIETARY_TAGS),
      allergens: list(ALLERGENS),
      noAllergens: z.preprocess((v) => v === 'on' || v === 'true' || v === true, z.boolean()),
      mvaRateBp: z.coerce
        .number()
        .refine((v) => (MVA_RATES as readonly number[]).includes(v), 'mva'),
    })
    .superRefine((value, ctx) => {
      if (value.allergens.length === 0 && !value.noAllergens) {
        ctx.addIssue({ code: 'custom', path: ['allergens'], message: 'allergens' });
      }
      if (value.allergens.length > 0 && value.noAllergens) {
        ctx.addIssue({ code: 'custom', path: ['allergens'], message: 'allergensConflict' });
      }
      if (value.mvaRateBp !== 0 && !mvaRegistered) {
        ctx.addIssue({ code: 'custom', path: ['mvaRateBp'], message: 'mvaNotRegistered' });
      }
    })
    .transform((value) => ({
      name: value.name,
      description: value.description,
      price: value.price,
      categoryId: value.categoryId,
      mvaRateBp: value.mvaRateBp,
      allergens: sortAllergens(value.allergens),
      dietaryTags: DIETARY_TAGS.filter((t) => value.dietaryTags.includes(t)),
    }));
}

export type ProductInput = z.output<ReturnType<typeof productSchema>>;
