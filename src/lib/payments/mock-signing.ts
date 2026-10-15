import { createHmac, timingSafeEqual } from 'node:crypto';

/** Signed, tamper-proof tokens for the mock provider's payment links and webhooks. */

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

export interface LinkPayload {
  kind: 'stall_fee';
  reference: string;
  amountOre: number;
  description: string;
  returnUrl: string;
  /** Expiry, epoch milliseconds. */
  exp: number;
}

/** Body and signature joined by "~": a "." in the path would make the proxy skip the page. */
export function encodeLinkToken(payload: LinkPayload, secret: string): string {
  const body = encode(JSON.stringify(payload));
  return `${body}~${sign(body, secret)}`;
}

/** The link's payload when the token is authentic and not expired; otherwise null. */
export function decodeLinkToken(
  token: string,
  secret: string,
  now = Date.now(),
): LinkPayload | null {
  const [body, signature] = token.split('~');
  if (!body || !signature || !verify(body, signature, secret)) return null;
  try {
    const payload = JSON.parse(decode(body)) as LinkPayload;
    return payload.exp > now ? payload : null;
  } catch {
    return null;
  }
}
