import 'server-only';
import { serverEnv } from '@/lib/env.server';
import { decodeLinkToken, encodeLinkToken, verify, type LinkPayload } from './mock-signing';
import type { PaymentProvider, VerifiedWebhookEvent } from './provider';

/**
 * Temporary stand-in for a payment provider (replaced in Prompt 09). Its "checkout" is a page in
 * the app (/pay/mock/[token]); paying there sends a signed webhook through the same path a real
 * provider's webhook takes. It moves no money.
 */
const LINK_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function mockSecret(): string {
  if (serverEnv.MOCK_PAYMENT_SECRET) return serverEnv.MOCK_PAYMENT_SECRET;
  if (serverEnv.RATE_LIMIT_SECRET) return `mock-payments:${serverEnv.RATE_LIMIT_SECRET}`;
  if (process.env.NODE_ENV === 'production') throw new Error('MOCK_PAYMENT_SECRET is not set.');
  return 'development-only';
}

export function readMockLink(token: string): LinkPayload | null {
  return decodeLinkToken(token, mockSecret());
}

export const mockProvider: PaymentProvider = {
  name: 'mock',

  async createPaymentLink(request) {
    const token = encodeLinkToken({ ...request, exp: Date.now() + LINK_TTL_MS }, mockSecret());
    const origin = new URL(request.returnUrl).origin;
    return { url: `${origin}/pay/mock/${token}` };
  },

  async verifyWebhook(rawBody, signature) {
    if (!verify(rawBody, signature, mockSecret())) return null;
    try {
      return JSON.parse(rawBody) as VerifiedWebhookEvent;
    } catch {
      return null;
    }
  },
};
