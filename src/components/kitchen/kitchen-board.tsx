'use client';

import { BellRing, CircleSlash, RefreshCw, Volume2, VolumeX, WifiOff } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import type { KitchenOrder } from '@/lib/orders/server';
import {
  KITCHEN_COLUMNS,
  minutesSince,
  NEXT_STATUS,
  type KitchenStatus,
  type OrderStatus,
} from '@/lib/orders/status';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';

type Product = { id: string; name: string; soldOut: boolean };
type Snapshot = { orders: KitchenOrder[]; products: Product[] };
type Result = { ok: true } | { ok: false; error: 'failed' | 'refund_failed' };

const ACTION_KEY: Record<KitchenStatus, 'accept' | 'start' | 'ready' | 'collected'> = {
  new: 'accept',
  accepted: 'start',
  preparing: 'ready',
  ready: 'collected',
};

// A short two-tone chime, made with Web Audio (no sound file to download).
function chime() {
  const Ctx =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return;
  const ctx = new Ctx();
  [880, 1320].forEach((frequency, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = frequency;
    osc.connect(gain);
    gain.connect(ctx.destination);
    const start = ctx.currentTime + i * 0.18;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.4, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.35);
    osc.start(start);
    osc.stop(start + 0.4);
  });
  window.setTimeout(() => void ctx.close(), 1000);
}

/**
 * Kitchen display (ORD-02): four columns, large touch targets, live via Supabase Realtime.
 * Every change (and every reconnect) refetches the whole board from the server, so an order
 * that arrived while offline is never missed.
 */
export function KitchenBoard({
  eventVendorId,
  initial,
  load,
  advance,
  cancel,
  setSoldOut,
}: {
  eventVendorId: string;
  initial: Snapshot;
  load: () => Promise<Snapshot | null>;
  advance: (orderId: string, from: OrderStatus, to: OrderStatus) => Promise<Result>;
  cancel: (orderId: string, reason: string) => Promise<Result>;
  setSoldOut: (productId: string, change: { soldOut: boolean }) => Promise<boolean>;
}) {
  const t = useTranslations('Kitchen');
  const [snapshot, setSnapshot] = useState(initial);
  const [online, setOnline] = useState(true);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const [sound, setSound] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<KitchenOrder | null>(null);
  const [reason, setReason] = useState('');
  const [pending, startTransition] = useTransition();
  const known = useRef(new Set(initial.orders.map((o) => o.id)));
  const soundRef = useRef(sound);
  useEffect(() => {
    soundRef.current = sound;
  }, [sound]);

  const refresh = useCallback(async () => {
    try {
      const next = await load();
      if (!next) return;
      const arrived = next.orders.filter((o) => o.status === 'new' && !known.current.has(o.id));
      next.orders.forEach((o) => known.current.add(o.id));
      if (arrived.length) {
        setFresh((current) => new Set([...current, ...arrived.map((o) => o.id)]));
        setMessage(t('newOrders', { count: arrived.length }));
        if (soundRef.current) chime();
      }
      setSnapshot(next);
      setOnline(navigator.onLine);
    } catch {
      setOnline(false);
    }
  }, [load, t]);

  // Realtime subscription with explicit reconnect: going offline drops the channel; coming
  // back (or the channel recovering) resubscribes and refetches everything.
  useEffect(() => {
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let stopped = false;
    const subscribe = async () => {
      if (channel) void supabase.removeChannel(channel);
      channel = null;
      // Join as the signed-in vendor, so RLS lets the order changes through.
      const { data } = await supabase.auth.getSession();
      if (stopped) return;
      await supabase.realtime.setAuth(data.session?.access_token ?? null);
      channel = supabase
        .channel(`kitchen:${eventVendorId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'orders',
            filter: `event_vendor_id=eq.${eventVendorId}`,
          },
          () => void refresh(),
        )
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            setOnline(navigator.onLine);
            void refresh();
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            setOnline(false);
          }
        });
    };
    const goOffline = () => {
      setOnline(false);
      if (channel) void supabase.removeChannel(channel);
      channel = null;
    };
    const goOnline = () => {
      void subscribe();
      void refresh();
    };
    void subscribe();
    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);
    // Safety net: a full refetch every 30 s even if no event arrives.
    const poll = window.setInterval(() => void refresh(), 30_000);
    const tick = window.setInterval(() => setNow(new Date()), 15_000);
    return () => {
      stopped = true;
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
      window.clearInterval(poll);
      window.clearInterval(tick);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [eventVendorId, refresh]);

  const act = (order: KitchenOrder) => {
    const status = order.status as KitchenStatus;
    const to = NEXT_STATUS[status];
    setBusy(order.id);
    setFresh((current) => {
      const next = new Set(current);
      next.delete(order.id);
      return next;
    });
    startTransition(async () => {
      const result = await advance(order.id, status, to);
      setMessage(
        result.ok
          ? t('moved', { code: order.code, status: t(`status.${to}`) })
          : t('errors.failed'),
      );
      await refresh();
      setBusy(null);
    });
  };

  const confirmCancel = () => {
    const order = cancelling;
    if (!order || !reason.trim()) return;
    startTransition(async () => {
      const result = await cancel(order.id, reason);
      setMessage(result.ok ? t('cancelled', { code: order.code }) : t(`errors.${result.error}`));
      if (result.ok) {
        setCancelling(null);
        setReason('');
      }
      await refresh();
    });
  };

  const toggleSoldOut = (product: Product) => {
    const soldOut = !product.soldOut;
    setSnapshot((s) => ({
      ...s,
      products: s.products.map((p) => (p.id === product.id ? { ...p, soldOut } : p)),
    }));
    startTransition(async () => {
      const ok = await setSoldOut(product.id, { soldOut });
      setMessage(
        ok ? t(soldOut ? 'soldOutOn' : 'soldOutOff', { name: product.name }) : t('errors.failed'),
      );
      if (!ok) await refresh();
    });
  };

  const soldOutCount = snapshot.products.filter((p) => p.soldOut).length;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant={sound ? 'secondary' : 'outline'}
          size="lg"
          aria-pressed={sound}
          onClick={() => {
            const next = !sound;
            setSound(next);
            if (next) chime();
          }}
        >
          {sound ? <Volume2 aria-hidden /> : <VolumeX aria-hidden />}
          {sound ? t('soundOn') : t('soundOff')}
        </Button>
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="outline" size="lg">
              <CircleSlash aria-hidden />
              {t('soldOut.open', { count: soldOutCount })}
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-full max-w-md">
            <SheetHeader>
              <SheetTitle>{t('soldOut.title')}</SheetTitle>
            </SheetHeader>
            <ul className="grid gap-2 px-4 pb-6">
              {snapshot.products.map((p) => (
                <li
                  key={p.id}
                  className="flex min-h-14 items-center justify-between gap-4 rounded-lg border border-border px-4"
                >
                  <label htmlFor={`sold-out-${p.id}`} className="text-body font-medium">
                    {p.name}
                  </label>
                  <Switch
                    id={`sold-out-${p.id}`}
                    checked={p.soldOut}
                    onCheckedChange={() => toggleSoldOut(p)}
                    aria-label={t('soldOut.toggle', { name: p.name })}
                  />
                </li>
              ))}
            </ul>
          </SheetContent>
        </Sheet>
        <Button variant="ghost" size="lg" onClick={() => void refresh()} disabled={pending}>
          <RefreshCw aria-hidden />
          {t('refresh')}
        </Button>
        <p role="status" aria-live="polite" className="ml-auto text-body-sm text-muted-foreground">
          {message}
        </p>
      </div>

      {!online && (
        <p
          role="alert"
          data-testid="kitchen-offline"
          className="flex items-center gap-3 rounded-lg bg-danger-subtle px-4 py-3 text-body font-semibold text-danger-subtle-foreground"
        >
          <WifiOff aria-hidden className="size-5" />
          {t('offline')}
        </p>
      )}

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {KITCHEN_COLUMNS.map((column) => {
          const orders = snapshot.orders.filter((o) => o.status === column);
          return (
            <section
              key={column}
              aria-labelledby={`col-${column}`}
              data-testid={`kitchen-column-${column}`}
              className="flex min-h-48 flex-col gap-3 rounded-2xl bg-muted p-3"
            >
              <h2
                id={`col-${column}`}
                className="flex items-center justify-between px-1 text-heading-sm font-semibold"
              >
                {t(`status.${column}`)}
                <span className="rounded-full bg-card px-2.5 text-body-sm tabular-nums">
                  {orders.length}
                </span>
              </h2>
              <ul className="grid content-start gap-3">
                {orders.map((order) => {
                  const minutes = minutesSince(order.paidAt, now);
                  const isFresh = fresh.has(order.id);
                  return (
                    <li
                      key={order.id}
                      data-testid="kitchen-order"
                      data-code={order.code}
                      data-fresh={isFresh || undefined}
                      className={cn(
                        'grid gap-3 rounded-xl border-2 bg-card p-4 shadow-xs',
                        isFresh ? 'animate-pulse border-primary' : 'border-transparent',
                      )}
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="font-display text-display-md leading-none font-semibold tabular-nums">
                          {order.code}
                        </p>
                        <p
                          className={cn(
                            'text-body-sm font-medium tabular-nums',
                            minutes >= 15 ? 'text-danger' : 'text-muted-foreground',
                          )}
                        >
                          {isFresh && <BellRing aria-hidden className="mr-1 inline size-4" />}
                          {t('minutes', { minutes })}
                        </p>
                      </div>
                      <ul className="grid gap-1 text-body-lg">
                        {order.items.map((item, i) => (
                          <li key={i} className="flex gap-2">
                            <span className="min-w-8 font-semibold tabular-nums">
                              {item.quantity}×
                            </span>
                            <span>{item.name}</span>
                          </li>
                        ))}
                      </ul>
                      {(order.name || order.note) && (
                        <p className="rounded-md bg-accent px-3 py-2 text-body">
                          {order.name && <span className="font-semibold">{order.name}</span>}
                          {order.name && order.note && ' · '}
                          {order.note}
                        </p>
                      )}
                      <div className="flex gap-2">
                        <Button
                          size="lg"
                          className="h-14 flex-1 text-body-lg"
                          onClick={() => act(order)}
                          loading={busy === order.id}
                          aria-label={t(`actions.${ACTION_KEY[column]}Label`, { code: order.code })}
                        >
                          {t(`actions.${ACTION_KEY[column]}`)}
                        </Button>
                        <Button
                          size="lg"
                          variant="outline"
                          className="h-14"
                          onClick={() => setCancelling(order)}
                          aria-label={t('actions.cancelLabel', { code: order.code })}
                        >
                          {t('actions.cancel')}
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>

      <Dialog open={!!cancelling} onOpenChange={(open) => !open && setCancelling(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('cancelDialog.title', { code: cancelling?.code ?? '' })}</DialogTitle>
            <DialogDescription>{t('cancelDialog.text')}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <label htmlFor="cancel-reason" className="text-body-sm font-medium">
              {t('cancelDialog.reason')}
            </label>
            <Textarea
              id="cancel-reason"
              value={reason}
              maxLength={200}
              required
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" size="lg" onClick={() => setCancelling(null)}>
              {t('cancelDialog.keep')}
            </Button>
            <Button
              variant="danger"
              size="lg"
              onClick={confirmCancel}
              disabled={!reason.trim()}
              loading={pending}
            >
              {t('cancelDialog.confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
