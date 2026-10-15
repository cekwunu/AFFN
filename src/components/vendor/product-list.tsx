'use client';

import { ArrowDown, ArrowUp, GripVertical, ImageOff } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRef, useState, useTransition, type DragEvent } from 'react';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button-variants';
import { Link } from '@/i18n/link';
import { cn } from '@/lib/utils';

export interface ProductListItem {
  id: string;
  name: string;
  price: string;
  imageUrl: string | null;
  allergens: string;
  onSale: boolean;
  soldOut: boolean;
  ordered: boolean;
}

type FormAction = (formData: FormData) => Promise<void>;

function ActionButton({
  action,
  id,
  label,
  fields = {},
  confirm,
  danger,
}: {
  action: FormAction;
  id: string;
  label: string;
  fields?: Record<string, string>;
  confirm?: string;
  danger?: boolean;
}) {
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={id} />
      {Object.entries(fields).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <button
        type="submit"
        className={buttonVariants({
          variant: 'ghost',
          size: 'sm',
          className: danger ? 'text-danger' : undefined,
        })}
      >
        {label}
      </button>
    </form>
  );
}

/**
 * The vendor's menu in display order. Drag and drop to reorder; the arrow buttons do the same
 * from the keyboard. Item actions are plain forms, so they work before JavaScript loads.
 */
export function ProductList({
  items: initial,
  archived,
  reorder,
  duplicate,
  setArchived,
  remove,
}: {
  items: ProductListItem[];
  archived: boolean;
  reorder: (ids: string[]) => Promise<boolean>;
  duplicate: FormAction;
  setArchived: FormAction;
  remove: FormAction;
}) {
  const t = useTranslations('Catalogue');
  const [items, setItems] = useState(initial);
  const [status, setStatus] = useState('');
  const [, startTransition] = useTransition();
  const dragged = useRef<string | null>(null);
  const [over, setOver] = useState<string | null>(null);

  const commit = (next: ProductListItem[]) => {
    setItems(next);
    startTransition(async () => {
      const ok = await reorder(next.map((i) => i.id));
      setStatus(ok ? t('orderSaved') : t('errors.unknown'));
    });
  };
  const move = (from: number, to: number) => {
    if (to < 0 || to >= items.length || from === to) return;
    const next = [...items];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item!);
    commit(next);
  };
  const onDrop = (event: DragEvent, targetId: string) => {
    event.preventDefault();
    setOver(null);
    const from = items.findIndex((i) => i.id === dragged.current);
    const to = items.findIndex((i) => i.id === targetId);
    dragged.current = null;
    if (from >= 0 && to >= 0) move(from, to);
  };

  return (
    <div className="grid gap-3">
      {!archived && items.length > 1 && (
        <p className="text-body-sm text-muted-foreground">{t('dragHint')}</p>
      )}
      <p role="status" className="sr-only">
        {status}
      </p>
      <ol className="grid gap-2">
        {items.map((item, index) => (
          <li
            key={item.id}
            data-testid="product-row"
            draggable={!archived}
            onDragStart={(e) => {
              dragged.current = item.id;
              e.dataTransfer.effectAllowed = 'move';
            }}
            onDragOver={(e) => {
              if (archived) return;
              e.preventDefault();
              setOver(item.id);
            }}
            onDragLeave={() => setOver((o) => (o === item.id ? null : o))}
            onDrop={(e) => onDrop(e, item.id)}
            className={cn(
              'grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3 rounded-xl border bg-card p-3 sm:grid-cols-[auto_auto_minmax(0,1fr)_auto]',
              over === item.id ? 'border-primary' : 'border-border',
            )}
          >
            {!archived && (
              <div className="row-span-2 flex items-center gap-1 sm:row-span-1">
                <GripVertical
                  aria-hidden
                  className="hidden size-5 cursor-grab text-muted-foreground sm:block"
                />
                <div className="flex flex-col">
                  <button
                    type="button"
                    onClick={() => move(index, index - 1)}
                    disabled={index === 0}
                    aria-label={t('moveUp', { name: item.name })}
                    className={buttonVariants({ variant: 'ghost', size: 'icon-sm' })}
                  >
                    <ArrowUp aria-hidden />
                  </button>
                  <button
                    type="button"
                    onClick={() => move(index, index + 1)}
                    disabled={index === items.length - 1}
                    aria-label={t('moveDown', { name: item.name })}
                    className={buttonVariants({ variant: 'ghost', size: 'icon-sm' })}
                  >
                    <ArrowDown aria-hidden />
                  </button>
                </div>
              </div>
            )}
            <div className="hidden size-16 overflow-hidden rounded-lg bg-muted sm:block">
              {item.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- user upload from Supabase Storage
                <img src={item.imageUrl} alt="" className="size-full object-cover" />
              ) : (
                <span className="flex size-full items-center justify-center text-muted-foreground">
                  <ImageOff aria-hidden className="size-5" />
                  <span className="sr-only">{t('noImage')}</span>
                </span>
              )}
            </div>
            <div className="grid min-w-0 gap-1">
              <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="font-semibold">{item.name}</span>
                <span className="text-body-sm text-muted-foreground tabular-nums">
                  {item.price}
                </span>
              </p>
              <p className="truncate text-caption text-muted-foreground">{item.allergens}</p>
              {!archived && (
                <p className="flex flex-wrap gap-1.5">
                  <Badge variant={item.soldOut ? 'warning' : item.onSale ? 'success' : 'neutral'}>
                    {item.soldOut ? t('soldOut') : item.onSale ? t('onSale') : t('notOnSale')}
                  </Badge>
                </p>
              )}
            </div>
            <div className="col-span-2 flex flex-wrap items-center gap-1 sm:col-span-1 sm:justify-end">
              {!archived && (
                <>
                  <Link
                    href={`/vendor/products/${item.id}`}
                    className={buttonVariants({ variant: 'outline', size: 'sm' })}
                  >
                    {t('edit')}
                    <span className="sr-only"> {item.name}</span>
                  </Link>
                  <ActionButton action={duplicate} id={item.id} label={t('duplicate')} />
                </>
              )}
              <ActionButton
                action={setArchived}
                id={item.id}
                fields={{ archive: String(!archived) }}
                label={archived ? t('restore') : t('archive')}
              />
              {item.ordered ? (
                <span className="px-2 text-caption text-muted-foreground">{t('ordered')}</span>
              ) : (
                <ActionButton
                  action={remove}
                  id={item.id}
                  fields={archived ? { show: 'archived' } : {}}
                  label={t('delete')}
                  confirm={t('deleteConfirm', { name: item.name })}
                  danger
                />
              )}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
