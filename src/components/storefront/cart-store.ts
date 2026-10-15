'use client';

import { useSyncExternalStore } from 'react';

/**
 * The visitor's cart (QR-03): product id → quantity, shared by the add buttons and the cart
 * sheet on the vendor page, and kept in sessionStorage so it survives a failed payment.
 */
export type CartLines = Readonly<Record<string, number>>;

const EMPTY: CartLines = Object.freeze({});
const MAX_QUANTITY = 20;
const carts = new Map<string, CartLines>();
const listeners = new Set<() => void>();

const storageKey = (cartKey: string) => `affn-cart:${cartKey}`;

function read(cartKey: string): CartLines {
  const cached = carts.get(cartKey);
  if (cached) return cached;
  let lines: CartLines = EMPTY;
  try {
    const raw = sessionStorage.getItem(storageKey(cartKey));
    const parsed = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    lines = Object.fromEntries(
      Object.entries(parsed).filter(
        (e): e is [string, number] => Number.isInteger(e[1]) && (e[1] as number) > 0,
      ),
    );
  } catch {
    lines = EMPTY;
  }
  carts.set(cartKey, lines);
  return lines;
}

function write(cartKey: string, lines: CartLines) {
  carts.set(cartKey, lines);
  try {
    sessionStorage.setItem(storageKey(cartKey), JSON.stringify(lines));
  } catch {
    // Private mode: the cart still works for this page view.
  }
  listeners.forEach((listener) => listener());
}

export function setQuantity(cartKey: string, productId: string, quantity: number) {
  const next: Record<string, number> = { ...read(cartKey) };
  const clamped = Math.max(0, Math.min(MAX_QUANTITY, Math.trunc(quantity)));
  if (clamped === 0) delete next[productId];
  else next[productId] = clamped;
  write(cartKey, next);
}

export function useCart(cartKey: string): CartLines {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => read(cartKey),
    () => EMPTY,
  );
}
