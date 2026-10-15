import { describe, expect, it } from 'vitest';
import { ore } from '@/lib/money';
import { includedMva, normalizeCart, priceCart, type PricedProduct } from './cart';

const products: PricedProduct[] = [
  { id: 'jollof', name: 'Jollof', priceOre: 18_500, mvaRateBp: 0, categoryId: 'mains' },
  { id: 'zobo', name: 'Zobo', priceOre: 4_500, mvaRateBp: 0, categoryId: 'drinks' },
  { id: 'suya', name: 'Suya', priceOre: 15_500, mvaRateBp: 1_500, categoryId: 'street' },
  { id: 'cola', name: 'Cola', priceOre: 3_333, mvaRateBp: 2_500, categoryId: 'drinks' },
];

describe('includedMva', () => {
  it('extracts the mva contained in a price, half-up', () => {
    expect(includedMva(ore(12_500), 2_500)).toBe(2_500); // kr 125 incl. 25 % → kr 25
    expect(includedMva(ore(11_500), 1_500)).toBe(1_500); // kr 115 incl. 15 % → kr 15
    expect(includedMva(ore(3_333), 2_500)).toBe(667); // 666,6 → 667
    expect(includedMva(ore(10_000), 0)).toBe(0);
  });
});

describe('normalizeCart', () => {
  it('merges repeats, drops invalid lines and caps quantities', () => {
    expect(
      normalizeCart([
        { productId: 'a', quantity: 2 },
        { productId: 'a', quantity: 1 },
        { productId: 'b', quantity: 0 },
        { productId: 'c', quantity: 1.5 },
        { productId: 'd', quantity: 500 },
      ]),
    ).toEqual([
      { productId: 'a', quantity: 3 },
      { productId: 'd', quantity: 20 },
    ]);
  });
});

describe('priceCart', () => {
  it('prices each line from the products, with mva per line, and sums the lines', () => {
    const result = priceCart(
      [
        { productId: 'jollof', quantity: 2 },
        { productId: 'suya', quantity: 1 },
        { productId: 'cola', quantity: 3 },
      ],
      products,
    );
    expect(result.lines.map((l) => [l.productId, l.lineTotalOre, l.mvaOre])).toEqual([
      ['jollof', 37_000, 0],
      ['suya', 15_500, 2_022], // 15 500 × 15/115 = 2 021,7 → 2 022
      ['cola', 9_999, 2_000], // 9 999 × 25/125 = 1 999,8 → 2 000
    ]);
    expect(result.totalOre).toBe(62_499);
    expect(result.mvaOre).toBe(4_022);
  });

  it('refuses an empty cart and products that are not on sale', () => {
    expect(() => priceCart([], products)).toThrow('empty');
    expect(() => priceCart([{ productId: 'gone', quantity: 1 }], products)).toThrow('unavailable');
  });
});
