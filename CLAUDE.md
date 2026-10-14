# AFF Marketplace — project memory

## What we are building
Commerce, vendor and sponsor platform for African Food Festival Norway (AFFN).
Visitors scan a vendor QR code, order and pay in the browser, and collect their food.
AFFN onboards vendors, takes commission, settles vendors after the event, and reports
to sponsors.
Full requirements: doc/PRD.md (v1.1). Requirement IDs such as VEN-02 refer to it.

## Locked decisions (never change without the owner's approval)
- A licensed payment provider (PSP) holds all customer money. AFFN never receives
  vendor sales money in its own account. No wallet, no stored value, no vendor-owned POS.
- The vendor is the seller of record. Receipts show vendor name and org number.
- Commission is "X % + mva" (25 % mva on the commission). Rates are per vendor with
  fallbacks: vendor → category → event → organization.
- AFFN absorbs PSP processing fees out of its commission.
- Stall fees are charged in addition to commission and paid into AFFN's own account.
- Assume vendors are NOT mva-registered; product mva_rate defaults to 0.
- Every vendor needs a valid Norwegian org number (checked against Brønnøysundregistrene).
- No customer accounts and no customer app in v1.
- Multi-tenant ready: organization → event → everything else.

## Stack
Next.js (App Router) + TypeScript strict · Tailwind + shadcn/ui restyled to our design
system · Supabase (Postgres, Auth, Storage, Realtime, Edge Functions) in an EU region ·
Vercel with EU function region · Vitest + Playwright · GitHub Actions.

## Non-negotiable engineering rules
- Money is integer øre (bigint). Never floats. Round half-up per order line, never on totals.
- ledger_entries is append-only. Corrections are new entries. Never UPDATE or DELETE money rows.
- Every table has organization_id; every event-scoped table has event_id. RLS on every
  table, with tests.
- The Supabase service role is used only in server code. No secrets in client bundles.
- All PSP calls go through src/lib/payments/provider.ts (PaymentProvider interface).
  Never call a PSP SDK elsewhere.
- Webhooks: verify signature, store raw event, process idempotently.
- Every approval, money event, role change and rate change writes to audit_log.
- Dates stored as timestamptz (UTC), shown in Europe/Oslo. Currency shown as "kr 1 234,50".
- UI text through the i18n layer: Norwegian bokmål (default) and English. No hard-coded strings.
- WCAG 2.1 AA. Public pages must stay fast on 4G (LCP < 2 s).
- Personal data in clearly marked columns so it can be exported or erased; financial
  records kept 5 years.

## Design rules
Premium Scandinavian base, subtle African identity. Warm earth accents on a calm neutral
palette, strong typography, generous spacing. No tribal-pattern overload, no loud
colours, no generic dashboard templates. Use the tokens and components in
src/components/ui and src/styles — never ad-hoc colours or spacing.

## How to work
- Start every task in plan mode; list files to change and tests to add before writing code.
- Write tests for money maths and RLS before the UI that uses them.
- Keep commits small; prefix with the prompt number (P07: ...).
- If a requirement is unclear or conflicts with this file, stop and ask the owner.
  Do not guess.
- After each task: run lint, typecheck and tests, and report results.

## Commands
Package manager: pnpm (Node 22, see .nvmrc). Copy `.env.example` to `.env.local` first.

| Command | What it does |
| --- | --- |
| `pnpm install` | Install dependencies |
| `pnpm dev` | Dev server at http://localhost:3000 (`/` = bokmål, `/en` = English) |
| `pnpm build` / `pnpm start` | Production build / serve it |
| `pnpm lint` | ESLint |
| `pnpm format` / `pnpm format:check` | Prettier write / check |
| `pnpm typecheck` | Generate Next route types, then `tsc --noEmit` |
| `pnpm test` / `pnpm test:watch` | Vitest unit tests (`src/**/*.test.ts`) |
| `pnpm test:e2e` | Playwright tests in `e2e/` (starts the dev server; `PORT` to change port) |
| `pnpm check:budget` | After `pnpm build`: fails if a public page ships > 150 kB gzipped JS (NFR-01) |
| `pnpm db:start` / `pnpm db:stop` | Local Supabase in Docker; `db:start` prints URL and keys |
| `pnpm db:env` | Write `.env.local` from the running local Supabase (keys, Mailpit SMTP); needed by `test:e2e` |
| `pnpm db:reset` | Recreate local DB from `supabase/migrations` + `supabase/seed.sql` |
| `pnpm db:types` | Regenerate `src/lib/supabase/database.types.ts` from the local DB (commit it) |
| `pnpm test:db` | RLS and integrity tests against the local DB (`pnpm db:reset` first for a clean run) |
| `pnpm db:advisors` | Supabase advisor lints (security + performance); fails on any warning |
| `pnpm exec supabase migration new <name>` | New SQL migration file |

CI (`.github/workflows/ci.yml`) runs lint, format:check, typecheck, test, build and check:budget on
every push, a database job (migrations from scratch, `test:db`, `db:advisors`, types drift) and a
Playwright job (`test:e2e`, incl. axe WCAG 2.1 AA checks on `/design` and the shells).

Database: migrations in `supabase/migrations` (never edit an applied one; add a new file). Every new
table needs RLS, explicit grants, a `tests/db/matrix.ts` entry and fixture rows in
`tests/db/fixtures.sql` — `test:db` fails otherwise. Helpers for policies live in schema `private`.
If Docker cannot pull from public.ecr.aws, set `SUPABASE_INTERNAL_IMAGE_REGISTRY=docker.io`. If Docker Hub
rate-limits, pull the image from `mirror.gcr.io/...` and `docker tag` it to the expected name.

Cloud: Supabase project `nwllhsbhdftrucgndjpc` ("Affn", eu-north-1 Stockholm), URL
`https://nwllhsbhdftrucgndjpc.supabase.co`. All migrations up to `20261016100000_vendor_onboarding` are
applied (no seed data). Reference data (organization, AFFN 2027, categories, commission rule, stall types)
is in `supabase/reference-data.sql`, applied once; no users or demo vendors. Apply each new migration there too, after CI is green. The Supabase connection
here cannot approve destructive statements: write migrations without them where possible (e.g.
`alter policy` instead of drop/create). pg_graphql is not installed on the cloud project.

Auth (P04): sign-in/up, reset and MFA run as server actions (`src/app/[locale]/(auth)/actions.ts`);
`src/proxy.ts` routes by the `affn` JWT claim from `private.custom_access_token_hook`; layouts recheck
live memberships with `requirePortal`. Admin helpers in RLS require `aal2`. Seed users all use password
`password`; platform@ and admin@ have the dev-only TOTP secret `KRSXG5CTMVRXEZLUKRSXG5CTMVRXEZLU`.
Emails locally go to Mailpit (http://127.0.0.1:54324). For a cloud project, also configure: the
access-token hook, TOTP MFA, custom SMTP (EU), the email templates in `supabase/templates`, site URL
and redirect URL `<site>/api/auth/confirm`, and minimum password length 12.

Vendor onboarding (P05): public `/become-a-vendor` reads stall types, key dates and the commission
rule from the database; the application lives at `/vendor/apply/[step]` (server actions in
`vendor/apply/actions.ts`, autosaved drafts in `event_vendors.application_progress`). The business is
created by `public.start_vendor_application` (service role) after the Brønnøysund check, which also
activates the pending vendor membership. Documents go to the private `vendor-documents` bucket
(signed URLs via `/api/vendor/documents/[id]`), logo and cover to the public `vendor-media` bucket,
both under `{vendor_id}/`. Agreement text is versioned (`AGREEMENT_VERSION` in
`src/lib/vendor/agreement.ts`): bump it when the Agreement messages change. Local e2e: start Supabase
with storage (`-x realtime,imgproxy,studio,edge-runtime,logflare,vector,supavisor,postgres-meta`).

Review centre (P06): `/admin/applications` (queue, URL filters) and `/admin/applications/[id]`. Decisions
go through `public.review_application` (wrapper over `private.review_application`): one `event_vendors`
audit row per action with the note as reason (`affn.audit_reason`); approval creates the stall fee
(stall type fee + 25 % mva) and its invoice; commission override only for Organization Admins.

Stalls and fees (P07): `/admin/stalls` (inventory, CSV import via `src/lib/stalls/csv.ts`),
`/admin/stalls/assign` (`public.assign_stall`, audited) and `/admin/stalls/layout` (venue image in the
public `event-media` bucket under `{event_id}/`, pins in basis points). Vendors see `/vendor/stall`; the
stall shows only after the fee is paid. Fees are paid by payment link from `PaymentProvider`; the mock
provider's checkout is `/pay/mock/[token]` and posts a signed webhook through `handlePaymentWebhook`
(also `/api/webhooks/[provider]`), which stores the raw event and calls `public.record_fee_payment`
(service role, idempotent, `fee_payments` only — never the vendor ledger). Prompt 09 replaces the mock.

Public pages stay light: their client islands get translated strings as props and use
`@/i18n/link` and `clsx` — no `useTranslations`, `cn` or Radix overlays in public client code.
