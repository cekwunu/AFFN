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
  subtractOre,
  type BasisPoints,
  type Ore,
} from './money';

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
 * The rule in force: the most specific scope that has a rule effective at `at`
 * (vendor → product category → event → organization), and within it the latest effective_from.
 */
export function resolveCommissionRule<R extends CommissionRule>(
  rules: readonly R[],
  {
    vendorId,
    categoryId = null,
    eventId,
    at = new Date(),
  }: { vendorId?: string | null; categoryId?: string | null; eventId: string; at?: Date },
): R | null {
  const time = at.getTime();
  const applies = (rule: R): boolean => {
    if (new Date(rule.effectiveFrom).getTime() > time) return false;
    if (rule.eventId !== null && rule.eventId !== eventId) return false;
    switch (rule.scope) {
      case 'vendor':
        return !!vendorId && rule.vendorId === vendorId;
      case 'category':
        return !!categoryId && rule.categoryId === categoryId;
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

/** Splits one order's gross amount. */
export function commissionBreakdown(
  gross: Ore,
  rule: Pick<CommissionRule, 'type' | 'rateBp' | 'fixedOre'>,
): CommissionBreakdown {
  const percentage =
    rule.type === 'fixed' ? ore(0) : percentOf(gross, (rule.rateBp ?? 0) as BasisPoints);
  const fixed = rule.type === 'percentage' ? ore(0) : ore(rule.fixedOre ?? 0);
  const commission = addOre(percentage, fixed);
  const mva = percentOf(commission, MVA_STANDARD_RATE);
  const platformFee = addOre(commission, mva);
  return { gross, commission, mva, platformFee, vendorPayout: subtractOre(gross, platformFee) };
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
