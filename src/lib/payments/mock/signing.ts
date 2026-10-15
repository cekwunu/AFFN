import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

/** Signed, tamper-proof tokens and webhook signatures for the mock payment provider. */

const encode = (value: string) => Buffer.from(value).toString('base64url');
const decode = (value: string) => Buffer.from(value, 'base64url').toString('utf8');

export function sign(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

export function verify(payload: string, signature: string | null, secret: string): boolean {
  if (!signature) return false;
  const expected = Buffer.from(sign(payload, secret));
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/** Short stable id derived from a key, so the same idempotency key gives the same object. */
export function stableId(prefix: string, key: string): string {
  return `${prefix}_${createHash('sha256').update(key).digest('hex').slice(0, 24)}`;
}

/** Body and signature joined by "~": a "." in the path would make the proxy skip the page. */
export function encodeToken<T extends { exp: number }>(payload: T, secret: string): string {
  const body = encode(JSON.stringify(payload));
  return `${body}~${sign(body, secret)}`;
}

/** The token's payload when it is authentic and not expired; otherwise null. */
export function decodeToken<T extends { exp: number }>(
  token: string,
  secret: string,
  now = Date.now(),
): T | null {
  const [body, signature] = token.split('~');
  if (!body || !signature || !verify(body, signature, secret)) return null;
  try {
    const payload = JSON.parse(decode(body)) as T;
    return payload.exp > now ? payload : null;
  } catch {
    return null;
  }
}
