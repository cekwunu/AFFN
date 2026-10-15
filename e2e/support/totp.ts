import { authenticator } from 'otplib';

/** Dev-only TOTP secret of the seeded Org Admin and Platform Owner (supabase/seed.sql). */
export const SEED_TOTP_SECRET = 'KRSXG5CTMVRXEZLUKRSXG5CTMVRXEZLU';

const lastStep = new Map<string, number>();

/** A TOTP code that has not been used in this run (waits for the next 30 s step if needed). */
export async function freshTotp(secret: string): Promise<string> {
  const step = () => Math.floor(Date.now() / 30_000);
  while (lastStep.get(secret) === step()) {
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  lastStep.set(secret, step());
  return authenticator.generate(secret);
}
