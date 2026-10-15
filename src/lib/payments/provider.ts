import 'server-only';
import { serverEnv } from '@/lib/env.server';
import { mockProvider } from './mock';

/**
 * The only way the platform talks to a payment provider (CLAUDE.md). Prompt 09 adds the customer
 * payment operations (onboardVendor, createPayment, refund, releasePayout, …) and a real
 * provider; until then the mock provider stands in.
 */
export type ProviderName = 'mock' | 'stripe' | 'swedbank';

/** A payment into AFFN's own account (stall fees: STL-04). */
export interface PaymentLinkRequest {
  /** What is being paid, e.g. a stall fee. */
  kind: 'stall_fee';
  /** Our id for the thing being paid (stall fee id). */
  reference: string;
  amountOre: number;
  description: string;
  /** Where the payer comes back to after paying. */
  returnUrl: string;
}

export interface PaymentLink {
  url: string;
}

/** A provider event after its signature has been verified. */
export interface VerifiedWebhookEvent {
  id: string;
  type: 'payment_link.paid';
  kind: 'stall_fee';
  reference: string;
  providerPaymentId: string;
  amountOre: number;
}

export interface PaymentProvider {
  readonly name: ProviderName;
  createPaymentLink(request: PaymentLinkRequest): Promise<PaymentLink>;
  /** Verifies the signature; null when the payload is not authentic. */
  verifyWebhook(rawBody: string, signature: string | null): Promise<VerifiedWebhookEvent | null>;
}

export function getPaymentProvider(
  name: ProviderName = serverEnv.PAYMENT_PROVIDER,
): PaymentProvider {
  switch (name) {
    case 'mock':
      return mockProvider;
    default:
      throw new Error(`Payment provider "${name}" is not available yet (Prompt 09).`);
  }
}
