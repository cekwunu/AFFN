import 'server-only';
import { z } from 'zod';

const serverSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  PAYMENT_PROVIDER: z.enum(['mock', 'stripe', 'swedbank']).default('mock'),
  // Signs mock payment links and webhooks (temporary stub until a real provider, P09).
  MOCK_PAYMENT_SECRET: z.string().min(1).optional(),
  STRIPE_SECRET_KEY: z.string().min(1).optional(),
  STRIPE_WEBHOOK_SECRET: z.string().min(1).optional(),
  SWEDBANK_PAY_MERCHANT_TOKEN: z.string().min(1).optional(),
  SWEDBANK_PAY_PAYEE_ID: z.string().min(1).optional(),
  SWEDBANK_PAY_API_URL: z.url().optional(),
  BRREG_API_URL: z.url().default('https://data.brreg.no/enhetsregisteret/api'),
  // Email (invitations etc.) over SMTP: Mailpit locally, an EU provider in production.
  SMTP_HOST: z.string().min(1).optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_USER: z.string().min(1).optional(),
  SMTP_PASS: z.string().min(1).optional(),
  SMTP_SECURE: z.enum(['true', 'false']).default('false'),
  EMAIL_FROM: z.string().min(1).default('AFF Marketplace <no-reply@affn.no>'),
  // Organization that self sign-up joins (single tenant today).
  DEFAULT_ORGANIZATION_SLUG: z.string().min(1).default('affn'),
  // Key for hashing rate-limit buckets; required in production.
  RATE_LIMIT_SECRET: z.string().min(1).optional(),
  // Vercel Cron sends it as a bearer token to /api/cron/* (daily reconciliation, P14).
  CRON_SECRET: z.string().min(16).optional(),
  // Multiplies per-IP limits (e.g. for end-to-end tests where every request has the same IP).
  RATE_LIMIT_IP_SCALE: z.coerce.number().positive().default(1),
});

const emptyToUndefined = (value: string | undefined) => (value === '' ? undefined : value);

export const serverEnv = serverSchema.parse(
  Object.fromEntries(
    Object.keys(serverSchema.shape).map((key) => [key, emptyToUndefined(process.env[key])]),
  ),
);

export function requireServiceRoleKey(): string {
  if (!serverEnv.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set (see .env.example).');
  }
  return serverEnv.SUPABASE_SERVICE_ROLE_KEY;
}
