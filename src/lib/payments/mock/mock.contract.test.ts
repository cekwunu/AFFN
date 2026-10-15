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
