import 'server-only';
import { serverEnv } from '@/lib/env.server';
import { createMockProvider, type MockProvider } from './mock/provider';
import { supabaseMockStore } from './mock/supabase-store';
import type { PaymentProvider, ProviderName } from './provider';
import { createStripeConnectProvider } from './providers/stripe-connect';
import { createSwedbankPayProvider } from './providers/swedbank-pay';

/** Secret that signs the mock provider's hosted pages and webhooks. */
export function mockSecret(): string {
  if (serverEnv.MOCK_PAYMENT_SECRET) return serverEnv.MOCK_PAYMENT_SECRET;
  if (serverEnv.RATE_LIMIT_SECRET) return `mock-payments:${serverEnv.RATE_LIMIT_SECRET}`;
  if (process.env.NODE_ENV === 'production') throw new Error('MOCK_PAYMENT_SECRET is not set.');
  return 'development-only';
}

let mock: MockProvider | null = null;
export function getMockProvider(): MockProvider {
  mock ??= createMockProvider({ secret: mockSecret(), store: supabaseMockStore() });
  return mock;
}

/** The provider chosen by PAYMENT_PROVIDER (mock by default). */
export function getPaymentProvider(
  name: ProviderName = serverEnv.PAYMENT_PROVIDER,
): PaymentProvider {
  switch (name) {
    case 'mock':
      return getMockProvider();
    case 'stripe':
      return createStripeConnectProvider();
    case 'swedbank':
      return createSwedbankPayProvider();
  }
}
