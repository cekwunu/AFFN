import type { EmailOtpType } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';
import { localizePath } from '@/i18n/paths';
import { safeNextPath } from '@/lib/auth/roles';
import { createClient } from '@/lib/supabase/server';

const TYPES = new Set<EmailOtpType>([
  'email',
  'signup',
  'recovery',
  'invite',
  'magiclink',
  'email_change',
]);

/**
 * Target of the links in Supabase's emails (verification, password reset, email change).
 * Verifies the token, which signs the user in, then sends them on in their language.
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const tokenHash = url.searchParams.get('token_hash');
  const type = url.searchParams.get('type') as EmailOtpType | null;

  const supabase = await createClient();
  const result =
    tokenHash && type && TYPES.has(type)
      ? await supabase.auth.verifyOtp({ type, token_hash: tokenHash })
      : null;

  const metadata = (result?.data.user?.user_metadata ?? {}) as {
    locale?: string;
    after_confirm?: unknown;
  };
  const locale = metadata.locale === 'en' ? 'en' : 'nb';
  const to = (path: string) =>
    NextResponse.redirect(new URL(localizePath(path, locale), url.origin));

  if (!result || result.error) return to('/sign-in?error=link_invalid');
  if (type === 'recovery') return to('/reset-password');
  return to(safeNextPath(metadata.after_confirm) ?? '/portal');
}
