/**
 * The only way the platform talks to a payment provider (PRD §5, CLAUDE.md). Every PSP —
 * the mock used in development and tests, Stripe Connect, Swedbank Pay — implements this
 * interface, and the same contract tests (./contract.ts) run against each of them.
 *
 * All amounts are integer øre in NOK. Types only: no server code, so tests can import it.
 */

export type ProviderName = 'mock' | 'stripe' | 'swedbank';
export type PaymentMethod = 'vipps' | 'card' | 'apple_pay' | 'google_pay';
export const PAYMENT_METHODS: readonly PaymentMethod[] = [
  'vipps',
  'card',
  'apple_pay',
  'google_pay',
];

/** A vendor's payment account, as the vendor portal shows it (VEN-06). */
export type VendorPaymentStatus = 'not_started' | 'pending' | 'action_required' | 'enabled';

/** Where the money (minus the platform fee) goes: a vendor's account or AFFN's own. */
export type PaymentAccount = { kind: 'vendor'; accountId: string } | { kind: 'platform' };

/** Our references, echoed back on every webhook about the payment. */
export interface PaymentMetadata {
  kind: 'order' | 'stall_fee';
  /** Order id or stall fee id. */
  reference: string;
  organizationId: string;
  [key: string]: string;
}

export interface OnboardVendorInput {
  /** Our event participation; one payment account per participation. */
  eventVendorId: string;
  /** Reuse the account when onboarding is resumed. */
  existingAccountId: string | null;
  businessName: string;
  orgNumber: string;
  email: string | null;
  /** Where the hosted onboarding sends the vendor back to. */
  returnUrl: string;
}

export interface OnboardVendorResult {
  accountId: string;
  /** Hosted KYC page. */
  onboardingUrl: string;
}

export interface VendorStatusResult {
  accountId: string;
  status: VendorPaymentStatus;
  /** True when the account can receive payments (selling is allowed). */
  chargesEnabled: boolean;
  /** What the provider still needs from the vendor, in its own words. */
  requirements: string[];
}

export interface CreatePaymentInput {
  amountOre: number;
  /** Withheld for AFFN: commission + mva for orders, the whole amount for AFFN's own fees. */
  platformFeeOre: number;
  account: PaymentAccount;
  /** Same key → same payment: retries never charge twice (NFR-04). */
  idempotencyKey: string;
  methods: readonly PaymentMethod[];
  description: string;
  /** Hosted payment page sends the payer here after paying (or failing). */
  returnUrl: string;
  cancelUrl: string;
  metadata: PaymentMetadata;
}

export interface CreatePaymentResult {
  providerPaymentId: string;
  /** Hosted payment page. */
  redirectUrl: string;
}

export interface RefundInput {
  providerPaymentId: string;
  amountOre: number;
  reason: string;
  idempotencyKey: string;
}

export interface RefundResult {
  providerRefundId: string;
  amountOre: number;
  /** AFFN's fee given back, pro rata to the refunded share (PRD §5). */
  platformFeeReversalOre: number;
  status: 'pending' | 'succeeded' | 'failed';
}

export interface PayoutInput {
  accountId: string;
  amountOre: number;
  idempotencyKey: string;
  /** Our settlement line id. */
  reference: string;
}

export interface PayoutResult {
  providerPayoutId: string;
  status: 'in_transit' | 'paid' | 'failed';
}

export interface SettlementTransaction {
  type: 'payment' | 'refund' | 'payout';
  providerId: string;
  /** Null for payments into AFFN's own account. */
  accountId: string | null;
  amountOre: number;
  /** Platform fee withheld (payments) or reversed (refunds, negative). */
  platformFeeOre: number;
  occurredAt: string;
  reference: string | null;
}

/** A verified provider event, in our own vocabulary. */
export type WebhookEvent =
  | {
      id: string;
      type: 'payment.succeeded';
      providerPaymentId: string;
      amountOre: number;
      platformFeeOre: number;
      /** The provider's own processing fee, paid by AFFN out of its commission (PRD §6). */
      pspFeeOre: number;
      method: PaymentMethod;
      metadata: PaymentMetadata;
    }
  | {
      id: string;
      type: 'payment.failed';
      providerPaymentId: string;
      reason: string;
      metadata: PaymentMetadata;
    }
  | { id: string; type: 'account.updated'; accountId: string; status: VendorPaymentStatus }
  | {
      id: string;
      type: 'refund.succeeded' | 'refund.failed';
      providerRefundId: string;
      providerPaymentId: string;
      amountOre: number;
      platformFeeReversalOre: number;
    }
  | {
      id: string;
      type: 'payout.paid' | 'payout.failed';
      providerPayoutId: string;
      accountId: string;
      amountOre: number;
      reason: string | null;
    };

export interface PaymentProvider {
  readonly name: ProviderName;
  /** Test mode: no real money moves; the UI shows "TEST MODE". */
  readonly testMode: boolean;
  onboardVendor(input: OnboardVendorInput): Promise<OnboardVendorResult>;
  getVendorStatus(accountId: string): Promise<VendorStatusResult>;
  createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult>;
  /** Verifies the signature and parses the event; null when it is not authentic. */
  handleWebhook(rawBody: string, headers: Headers): Promise<WebhookEvent | null>;
  refund(input: RefundInput): Promise<RefundResult>;
  releasePayout(input: PayoutInput): Promise<PayoutResult>;
  fetchSettlementReport(range: { from: Date; to: Date }): Promise<SettlementTransaction[]>;
}

/** Our payment account status column (event_vendors.psp_account_status). */
export type DbAccountStatus = 'not_started' | 'pending' | 'eligible' | 'restricted';

export const toDbStatus = (status: VendorPaymentStatus): DbAccountStatus =>
  ({
    not_started: 'not_started',
    pending: 'pending',
    action_required: 'restricted',
    enabled: 'eligible',
  })[status] as DbAccountStatus;

export const fromDbStatus = (status: DbAccountStatus): VendorPaymentStatus =>
  ({
    not_started: 'not_started',
    pending: 'pending',
    restricted: 'action_required',
    eligible: 'enabled',
  })[status] as VendorPaymentStatus;
