/**
 * Mock payment provider (PRD §11): implements the whole PaymentProvider interface without moving
 * money. Its "hosted" onboarding and payment pages live in the app (/pay/mock/[token]); each
 * action there produces a signed webhook that goes through the same processing path as a real
 * provider's. Always in test mode.
 */
import { ore, roundHalfUp } from '@/lib/money';
import { proRataFeeReversal } from '@/lib/money/commission';
import type {
  CreatePaymentInput,
  PaymentMetadata,
  PaymentMethod,
  PaymentProvider,
  WebhookEvent,
} from '../provider';
import { decodeToken, encodeToken, sign, stableId, verify } from './signing';
import type { MockStore } from './store';

/** The mock's processing fee: 2.5 % of the payment, half-up (illustrative, PRD §6). */
export function mockPspFee(amountOre: number): number {
  return Number(roundHalfUp(BigInt(amountOre) * 250n, 10_000n));
}

export const MOCK_SIGNATURE_HEADER = 'x-affn-signature';
const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type HostedToken =
  | {
      kind: 'onboarding';
      accountId: string;
      eventVendorId: string;
      businessName: string;
      returnUrl: string;
      exp: number;
    }
  | {
      kind: 'payment';
      paymentId: string;
      amountOre: number;
      platformFeeOre: number;
      accountId: string | null;
      methods: PaymentMethod[];
      description: string;
      returnUrl: string;
      cancelUrl: string;
      metadata: PaymentMetadata;
      exp: number;
    };

/** A webhook as the provider would POST it. */
export interface WebhookDelivery {
  rawBody: string;
  headers: Headers;
}

export interface MockProvider extends PaymentProvider {
  readonly name: 'mock';
  /** Reads a hosted page token; null when forged or expired. */
  readToken(token: string): HostedToken | null;
  /** The vendor finishes (or stops at) the hosted onboarding. */
  completeOnboarding(
    token: string,
    outcome: 'enabled' | 'action_required',
  ): Promise<{ delivery: WebhookDelivery; returnUrl: string } | null>;
  /** The payer completes (or fails) the hosted payment. */
  completePayment(
    token: string,
    outcome: { result: 'succeeded' | 'failed'; method: PaymentMethod },
  ): Promise<{ delivery: WebhookDelivery; returnUrl: string; paymentId: string } | null>;
}

export function createMockProvider({
  secret,
  store,
  now = () => new Date(),
}: {
  secret: string;
  store: MockStore;
  now?: () => Date;
}): MockProvider {
  const hostedUrl = (returnUrl: string, token: string) =>
    `${new URL(returnUrl).origin}/pay/mock/${token}`;
  const deliver = (event: WebhookEvent): WebhookDelivery => {
    const rawBody = JSON.stringify(event);
    return { rawBody, headers: new Headers({ [MOCK_SIGNATURE_HEADER]: sign(rawBody, secret) }) };
  };
  const eventId = () => `evt_mock_${crypto.randomUUID()}`;
  const readToken = (token: string) => decodeToken<HostedToken>(token, secret, now().getTime());

  const validatePayment = (input: CreatePaymentInput) => {
    if (!Number.isSafeInteger(input.amountOre) || input.amountOre <= 0) {
      throw new RangeError('Payment amount must be a positive whole number of øre');
    }
    if (
      !Number.isSafeInteger(input.platformFeeOre) ||
      input.platformFeeOre < 0 ||
      input.platformFeeOre > input.amountOre
    ) {
      throw new RangeError('Platform fee must be between 0 and the amount');
    }
    if (input.account.kind === 'platform' && input.platformFeeOre !== input.amountOre) {
      throw new RangeError('A payment to the platform account is all platform fee');
    }
    if (input.methods.length === 0) throw new RangeError('At least one payment method');
  };

  return {
    name: 'mock',
    testMode: true,
    readToken,

    async onboardVendor(input) {
      const accountId = input.existingAccountId ?? stableId('mock_acct', input.eventVendorId);
      const existing = await store.getAccount(accountId);
      if (!existing) await store.putAccount({ id: accountId, status: 'pending' });
      const token = encodeToken<HostedToken>(
        {
          kind: 'onboarding',
          accountId,
          eventVendorId: input.eventVendorId,
          businessName: input.businessName,
          returnUrl: input.returnUrl,
          exp: now().getTime() + TOKEN_TTL_MS,
        },
        secret,
      );
      return { accountId, onboardingUrl: hostedUrl(input.returnUrl, token) };
    },

    async getVendorStatus(accountId) {
      const account = await store.getAccount(accountId);
      const status = account?.status ?? 'not_started';
      return {
        accountId,
        status,
        chargesEnabled: status === 'enabled',
        requirements: status === 'action_required' ? ['identity_document'] : [],
      };
    },

    async createPayment(input) {
      validatePayment(input);
      if (input.account.kind === 'vendor') {
        const account = await store.getAccount(input.account.accountId);
        if (account?.status !== 'enabled') {
          throw new Error('The vendor account cannot receive payments yet');
        }
      }
      const paymentId = stableId('mock_pay', input.idempotencyKey);
      const existing = await store.getPayment(paymentId);
      if (existing && existing.amountOre !== input.amountOre) {
        throw new Error('Idempotency key reused with a different amount');
      }
      if (!existing) {
        await store.putPayment({
          id: paymentId,
          amountOre: input.amountOre,
          platformFeeOre: input.platformFeeOre,
          accountId: input.account.kind === 'vendor' ? input.account.accountId : null,
          status: 'pending',
          method: null,
          metadata: input.metadata,
          at: now().toISOString(),
        });
      }
      const token = encodeToken<HostedToken>(
        {
          kind: 'payment',
          paymentId,
          amountOre: input.amountOre,
          platformFeeOre: input.platformFeeOre,
          accountId: input.account.kind === 'vendor' ? input.account.accountId : null,
          methods: [...input.methods],
          description: input.description,
          returnUrl: input.returnUrl,
          cancelUrl: input.cancelUrl,
          metadata: input.metadata,
          exp: now().getTime() + TOKEN_TTL_MS,
        },
        secret,
      );
      return { providerPaymentId: paymentId, redirectUrl: hostedUrl(input.returnUrl, token) };
    },

    async handleWebhook(rawBody, headers) {
      if (!verify(rawBody, headers.get(MOCK_SIGNATURE_HEADER), secret)) return null;
      try {
        const event = JSON.parse(rawBody) as WebhookEvent;
        return typeof event?.id === 'string' && typeof event.type === 'string' ? event : null;
      } catch {
        return null;
      }
    },

    async refund(input) {
      const payment = await store.getPayment(input.providerPaymentId);
      if (!payment || payment.status !== 'succeeded') throw new Error('Payment cannot be refunded');
      const refundId = stableId('mock_re', input.idempotencyKey);
      const existing = await store.getRefund(refundId);
      if (existing) {
        return {
          providerRefundId: existing.id,
          amountOre: existing.amountOre,
          platformFeeReversalOre: existing.platformFeeReversalOre,
          status: 'succeeded',
        };
      }
      const previous = await store.refundsFor(payment.id);
      const refunded = previous.reduce((sum, r) => sum + r.amountOre, 0);
      const reversed = previous.reduce((sum, r) => sum + r.platformFeeReversalOre, 0);
      if (input.amountOre <= 0 || refunded + input.amountOre > payment.amountOre) {
        throw new RangeError('Refund exceeds what is left of the payment');
      }
      // The last refund gives back whatever fee is left, so the reversals add up exactly.
      const reversal =
        refunded + input.amountOre === payment.amountOre
          ? payment.platformFeeOre - reversed
          : Math.min(
              proRataFeeReversal(
                ore(payment.platformFeeOre),
                ore(payment.amountOre),
                ore(input.amountOre),
              ),
              payment.platformFeeOre - reversed,
            );
      await store.putRefund({
        id: refundId,
        paymentId: payment.id,
        amountOre: input.amountOre,
        platformFeeReversalOre: reversal,
        at: now().toISOString(),
      });
      return {
        providerRefundId: refundId,
        amountOre: input.amountOre,
        platformFeeReversalOre: reversal,
        status: 'succeeded',
      };
    },

    async releasePayout(input) {
      if (!Number.isSafeInteger(input.amountOre) || input.amountOre <= 0) {
        throw new RangeError('Payout must be a positive whole number of øre');
      }
      const account = await store.getAccount(input.accountId);
      if (account?.status !== 'enabled') throw new Error('The vendor account cannot be paid out');
      const payoutId = stableId('mock_po', input.idempotencyKey);
      if (!(await store.getPayout(payoutId))) {
        await store.putPayout({
          id: payoutId,
          accountId: input.accountId,
          amountOre: input.amountOre,
          reference: input.reference,
          at: now().toISOString(),
        });
      }
      return { providerPayoutId: payoutId, status: 'paid' };
    },

    async fetchSettlementReport(range) {
      return store.transactions(range);
    },

    async completeOnboarding(token, outcome) {
      const payload = readToken(token);
      if (payload?.kind !== 'onboarding') return null;
      await store.putAccount({ id: payload.accountId, status: outcome });
      return {
        returnUrl: payload.returnUrl,
        delivery: deliver({
          id: eventId(),
          type: 'account.updated',
          accountId: payload.accountId,
          status: outcome,
        }),
      };
    },

    async completePayment(token, { result, method }) {
      const payload = readToken(token);
      if (payload?.kind !== 'payment' || !payload.methods.includes(method)) return null;
      const stored = await store.getPayment(payload.paymentId);
      if (stored && stored.status !== 'succeeded') {
        await store.putPayment({
          ...stored,
          status: result,
          method,
          at: now().toISOString(),
        });
      }
      const event: WebhookEvent =
        result === 'succeeded'
          ? {
              id: eventId(),
              type: 'payment.succeeded',
              providerPaymentId: payload.paymentId,
              amountOre: payload.amountOre,
              platformFeeOre: payload.platformFeeOre,
              pspFeeOre: mockPspFee(payload.amountOre),
              method,
              metadata: payload.metadata,
            }
          : {
              id: eventId(),
              type: 'payment.failed',
              providerPaymentId: payload.paymentId,
              reason: 'card_declined',
              metadata: payload.metadata,
            };
      return {
        paymentId: payload.paymentId,
        returnUrl: result === 'succeeded' ? payload.returnUrl : payload.cancelUrl,
        delivery: deliver(event),
      };
    },
  };
}
