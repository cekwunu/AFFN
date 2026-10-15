import { createHmac } from 'node:crypto';

/** Hashed bucket key: the database never sees the IP address or email (GDPR). */
export function rateLimitKey(bucket: string, value: string, secret: string): string {
  return `${bucket}:${createHmac('sha256', secret).update(value.trim().toLowerCase()).digest('hex')}`;
}

/** Client IP from proxy headers (Vercel sets x-forwarded-for / x-real-ip). */
export function clientIp(headers: Pick<Headers, 'get'>): string {
  const forwarded = headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return forwarded || headers.get('x-real-ip')?.trim() || 'unknown';
}
