/**
 * Commission maths (PRD §6). AFFN's fee is "X % + mva": commission per order, rounded half-up to
 * whole øre, plus 25 % mva on the commission, also rounded per order. Never applied to totals.
 */
import {
  MVA_STANDARD_RATE,
  addOre,
  formatOre,
  ore,
  percentOf,
  roundHalfUp,
  subtractOre,
  type BasisPoints,
  type Ore,
} from './index';

export type CommissionScope = 'vendor' | 'category' | 'event' | 'organization';
export type CommissionType = 'percentage' | 'fixed' | 'hybrid';

export interface CommissionRule {
  scope: CommissionScope;
  type: CommissionType;
  /** Percentage part in basis points (1000 = 10 %). */
  rateBp: number | null;
  /** Fixed part per order, in øre. */
  fixedOre: number | null;
  eventId: string | null;
  categoryId: string | null;
  vendorId: string | null;
  effectiveFrom: string | Date;
}

const PRECEDENCE: CommissionScope[] = ['vendor', 'category', 'event', 'organization'];

/**
 * The rule in force for one order (PRD §6): the most specific scope that has a rule effective at
 * `at` — vendor → product category → event → organization — and within a scope the latest
 * effective_from. A category rule applies only when every item in the order belongs to that one
 * category (owner decision P09); mixed orders fall through to the event rule.
 */
export function resolveCommissionRule<R extends CommissionRule>(
  rules: readonly R[],
  {
    vendorId,
    categoryIds = [],
    eventId,
    at = new Date(),
  }: {
    vendorId?: string | null;
    /** Product category of each item in the order (null for uncategorised items). */
    categoryIds?: readonly (string | null)[];
    eventId: string;
    at?: Date;
  },
): R | null {
  const time = at.getTime();
  const orderCategory =
    categoryIds.length > 0 && categoryIds.every((c) => c !== null && c === categoryIds[0])
      ? categoryIds[0]!
      : null;
  const applies = (rule: R): boolean => {
    if (new Date(rule.effectiveFrom).getTime() > time) return false;
    if (rule.eventId !== null && rule.eventId !== eventId) return false;
    switch (rule.scope) {
      case 'vendor':
        return !!vendorId && rule.vendorId === vendorId;
      case 'category':
        return orderCategory !== null && rule.categoryId === orderCategory;
      case 'event':
        return rule.eventId === eventId;
      case 'organization':
        return true;
    }
  };
  for (const scope of PRECEDENCE) {
    const candidates = rules
      .filter((rule) => rule.scope === scope && applies(rule))
      .sort((a, b) => new Date(b.effectiveFrom).getTime() - new Date(a.effectiveFrom).getTime());
    if (candidates[0]) return candidates[0];
  }
  return null;
}

export interface CommissionBreakdown {
  gross: Ore;
  commission: Ore;
  mva: Ore;
  /** Commission + mva: what the PSP withholds for AFFN. */
  platformFee: Ore;
  vendorPayout: Ore;
}

/**
 * Splits one order's gross amount (PRD §6): commission (percentage, fixed or both) rounded
 * half-up to whole øre, then 25 % mva on the commission, also rounded half-up. Calculated per
 * order, never on a total. Throws when the fee would exceed a sale, so checkout can refuse it.
 */
export function calculateCommission(
  gross: Ore,
  rule: Pick<CommissionRule, 'type' | 'rateBp' | 'fixedOre'>,
): CommissionBreakdown {
  const sign = gross < 0 ? -1 : 1;
  const percentage =
    rule.type === 'fixed' ? ore(0) : percentOf(gross, (rule.rateBp ?? 0) as BasisPoints);
  const fixed = rule.type === 'percentage' ? ore(0) : ore(sign * (rule.fixedOre ?? 0));
  const commission = addOre(percentage, fixed);
  const mva = percentOf(commission, MVA_STANDARD_RATE);
  const platformFee = addOre(commission, mva);
  if (Math.abs(platformFee) > Math.abs(gross)) {
    throw new RangeError(`Platform fee ${platformFee} exceeds the order amount ${gross}`);
  }
  return { gross, commission, mva, platformFee, vendorPayout: subtractOre(gross, platformFee) };
}

/**
 * AFFN's fee reversed on a refund, pro rata to the refunded share of the payment (PRD §5),
 * rounded half-up. A full refund reverses exactly the fee that was withheld.
 */
export function proRataFeeReversal(platformFee: Ore, paymentAmount: Ore, refundAmount: Ore): Ore {
  if (paymentAmount <= 0) throw new RangeError('Payment amount must be positive');
  if (refundAmount <= 0 || refundAmount > paymentAmount) {
    throw new RangeError(`Refund ${refundAmount} must be between 1 and ${paymentAmount}`);
  }
  if (refundAmount === paymentAmount) return platformFee;
  return ore(
    Number(roundHalfUp(BigInt(platformFee) * BigInt(refundAmount), BigInt(paymentAmount))),
  );
}

/** "10 %" or "12,5 %" from basis points, with a non-breaking space before the sign. */
export function formatPercent(rateBp: number): string {
  const whole = Math.trunc(rateBp / 100);
  const fraction = (rateBp % 100).toString().padStart(2, '0').replace(/0+$/, '');
  return `${whole}${fraction ? `,${fraction}` : ''} %`;
}

/**
 * The commission as written in the vendor agreement: "10 % + mva",
 * "kr 5,00 per ordre + mva" or "10 % + kr 5,00 per ordre + mva".
 */
export function formatCommissionTerms(
  rule: Pick<CommissionRule, 'type' | 'rateBp' | 'fixedOre'>,
  perOrder: string,
): string {
  const parts: string[] = [];
  if (rule.type !== 'fixed') parts.push(formatPercent(rule.rateBp ?? 0));
  if (rule.type !== 'percentage') parts.push(`${formatOre(ore(rule.fixedOre ?? 0))} ${perOrder}`);
  return `${parts.join(' + ')} + mva`;
}

/** "10", "12,5" or "12.5" (per cent) as basis points; null unless 0–100 with ≤ 2 decimals. */
export function parsePercent(input: string): number | null {
  const match = /^(\d{1,3})(?:[.,](\d{1,2}))?$/.exec(input.trim().replace(/\s*%$/, ''));
  if (!match) return null;
  const bp = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
  return bp <= 10_000 ? bp : null;
}
