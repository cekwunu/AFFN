import 'server-only';
import { z } from 'zod';

const serverSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  PAYMENT_PROVIDER: z.enum(['mock', 'stripe', 'swedbank']).default('mock'),
  STRIPE_SECRET_KEY: z.string().min(1).optional(),
  STRIPE_WEBHOOK_SECRET: z.string().min(1).optional(),
  SWEDBANK_PAY_MERCHANT_TOKEN: z.string().min(1).optional(),
  SWEDBANK_PAY_PAYEE_ID: z.string().min(1).optional(),
  SWEDBANK_PAY_API_URL: z.url().optional(),
  BRREG_API_URL: z.url().default('https://data.brreg.no/enhetsregisteret/api'),
  EMAIL_PROVIDER_API_KEY: z.string().min(1).optional(),
  EMAIL_FROM: z.string().min(1).optional(),
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
