'use client';

import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { Switch } from '@/components/ui/switch';

export interface AvailabilityItem {
  id: string;
  name: string;
  price: string;
  onSale: boolean;
  soldOut: boolean;
}

/**
 * What the vendor sells at the event, and sold-out toggles usable on a phone during service
 * (CAT-02). Each change is saved at once.
 */
export function AvailabilityList({
  items: initial,
  update,
}: {
  items: AvailabilityItem[];
  update: (productId: string, change: { onSale?: boolean; soldOut?: boolean }) => Promise<boolean>;
}) {
  const t = useTranslations('Catalogue');
  const [items, setItems] = useState(initial);
  const [status, setStatus] = useState('');
  const [pending, startTransition] = useTransition();

  const change = (id: string, patch: { onSale?: boolean; soldOut?: boolean }) => {
    const before = items;
    setItems((current) =>
      current.map((i) =>
        i.id === id
          ? {
              ...i,
              ...(patch.onSale !== undefined ? { onSale: patch.onSale, soldOut: false } : {}),
              ...(patch.soldOut !== undefined ? { soldOut: patch.soldOut } : {}),
            }
          : i,
      ),
    );
    startTransition(async () => {
      const ok = await update(id, patch);
      if (!ok) setItems(before);
      setStatus(ok ? t('availability.saved') : t('errors.unknown'));
    });
  };
  const onSaleCount = items.filter((i) => i.onSale).length;

  return (
    <div className="grid gap-3">
      <p className="text-body-sm text-muted-foreground" aria-live="polite">
        {t('availability.onSaleCount', { count: onSaleCount, total: items.length })}
      </p>
      <p role="status" className="sr-only">
        {status}
      </p>
      <ul className="grid gap-2">
        {items.map((item) => (
          <li
            key={item.id}
            data-testid="availability-row"
            className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 rounded-xl border border-border bg-card p-4"
          >
            <label className="flex min-h-11 items-center gap-3">
              <input
                type="checkbox"
                checked={item.onSale}
                disabled={pending}
                onChange={(e) => change(item.id, { onSale: e.target.checked })}
                aria-label={t('availability.sell', { name: item.name })}
                className="size-6 accent-primary"
              />
              <span className="grid">
                <span className="font-semibold">{item.name}</span>
                <span className="text-body-sm text-muted-foreground tabular-nums">
                  {item.price}
                </span>
              </span>
            </label>
            {item.onSale && (
              <span className="flex items-center gap-2 text-body-sm font-medium">
                <Switch
                  checked={item.soldOut}
                  disabled={pending}
                  onCheckedChange={(soldOut) => change(item.id, { soldOut })}
                  aria-label={t('availability.soldOutToggle', { name: item.name })}
                />
                <span
                  aria-hidden
                  className={item.soldOut ? 'text-warning-subtle-foreground' : undefined}
                >
                  {item.soldOut ? t('soldOut') : t('onSale')}
                </span>
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
