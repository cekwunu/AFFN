'use client';

import { clsx } from 'clsx';
import { Minus, Plus, ShoppingBag, X } from 'lucide-react';
import { useActionState, useRef } from 'react';
import { useFormStatus } from 'react-dom';
import type {
  CheckoutError,
  CheckoutState,
} from '@/app/[locale]/(public)/e/[event]/[vendor]/actions';
import { formatOre, ore } from '@/lib/money';
import { setQuantity, useCart } from './cart-store';

export interface CartProduct {
  id: string;
  name: string;
  priceOre: number;
}

export interface CartLabels {
  open: string;
  itemOne: string;
  itemOther: string;
  title: string;
  close: string;
  empty: string;
  total: string;
  name: string;
  nameHint: string;
  note: string;
  noteHint: string;
  pay: string;
  paying: string;
  methods: string;
  testMode: string;
  decrease: string;
  increase: string;
  errors: Record<CheckoutError, string>;
}

const fill = (template: string, values: Record<string, string | number>) =>
  template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ''));

function PayButton({ label, paying }: { label: string; paying: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-disabled={pending}
      className="inline-flex h-12 w-full items-center justify-center rounded-lg bg-primary px-6 text-body font-semibold text-primary-foreground transition-colors hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-70"
    >
      {pending ? paying : label}
    </button>
  );
}

/**
 * The cart (QR-03): a bar at the bottom of the phone screen and a sheet with the order, an
 * optional name and pickup note, and the button to pay. Products come from the server; prices
 * are checked again at checkout.
 */
export function CartSheet({
  cartKey,
  products,
  event,
  vendor,
  locale,
  testMode,
  action,
  labels,
}: {
  cartKey: string;
  products: CartProduct[];
  event: string;
  vendor: string;
  locale: string;
  testMode: boolean;
  action: (state: CheckoutState, formData: FormData) => Promise<CheckoutState>;
  labels: CartLabels;
}) {
  const lines = useCart(cartKey);
  const dialog = useRef<HTMLDialogElement>(null);
  const [state, formAction] = useActionState(action, {});
  const byId = new Map(products.map((p) => [p.id, p]));
  const items = Object.entries(lines)
    .map(([id, quantity]) => ({ product: byId.get(id), quantity }))
    .filter((i): i is { product: CartProduct; quantity: number } => !!i.product);
  const count = items.reduce((sum, i) => sum + i.quantity, 0);
  const total = items.reduce((sum, i) => sum + i.product.priceOre * i.quantity, 0);
  const totalText = formatOre(ore(total));
  const round =
    'inline-flex size-10 items-center justify-center rounded-full border border-border bg-card hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

  return (
    <>
      {count > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80">
          <button
            type="button"
            onClick={() => dialog.current?.showModal()}
            className="mx-auto flex h-12 w-full max-w-xl items-center justify-between gap-3 rounded-lg bg-primary px-5 text-body font-semibold text-primary-foreground shadow-md transition-colors hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <span className="flex items-center gap-2">
              <ShoppingBag aria-hidden className="size-5" />
              {fill(count === 1 ? labels.itemOne : labels.itemOther, { count })}
            </span>
            <span className="tabular-nums">{fill(labels.open, { total: totalText })}</span>
          </button>
        </div>
      )}

      <dialog
        ref={dialog}
        aria-labelledby="cart-title"
        className="backdrop:bg-overlay m-0 mt-auto max-h-[92dvh] w-full max-w-none rounded-t-2xl border border-border bg-card p-0 text-foreground sm:m-auto sm:max-w-lg sm:rounded-2xl"
      >
        <div className="grid gap-5 p-5">
          <div className="flex items-center justify-between gap-4">
            <h2 id="cart-title" className="font-display text-heading-lg font-semibold">
              {labels.title}
            </h2>
            <button
              type="button"
              onClick={() => dialog.current?.close()}
              aria-label={labels.close}
              className={round}
            >
              <X aria-hidden className="size-5" />
            </button>
          </div>

          {items.length === 0 ? (
            <p className="text-body text-muted-foreground">{labels.empty}</p>
          ) : (
            <ul className="grid gap-3" data-testid="cart-lines">
              {items.map(({ product, quantity }) => (
                <li
                  key={product.id}
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3"
                >
                  <span className="grid">
                    <span className="font-medium">{product.name}</span>
                    <span className="text-body-sm text-muted-foreground tabular-nums">
                      {formatOre(ore(product.priceOre * quantity))}
                    </span>
                  </span>
                  <span className="inline-flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setQuantity(cartKey, product.id, quantity - 1)}
                      aria-label={fill(labels.decrease, { name: product.name })}
                      className={round}
                    >
                      <Minus aria-hidden className="size-4" />
                    </button>
                    <span className="min-w-5 text-center font-semibold tabular-nums">
                      {quantity}
                    </span>
                    <button
                      type="button"
                      onClick={() => setQuantity(cartKey, product.id, quantity + 1)}
                      aria-label={fill(labels.increase, { name: product.name })}
                      className={round}
                    >
                      <Plus aria-hidden className="size-4" />
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}

          <p className="flex items-baseline justify-between border-t border-border pt-4 text-heading-sm font-semibold">
            <span>{labels.total}</span>
            <span className="tabular-nums" data-testid="cart-total">
              {totalText}
            </span>
          </p>

          <form action={formAction} className="grid gap-4">
            <input type="hidden" name="event" value={event} />
            <input type="hidden" name="vendor" value={vendor} />
            <input type="hidden" name="locale" value={locale} />
            <input
              type="hidden"
              name="items"
              value={JSON.stringify(
                items.map((i) => ({ productId: i.product.id, quantity: i.quantity })),
              )}
            />
            <input type="hidden" name="expectedTotal" value={total} />
            <label className="grid gap-1.5 text-body-sm font-medium">
              {labels.name}
              <input
                name="name"
                autoComplete="given-name"
                maxLength={60}
                aria-describedby="cart-name-hint"
                className="h-11 rounded-md border border-input bg-background px-3.5 text-body font-normal"
              />
              <span id="cart-name-hint" className="text-caption font-normal text-muted-foreground">
                {labels.nameHint}
              </span>
            </label>
            <label className="grid gap-1.5 text-body-sm font-medium">
              {labels.note}
              <input
                name="note"
                maxLength={140}
                aria-describedby="cart-note-hint"
                className="h-11 rounded-md border border-input bg-background px-3.5 text-body font-normal"
              />
              <span id="cart-note-hint" className="text-caption font-normal text-muted-foreground">
                {labels.noteHint}
              </span>
            </label>
            {state.error && (
              <p role="alert" className="text-body-sm font-medium text-danger">
                {labels.errors[state.error]}
              </p>
            )}
            {items.length > 0 && (
              <PayButton label={fill(labels.pay, { total: totalText })} paying={labels.paying} />
            )}
            <p className={clsx('text-center text-caption text-muted-foreground')}>
              {labels.methods}
            </p>
            {testMode && (
              <p className="text-center text-caption font-bold tracking-wide text-warning-subtle-foreground">
                {labels.testMode}
              </p>
            )}
          </form>
        </div>
      </dialog>
    </>
  );
}
