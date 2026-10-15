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
- After each prompt: push, open a pull request into `main` and merge it once CI is green and
  the cloud migrations are applied (standing owner instruction). Never merge with red CI.
- Anything the owner must do outside Claude (Vercel, Supabase dashboard, SQL editor, DNS, PSP
  accounts, …): assume no prior knowledge and give numbered step-by-step instructions — where to
  click, exactly what to enter or paste, what they should see, and how to tell it worked
  (standing owner instruction).

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
| `pnpm check:lighthouse` | Lighthouse (mobile) on `LIGHTHOUSE_URL` against `pnpm start`: performance and accessibility ≥ 90 |
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
`https://nwllhsbhdftrucgndjpc.supabase.co`. All migrations up to `20261025100000_reconciliation` are
applied (no seed data). Reference data (organization, AFFN 2027, categories, commission rule, stall types)
is in `supabase/reference-data.sql`, applied once; no users or demo vendors. Apply each new migration there too, after CI is green. The Supabase connection
here cannot approve destructive statements (including `delete from` inside function bodies): write
migrations without them where possible (e.g. `alter policy` instead of drop/create), and put the
unavoidable ones in a separate small migration the owner runs in the SQL editor. pg_graphql is not installed on the cloud project.
Leaked-password protection (Auth) needs a paid Supabase plan: the owner turns it on when the plan is
upgraded, so the advisor's `auth_leaked_password_protection` warning on the cloud project is expected
until then.

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
with storage and Realtime (`-x imgproxy,studio,edge-runtime,logflare,vector,supavisor,postgres-meta`).

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
(service role, idempotent, `fee_payments` only — never the vendor ledger).

Payments (P09): `src/lib/payments/provider.ts` is the provider-agnostic interface (types only);
`getPaymentProvider()` in `src/lib/payments/index.ts` picks it by `PAYMENT_PROVIDER`. The mock
(`src/lib/payments/mock/`, always TEST MODE) has hosted onboarding and payment pages at
`/pay/mock/[token]`; `providers/` holds TODO stubs for Stripe Connect and Swedbank Pay (Prompt 22).
Every provider must pass `src/lib/payments/contract.ts` (run for the mock in
`mock/mock.contract.test.ts`). Webhooks: `processWebhook` stores the raw event, skips ids already
processed, and applies them via service-role functions (`record_order_payment`,
`record_fee_payment`, `set_payment_account_status`, refund/payout results). Vendors onboard at
`/vendor/payouts` (`set_payment_account`, audited with `affn.audit_actor`); selling needs
`psp_account_status = 'eligible'` (shown as Enabled). Money maths: `src/lib/money`
(`calculateCommission`, `resolveCommissionRule` — category rule only when the whole order is in
that category — and `proRataFeeReversal`).

Vendor portal and catalogue (P08): `/vendor` (status cards, next steps), `/vendor/profile` (story,
contact, socials, catering, logo/cover, gallery in `vendor_gallery_images`, max 8, alt text required),
`/vendor/products` (menu in `products.sort_order`, one order per vendor; duplicate, archive/restore,
delete via `public.delete_product` only when no order refers to it), `/vendor/products/availability`
(`product_availability` per event + sold-out) and `/vendor/preview` (`VendorPage` in
`src/components/vendor-page`, server-only, reused by the public page). Rules in `src/lib/catalogue`
(14 EU allergens, mva 0 % unless `vendors.mva_registered`, also enforced by a trigger). Images are
compressed in the browser (`src/lib/images/compress.ts`) and stored in `vendor-media/{vendor_id}/products|gallery/`.
Vendor client components use `useTranslations` inside `<ClientIntl namespaces=…>` (portal pages only).

Storefront and checkout (P10): the QR points at `/e/[event]/[vendor]` (`getStorefront` in
`src/lib/storefront/server.ts`, admin client with explicit public filters; blocked states paused /
payouts / closed). Cart islands in `src/components/storefront` (sessionStorage, native `<dialog>`).
The `checkout` server action prices the cart, resolves the rule, then `public.create_order` (service
role, atomic; recomputes prices and the fee and rejects any mismatch) → `createPayment` →
`attach_provider_payment`. Receipt and order status at `/o/[token]` (`getReceipt`), with an optional
emailed copy. Vendors download the PNG and A5 PDF table sign at `/vendor/qr` (`/api/vendor/qr/[format]`,
`src/lib/storefront/qr.ts`; URL from `NEXT_PUBLIC_SITE_URL`). `pnpm check:lighthouse` (mobile, median
of 3, performance and accessibility ≥ 90) runs in CI against a production build of the seeded vendor page.

Orders and kitchen (P11): order codes like `B·A1-007` (festival day letter from `events.starts_at` in
Oslo, `T` outside festival days; active stall; daily number) are set at insert by
`private.assign_order_number` and never change. Vendors move orders one step at a time
(new → accepted → preparing → ready → collected), enforced by `private.guard_order_update` and
audited; cancelling goes through `cancelOrder` (`src/app/[locale]/(kitchen)/vendor/kitchen/actions.ts`):
`public.begin_order_cancellation` (cancel + pending full refund) → `PaymentProvider.refund` →
`public.record_order_refund`. The kitchen (`/vendor/kitchen`, own full-screen route group) listens to
`postgres_changes` on `orders` (set the Realtime auth token before subscribing) and refetches
everything on each event and on reconnect; the customer's `/o/[token]` listens to the broadcast topic
`order:{tracking_token}` (sent by triggers on orders and refunds) with `@supabase/realtime-js` only.
History at `/vendor/orders`. Local e2e needs Realtime: start Supabase without `-x realtime`, and run
`docker restart supabase_realtime_affn` after `pnpm db:reset`. The kitchen e2e runs after the other
specs (Playwright project dependency) because the storefront spec briefly pauses the same vendor.

Commission and ledger (P12): Organization Admins add rules at `/admin/commission` (insert-only
rules, reason required and audited, effective-from never in the past — `private.guard_commission_rule`;
live "kr 500 sale" example in `src/components/admin/commission-form.tsx`). The ledger is posted by
triggers when a payment or refund becomes `succeeded` (`private.post_order_ledger`,
`private.post_refund_ledger`), in the same transaction, from the order's snapshot and the PSP fee the
provider reports (`payment.succeeded.pspFeeOre`, stored in `payments.psp_fee_ore` by the 8-argument
`record_order_payment`). `src/lib/money/ledger.ts` is the specification: property tests in
`ledger.test.ts`, and `tests/db/ledger.test.ts` checks the SQL posts the same lines. Refunds reverse
vendor share, commission and mva pro rata; the PSP fee is never reversed. `/admin/ledger` compares
`public.event_money_totals` (ledger vs orders/refunds); vendor balances (`public.vendor_balances`,
RLS) show on `/vendor/payouts`. The mock PSP fee is 2,5 % (illustrative). Commission e2e runs in the
`kitchen` Playwright project after the other specs.

Settlements (P13): `/admin/settlements` (queue, history, new batch with vendors + cut-off) and
`/admin/settlements/[id]`. Lines are snapshots written only by `private.prepare_settlement_lines`
(public invoker wrapper; event staff, draft only): per vendor, ledger movements after its previous
cut-off up to the batch cut-off (`private.vendor_period`); `refunds_ore` is the vendor's share of
refunds and lost disputes. `public.settlement_blockers` (unreconciled — `private.unreconciled_count`,
filled in by P14 —, open dispute, payout account not eligible, negative, no lines) stops
`prepared`/`approved` (trigger). Four eyes: approver is an Organization Admin ≠ preparer
(`private.settlement_workflow` + check). Adjustments only while draft, approved by an Org Admin ≠
creator, counted after a refresh. Release (`releaseSettlement`): `begin_settlement_release` (posts
adjustments to the ledger, one pending payout per unpaid line, new attempt on retry) →
`PaymentProvider.releasePayout` → `record_payout` (paid → Dr vendor_payable / Cr psp_clearing; batch
→ completed / completed_with_failures; retry from partially failed). Disputes come from the PSP
(`dispute.opened/closed` webhook → `record_dispute`; lost = Dr vendor_payable / Cr psp_clearing);
the mock's `simulateDispute` is wired to test-mode buttons on the batch page. Vendors see
`/vendor/settlements`. Table containers are focusable (keyboard scrolling, axe).

Transactions and reconciliation (P14): `/admin/transactions` lists payments, refunds and payouts
(`public.transactions` view, security invoker) with URL filters and a detail panel (`?open=kind:id`;
ledger, items, audit; raw provider events for Organization Admins). Reconciliation
(`src/lib/reconciliation`: pure `reconcile()` in `match.ts`, `runReconciliation` in `server.ts`)
compares `PaymentProvider.fetchSettlementReport` with our tables and stores the run with
`public.record_reconciliation` (service role): one open `reconciliation_items` row per provider id
and kind; open items resolve themselves when a later run no longer finds them. Vercel Cron
(`vercel.json`) calls `/api/cron/reconcile` daily with `Authorization: Bearer CRON_SECRET` (last
48 h); `/admin/reconciliation` has "Run now" and the assign / comment / resolve-with-reason workflow
(audited). Open items for the event (or with no event) block settlement via
`private.unreconciled_count`. TEST MODE: rows in `mock_report_overrides` (drop / amount / fee /
extra) change the mock report so mismatches can be injected. CSV exports at `/admin/exports`
(`/api/admin/exports`, `src/lib/exports`): semicolon, decimal comma, UTF-8 BOM, Oslo times; columns
in `docs/exports.md` (update it when a column changes). The reconciliation e2e is its own
Playwright project after `kitchen`.

Public pages stay light: their client islands get translated strings as props and use
`@/i18n/link` and `clsx` — no `useTranslations`, `cn` or Radix overlays in public client code.
