#!/usr/bin/env bash
# Writes .env.local for the app from the running local Supabase (`pnpm db:start` first).
# Local-only values: the demo keys of the local stack and Mailpit as SMTP server.
set -euo pipefail
STATUS="$(pnpm exec supabase status -o env 2>/dev/null)"
get() { echo "$STATUS" | grep "^$1=" | cut -d= -f2- | tr -d '"'; }
cat > .env.local <<ENV
NEXT_PUBLIC_SITE_URL=http://localhost:3000
NEXT_PUBLIC_SUPABASE_URL=$(get API_URL)
NEXT_PUBLIC_SUPABASE_ANON_KEY=$(get ANON_KEY)
SUPABASE_SERVICE_ROLE_KEY=$(get SERVICE_ROLE_KEY)
DEFAULT_ORGANIZATION_SLUG=affn
RATE_LIMIT_SECRET=local-development-only
SMTP_HOST=127.0.0.1
SMTP_PORT=54325
EMAIL_FROM="AFF Marketplace <no-reply@affn.test>"
ENV
echo "Wrote .env.local"
