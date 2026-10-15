'use client';

import { clsx } from 'clsx';
import { Minus, Plus } from 'lucide-react';
import { setQuantity, useCart } from './cart-store';

export interface AddToCartLabels {
  add: string;
  addNamed: string;
  decrease: string;
  increase: string;
}

/** "Add" on a menu item, then a − n + stepper (QR-03). */
export function AddToCart({
  cartKey,
  productId,
  labels,
}: {
  cartKey: string;
  productId: string;
  labels: AddToCartLabels;
}) {
  const quantity = useCart(cartKey)[productId] ?? 0;
  const round =
    'inline-flex size-11 items-center justify-center rounded-full border border-border bg-card text-foreground transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';
  if (quantity === 0) {
    return (
      <button
        type="button"
        onClick={() => setQuantity(cartKey, productId, 1)}
        aria-label={labels.addNamed}
        className="inline-flex h-11 items-center gap-1.5 rounded-full bg-primary px-4 text-body-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <Plus aria-hidden className="size-4" />
        {labels.add}
      </button>
    );
  }
  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={() => setQuantity(cartKey, productId, quantity - 1)}
        aria-label={labels.decrease}
        className={round}
      >
        <Minus aria-hidden className="size-4" />
      </button>
      <output
        aria-live="polite"
        className={clsx('min-w-6 text-center text-body font-semibold tabular-nums')}
      >
        {quantity}
      </output>
      <button
        type="button"
        onClick={() => setQuantity(cartKey, productId, quantity + 1)}
        aria-label={labels.increase}
        className={round}
      >
        <Plus aria-hidden className="size-4" />
      </button>
    </span>
  );
}
