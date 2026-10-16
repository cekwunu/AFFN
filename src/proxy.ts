import createIntlMiddleware from 'next-intl/middleware';
import { NextResponse, type NextRequest } from 'next/server';
import { localizePath, splitLocale } from '@/i18n/paths';
import { routing } from '@/i18n/routing';
import { decideRoute } from '@/lib/auth/routing';
import { updateSession } from '@/lib/supabase/session';

const handleI18nRouting = createIntlMiddleware(routing);

/** Carries refreshed session cookies over to a redirect or rewrite response. */
function withCookies(target: NextResponse, source: NextResponse) {
  source.cookies.getAll().forEach((cookie) => target.cookies.set(cookie));
  source.headers.forEach((value, key) => {
    if (['cache-control', 'expires', 'pragma'].includes(key)) target.headers.set(key, value);
  });
  return target;
}

export async function proxy(request: NextRequest) {
  const intlResponse = handleI18nRouting(request);
  const { response, claims } = await updateSession(request, intlResponse);

  // Locale redirects (e.g. /nb/vendor → /vendor) are handled first.
  if (response.headers.has('location')) return response;

  // Portal protection (AUTH-02, AUTH-04). Layouts check again with live memberships.
  const { locale, path } = splitLocale(request.nextUrl.pathname);
  const decision = decideRoute(path, request.nextUrl.search, claims);
  if (decision.type === 'redirect') {
    return withCookies(
      NextResponse.redirect(new URL(localizePath(decision.to, locale), request.url)),
      response,
    );
  }
  if (decision.type === 'forbidden') {
    return withCookies(
      NextResponse.rewrite(new URL(`/${locale}/forbidden`, request.url), { status: 403 }),
      response,
    );
  }
  return response;
}

export const config = {
  // Everything except API routes, Next.js internals and files with an extension.
  // /s/[code] (sponsor links) is left alone: it records a hit and redirects, setting no cookies.
  matcher: '/((?!api|s/|_next|_vercel|.*\\..*).*)',
};
