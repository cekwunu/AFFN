/**
 * Order maths for checkout (QR-03). Prices include mva; each line's mva is worked out from the
 * line total and rounded half-up per line, and the order totals are sums of the lines (never
 * recalculated on the total). Shared by the cart, the checkout action and its tests.
 */
import { ore, roundHalfUp, sumOre, type Ore } from '@/lib/money';

export const MAX_LINES = 30;
export const MAX_QUANTITY = 20;

export interface CartItem {
  productId: string;
  quantity: number;
}

export interface PricedProduct {
  id: string;
  name: string;
  priceOre: number;
  mvaRateBp: number;
  categoryId: string | null;
}

export interface OrderLine {
  productId: string;
  name: string;
  quantity: number;
  unitPriceOre: Ore;
  lineTotalOre: Ore;
  mvaRateBp: number;
  /** Mva contained in the line total. */
  mvaOre: Ore;
  categoryId: string | null;
}

/** Mva contained in an amount that includes mva at `rateBp`, rounded half-up. */
export function includedMva(amount: Ore, rateBp: number): Ore {
  if (rateBp === 0) return ore(0);
  return ore(Number(roundHalfUp(BigInt(amount) * BigInt(rateBp), BigInt(10_000 + rateBp))));
}

/** Merges repeated products and drops anything invalid; quantities are capped. */
export function normalizeCart(items: readonly CartItem[]): CartItem[] {
  const merged = new Map<string, number>();
  for (const item of items) {
    if (typeof item?.productId !== 'string' || !Number.isInteger(item.quantity)) continue;
    if (item.quantity <= 0) continue;
    merged.set(
      item.productId,
      Math.min(MAX_QUANTITY, (merged.get(item.productId) ?? 0) + item.quantity),
    );
  }
  return [...merged].slice(0, MAX_LINES).map(([productId, quantity]) => ({ productId, quantity }));
}

/**
 * Prices the cart from the products on sale. Throws when the cart is empty or names a product
 * that is not on sale (sold out, archived or another vendor's).
 */
export function priceCart(
  items: readonly CartItem[],
  products: readonly PricedProduct[],
): { lines: OrderLine[]; totalOre: Ore; mvaOre: Ore } {
  const cart = normalizeCart(items);
  if (cart.length === 0) throw new RangeError('empty');
  const byId = new Map(products.map((p) => [p.id, p]));
  const lines = cart.map((item): OrderLine => {
    const product = byId.get(item.productId);
    if (!product) throw new RangeError('unavailable');
    const unit = ore(product.priceOre);
    const lineTotal = ore(product.priceOre * item.quantity);
    return {
      productId: product.id,
      name: product.name,
      quantity: item.quantity,
      unitPriceOre: unit,
      lineTotalOre: lineTotal,
      mvaRateBp: product.mvaRateBp,
      mvaOre: includedMva(lineTotal, product.mvaRateBp),
      categoryId: product.categoryId,
    };
  });
  return {
    lines,
    totalOre: sumOre(lines.map((l) => l.lineTotalOre)),
    mvaOre: sumOre(lines.map((l) => l.mvaOre)),
  };
}
