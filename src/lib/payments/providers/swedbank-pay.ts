/**
 * TODO (Prompt 22): Swedbank Pay implementation of PaymentProvider.
 *
 * - onboardVendor: merchant onboarding for split settlement (sub-merchant), hosted KYC link.
 * - createPayment: Payment Order with Vipps, card, Apple Pay and Google Pay, the vendor as
 *   sub-merchant and AFFN's platform fee as the split; `PayeeReference` = our idempotency key.
 * - handleWebhook: verify the callback, then read the payment order state from the API.
 * - refund (reversal) with pro-rata fee split, releasePayout, fetchSettlementReport (settlement
 *   and reconciliation reports).
 *
 * Must pass the shared contract suite in ../contract.ts against the Swedbank Pay test
 * environment (SWEDBANK_PAY_* variables).
 */
import type { PaymentProvider } from '../provider';

export function createSwedbankPayProvider(): PaymentProvider {
  throw new Error('Swedbank Pay is not implemented yet (Prompt 22). Set PAYMENT_PROVIDER=mock.');
}
