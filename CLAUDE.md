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
| `pnpm db:start` / `pnpm db:stop` | Local Supabase in Docker; `db:start` prints URL and keys |
| `pnpm db:reset` | Recreate local DB from `supabase/migrations` + `supabase/seed.sql` |
| `pnpm db:types` | Regenerate `src/lib/supabase/database.types.ts` from the local DB |
| `pnpm exec supabase migration new <name>` | New SQL migration file |

CI (`.github/workflows/ci.yml`) runs lint, format:check, typecheck and test on every push, plus a
Playwright job (`test:e2e`, incl. axe WCAG 2.1 AA checks on `/design` and the shells).
