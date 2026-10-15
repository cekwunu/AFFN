import 'server-only';
import { headers } from 'next/headers';

/** This request's origin (scheme + host), for URLs that leave the app and come back. */
export async function requestOrigin(): Promise<string> {
  const h = await headers();
  return (
    h.get('origin') ??
    `${h.get('x-forwarded-proto') ?? 'http'}://${h.get('x-forwarded-host') ?? h.get('host')}`
  );
}
