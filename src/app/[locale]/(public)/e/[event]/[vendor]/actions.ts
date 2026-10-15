'use server';

import { redirect } from 'next/navigation';
import { localizePath } from '@/i18n/paths';
import type { Locale } from '@/i18n/routing';
import { priceCart, type CartItem } from '@/lib/checkout/cart';
import { requestOrigin } from '@/lib/http/origin';
import { calculateCommission, resolveCommissionRule } from '@/lib/money/commission';
import { getPaymentProvider } from '@/lib/payments';
import { PAYMENT_METHODS } from '@/lib/payments/provider';
import { hitLimit, requestIp } from '@/lib/rate-limit';
import { commissionRulesFor, getStorefront } from '@/lib/storefront/server';
import { createAdminClient } from '@/lib/supabase/admin';

export type CheckoutError =
  'empty' | 'unavailable' | 'price_changed' | 'not_selling' | 'rate_limited' | 'failed';

export interface CheckoutState {
  error?: CheckoutError;
  at?: number;
}

const DB_ERRORS: Record<string, CheckoutError> = {
  not_selling: 'not_selling',
  invalid_cart: 'empty',
  unavailable: 'unavailable',
  price_changed: 'price_changed',
};

/**
 * Checkout (QR-03): prices the cart from the products on sale, works out the commission with the
 * rule in force (src/lib/money), creates the order and its payment in one database transaction
 * (which checks everything again) and sends the visitor to the payment provider. The platform
 * fee withheld by the provider is commission + 25 % mva on the commission.
 */
export async function checkout(_: CheckoutState, formData: FormData): Promise<CheckoutState> {
  const fail = (error: CheckoutError): CheckoutState => ({ error, at: Date.now() });
  if (!(await hitLimit('checkoutIp', await requestIp()))) return fail('rate_limited');

  const locale: Locale = formData.get('locale') === 'en' ? 'en' : 'nb';
  const eventSlug = String(formData.get('event') ?? '');
  const vendorSlug = String(formData.get('vendor') ?? '');
  const store = await getStorefront(eventSlug, vendorSlug);
  if (!store) return fail('failed');
  if (store.blocked) return fail('not_selling');

  let items: CartItem[];
  try {
    const parsed = JSON.parse(String(formData.get('items') ?? '[]')) as unknown;
    items = Array.isArray(parsed) ? (parsed as CartItem[]) : [];
  } catch {
    return fail('empty');
  }
  let priced: ReturnType<typeof priceCart>;
  try {
    priced = priceCart(
      items,
      store.menu
        .filter((p) => !p.soldOut)
        .map((p) => ({
          id: p.id,
          name: p.name,
          priceOre: p.price_ore,
          mvaRateBp: p.mva_rate_bp,
          categoryId: p.category_id,
        })),
    );
  } catch (error) {
    return fail(error instanceof RangeError && error.message === 'empty' ? 'empty' : 'unavailable');
  }
  if (Number(formData.get('expectedTotal')) !== priced.totalOre) return fail('price_changed');

  const rules = await commissionRulesFor(
    store.event.organization_id,
    store.event.id,
    store.vendor.id,
  );
  const rule = resolveCommissionRule(rules, {
    vendorId: store.vendor.id,
    categoryIds: priced.lines.map((l) => l.categoryId),
    eventId: store.event.id,
  });
  if (!rule) return fail('failed');
  let fee: ReturnType<typeof calculateCommission>;
  try {
    fee = calculateCommission(priced.totalOre, rule);
  } catch {
    return fail('failed');
  }

  const provider = getPaymentProvider();
  const admin = createAdminClient();
  const { data: order, error } = await admin.rpc('create_order', {
    p_event_vendor_id: store.eventVendorId,
    p_items: priced.lines.map((l) => ({ product_id: l.productId, quantity: l.quantity })),
    p_expected_total_ore: priced.totalOre,
    p_commission_rule_id: rule.id,
    p_commission_ore: fee.commission,
    p_commission_mva_ore: fee.mva,
    p_customer_name: String(formData.get('name') ?? '').slice(0, 60),
    p_pickup_note: String(formData.get('note') ?? '').slice(0, 140),
    p_locale: locale,
    p_provider: provider.name,
  });
  if (error) return fail(DB_ERRORS[error.message] ?? 'failed');
  const created = order as {
    order_id: string;
    tracking_token: string;
    payment_id: string;
    idempotency_key: string;
    total_ore: number;
    platform_fee_ore: number;
    psp_account_id: string;
    organization_id: string;
  };

  const origin = await requestOrigin();
  let redirectUrl: string;
  try {
    const payment = await provider.createPayment({
      amountOre: created.total_ore,
      platformFeeOre: created.platform_fee_ore,
      account: { kind: 'vendor', accountId: created.psp_account_id },
      idempotencyKey: created.idempotency_key,
      methods: PAYMENT_METHODS,
      description: `${store.vendor.display_name} – ${store.event.name}`,
      returnUrl: `${origin}${localizePath(`/o/${created.tracking_token}`, locale)}`,
      cancelUrl: `${origin}${localizePath(`/e/${eventSlug}/${vendorSlug}`, locale)}`,
      metadata: {
        kind: 'order',
        reference: created.order_id,
        organizationId: created.organization_id,
      },
    });
    const { error: attachError } = await admin.rpc('attach_provider_payment', {
      p_payment_id: created.payment_id,
      p_provider_payment_id: payment.providerPaymentId,
    });
    if (attachError) throw attachError;
    redirectUrl = payment.redirectUrl;
  } catch {
    return fail('failed');
  }
  redirect(redirectUrl);
}
