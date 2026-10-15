import type {
  PaymentMetadata,
  PaymentMethod,
  SettlementTransaction,
  VendorPaymentStatus,
} from '../provider';

/** State the mock provider keeps, as a real PSP would on its side. */
export interface MockAccount {
  id: string;
  status: VendorPaymentStatus;
}

export interface MockPayment {
  id: string;
  amountOre: number;
  platformFeeOre: number;
  /** Null: AFFN's own account. */
  accountId: string | null;
  status: 'pending' | 'succeeded' | 'failed';
  method: PaymentMethod | null;
  metadata: PaymentMetadata;
  at: string;
}

export interface MockRefund {
  id: string;
  paymentId: string;
  amountOre: number;
  platformFeeReversalOre: number;
  at: string;
}

export interface MockPayout {
  id: string;
  accountId: string;
  amountOre: number;
  reference: string;
  at: string;
}

export interface MockStore {
  getAccount(id: string): Promise<MockAccount | null>;
  putAccount(account: MockAccount): Promise<void>;
  getPayment(id: string): Promise<MockPayment | null>;
  putPayment(payment: MockPayment): Promise<void>;
  refundsFor(paymentId: string): Promise<MockRefund[]>;
  getRefund(id: string): Promise<MockRefund | null>;
  putRefund(refund: MockRefund): Promise<void>;
  getPayout(id: string): Promise<MockPayout | null>;
  putPayout(payout: MockPayout): Promise<void>;
  transactions(range: { from: Date; to: Date }): Promise<SettlementTransaction[]>;
}

/** In-memory store: contract tests and local experiments. */
export function memoryStore(): MockStore {
  const accounts = new Map<string, MockAccount>();
  const payments = new Map<string, MockPayment>();
  const refunds = new Map<string, MockRefund>();
  const payouts = new Map<string, MockPayout>();
  const within = (at: string, { from, to }: { from: Date; to: Date }) =>
    Date.parse(at) >= from.getTime() && Date.parse(at) < to.getTime();
  return {
    async getAccount(id) {
      return accounts.get(id) ?? null;
    },
    async putAccount(account) {
      accounts.set(account.id, { ...account });
    },
    async getPayment(id) {
      return payments.get(id) ?? null;
    },
    async putPayment(payment) {
      payments.set(payment.id, { ...payment });
    },
    async refundsFor(paymentId) {
      return [...refunds.values()].filter((r) => r.paymentId === paymentId);
    },
    async getRefund(id) {
      return refunds.get(id) ?? null;
    },
    async putRefund(refund) {
      refunds.set(refund.id, { ...refund });
    },
    async getPayout(id) {
      return payouts.get(id) ?? null;
    },
    async putPayout(payout) {
      payouts.set(payout.id, { ...payout });
    },
    async transactions(range) {
      const list: SettlementTransaction[] = [];
      for (const p of payments.values()) {
        if (p.status !== 'succeeded' || !within(p.at, range)) continue;
        list.push({
          type: 'payment',
          providerId: p.id,
          accountId: p.accountId,
          amountOre: p.amountOre,
          platformFeeOre: p.platformFeeOre,
          occurredAt: p.at,
          reference: p.metadata.reference,
        });
      }
      for (const r of refunds.values()) {
        if (!within(r.at, range)) continue;
        const payment = payments.get(r.paymentId);
        list.push({
          type: 'refund',
          providerId: r.id,
          accountId: payment?.accountId ?? null,
          amountOre: -r.amountOre,
          platformFeeOre: -r.platformFeeReversalOre,
          occurredAt: r.at,
          reference: payment?.metadata.reference ?? null,
        });
      }
      for (const p of payouts.values()) {
        if (!within(p.at, range)) continue;
        list.push({
          type: 'payout',
          providerId: p.id,
          accountId: p.accountId,
          amountOre: -p.amountOre,
          platformFeeOre: 0,
          occurredAt: p.at,
          reference: p.reference,
        });
      }
      return list.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
    },
  };
}
