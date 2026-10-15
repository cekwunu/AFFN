import { describe, expect, it } from 'vitest';
import { providerContract } from '../contract';
import { createMockProvider } from './provider';
import { memoryStore } from './store';

const token = (url: string) => url.split('/pay/mock/')[1]!;

providerContract('MockProvider', async () => {
  const provider = createMockProvider({ secret: 'contract-test-secret', store: memoryStore() });
  return {
    provider,
    origin: 'http://localhost:3000',
    async completeOnboarding(url, outcome) {
      const result = await provider.completeOnboarding(token(url), outcome);
      if (!result) throw new Error('Invalid onboarding link');
      return result.delivery;
    },
    async pay(url, outcome, method) {
      const result = await provider.completePayment(token(url), { result: outcome, method });
      if (!result) throw new Error('Invalid payment link');
      return result.delivery;
    },
  };
});

describe('MockProvider disputes (TEST MODE)', () => {
  it('reports a dispute as a signed webhook with a stable id', async () => {
    const provider = createMockProvider({ secret: 'contract-test-secret', store: memoryStore() });
    const opened = provider.simulateDispute({
      providerPaymentId: 'mock_pay_1',
      amountOre: 5_000,
      outcome: 'open',
    });
    const closed = provider.simulateDispute({
      providerPaymentId: 'mock_pay_1',
      amountOre: 5_000,
      outcome: 'lost',
    });
    const a = await provider.handleWebhook(opened.rawBody, opened.headers);
    const b = await provider.handleWebhook(closed.rawBody, closed.headers);
    expect(a).toMatchObject({
      type: 'dispute.opened',
      providerPaymentId: 'mock_pay_1',
      outcome: 'open',
    });
    expect(b).toMatchObject({ type: 'dispute.closed', outcome: 'lost' });
    expect(
      a!.type === 'dispute.opened' && b!.type === 'dispute.closed' && a!.providerDisputeId,
    ).toBe(b!.type === 'dispute.closed' && b!.providerDisputeId);
    const forged = new Headers({ 'x-affn-signature': 'nope' });
    await expect(provider.handleWebhook(opened.rawBody, forged)).resolves.toBeNull();
  });
});
