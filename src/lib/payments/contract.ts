/**
 * Provider contract (P09): one test suite every PaymentProvider must pass — the mock now, Stripe
 * Connect and Swedbank Pay in their sandboxes later (Prompt 22). A harness drives the provider's
 * hosted pages the way a vendor or payer would and hands back the webhook the provider sends.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import type { PaymentMetadata, PaymentMethod, PaymentProvider, WebhookEvent } from './provider';

export interface WebhookDelivery {
  rawBody: string;
  headers: Headers;
}

export interface ContractHarness {
  provider: PaymentProvider;
  /** Origin the hosted pages return to. */
  origin: string;
  completeOnboarding(
    onboardingUrl: string,
    outcome: 'enabled' | 'action_required',
  ): Promise<WebhookDelivery>;
  pay(
    redirectUrl: string,
    outcome: 'succeeded' | 'failed',
    method: PaymentMethod,
  ): Promise<WebhookDelivery>;
}

const metadata = (reference: string): PaymentMetadata => ({
  kind: 'order',
  reference,
  organizationId: '10000000-0000-4000-8000-000000000001',
});

export function providerContract(name: string, setup: () => Promise<ContractHarness>) {
  describe(`PaymentProvider contract: ${name}`, () => {
    let h: ContractHarness;
    let provider: PaymentProvider;
    beforeEach(async () => {
      h = await setup();
      provider = h.provider;
    });

    const parse = async (delivery: WebhookDelivery): Promise<WebhookEvent> => {
      const event = await provider.handleWebhook(delivery.rawBody, delivery.headers);
      expect(event).not.toBeNull();
      return event!;
    };

    const enabledAccount = async (eventVendorId = crypto.randomUUID()) => {
      const { accountId, onboardingUrl } = await provider.onboardVendor({
        eventVendorId,
        existingAccountId: null,
        businessName: 'Mama Afrika Kjøkken',
        orgNumber: '912345670',
        email: 'hei@mamaafrika.example',
        returnUrl: `${h.origin}/vendor/payouts`,
      });
      await parse(await h.completeOnboarding(onboardingUrl, 'enabled'));
      return accountId;
    };

    const payment = async (accountId: string, amountOre = 50_000, platformFeeOre = 6_250) =>
      provider.createPayment({
        amountOre,
        platformFeeOre,
        account: { kind: 'vendor', accountId },
        idempotencyKey: `order-${crypto.randomUUID()}`,
        methods: ['vipps', 'card', 'apple_pay', 'google_pay'],
        description: 'Jollof',
        returnUrl: `${h.origin}/o/receipt`,
        cancelUrl: `${h.origin}/e/affn-2027/mama`,
        metadata: metadata(crypto.randomUUID()),
      });

    const paidPayment = async (amountOre = 50_000, platformFeeOre = 6_250) => {
      const accountId = await enabledAccount();
      const created = await payment(accountId, amountOre, platformFeeOre);
      await parse(await h.pay(created.redirectUrl, 'succeeded', 'card'));
      return { accountId, ...created };
    };

    describe('vendor onboarding (VEN-06)', () => {
      it('goes from not started to pending to enabled through the hosted page', async () => {
        const eventVendorId = crypto.randomUUID();
        const input = {
          eventVendorId,
          existingAccountId: null,
          businessName: 'Mama Afrika Kjøkken',
          orgNumber: '912345670',
          email: null,
          returnUrl: `${h.origin}/vendor/payouts`,
        };
        const { accountId, onboardingUrl } = await provider.onboardVendor(input);
        expect(onboardingUrl).toMatch(/^https?:\/\//);
        expect(await provider.getVendorStatus(accountId)).toMatchObject({
          status: 'pending',
          chargesEnabled: false,
        });

        const event = await parse(await h.completeOnboarding(onboardingUrl, 'enabled'));
        expect(event).toMatchObject({ type: 'account.updated', accountId, status: 'enabled' });
        expect(await provider.getVendorStatus(accountId)).toMatchObject({
          status: 'enabled',
          chargesEnabled: true,
          requirements: [],
        });

        // Resuming onboarding keeps the same account.
        const again = await provider.onboardVendor({ ...input, existingAccountId: accountId });
        expect(again.accountId).toBe(accountId);
      });

      it('reports when the vendor must act', async () => {
        const { accountId, onboardingUrl } = await provider.onboardVendor({
          eventVendorId: crypto.randomUUID(),
          existingAccountId: null,
          businessName: 'Zanzibar Spice AS',
          orgNumber: '945678901',
          email: null,
          returnUrl: `${h.origin}/vendor/payouts`,
        });
        const event = await parse(await h.completeOnboarding(onboardingUrl, 'action_required'));
        expect(event).toMatchObject({ type: 'account.updated', status: 'action_required' });
        const status = await provider.getVendorStatus(accountId);
        expect(status.chargesEnabled).toBe(false);
        expect(status.requirements.length).toBeGreaterThan(0);
      });

      it('refuses payments to an account that is not enabled', async () => {
        const { accountId } = await provider.onboardVendor({
          eventVendorId: crypto.randomUUID(),
          existingAccountId: null,
          businessName: 'Ny Bod',
          orgNumber: '956789012',
          email: null,
          returnUrl: `${h.origin}/vendor/payouts`,
        });
        await expect(payment(accountId)).rejects.toThrow();
      });
    });

    describe('payments', () => {
      it('charges with a platform fee and confirms by signed webhook', async () => {
        const accountId = await enabledAccount();
        const created = await payment(accountId);
        const event = await parse(await h.pay(created.redirectUrl, 'succeeded', 'vipps'));
        expect(event).toMatchObject({
          type: 'payment.succeeded',
          providerPaymentId: created.providerPaymentId,
          amountOre: 50_000,
          platformFeeOre: 6_250,
          method: 'vipps',
        });
        // The provider reports its own fee, a whole number of øre within the payment.
        const pspFee = event.type === 'payment.succeeded' ? event.pspFeeOre : -1;
        expect(Number.isSafeInteger(pspFee) && pspFee >= 0 && pspFee <= 50_000).toBe(true);
        expect(event.type === 'payment.succeeded' && event.metadata.kind).toBe('order');
      });

      it('reports a failed payment', async () => {
        const accountId = await enabledAccount();
        const created = await payment(accountId);
        const event = await parse(await h.pay(created.redirectUrl, 'failed', 'card'));
        expect(event).toMatchObject({
          type: 'payment.failed',
          providerPaymentId: created.providerPaymentId,
        });
      });

      it('is idempotent per key: a retry never creates a second payment', async () => {
        const accountId = await enabledAccount();
        const input = {
          amountOre: 18_500,
          platformFeeOre: 2_313,
          account: { kind: 'vendor' as const, accountId },
          idempotencyKey: `order-${crypto.randomUUID()}`,
          methods: ['card'] as PaymentMethod[],
          description: 'Suya',
          returnUrl: `${h.origin}/o/x`,
          cancelUrl: `${h.origin}/e/x/y`,
          metadata: metadata(crypto.randomUUID()),
        };
        const first = await provider.createPayment(input);
        const second = await provider.createPayment(input);
        expect(second.providerPaymentId).toBe(first.providerPaymentId);
      });

      it('takes payments into the platform account (stall fees): all of it is platform fee', async () => {
        const created = await provider.createPayment({
          amountOre: 312_500,
          platformFeeOre: 312_500,
          account: { kind: 'platform' },
          idempotencyKey: `stall-fee-${crypto.randomUUID()}`,
          methods: ['card'],
          description: 'Standavgift',
          returnUrl: `${h.origin}/vendor/stall`,
          cancelUrl: `${h.origin}/vendor/stall`,
          metadata: { ...metadata(crypto.randomUUID()), kind: 'stall_fee' },
        });
        const event = await parse(await h.pay(created.redirectUrl, 'succeeded', 'card'));
        expect(event).toMatchObject({ type: 'payment.succeeded', platformFeeOre: 312_500 });
      });

      it('rejects invalid amounts and fees', async () => {
        const accountId = await enabledAccount();
        await expect(payment(accountId, 0, 0)).rejects.toThrow();
        await expect(payment(accountId, 1_000, 1_001)).rejects.toThrow();
        await expect(payment(accountId, 100.5, 0)).rejects.toThrow();
      });
    });

    describe('webhooks', () => {
      it('rejects a tampered body or a missing signature', async () => {
        const accountId = await enabledAccount();
        const created = await payment(accountId);
        const delivery = await h.pay(created.redirectUrl, 'succeeded', 'card');
        const tampered = delivery.rawBody.replace('50000', '1');
        expect(await provider.handleWebhook(tampered, delivery.headers)).toBeNull();
        expect(await provider.handleWebhook(delivery.rawBody, new Headers())).toBeNull();
        expect(await provider.handleWebhook('not json', delivery.headers)).toBeNull();
      });

      it('gives every event a stable id, so duplicates can be recognised', async () => {
        const accountId = await enabledAccount();
        const created = await payment(accountId);
        const delivery = await h.pay(created.redirectUrl, 'succeeded', 'card');
        const once = await parse(delivery);
        const twice = await parse(delivery);
        expect(twice.id).toBe(once.id);
      });
    });

    describe('refunds', () => {
      it('refunds in part and in full, reversing the platform fee pro rata', async () => {
        const paid = await paidPayment(30_000, 3_750);
        const first = await provider.refund({
          providerPaymentId: paid.providerPaymentId,
          amountOre: 10_000,
          reason: 'Manglende tilbehør',
          idempotencyKey: `refund-${crypto.randomUUID()}`,
        });
        expect(first).toMatchObject({ amountOre: 10_000, platformFeeReversalOre: 1_250 });
        const rest = await provider.refund({
          providerPaymentId: paid.providerPaymentId,
          amountOre: 20_000,
          reason: 'Avlyst',
          idempotencyKey: `refund-${crypto.randomUUID()}`,
        });
        expect(first.platformFeeReversalOre + rest.platformFeeReversalOre).toBe(3_750);
        await expect(
          provider.refund({
            providerPaymentId: paid.providerPaymentId,
            amountOre: 1,
            reason: 'Too much',
            idempotencyKey: `refund-${crypto.randomUUID()}`,
          }),
        ).rejects.toThrow();
      });

      it('keeps the reversals exact when shares do not divide evenly', async () => {
        const paid = await paidPayment(10_000, 1_251);
        const key = () => `refund-${crypto.randomUUID()}`;
        const reversals = [];
        for (const amountOre of [3_333, 3_333, 3_334]) {
          const r = await provider.refund({
            providerPaymentId: paid.providerPaymentId,
            amountOre,
            reason: 'Del',
            idempotencyKey: key(),
          });
          reversals.push(r.platformFeeReversalOre);
        }
        expect(reversals.reduce((a, b) => a + b, 0)).toBe(1_251);
      });

      it('is idempotent per key', async () => {
        const paid = await paidPayment();
        const input = {
          providerPaymentId: paid.providerPaymentId,
          amountOre: 5_000,
          reason: 'Feil',
          idempotencyKey: `refund-${crypto.randomUUID()}`,
        };
        const a = await provider.refund(input);
        const b = await provider.refund(input);
        expect(b.providerRefundId).toBe(a.providerRefundId);
        const report = await provider.fetchSettlementReport({
          from: new Date(Date.now() - 60_000),
          to: new Date(Date.now() + 60_000),
        });
        expect(report.filter((t) => t.providerId === a.providerRefundId)).toHaveLength(1);
      });

      it('cannot refund an unpaid payment', async () => {
        const accountId = await enabledAccount();
        const created = await payment(accountId);
        await expect(
          provider.refund({
            providerPaymentId: created.providerPaymentId,
            amountOre: 100,
            reason: 'x',
            idempotencyKey: `refund-${crypto.randomUUID()}`,
          }),
        ).rejects.toThrow();
      });
    });

    describe('payouts and settlement report', () => {
      it('releases a payout once per key and lists everything in the settlement report', async () => {
        const from = new Date(Date.now() - 60_000);
        const paid = await paidPayment(50_000, 6_250);
        await provider.refund({
          providerPaymentId: paid.providerPaymentId,
          amountOre: 10_000,
          reason: 'Del',
          idempotencyKey: `refund-${crypto.randomUUID()}`,
        });
        const key = `payout-${crypto.randomUUID()}`;
        const payout = await provider.releasePayout({
          accountId: paid.accountId,
          amountOre: 35_000,
          idempotencyKey: key,
          reference: 'settlement-line-1',
        });
        expect(payout.status).not.toBe('failed');
        const again = await provider.releasePayout({
          accountId: paid.accountId,
          amountOre: 35_000,
          idempotencyKey: key,
          reference: 'settlement-line-1',
        });
        expect(again.providerPayoutId).toBe(payout.providerPayoutId);

        const report = await provider.fetchSettlementReport({
          from,
          to: new Date(Date.now() + 60_000),
        });
        const mine = report.filter(
          (t) => t.accountId === paid.accountId || t.providerId === paid.providerPaymentId,
        );
        expect(mine.map((t) => [t.type, t.amountOre, t.platformFeeOre])).toEqual([
          ['payment', 50_000, 6_250],
          ['refund', -10_000, -1_250],
          ['payout', -35_000, 0],
        ]);
      });

      it('refuses payouts to accounts that are not enabled', async () => {
        const { accountId } = await provider.onboardVendor({
          eventVendorId: crypto.randomUUID(),
          existingAccountId: null,
          businessName: 'Ny Bod',
          orgNumber: '956789012',
          email: null,
          returnUrl: `${h.origin}/vendor/payouts`,
        });
        await expect(
          provider.releasePayout({
            accountId,
            amountOre: 1_000,
            idempotencyKey: `payout-${crypto.randomUUID()}`,
            reference: 'x',
          }),
        ).rejects.toThrow();
      });
    });
  });
}
