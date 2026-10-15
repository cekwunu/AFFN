/**
 * TODO (Prompt 22): Stripe Connect implementation of PaymentProvider.
 *
 * - onboardVendor: Express account + Account Link (hosted KYC); payouts on a manual schedule so
 *   vendor money waits for AFFN's settlement approval (PRD §5).
 * - createPayment: Checkout Session / PaymentIntent with `application_fee_amount` = platform fee
 *   and `transfer_data.destination` = vendor account; `Idempotency-Key` = our key; Vipps when
 *   available on Connect, otherwise card, Apple Pay and Google Pay.
 * - handleWebhook: verify `Stripe-Signature` with STRIPE_WEBHOOK_SECRET; map payment_intent.*,
 *   account.updated, charge.refunded, payout.* to WebhookEvent.
 * - refund: `refund_application_fee: true` (pro-rata fee reversal).
 * - releasePayout / fetchSettlementReport: Payouts and Balance Transactions APIs.
 *
 * Must pass the shared contract suite in ../contract.ts against the Stripe test mode.
 */
import type { PaymentProvider } from '../provider';

export function createStripeConnectProvider(): PaymentProvider {
  throw new Error('Stripe Connect is not implemented yet (Prompt 22). Set PAYMENT_PROVIDER=mock.');
}
