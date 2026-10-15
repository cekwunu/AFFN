'use client';

import { RealtimeClient } from '@supabase/realtime-js';
import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';

/**
 * Keeps the customer's tracking page live (ORD-03): listens to the order's broadcast topic
 * (named after its secret tracking token) and re-renders the page from the server on every
 * change, on reconnect and every 20 s as a safety net. Vibrates once when the order is ready.
 */
export function OrderLive({
  token,
  status,
  supabaseUrl,
  anonKey,
  readyTitle,
  settled,
}: {
  token: string;
  status: string;
  supabaseUrl: string | null;
  anonKey: string | null;
  readyTitle: string;
  /** False while a cancellation's refund is still on its way. */
  settled: boolean;
}) {
  const router = useRouter();
  const final = status === 'collected' || (status === 'cancelled' && settled);
  const previous = useRef(status);

  useEffect(() => {
    if (status === 'ready' && previous.current !== 'ready') {
      navigator.vibrate?.([200, 100, 200]);
      document.title = readyTitle;
    }
    previous.current = status;
  }, [status, readyTitle]);

  useEffect(() => {
    if (final) return;
    const refresh = () => router.refresh();
    const poll = window.setInterval(refresh, 20_000);
    window.addEventListener('online', refresh);
    if (!supabaseUrl || !anonKey) {
      return () => {
        window.clearInterval(poll);
        window.removeEventListener('online', refresh);
      };
    }
    const client = new RealtimeClient(`${supabaseUrl.replace(/^http/, 'ws')}/realtime/v1`, {
      params: { apikey: anonKey },
    });
    let joined = false;
    const channel = client
      .channel(`order:${token}`, { config: { private: false } })
      .on('broadcast', { event: 'status' }, refresh)
      .subscribe((state) => {
        if (state === 'SUBSCRIBED') {
          // A rejoin after a drop may have missed a change: refetch.
          if (joined) refresh();
          joined = true;
        }
      });
    return () => {
      window.clearInterval(poll);
      window.removeEventListener('online', refresh);
      void client.removeChannel(channel);
      client.disconnect();
    };
  }, [token, final, supabaseUrl, anonKey, router]);

  return null;
}
