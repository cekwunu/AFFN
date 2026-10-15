import { createHmac } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';

/** A variable from the environment or from .env.local (which the dev server reads). */
function env(name: string): string | undefined {
  if (process.env[name]) return process.env[name];
  if (!existsSync('.env.local')) return undefined;
  const line = readFileSync('.env.local', 'utf8')
    .split('\n')
    .find((l) => l.startsWith(`${name}=`));
  return line?.slice(name.length + 1).trim() || undefined;
}

/** The mock provider's signing secret, derived exactly as src/lib/payments/index.ts does. */
export function mockSecret(): string {
  const explicit = env('MOCK_PAYMENT_SECRET');
  if (explicit) return explicit;
  const rateLimit = env('RATE_LIMIT_SECRET');
  return rateLimit ? `mock-payments:${rateLimit}` : 'development-only';
}

export const signMock = (rawBody: string, secret = mockSecret()) =>
  createHmac('sha256', secret).update(rawBody).digest('base64url');
