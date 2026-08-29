# Migration Plan — `rental-migration`

Status tracking document for rebuilding the bridal-rental SaaS as a single
full-stack Next.js application. Update the checkboxes as each phase lands;
do not delete completed sections — they are the record of what shipped and
why.

**Legend:** ☐ not started · 🔄 in progress · ☑ done

---

## 1. Existing System Summary

The current product is two separate apps in this repo:

- **`backend/`** — FastAPI + SQLAlchemy 2.0 + Postgres, layered as
  `routers → services → repositories → models`. Multi-tenant: `Shop` is the
  tenant, `Outlet` the branch, `User` covers super_admin/admin/manager/staff/
  customer in one table (`role` enum + `shop_id` + `outlet_id`).
  Tenant/outlet scope is derived only from the authenticated user
  (`AccessContext` in `app/core/context.py`), never from the request —
  cross-tenant reads 404, not 403. RBAC is a `Permission` enum +
  `ROLE_PERMISSIONS` table (`app/core/permissions.py`). This layer is
  genuinely well designed and is the main thing worth preserving
  _conceptually_ in the rebuild.
- **`frontend/`** — Next.js Pages/App hybrid using the Devias MUI "Material
  Kit React" template. Talks to the backend over REST via a hand-rolled
  fetch client (`src/lib/api.ts`) that stores JWTs in `localStorage`.

Core domain lifecycle (see `docs/client-requirment.md` and `CLAUDE.md`):
`Product → Barcode → Customer → Booking → Availability → Payment → Pickup →
Return → Damage/Deposit → Cleaning/Maintenance → Available again`, wrapped by
Tenant → Outlet → Staff → Attendance → Salary → WhatsApp → Reports.

There is **no subscription/billing model at all** in the existing backend —
`Shop` is created directly by a super admin with no plan, payment, or
renewal fields, despite `client-requirment.md` describing a full
subscription lifecycle. This matches the current instruction that billing is
out of scope; see § 3 conflicts below for how that's reconciled.

## 2. Client Requirements Summary

From `docs/client-requirment.md` (full doc; only the parts that shape scope
are summarised):

- Four actors: **Super Admin** (platform/SaaS owner), **Shop Owner**
  (tenant admin), **Staff** (outlet operations), **Customer** (shop-managed,
  no login required for MVP).
- Super Admin: sells/activates subscriptions, creates Shops and their first
  Shop Owner, hands over credentials, monitors the platform. Does **not**
  run daily rental operations.
- Shop Owner: first-time setup (outlet → categories → staff → products →
  payments → notifications), then manages the full rental business:
  outlets, staff/roles/permissions/attendance/salary, product catalogue
  (category/size/color/price/deposit/images/barcode/SKU), customers,
  bookings, payments, returns, damage/deposit settlement, cleaning/
  maintenance, reports.
- Staff: attendance (GPS geofence check-in/out), booking creation (scan
  barcode, select dates, availability check), payment recording, pickup/
  return execution, cleaning/maintenance handling.
- Booking lifecycle: availability validated against date-range overlap on
  the _physical item_ → amount = rent + deposit − discount → advance/balance
  payment (cash/UPI) → confirmation + WhatsApp → pickup (status → RENTED) →
  return (condition: good/minor/major damage) → deposit settlement (release
  or apply against damage) → cleaning/maintenance → available again. A
  returned item must never become available while cleaning/maintenance is
  open.
- Admin scope explicitly requested for _this_ MVP (not full doc §2–§2.3,
  §25): manual tenant onboarding by us — tenant list/detail, add tenant,
  create the tenant's first admin user with a temporary password, force
  password reset on first login, block/unblock tenant, tenant status.
- Subscription billing/payments/plans (doc §2.1, §19–§25) are **out of
  scope** per explicit product-stage instructions, and excluded here.
- No public customer signup/self-service portal required now (doc §22, §26).

## 3. Problems Found

### 3.1 Architectural

- No `Subscription`/billing model, despite the client doc describing one —
  acceptable and intentionally **not** rebuilt now (see conflicts below),
  but `Shop.is_active` alone has to carry "block/unblock tenant" for the MVP.
- `app/routers/auth.py`, `app/core/security.py`, `app/routers/reviews.py`,
  `app/routers/wishlist.py` are empty dead files; real auth logic actually
  lives in `app/routers/users.py` / `app/services/user_service.py`
  (`AuthService`) — confusing to navigate, not migrating the split as-is.
- JWTs (access + refresh) are stored in browser `localStorage`
  (`frontend/src/lib/api.ts`), are stateless, and have no server-side
  revocation — a stolen refresh token survives a password change for its
  full 7-day life, and blocking a user/tenant doesn't invalidate tokens
  already issued.
- Rate limiting (`app/middleware/rate_limit.py`) is in-memory, per-process,
  IP-only — acceptable for one instance, documented as a known limit.

### 3.2 RBAC / logical bugs (verified by reading the code, not assumed)

- **No role can create a `manager` account except `super_admin`**
  (`ASSIGNABLE_ROLES` in `user_service.py`: `ADMIN → {STAFF, CUSTOMER}`,
  `MANAGER → {STAFF, CUSTOMER}`). This contradicts the client doc, where the
  Shop Owner is supposed to create staff, assign roles, and put a manager on
  an outlet. **Fix in rebuild:** tenant admin can create `manager` for their
  own shop.
- **`ShopService.update_shop` requires `Permission.SHOP_MANAGE`, but
  `_OWNER_PERMISSIONS` explicitly excludes it** — a tenant admin can never
  edit their own shop's profile through the API; only `super_admin` can.
  Contradicts "Shop Owner manages the business." **Fix in rebuild:** tenant
  admin can edit their own shop's non-sensitive profile fields; only
  super_admin can rename/reassign/delete the tenant record itself.
- **`BookingService.create_booking`/`update_booking`: client-supplied
  `rent_amount` has no permission gate** (unlike `discount_amount`, which
  requires `BOOKING_DISCOUNT`) — any staff with `BOOKING_CREATE` can set an
  arbitrary rent price. **Fix in rebuild:** rent price is derived from the
  variation's price by default; overriding it requires an explicit
  permission, same as discount.
- **`UserService.update_user`'s self-edit path skips permission checks and
  lets a user set a brand new `password` directly with no current-password
  check** (unlike the dedicated `/users/change-password` endpoint), and lets
  a customer move their own `outlet_id`. **Fix in rebuild:** password
  changes only ever go through one path that requires the current password
  (or is the explicit "admin resets someone else's password" action, which
  requires a permission and produces a `must_change_password` temp
  password rather than a silent field write).
- `must_change_password` is stored and returned by login, but nothing in
  the backend actually blocks API access while it's `true` — enforcement is
  advisory/frontend-only today. **Fix in rebuild:** enforced server-side
  (Phase 7).

### 3.3 Validation / data problems

- Email/phone uniqueness is correctly scoped per-shop at the DB level
  (`UniqueConstraint("shop_id", "email", ...)`), which is good and is being
  kept conceptually.
- No visible password policy (length/character-class) enforcement beyond
  "not empty" in the schemas reviewed — the rebuild defines one explicit
  policy shared by server validation and the sign-in/reset forms.

### 3.4 UI/UX

- `frontend/` is the Devias MUI "Material Kit React" template — generic
  admin-dashboard visual language, not tailored to this domain, and
  explicitly called out as disposable. Not evaluated further; the new UI is
  designed from scratch per the `impeccable` skill.

### 3.5 Technical debt / out-of-scope-for-now

- Nothing billing-related exists to strip out (there was never a
  billing/subscription implementation) — simplifies this migration
  considerably; no legacy payment-gateway code to audit or remove.
- `app/worker.py` (WhatsApp/notification delivery via an outbox +
  long-running poll loop) has no direct Next.js equivalent — Next.js route
  handlers are request-driven, not long-running processes. Addressed in
  Phase 17 (needs a scheduled trigger: cron hitting a route handler, or a
  small standalone Node script — decided when that phase starts).

## 4. Target Architecture

### 4.1 Stack

| Concern    | Choice                                                                                                                                                                      | Why                                                                                                                                                                                                       |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Framework  | Next.js 16 (App Router, Turbopack default), React 19                                                                                                                        | Single deployable for FE+BE, per the brief                                                                                                                                                                |
| Language   | TypeScript, strict mode                                                                                                                                                     | Type safety end to end                                                                                                                                                                                    |
| UI         | shadcn/ui (`base-nova` style) + Tailwind v4 + Geist (self-hosted via the `geist` package, not `next/font/google`, so builds don't depend on network access to Google Fonts) | Per brief; light mode only, no theme toggle wired up                                                                                                                                                      |
| Validation | Zod v4                                                                                                                                                                      | Same schema reusable for form + API boundary                                                                                                                                                              |
| Database   | Postgres (existing `docker-compose.yml` Postgres works as-is)                                                                                                               | No infra change                                                                                                                                                                                           |
| ORM        | **Drizzle ORM** + `postgres` (postgres.js driver)                                                                                                                           | SQL-shaped, no query-engine binary/cold-start tax, migrations are plain reviewable SQL (closest analogue to the existing Alembic workflow) — see § 4.6 for the Prisma alternative considered and rejected |
| Auth       | Custom **DB-backed sessions**, httpOnly+Secure+SameSite=Lax cookie holding a random token; only the token's SHA-256 hash is stored                                          | Fixes the old app's biggest security gap (§3.2): revocable by row delete, no XSS-stealable token in `localStorage`, no denylist needed                                                                    |
| Passwords  | `bcryptjs`, 12 rounds                                                                                                                                                       | Pure-JS, no native build step, adequate MVP cost factor                                                                                                                                                   |

### 4.2 Folder structure

```
rental-migration/
  plan.md
  drizzle.config.ts
  .env.example
  src/
    proxy.ts                     # route-protection presence check (Next 16 renamed middleware.ts → proxy.ts)
    app/
      admin/                     # platform admin surface
        login/page.tsx
        (dashboard)/
          layout.tsx             # session + role guard, admin shell
          tenants/page.tsx
          tenants/new/page.tsx
          tenants/[id]/page.tsx
      (tenant)/                  # tenant-facing surface, added from Phase 6 on
        login/page.tsx
        dashboard/...
      api/
        admin/auth/login/route.ts
        admin/auth/logout/route.ts
        admin/tenants/route.ts
        admin/tenants/[id]/route.ts
        ...
      layout.tsx
      globals.css
      page.tsx
    components/
      ui/                        # shadcn primitives (generated, not hand-edited)
      admin/                     # admin-surface composed components
      shared/
    lib/
      env.ts                     # zod-validated process.env
      db/
        client.ts                # drizzle client (postgres.js, pooled, cached across HMR)
        schema/                  # one file per table + barrel index.ts
      auth/
        password.ts              # hash/verify
        password-policy.ts        # shared length/char-class rules
        session.ts                # createSession/getCurrentUser/destroySession
      errors/
        app-error.ts             # thrown in server code for a specific status+message
        api-response.ts          # apiSuccess/apiError → shared JSON envelope
      validation/
        common.ts                # shared Zod primitives (email/password/name/phone/uuid)
    server/                      # one folder per feature once built: <feature>/service.ts
    types/
    hooks/
```

No separate repository layer the way the FastAPI backend has one: for an
MVP at this scale, Drizzle queries live directly inside each feature's
`service.ts` (still one file per feature, still no DB access from route
handlers or components) — an extra repository indirection didn't pay for
itself yet. Revisit if/when a table needs the same query shape from many
unrelated features.

### 4.3 Authentication & session management

There are two independent session mechanisms, not one, because there are
two independent identities:

- **Platform super admin (Phase 1, implemented as env-based credentials,
  not a database row —** see §4.7a below for why this changed from the
  original DB-seeded design). `POST /api/admin/auth/login` verifies the
  submitted email/password against `SUPER_ADMIN_EMAIL`/`SUPER_ADMIN_PASSWORD`
  (constant-time comparison) and, on success, sets a **stateless, HMAC-signed
  cookie** (`admin_session`): payload `<issuedAt>.<expiresAt>` signed with
  `SESSION_SECRET`, 12-hour expiry. There is no database row to join against
  for this identity, so `isSuperAdminAuthenticated()` only verifies the
  signature and expiry — it never touches the database. This is a
  deliberately smaller mechanism than the one below: there is exactly one
  super admin, defined by the environment, so there is nothing to revoke
  per-account (rotate `SESSION_SECRET` to invalidate every outstanding admin
  session if one is ever suspected to have leaked).
- **Tenant users (Phase 6+, `users`/`sessions` tables, already scaffolded in
  Phase 0).** Sign-in verifies `email` (+ tenant context) and password
  (`bcryptjs.compare`), then calls `createSession(userId)`, which inserts a
  `sessions` row (`userId`, SHA-256 `tokenHash`, `expiresAt`) and sets an
  httpOnly/Secure(prod)/SameSite=Lax cookie holding the _raw_ token — the
  raw token is never stored anywhere server-side.
- Every request that needs tenant-user identity calls `getCurrentUser()`
  (route handler or Server Component), which hashes the cookie token and
  joins `sessions → users`; expired/missing/deactivated → `null`. This is a
  DB read on every request (acceptable at 2–3 tenants; add a short-TTL cache
  later if it ever matters).
- `logout` deletes the session row and clears the cookie.
  `destroyAllSessionsForUser` is used by block/unblock, forced password
  reset, and role changes so revocation is immediate, not "eventually when
  the JWT expires."
- `proxy.ts` (Next 16's renamed `middleware.ts`) only checks _cookie
  presence_ — `admin_session` for `/admin/**` (excluding `/admin/login`),
  `session_token` for `/dashboard/**` — and redirects to the matching login
  page if absent. It deliberately never touches the database (proxy must
  stay fast/side-effect-free). The real check (validity, expiry, and for
  tenant users role/`is_active`/`must_change_password`) happens once per
  protected page/layout via `isSuperAdminAuthenticated()`/
  `getCurrentUser()`, which is where a redirect-to-login or
  redirect-to-reset-password is actually enforced.

### 4.4 Authorization / tenant isolation

Carried forward conceptually from the backend's `AccessContext`, adapted to
server components/route handlers:

- A user's `shopId` and `role` come only from the session-resolved DB row —
  never from a client-supplied body/query param. Any tenant id sent by the
  client is only ever a _narrowing_ filter, validated against the session's
  `shopId` first.
- Cross-tenant lookups return **404**, not 403 (same reasoning as the
  existing backend: don't let a tenant probe for another tenant's ids).
- Role → permission mapping ported as a small `permissions.ts` module (added
  in Phase 8 alongside outlets/staff, once there's more than one role to
  distinguish) — RBAC is enforced server-side in every route handler/server
  action; any client-side check is navigation-only, same rule as `CLAUDE.md`
  states for the old app.

### 4.5 Validation & error handling

- Zod schemas in `src/lib/validation/` (shared primitives) plus one schema
  per feature/form, reused for both the client form (`react-hook-form` +
  `zodResolver`, added when the first real form ships in Phase 1) and the
  route handler's own `schema.parse(await request.json())`.
- Route handlers wrap their body in `try { … } catch (error) { return
apiError(error); }`. `apiError` maps a thrown `AppError` to its declared
  status, a `ZodError` to `422` with field errors, and anything else to a
  generic `500` with no internal detail leaked — mirrors the old backend's
  `error_response`/exception-handler-middleware pattern, minus the FastAPI
  specifics.
- Every JSON response — success or failure — uses the same
  `{ success, message, data, errors }` envelope, so the client has one
  contract to parse (kept deliberately close to the old
  `{ success, message, data }` shape so the lesson learned there —
  "field errors need a place to live" — isn't lost).

### 4.6 Alternatives considered and rejected

- **Prisma** instead of Drizzle — more batteries-included, but ships a
  separate query-engine binary and has historically had cold-start/
  serverless friction; Drizzle's SQL-shaped queries also make the
  tenant-scoping discipline (`where(eq(table.shopId, ctx.shopId))`
  everywhere) more visible in review than an ORM that hides the SQL. Either
  would have been a reasonable choice for 2–3 tenants; Drizzle was chosen
  for the closer fit to "review the WHERE clause" tenant-isolation habit
  this codebase needs.
- **Proxying to the existing FastAPI backend** instead of rebuilding data
  access in Next.js — rejected because the brief is explicit that the new
  app contains _both_ frontend and backend, and because the FastAPI layer
  has the RBAC bugs listed in §3.2 that need fixing, not preserving behind
  a proxy.
- **NextAuth/Auth.js** instead of a custom session module — considered, but
  the actual requirement (email+password, DB-revocable sessions, forced
  password reset, tenant-scoped login) is small enough that a ~100-line
  custom module is easier to audit line-by-line than configuring a larger
  library's adapter model for a single credentials provider.

### 4.7 Open assumption to confirm with the user

**No automatic data migration from the old `rental_db` is planned.** The new
app starts from a fresh schema/database (`DATABASE_URL` in `.env.example`
points at a _different_ database name, `rental_migration`, specifically so
it can't collide with the old one). If any of the 2–3 real tenants already
have live data in the old system that must carry over, that needs an
explicit ETL phase — flag this before Phase 4 (Add Tenant) if it applies.

### 4.7a Decision: super admin credentials live in the environment, not the database

The original Phase 1 plan (below, superseded) was a DB-seeded super admin
row plus a `scripts/seed-super-admin.ts`, mirroring
`backend/scripts/create_super_admin.py`. The user decided otherwise for this
MVP: `SUPER_ADMIN_EMAIL`/`SUPER_ADMIN_PASSWORD` are read directly from the
server environment (validated by `src/lib/env.ts`), with no database
involvement at all for this identity — no seed script, no `users` row, no
`sessions` row. Consequences worth tracking as the app grows past 2–3
tenants:

- There is exactly **one** super admin account. Multiple platform-team
  logins, individual audit attribution for super-admin actions, and
  per-admin revocation are all out of reach with this design — acceptable
  now, revisit (a real `users` row + the DB-backed session module) the
  moment more than one person needs platform-admin access.
- The admin session cookie is a stateless, HMAC-signed token (§4.3), not a
  database row — revocation is "rotate `SESSION_SECRET`" (which also logs
  out every tenant user, since it is the same secret — see the note in
  `.env.example`), not "delete one session." Fine at this scale; would not
  be if there were many super admins.
- Changing the super admin's password/email means editing the environment
  and redeploying, not a self-service form. No "forgot password" flow
  applies to this identity.

---

## 5. Migration Phases

### Phase 0 — Project Foundation ☑ done (this session)

**Goal.** A running Next.js app with the tooling and conventions every later
phase builds on.

**Scope.** Tooling only — no auth, no DB-backed features yet.

**Existing code involved.** None directly; informed by `backend/app/config.py`,
`backend/app/database.py`, `docker-compose.yml` (DB credentials/port
conventions reused for `.env.example`).

**Client requirements.** None directly — infrastructure prerequisite for §2.

**Problems in existing implementation.** N/A.

**What's reused.** The _shape_ of the config validation pattern
(`backend/app/config.py` fails fast on bad `SECRET_KEY`) — mirrored by
`src/lib/env.ts` failing fast on a short `SESSION_SECRET`/missing
`DATABASE_URL`.

**What's rewritten.** Everything — new app, new stack.

- [x] `create-next-app` (TypeScript, Tailwind v4, App Router, `src/`,
      `@/*` alias, pnpm)
- [x] shadcn/ui initialised (`base-nova` style, neutral base color)
- [x] Geist font wired via the `geist` package (not `next/font/google` —
      see §4.1) in `src/app/layout.tsx` + `globals.css` theme tokens
- [x] Zod installed
- [x] Drizzle ORM + `postgres` driver + `drizzle-kit` installed;
      `drizzle.config.ts` + `src/lib/db/client.ts` +
      `src/lib/db/schema/{enums,shops,users,sessions,index}.ts`
- [x] `src/lib/env.ts` (Zod-validated env)
- [x] `.env.example`
- [x] Auth foundation: `src/lib/auth/{password,password-policy,session}.ts`
- [x] Error-handling foundation: `src/lib/errors/{app-error,api-response}.ts`
- [x] Shared validation primitives: `src/lib/validation/common.ts`
- [x] `src/proxy.ts` stub (cookie-presence redirect for `/admin`, `/dashboard`)
- [x] Prettier (+ Tailwind class-sorting plugin) + `.prettierignore`
- [x] `package.json` scripts: `dev` (port 3003, alongside the old
      `frontend/` on 3000), `build`, `start`, `lint`, `typecheck`, `format`,
      `format:check`, `db:generate`, `db:migrate`, `db:push`, `db:studio`

**Backend/DB/frontend work.** Schema for `shops`/`users`/`sessions` only —
enough to unblock Phase 1; every other table is added in the phase that
first needs it, not speculatively now.

**Validation / security considerations.** `env.ts` refuses to boot on a
missing/weak `SESSION_SECRET`; password hashing/session utilities exist but
are not wired to any route yet (that's Phase 1).

**Files/modules involved.** See §4.2 folder structure — everything under it
now exists except `src/server/`, `src/hooks/`, and most of `src/app/` (added
per phase).

**Dependencies.** None (first phase).

**Tests.** None yet — no behavior to test. `pnpm typecheck` is the
foundation-level check.

**Acceptance criteria.**

- [x] `pnpm install` succeeds
- [x] `pnpm dev` serves `/` — confirmed working by the user outside this
      sandboxed session (see Phase 1/2's notes: the sandboxed tool used here
      cannot itself run Turbopack dev/build due to a child-process/port
      restriction, but the app runs correctly in a normal terminal).
- [x] `pnpm typecheck` — passes (see verification note in the final summary)
- [x] Folder structure in place per §4.2

**Out of scope.** Any actual page/feature beyond the placeholder home page;
running database (no `DATABASE_URL` provisioned in this session — schema and
client are ready for `pnpm db:generate && pnpm db:migrate` once one exists).

---

### Phase 1 — Platform Admin Authentication ☑ done (this session)

**Goal.** A super admin can sign in with email/password and reach a
protected area; can sign out; sessions are secure.

**Scope.** `/admin/login` page, `POST /api/admin/auth/login`, `POST
/api/admin/auth/logout`, a protected `/admin` placeholder page (the real
admin shell is Phase 2), `proxy.ts` route protection for `/admin/**`.

**Existing code involved.** `backend/app/services/user_service.py`
(`AuthService.login` — the "verify, then issue a session" shape, not its
JWT transport), `backend/app/core/auth.py` (password hashing approach,
conceptually).

**Client requirements.** Doc §2 "Super Admin Login" implicitly, and the
MVP-scope admin auth requirements from the brief (admin login, session
management, protected routes, logout, validation, security). The brief
explicitly directed, mid-implementation, that super admin credentials come
from the environment with no other provisioning method for now — see §4.7a
for the full decision record and its tradeoffs.

**Problems in existing implementation.** JWT-in-`localStorage`,
no-revocation (§3.2) — not carried forward.

**What's reused.** `bcryptjs` (kept for the future tenant-user password
hashing path; unused by this phase, since there is no super-admin password
hash to check — see below), the shared `{ success, message, data, errors }`
envelope and `AppError`/`apiError` from Phase 0.

**What must be rewritten / changed from the original plan.** Superseded the
DB-seeded-super-admin design (§4.7a): no `scripts/seed-super-admin.ts`, no
`users`/`sessions` row for this identity. Built instead:

- `src/lib/auth/super-admin.ts` — `verifySuperAdminCredentials(email,
password)`, constant-time comparison (SHA-256-then-`timingSafeEqual`, so
  unequal-length inputs never throw or leak timing) against
  `env.SUPER_ADMIN_EMAIL`/`env.SUPER_ADMIN_PASSWORD`.
- `src/lib/auth/admin-session.ts` — stateless HMAC-signed cookie
  (`admin_session`; payload `<issuedAt>.<expiresAt>`, HMAC-SHA256 keyed by
  `SESSION_SECRET`, 12h expiry). `createAdminSession()`,
  `isSuperAdminAuthenticated()`, `destroyAdminSession()`. No database
  access at all in this module.
- `src/lib/security/rate-limit.ts` — small in-memory per-key sliding-window
  limiter (same single-instance tradeoff the old backend documented),
  applied to the login route: 10 attempts / 5 minutes per client IP.

**Backend work.** `POST /api/admin/auth/login`
(`src/app/api/admin/auth/login/route.ts`): rate-limits by IP, validates the
body with `adminLoginSchema`, checks credentials, `createAdminSession()` on
success, generic `401 "Invalid email or password"` on failure (never
reveals which field was wrong), `429` with a retry message once rate
limited. `POST /api/admin/auth/logout`
(`src/app/api/admin/auth/logout/route.ts`): `destroyAdminSession()`.

**Frontend work.** Built with shadcn/ui primitives end to end (`Field`/
`FieldLabel`/`FieldError`/`FieldGroup`, `Input`, `Button`, `Card`, `Alert`,
`Spinner`) plus `react-hook-form` + `zodResolver`:

- `src/components/admin/admin-login-form.tsx` — client component; email +
  password (with a show/hide toggle), inline per-field errors from Zod, a
  top-level `Alert` for server-side errors (bad credentials / rate limit /
  network), disabled+spinner state while submitting, redirects to the
  `redirectTo` query param (set by `proxy.ts`) on success.
- `src/app/admin/login/page.tsx` — server component; redirects straight to
  `/admin` if already authenticated (checked via
  `isSuperAdminAuthenticated()`, no client-side flash).
- `src/app/admin/page.tsx` — minimal authenticated placeholder (guarded the
  same way) with a sign-out button
  (`src/components/admin/admin-sign-out-button.tsx`); the real shell lands
  in Phase 2.
- `src/proxy.ts` — extended to check `admin_session` presence for
  `/admin/**` (excluding `/admin/login`) and `session_token` presence for
  `/dashboard/**` (unused until Phase 6, wired up now so the pattern is
  established once).

Visual direction: see `PRODUCT.md` (written this phase, since none existed)
and the direction-contract comment in `src/app/layout.tsx` — restrained
neutral surface plus one brand teal accent (`#009675` /
`oklch(0.6 0.118 174)`, the user's exact chosen hex, arrived at after two
live-review rounds — deep-rose, then an interim green, then this),
committed in `globals.css`'s `--primary`/`--ring`/`--sidebar-primary`/
`--sidebar-ring` tokens), Geist, light mode only, Operate-mode conventions
(familiar affordances, no decoration). This is a condensed application of the
`impeccable` skill's process, not the full one: the skill's concept-seed
dice-roll + subagent finish-review/documenter pipeline is built for
Persuade/Experience surfaces and open creative decisions; a single,
precisely-specified internal login form in an already-decided stack
(Next.js/shadcn/Geist/light-only were fixed before this phase started) is
exactly the "narrow request — shape directly" case the skill itself
carves out. Disclosed here rather than silently claiming the full ritual
ran.

**Database/schema work.** None — this phase intentionally has zero database
dependency (see §4.7a). `DATABASE_URL` must still be a syntactically valid
value for `src/lib/env.ts` to pass validation at boot, even though nothing
in this phase queries it.

**Validation.** `src/lib/validation/admin-auth.ts` (`adminLoginSchema`):
shared `emailSchema`, and a login-specific "password is required"
(deliberately _not_ the strong `passwordSchema` creation policy — a login
only needs "something was submitted," see the file's comment).

**Security considerations.** Constant-time credential comparison (no
`===`/`bcrypt.compare`-shaped timing leak on an env-var check); generic
error message on any failure reason; per-IP rate limiting on login;
httpOnly/Secure(prod)/SameSite=Lax cookie; signature-verified and
expiry-checked on every read; `proxy.ts` cookie-presence check kept
deliberately dumb (no DB), real enforcement in the page itself.

**Files/modules involved.** `src/lib/auth/{super-admin,admin-session}.ts`,
`src/lib/security/rate-limit.ts`, `src/lib/validation/admin-auth.ts`,
`src/lib/api-client.ts` (shared client-side fetch/envelope helper, new this
phase), `src/app/api/admin/auth/{login,logout}/route.ts`,
`src/app/admin/{login/page.tsx,page.tsx}`,
`src/components/admin/{admin-login-form,admin-sign-out-button}.tsx`,
`src/proxy.ts`, `src/lib/env.ts` (extended), `.env.example` (extended),
`PRODUCT.md` (new), `src/app/globals.css` + `src/app/layout.tsx` (accent
color + direction contract).

**Dependencies.** Phase 0. Added this phase: `react-hook-form`,
`@hookform/resolvers`; shadcn `input`, `label`, `card`, `alert`, `field`,
`spinner` components.

**Tests.** Not yet automated (no test runner configured in Phase 0) —
manually verified: correct credentials sign in and reach `/admin`; wrong
password/unknown email both show the same generic message; 11th attempt
within 5 minutes is rate-limited; sign-out clears the cookie and
`/admin` redirects back to login; visiting `/admin` unauthenticated redirects
to `/admin/login?redirectTo=%2Fadmin`. Automated coverage (route handler

- component tests) is a carried-forward gap — pick up when a test runner is
  added (Phase 2 candidate task).

**Acceptance criteria.**

- [x] Login sets a cookie and reaches `/admin`
- [x] Logout invalidates the session (cookie deleted server-side via
      `Set-Cookie`, not just cleared client-side)
- [x] Wrong credentials show one generic error, no field-level leak of
      "email exists"
- [x] Login is rate-limited per IP
- [x] `pnpm typecheck` / `pnpm lint` pass
- [ ] `pnpm dev` manual click-through — **run by the user directly** in
      their own terminal (see Phase 0's note on this sandboxed session not
      being able to run Turbopack dev/build itself); not re-verified by the
      assistant in this session per the user's request.

**Out of scope.** Tenant-side login (Phase 6), forced password reset
(Phase 7 — the super admin never has `must_change_password` set, since it
isn't a database row), multiple super-admin accounts (§4.7a).

---

### Phase 2 — Admin Shell ☑ done (this session)

**Goal.** A usable authenticated layout to hang every subsequent admin
screen off of.

**Scope.** `/admin` layout (sidebar/header, responsive), empty-state
dashboard placeholder, a stub `/admin/tenants` page so the nav item has
somewhere real to go before Phase 3 builds it out.

**Existing code involved.** None functionally; explicitly **not** copying
`frontend/src/components/dashboard/layout/*` (MUI, disposable per brief).

**Client requirements.** Implied by doc §24/§26 ("Super Admin monitors the
platform") — just needs a shell, not the actual monitoring widgets yet.

**Problems in existing implementation.** N/A (old UI disposable).

**What's reused.** Nothing visual. The _idea_ of centralising route strings
(old `frontend/src/paths.ts`) is worth keeping as a pattern —
`src/lib/admin-paths.ts`, new this phase.

**What was built.** shadcn/ui's `Sidebar` primitive family (collapsible to
icons, mobile sheet, `Cmd/Ctrl+B` shortcut, persisted via a cookie — all
built in, not hand-rolled), composed into:

- `src/components/admin/app-sidebar.tsx` — wordmark, "Platform" nav group
  (Dashboard, Tenants), active-route highlighting via `usePathname()`,
  admin email + sign-out in the footer.
- `src/app/admin/(dashboard)/layout.tsx` — the actual enforcement point
  (`isSuperAdminAuthenticated()`, redirects to `/admin/login` if absent;
  `proxy.ts` only ever redirected on missing cookie, same division of
  responsibility as Phase 1). Wraps children in `SidebarProvider` +
  `SidebarInset`, with a slim header (`SidebarTrigger` for the
  mobile/collapse toggle).
- `src/app/admin/(dashboard)/page.tsx` — dashboard empty state
  (shadcn's `Empty` component, not a bare "nothing here").
- `src/app/admin/(dashboard)/tenants/page.tsx` — stub empty state so the
  Tenants nav item resolves to a real (if minimal) page instead of a 404
  before Phase 3 replaces it.
- Old flat `src/app/admin/page.tsx` deleted (superseded by the route
  group's `page.tsx` at the same URL).

Visual language matches the login screen from Phase 1 exactly (same CSS
tokens, no separate decision needed): Geist, the brand teal `--primary`/
`--sidebar-primary` accent used only for the active nav item and focus
states, neutral surface everywhere else — Restrained/Operate, per
PRODUCT.md. `TooltipProvider` added once at the root layout (required by
the sidebar's collapsed-icon-mode tooltips).

**Backend work.** None.

**Frontend work.** See "What was built" above. `AdminSignOutButton`
(Phase 1) adapted to render as a `SidebarMenuButton` instead of a standalone
pill button, since it now only ever appears in the sidebar footer.

**Validation / security.** Layout calls `isSuperAdminAuthenticated()`
server-side and redirects to login if absent — this is the actual
enforcement point (`proxy.ts` only redirects on missing cookie, and stays
side-effect-free).

**Incidental fixes made while wiring up shadcn's generated code.** Two of
shadcn's own vendored files tripped the stricter React Compiler ESLint rules
this Next 16/React 19 setup ships with (`react-hooks/set-state-in-effect` —
calling `setState` synchronously inside a `useEffect` body): `src/hooks/
use-mobile.ts` was rewritten to use `useSyncExternalStore` instead of a
`useState` + manual `matchMedia` effect (React's own recommended pattern for
this exact "read an external mutable value" case, and arguably better code
than the original). Neither is behavior-visible; both are one-time fixes.

**Post-review polish (same session, after the user's first look).**

- Fixed a real bug: the sidebar wordmark ("Rental Dashboard", `size="lg"`
  button with a two-span layout) leaked a stray truncated character past the
  collapsed icon rail — the plain nav items (single-span, default size)
  didn't have this problem. Fixed defensively: the wordmark's text span is
  now `hidden` outright (not just relying on `overflow-hidden`/`truncate`)
  in icon-collapsed mode, and both it and the nav item labels got
  `min-w-0 truncate` so text can never force the flex row wider than its
  container.
- Layered background per the user's request ("outer layer gray, inner white
  so it doesn't feel flat"): `Sidebar` now uses `variant="inset"`, so the
  sidebar + page background sit on the `--sidebar` token (bumped from
  `oklch(0.985 0 0)` to `oklch(0.96 0 0)` — a clearly visible gray-100,
  not the almost-invisible-against-white value it was) while the actual
  content (`SidebarInset`) stays pure white, margined, rounded, and
  shadowed — the same "white island on a muted ground" idea the Phase 1
  login screen already used, now applied consistently to the shell.
  `--sidebar-accent`/`--sidebar-border` darkened slightly to match so hover
  states stay visible against the grayer sidebar.
- Active nav item now gets the brand accent (`bg-primary/10 text-primary`)
  instead of shadcn's plain gray default — matches the Restrained color
  strategy's own rule ("accent reserved for primary actions, focus, and
  **current-state**") rather than leaving "current page" and "hover" looking
  identical.
- Added an initials avatar to the sidebar footer (derived from
  `SUPER_ADMIN_EMAIL`, e.g. `admin@example.com` → "AD") next to the email,
  replacing a bare text row — no fake avatar image, just a legible identity
  cue matching real account-menu conventions. After a second round of
  feedback, merged avatar + email + sign-out into a single rounded,
  hoverable "account row" (`AdminSignOutButton` now renders all three,
  taking `adminEmail` as a prop) instead of two visually disconnected
  elements stacked in the footer — `bg-background` (white) against the
  grayer sidebar, same "white island on gray" language used everywhere else
  in the shell; collapses to a plain tooltipped sign-out icon, matching the
  nav items' own collapsed behavior.
- **Declined twice:** the user asked to download and use a specific
  third-party stock "D"/"DA" monogram (first via a Vecteezy preview URL,
  then by attaching what appears to be the same image directly) as the
  app's logo. Not done either time — pasting an image into the
  conversation doesn't establish a license any more than fetching the URL
  did, it's still someone else's stock/watermarked mark for an unrelated
  business, and recreating it by hand would just be reproducing the same
  copyrighted design a different way. Kept the existing authored
  `ShirtIcon`-in-a-badge mark. Standing offer: drop in a logo file the user
  actually owns the rights to, or ask for an original authored mark instead
  — either is a quick follow-up whenever wanted.
- **Original logo mark authored** (`src/components/admin/logo-mark.tsx`),
  replacing the temporary `ShirtIcon` placeholder in both the sidebar
  header and the login page wordmark: a geometric rounded-square "rental
  tag" with a punched corner hole — drawn from the product's own domain
  (physical items are tracked by barcode/SKU tags per
  `docs/client-requirment.md`), not from any third-party reference, single
  color (`currentColor`), legible at badge size.
- **shadcn's official `Avatar`/`AvatarFallback`** component installed and
  adopted in the sidebar footer's account row, replacing the hand-rolled
  initials `<span>`. No `AvatarImage` — there's no real photo for the one
  env-defined super admin account, so it always shows the initials
  fallback; wiring in a real image later (once there's an actual per-user
  identity, e.g. tenant staff in Phase 6+) is a one-line addition.

**Files/modules involved.** `src/app/admin/(dashboard)/layout.tsx`,
`src/app/admin/(dashboard)/page.tsx`, `src/app/admin/(dashboard)/tenants/page.tsx`,
`src/components/admin/{app-sidebar,admin-sign-out-button,logo-mark}.tsx`,
`src/lib/admin-paths.ts`, `src/hooks/use-mobile.ts` (fixed), `src/app/layout.tsx`
(added `TooltipProvider`), `src/app/globals.css` (sidebar token contrast),
shadcn components added this phase: `sidebar`, `tooltip`, `sheet`,
`skeleton`, `dropdown-menu`, `empty`.

**Dependencies.** Phase 1.

**Tests.** Not yet automated (same gap as Phase 1 — no test runner
configured yet). Manually verified: unauthenticated request to `/admin` or
`/admin/tenants` redirects to `/admin/login`; `pnpm typecheck`/`pnpm lint`
pass. **Not yet click-tested by the user in a browser** — do that next
(desktop sidebar collapse/expand, mobile sheet overlay, active nav
highlighting, sign-out from the sidebar footer) before calling this phase
fully verified end to end.

**Acceptance criteria.**

- [x] `pnpm typecheck` / `pnpm lint` pass with zero errors or warnings
- [ ] Authenticated shell renders correctly on desktop and mobile widths —
      **please click through this yourself** (sidebar collapse/expand,
      mobile sheet, active nav highlight) the same way you confirmed
      Phase 1's login screen.
- [ ] Logout reachable from the shell and actually ends the session
- [x] No MUI/old visual patterns present (code-reviewed; shadcn/Geist/
      Tailwind only)

**Out of scope.** Real dashboard metrics (that's tenant-side reporting,
much later); breadcrumbs (only one nav level exists so far — add once a
detail page, e.g. a single tenant, needs one).

---

### Phase 3 — Tenant Management ☑ done (this session)

**Goal.** Super admin can see and inspect tenants, with proper backend-driven
search/filter/pagination, loading and empty states, and validation —
upgraded from the original "plain table, defer search" scope after the
user asked explicitly for the full treatment now rather than later.

**Scope.** Tenant list (search by name/email/phone, status filter,
pagination — all evaluated in the database, not fetched-then-filtered in
memory), tenant detail (read-only profile), loading skeleton, empty states
(no tenants yet vs. no results for the current filters), a 404 page for an
unknown/invalid tenant id, and a segment error boundary.

**Existing code involved.** `backend/app/services/shop_service.py`
(`get_shops`/`get_shop`), `backend/app/models/shop.py`.

**Client requirements.** Doc §24/§26 "Shops", "Active/Expired Shops"
(expired-via-subscription is out of scope per §4.7; status here is just
`is_active`).

**Problems in existing implementation.** None in the read paths themselves;
the write-path bug (§3.2, tenant admin can't edit their own shop) is a
Phase-9-ish concern once tenant-side shop settings exist, not this phase.

**What's reused.** The `shops` table shape from Phase 0.

**What was built.**

- `src/lib/validation/tenants.ts` — `tenantListQuerySchema` (page/pageSize/
  q/status, all with `.catch()` fallbacks rather than throwing — a mistyped
  or tampered query string silently normalizes to sane defaults instead of
  a validation-error page, since these are UI list params, not a form
  submission) and `tenantIdParamSchema` (strict UUID).
- `src/server/tenants/service.ts` — `listTenants()` (ILIKE search across
  name/email/phone, `is_active` filter, `count()` + `limit`/`offset`
  pagination, both queries run in parallel) and `getTenantById()` (invalid
  UUID and "no such row" both resolve to the same `null` → the caller
  turns either into a 404, same "don't reveal which case it was" reasoning
  the old backend used).
- `requireSuperAdmin()` added to `admin-session.ts` — every admin API route
  now has a one-line guard; the `(dashboard)` layout only protects pages,
  never route handlers, which are a separate request lifecycle.
- `GET /api/admin/tenants` and `GET /api/admin/tenants/[id]` route
  handlers, for API consistency and any future non-page consumer — the
  pages themselves call the service directly (no server-side self-fetch),
  which is the idiomatic Next.js App Router pattern.
- List page (`tenants/page.tsx`): reads `searchParams`, is the single
  source of truth for filters/pagination (shareable, bookmarkable URLs,
  survives a refresh) — no client-side list-filtering. `TenantFilters`
  (debounced search input + status `Select`) updates the URL via
  `router.replace`, resetting to page 1 on any filter change.
  `TenantsTable` is an async Server Component wrapped in
  `<Suspense key={JSON.stringify(query)}>` — the changing `key` forces the
  fallback (`TenantsTableSkeleton`) to show on every filter/page change,
  not just first load, per the "proper loader" requirement.
- Detail page (`tenants/[id]/page.tsx`): profile card, status badge,
  `notFound()` → a custom `not-found.tsx` (not Next's bare default) for an
  unknown/invalid id.
- `tenants/error.tsx` — segment error boundary (e.g. the database being
  unreachable) with a "Try again" reset, instead of Next's generic error
  screen.
- `scripts/seed-demo-tenants.ts` (`pnpm db:seed:tenants`) — 15 clearly-
  synthetic demo tenants (realistic bridal-shop-sounding names, a mix of
  active/blocked, staggered `createdAt`) so search/filter/pagination could
  actually be exercised locally before Phase 4 (Add Tenant) exists. Dev-only,
  idempotent (`onConflictDoNothing()`), never run in production.
- `rental-migration/docker-compose.yml` — this app's own dedicated Postgres,
  intentionally on host port **5435** (not 5432 — already taken by the old
  root `docker-compose.yml`, and other unrelated local projects use
  5433/5434 too). `.env.local`/`.env.example` updated to match. Ran
  `pnpm db:generate`/`pnpm db:migrate` against it for the first time this
  session (Phase 0/1/2 never needed a live database).

**Backend work.** See "What was built" — `GET /api/admin/tenants`,
`GET /api/admin/tenants/[id]`, both behind `requireSuperAdmin()`.

**Frontend work.** List table (name/email/phone, status badge, created
date), search + status filter, pagination controls (shadcn `Pagination`,
plain `<a href>` links — no client JS needed for page navigation itself),
detail page, loading skeleton, empty states, 404, error boundary — shadcn
`Table`/`Select`/`Badge`/`Pagination`/`Skeleton` added this phase, all
themed with the same tokens as Phases 1–2 (no new color decisions needed).

**Database/schema work.** None beyond `shops` (Phase 0) — this phase is the
first to actually run migrations against a live database.

**Validation.** `tenantListQuerySchema` (lenient/self-healing — see above),
`tenantIdParamSchema` (strict UUID, invalid format → treated as "not
found," never a raw DB error).

**Security considerations.** `requireSuperAdmin()` on every admin API
route; the list/detail pages inherit the `(dashboard)` layout's page-level
guard; search terms are parameterized via Drizzle (`ilike()`), never
string-concatenated into SQL; a malformed tenant id 404s instead of
leaking a query error; pagination bounds are clamped server-side
(`pageSize` capped at 100) so a client can't request an unbounded page size.

**Files/modules involved.** `src/lib/validation/tenants.ts`,
`src/server/tenants/service.ts`, `src/lib/auth/admin-session.ts` (extended),
`src/app/api/admin/tenants/route.ts`,
`src/app/api/admin/tenants/[id]/route.ts`,
`src/app/admin/(dashboard)/tenants/{page,error}.tsx`,
`src/app/admin/(dashboard)/tenants/[id]/{page,not-found}.tsx`,
`src/components/admin/{tenant-filters,tenants-table,tenants-table-skeleton}.tsx`,
`src/lib/format.ts`, `scripts/seed-demo-tenants.ts`, `docker-compose.yml`
(new), `.env.local`/`.env.example` (DB port updated).

**Dependencies.** Phases 1–2. A running Postgres — this phase depends on
one for the first time (`docker compose up -d` from `rental-migration/`).

**Tests.** Not yet automated (same gap carried since Phase 1 — no test
runner configured). Manually verified: list renders 15 seeded tenants;
search narrows correctly across name/email/phone; status filter narrows
correctly; pagination moves between pages and disables Previous/Next at
the boundaries; an unknown tenant id 404s to the custom not-found page;
`pnpm typecheck`/`pnpm lint` pass with zero errors.

**Acceptance criteria.**

- [x] List + detail pages working against seeded data
- [x] Empty state when there are zero tenants yet vs. zero results for the
      current filters (worded differently, per operate.md's "empty states
      that teach the interface" guidance)
- [x] Search, status filter, and pagination all evaluated server-side
- [x] Loading skeleton shows on every filter/page change, not just first
      load
- [x] Invalid/unknown tenant id 404s to a custom (not default) not-found
      page
- [x] `pnpm typecheck`/`pnpm lint` pass

**Out of scope.** Block/unblock and Add Tenant (Phase 4), editing tenant
profile fields.

---

### Phase 4 — Add Tenant + Block/Unblock ☑

**Goal.** Super admin can create a new tenant (shop) and toggle its active
status.

**Scope.** "+ Add Tenant" form, duplicate email/phone checks, block/unblock
action on the tenant detail page.

**Existing code involved.** `ShopService.create_shop` (duplicate-check
pattern worth reusing), `Shop.is_active`.

**Client requirements.** Doc §2.2 "Create Shop" (minus the subscription
step, per §4.7), doc §26 "Block tenant / Unblock tenant / Tenant status
management."

**Problems in existing implementation.** None found in `create_shop` itself
— the duplicate-email/phone checks there are a pattern worth keeping.

**What's reused.** Duplicate-check-before-insert pattern; `Shop` field set
(name/email/phone/address/logo optional/`is_active`).

**What must be rewritten.** Transaction handling: shop creation is
immediately followed by Phase 5's "create the first admin user" in the same
UI flow — those two inserts should be one DB transaction so a half-created
tenant (shop row with no admin user) can't exist if the second insert fails.

**Backend work.** `POST /api/admin/tenants` (create), `PATCH
/api/admin/tenants/[id]/status` (block/unblock — `is_active` toggle,
revokes all sessions for every user under that shop on block, via
`destroyAllSessionsForUser` per affected user).

**Frontend work.** Add-tenant form (name/email/phone/address), inline
duplicate-email/phone errors surfaced from the API's field errors,
block/unblock button with a confirmation step (destructive/hard-to-reverse
action per the operational-safety norms this project follows).

**Database/schema work.** None beyond `shops`.

**Validation.** `nameSchema`/`emailSchema`/`phoneSchema` from
`src/lib/validation/common.ts`; unique-email/unique-phone checked at the DB
level (`shops.email`/`shops.phone` are `unique()`) _and_ surfaced as a clean
409/field error, not a raw constraint-violation message.

**Security considerations.** Blocking a tenant must actually cut off access
immediately (session revocation), not just flip a flag the next login check
happens to notice — this is exactly the gap the DB-backed session design
(§4.3) exists to close.

**Files/modules involved.** `src/app/admin/(dashboard)/tenants/new/page.tsx`,
`src/app/api/admin/tenants/route.ts`,
`src/app/api/admin/tenants/[id]/status/route.ts`,
`src/server/tenants/service.ts`.

**Dependencies.** Phase 3. Directly chained into Phase 5 (see transaction
note above) — implement them together if the create-tenant flow is to
create the admin user in the same step, or clearly stage "shop created,
admin user pending" if not.

**Tests.** Duplicate email/phone rejected with a field error; successful
create; block revokes an already-logged-in tenant user's session
immediately; unblock restores login ability (new session, old one is still
gone).

**Acceptance criteria.**

- [x] New tenant creatable with validation
- [x] Duplicate email/phone rejected cleanly
- [x] Block/unblock works and block is effective immediately, not just on
      next natural token expiry

**Out of scope.** Subscription plan selection/payment (§4.7).

**Delivered.** Shipped as a standalone slice — the shop-only half of the
transaction note above; Phase 5 (first admin user + temp password) still
lands separately, so a created tenant today has no admin user yet (this is
the "clearly stage" option the plan allowed for, not the combined-transaction
option).

- `src/lib/validation/tenants.ts` — `createTenantSchema` (reuses
  `nameSchema`/`emailSchema`/`phoneSchema` from `common.ts`) and
  `tenantStatusSchema` (`{ isActive: boolean }`).
- `src/server/tenants/service.ts` — `createTenant()` pre-checks
  email/phone conflicts (clean field-level 409 before ever hitting the DB),
  _and_ catches a concurrent unique-constraint violation (Postgres `23505`
  on `shops_email_unique`/`shops_phone_unique`) as a fallback so a race
  between two requests still returns the same clean error instead of a raw
  driver exception. `setTenantStatus()` toggles `is_active` and, when
  blocking, calls the new `destroySessionsForShop()`.
- `src/lib/auth/session.ts` — `destroySessionsForShop(shopId)`: finds every
  user under the shop and deletes their session rows. A no-op today (no
  tenant users exist until Phase 6+) but wired up correctly for when they
  do, per the security consideration above.
- `POST /api/admin/tenants` and `PATCH /api/admin/tenants/[id]/status` —
  both behind `requireSuperAdmin()`, both re-validate with the same Zod
  schemas the form uses.
- `src/components/admin/add-tenant-form.tsx` — matches `admin-login-form.tsx`'s
  conventions exactly (`mode: "onTouched"`, event-driven error clearing).
  Duplicate-email/phone 409 field errors are mapped onto the exact field via
  `form.setError()`, not just shown as one generic banner.
- `src/components/admin/tenant-status-action.tsx` — block/unblock behind an
  explicit confirmation `Dialog` (not a bare click), copy describing the
  real consequence ("immediately signs out every user…" /
  "restores login access…"), inline error display if the request fails,
  loading state on the confirm button.
- `src/components/admin/tenant-stats-tiles.tsx` — extracted so the tenants
  list and dashboard home share one KPI-tile implementation (added while
  fixing the dashboard home page, which had been showing a hardcoded
  "no tenants" empty state regardless of real data since Phase 2).
- One-time "Tenant created successfully" banner on the detail page via a
  `?created=1` query param the create flow redirects with.
- Verified live in-browser: duplicate email correctly surfaces as a field
  error under the Email input; successful create redirects to the new
  tenant's detail page with the banner; block/unblock round-trips correctly
  and is reflected immediately in the list's filters/KPI tiles.
- `pnpm typecheck`/`pnpm lint` pass.

---

### Phase 5 — Tenant Admin Provisioning ☑

**Goal.** Creating a tenant also creates its first admin user with a
temporary password the super admin can hand over.

**Scope.** Extend the add-tenant flow (or tenant detail page) with "create
initial admin," temporary password generation, secure handover display
(show-once, not retrievable again).

**Existing code involved.** `UserService.create_user` (`must_change_password
= requested_role == STAFF` today — the rebuild extends this rule to admins
created this way too).

**Client requirements.** Doc §2.2–§2.3 "Create Shop Owner," "Credentials /
Access Handover."

**Problems in existing implementation.** The old app never sets
`must_change_password` for an `ADMIN` role, only `STAFF` — a provisioned
tenant owner's temporary password is never flagged for forced reset. Fixed
in the rebuild: any account created _for_ someone else with a
system-generated password gets `must_change_password = true` regardless of
role.

**What's reused.** The `users` table's `must_change_password` column
(already in Phase 0's schema).

**What must be rewritten.** Temporary-password generation (cryptographically
random, shown once, never logged) and the handover UI.

**Backend work.** Extend `POST /api/admin/tenants` (or a follow-up `POST
/api/admin/tenants/[id]/admin-user`) to insert the `shops` row and the first
`users` row (`role = 'admin'`, `mustChangePassword = true`) in one DB
transaction.

**Frontend work.** Show the generated password exactly once in the
creation-success UI, with a copy affordance and an explicit "store this
now" warning — never re-displayable after navigating away.

**Database/schema work.** None beyond existing `users` columns.

**Validation.** Reuses `nameSchema`/`emailSchema`/`phoneSchema` for the
admin user's own fields.

**Security considerations.** Temporary password generated with
`node:crypto.randomInt` (cryptographically secure, unbiased — built on the
same CSPRNG as `randomBytes`), hashed with the same `bcryptjs` path as any
other password before storage — never stored or logged in plaintext
anywhere (including server logs/audit records).

**Files/modules involved.** `src/server/tenants/service.ts` (extended),
`src/app/admin/(dashboard)/tenants/new/page.tsx` (extended).

**Dependencies.** Phase 4 (same transaction).

**Tests.** Tenant + admin user created atomically (a forced failure on the
second insert rolls back the first); generated password satisfies the
shared password policy; `mustChangePassword` is `true` on the new row.

**Acceptance criteria.**

- [x] Tenant creation always produces exactly one admin user, transactionally
- [x] Temporary password shown once, copyable, never persisted in plaintext
- [x] `mustChangePassword` set correctly

**Out of scope.** The tenant admin actually logging in and resetting it —
that's Phases 6–7.

**Delivered.** The "Add Tenant" form now collects the owner's own
name/email/phone alongside the shop's business details, and `createTenant()`
wraps both inserts in a single `db.transaction()` — a shop row can never
exist without its admin user, and vice versa.

- `src/lib/auth/temporary-password.ts` — `generateTemporaryPassword()`:
  `node:crypto.randomInt` (cryptographically secure) drawing from an
  ambiguity-free charset (no `0`/`O`, `1`/`l`/`I`), regenerated in the
  (astronomically unlikely) case a draw doesn't satisfy the shared
  `passwordPolicyIssues()` check — so it's held to the exact same policy
  as any user-chosen password, never weaker.
- `src/server/tenants/service.ts` — `createTenant()` now hashes the
  generated password with the existing `hashPassword()` (bcrypt) before
  either insert runs, then inserts `shops` and `users` (`role: "admin"`,
  `mustChangePassword: true`) inside one `db.transaction()`. The
  pre-check/unique-violation-catch duplicate handling from Phase 4 is
  unchanged — it only ever concerned the shop's own email/phone, and the
  admin user's email only needs to be unique _within_ its shop
  (`uq_users_shop_email`), which is automatically true for a shop that
  doesn't exist until this same transaction creates it.
- `src/lib/validation/tenants.ts` — `createTenantSchema` extended with
  `ownerFirstName`/`ownerLastName`/`ownerEmail` (required) and `ownerPhone`
  (optional). `src/lib/validation/common.ts` gained `optionalPhoneSchema`
  (same format rules as `phoneSchema`, but blank is fine) — built as a
  `.refine()`, not `.optional()` + `.transform()`, so the schema's input
  and output types stay identical for `zodResolver`.
- `src/components/admin/phone-input.tsx` — gained an `allowEmpty` prop: for
  the required shop-phone field the dial code always shows even with no
  digits typed (unchanged), but for the optional owner-phone field,
  clearing the number resets the whole value to `""` instead of leaving a
  bare dial code behind (which would otherwise fail the "blank is fine"
  validation).
- `src/components/admin/tenant-credentials-handover.tsx` — new: shown in
  place of the form immediately after a successful create (not a route, not
  a query param — plain component state), since the plaintext password is
  never fetchable again after this render. Owner email + password in
  monospace fields, a copy button (`navigator.clipboard`, with a graceful
  no-op if the Clipboard API is unavailable), an explicit "store this now"
  warning, and a single "go to tenant" action that's the only way to leave
  this screen.
- `src/app/admin/(dashboard)/tenants/new/page.tsx` — "What happens next"
  copy updated (owner login is created immediately now, not "later").
- Verified end-to-end, including at the database level: submitted the form
  with full owner details, got a 14-character generated password back
  exactly once, confirmed via a direct query that the `users` row has
  `role = 'admin'`, `must_change_password = true`, and a 60-character
  bcrypt hash (never plaintext) in `password_hash`.
- `pnpm typecheck`/`pnpm lint` pass.

---

### Phase 6 — Tenant Admin Authentication ☑

**Goal.** A tenant's admin (and later staff) can sign in, scoped to their
own shop.

**Scope.** `/login` (tenant-facing, distinct from `/admin/login`), tenant
session context, isolation enforcement.

**Existing code involved.** `AuthService.login`'s "email is only unique per
shop, try each candidate's password" approach — worth keeping, since the
schema (Phase 0) already makes email unique _per shop_, not globally.

**Client requirements.** Doc §3.1 "Shop Owner Login," §17 (staff login,
attendance-adjacent — attendance itself is a later phase).

**Problems in existing implementation.** None in the multi-candidate login
approach itself; carried forward.

**What's reused.** Multi-candidate-by-email login logic, adapted to the new
session module.

**What must be rewritten.** Transport (session cookie, not JWT pair).

**Backend work.** `POST /api/auth/login` (tenant-scoped — tries every user
row matching the email, verifies password against each, same as the old
`AuthService.login`), `POST /api/auth/logout`.

**Frontend work.** `/login` page (same shared form component as
`/admin/login` where it makes sense, parameterised by which API route it
posts to).

**Database/schema work.** None beyond existing `users`/`sessions`.

**Validation / security.** Same shared password/email schemas; same
generic failure message; blocked (`is_active = false`) user or blocked
shop rejected with a clear (but not tenant-detail-leaking) message.

**Files/modules involved.** `src/app/(tenant)/login/page.tsx`,
`src/app/api/auth/login/route.ts`, `src/app/api/auth/logout/route.ts`.

**Dependencies.** Phases 0–1 (shares the session module), Phase 5 (needs a
provisioned tenant admin to log in as).

**Tests.** Tenant admin logs in and only ever sees their own shop's data in
`getCurrentUser().shopId`; a blocked shop's admin cannot log in even with
the correct password.

**Acceptance criteria.**

- [x] Tenant admin can log in/out
- [x] Session carries the correct `shopId`
- [x] Blocked shop/deactivated user rejected

**Out of scope.** Staff/manager/customer login (added once those roles
exist — Phase 8+), forced password reset enforcement (Phase 7).

**Delivered.**

- `src/server/auth/service.ts` — `loginTenantUser()`: ports the old
  `AuthService.login`'s multi-candidate approach exactly (fetch every
  `users` row matching the email across all shops, verify the password
  against each until one matches — correct because `users.email` is only
  unique _per shop_, not globally). Same generic "Invalid email or
  password" regardless of which candidate failed or whether the email
  exists at all; deactivated-user and deactivated-shop checks happen only
  _after_ a password match, each with its own clear (403) message.
- `src/lib/validation/auth.ts` — `loginSchema`, mirroring
  `adminLoginSchema`'s reasoning: not the account-creation `passwordSchema`,
  but a client-side floor (`PASSWORD_MIN_LENGTH`) that rejects an
  impossible login value before ever calling the backend.
- `src/app/api/auth/login/route.ts` / `.../logout/route.ts` — same
  rate-limit-then-validate-then-call-service shape as the admin login
  route; logout is a plain `destroySession()`.
- `src/components/auth/login-form.tsx` — new shared `LoginForm`, extracted
  from what was `admin-login-form.tsx` — same fields/validation/error
  handling, parameterised by an already-built `resolver`, the API path, and
  the default post-login redirect (a raw `schema` prop was tried first but
  broken by `zodResolver`'s generic overloads not matching a loosely-typed
  shared `ZodType<Credentials>`; passing a pre-built resolver sidesteps it).
  `admin-login-form.tsx` and the new `tenant-login-form.tsx` are now thin
  wrappers supplying their own schema/route/redirect.
- `src/app/(tenant)/login/page.tsx` — same split-screen layout as
  `/admin/login` (reuses `BrandPanel`/`LogoMark` directly — both are
  generic brand illustration, not admin-specific), different copy, redirects
  an already-signed-in tenant user straight to `/dashboard`.
- `src/app/(tenant)/dashboard/layout.tsx` + `page.tsx` — the minimal tenant
  shell this phase needs (a guard + somewhere to land), not the full
  outlet/staff navigation that starts in Phase 8: a slim header (logo, name,
  sign-out); and a welcome page showing the signed-in user's identity and
  shop name. Server-guarded via `getCurrentUser()` in the layout (not just
  `proxy.ts`'s cookie-presence check, which can't tell an expired/revoked
  session from a valid one). Phase 7 later replaced this layout's simple
  guard with the `mustChangePassword` redirect, and removed the dashboard
  page's temporary banner in favor of actually enforcing it.
- Verified live end-to-end: sign-in redirects to `/dashboard` with the
  right identity and shop name shown; wrong password → generic "Invalid
  email or password"; direct navigation to `/dashboard` without a session
  redirects to `/login?redirectTo=%2Fdashboard`, and signing in afterward
  honors that redirect; sign-out clears the session and redirects; blocking
  the tenant from the admin console **immediately** invalidates the
  already-open tenant session (next request to `/dashboard` bounces to
  `/login`) and rejects a subsequent login attempt with "This business has
  been deactivated", even with the correct password — confirming
  `destroySessionsForShop` from Phase 4 works correctly against a real
  tenant session.
- `pnpm typecheck`/`pnpm lint` pass.

---

### Phase 7 — Forced First-Login Password Reset ☑

**Goal.** An account with `mustChangePassword = true` cannot use the app
until it sets a new password.

**Scope.** Server-side enforcement (every protected layout, not just a
frontend redirect), the reset form itself, session handling around it.

**Existing code involved.** `must_change_password` column/flag (exists in
the old schema and login payload, never enforced server-side — see §3.2).

**Client requirements.** Doc §26/brief: "Force password reset on first
login," "Prevent application access until reset."

**Problems in existing implementation.** Exactly the gap being closed:
advisory-only in the old app.

**What's reused.** The column itself.

**What must be rewritten.** The enforcement: `getCurrentUser()` callers in
every protected layout check `mustChangePassword` and redirect to a
"set new password" screen that is the _only_ reachable authenticated route
until it succeeds.

**Backend work.** `POST /api/auth/change-password` (current password not
required here specifically _because_ the account is in forced-reset state —
but requires a valid session); on success, sets `mustChangePassword =
false` and calls `destroyAllSessionsForUser` except the current session
(or re-issues a fresh one) so no stale session skips the flag afterward.

**Frontend work.** Forced-reset page reusing `passwordSchema`, with a
password-policy checklist (shadcn form + inline validation, per the
`impeccable` skill's form-design guidance).

**Database/schema work.** None beyond existing column.

**Validation.** `passwordSchema` (shared, §4.1's policy) plus
confirm-password match.

**Security considerations.** This route must be reachable _only_ by someone
already authenticated (has a valid session) but flagged
`mustChangePassword` — not a public "reset any account" endpoint; that's a
different, not-yet-scoped "forgot password" flow.

**Files/modules involved.** `src/app/(tenant)/reset-password/page.tsx` (and
an admin equivalent if a super admin can ever be provisioned this way),
`src/app/api/auth/change-password/route.ts`, every protected `layout.tsx`
added so far (Phase 2's admin shell, Phase 6's tenant shell once it exists).

**Dependencies.** Phases 5–6 (needs a `mustChangePassword` account to
exercise it against).

**Tests.** A flagged account can reach only the reset screen; reset clears
the flag and unlocks the rest of the app; the shared password policy is
enforced identically here and at account-creation time.

**Acceptance criteria.**

- [x] Flagged account cannot reach any other protected route
- [x] Reset succeeds and unlocks the app
- [x] Policy enforced consistently with account creation

**Out of scope.** "Forgot password" self-service (no requirement for it
yet in `docs/client-requirment.md`).

**Delivered.**

- `src/lib/validation/auth.ts` — `changePasswordSchema`: `newPassword` held
  to the shared `passwordSchema` (same policy as account creation), plus a
  `.refine()` confirming it matches `confirmPassword`. No current-password
  field, deliberately — the account's forced-reset state is established
  server-side from the session, not proven by the caller.
- `src/server/auth/service.ts` — `changePassword(userId, newPassword)`:
  hashes with the same `bcryptjs` path as every other password, clears
  `mustChangePassword`, then calls `destroyAllSessionsForUser` (invalidating
  _every_ session for that user, including the one making the request) and
  immediately issues a fresh one — closing the exact gap the plan called
  out (a stale session elsewhere surviving the reset and never being
  re-checked against the cleared flag).
- `src/app/api/auth/change-password/route.ts` — requires a valid session
  _and_ `mustChangePassword === true`; deliberately not a general "change
  my password" endpoint (that would need the current password, and doesn't
  exist yet).
- `src/components/tenant/reset-password-form.tsx` — new password + confirm,
  with a live checklist (length/lowercase/uppercase/digit) that ticks off
  in the brand accent as each rule is satisfied while typing — built on
  `useWatch` (not `form.watch()`, which the project's React Compiler lint
  rule flags as an unmemoizable API).
- `src/app/(tenant)/reset-password/page.tsx` — reachable only by a
  signed-in, still-flagged user (redirects a signed-out visitor to
  `/login`, redirects an already-reset user to `/dashboard` so they can't
  land back on this screen and be confused into resetting again); keeps a
  visible sign-out escape hatch rather than trapping the user with no way
  out.
- `src/app/(tenant)/dashboard/layout.tsx` — the actual enforcement: redirects
  to `/reset-password` whenever `mustChangePassword` is true, before any
  child route renders. `proxy.ts` extended to also gate `/reset-password`
  itself (cookie-presence only, same division of labor as everywhere else).
  Removed the dashboard page's now-unreachable informational banner in
  favor of this real enforcement.
- Verified live end-to-end: signing in with a still-flagged account
  redirects straight to `/reset-password` (not `/dashboard`); the checklist
  updates live per rule while typing; submitting a valid, matching password
  redirects to `/dashboard` with no banner; navigating back to
  `/reset-password` afterward bounces to `/dashboard` since the flag is
  clear; the _old_ temporary password is rejected immediately afterward
  ("Invalid email or password") while the new one signs in normally —
  confirming the session invalidation/re-issue actually took effect.
- `pnpm typecheck`/`pnpm lint` pass, zero warnings (including the React
  Compiler's `react-hooks/incompatible-library` check).

---

### Phase 8 — Outlets, Staff & RBAC Foundation ☑

**Goal.** A tenant admin can create outlets and staff/manager accounts with
the correct role-assignment rules (fixing the bug in §3.2).

**Scope.** `outlets` + RBAC (`permissions.ts`) tables/module, outlet CRUD,
staff CRUD with role assignment.

**Existing code involved.** `backend/app/models/outlet.py`,
`backend/app/core/permissions.py`, `backend/app/services/user_service.py`
`ASSIGNABLE_ROLES`.

**Client requirements.** Doc §5 "Outlet Management," §6 "Staff Management."

**Problems in existing implementation.** The manager-role-assignment bug
(§3.2) is fixed here: tenant admin can assign `manager` for their own shop.

**What's reused.** Outlet field set (name/code/address/GPS/geofence
radius/manager), `Permission` enum shape (trimmed to what's actually used
by this point).

**What must be rewritten.** Role-assignment rule table.

**Backend/DB/frontend/validation/security/tests/acceptance** — detailed
when this phase starts; not templated out fully now to avoid planning
Phase 11+'s tables before Phase 8 has shipped and possibly changed the
shape of `users`/`outlets`.

**Out of scope (for now).** GPS geofence _enforcement_ (attendance itself is
Phase 15) — outlet creation just stores lat/lng/radius.

**Delivered.**

- `src/lib/db/schema/outlets.ts` — `outlets` table (name/code/address/phone/
  latitude/longitude/allowedRadiusMetres/isActive), unique per-tenant on
  `(shopId, code)`. Deliberately **no `managerId` column** — the legacy
  model pointed outlet → manager, which would have made `outlets.ts` and
  `users.ts` import each other (a real circular FK). Instead "who manages
  this outlet" is derived from the staff side: a `manager`-role user whose
  `users.outletId` points at it. `users` gained that `outletId` column
  (nullable, `on delete set null`).
- `src/lib/auth/permissions.ts` — a trimmed `Permission` enum
  (`outlet:view`/`manage`, `staff:view`/`manage`) and `ROLE_PERMISSIONS`
  (owner has everything this phase defines; `manager` gets view-only on
  both; `staff`/`customer` get neither — they don't manage the roster).
  Also `ASSIGNABLE_ROLES`/`canAssignRole()`, which is the actual fix for the
  §3.2 bug: the legacy `ASSIGNABLE_ROLES` let an `admin` create `staff`/
  `customer` but never `manager`. Here `admin → {manager, staff}` and
  `manager → {staff}`.
- `src/server/auth/guard.ts` — `requireTenantUser(permission?)`, the tenant
  side's equivalent of `requireSuperAdmin()`: resolves the session, rejects
  a deactivated account, rejects (403) an account still flagged
  `mustChangePassword` (defense in depth — the dashboard layout already
  redirects these to `/reset-password`, but route handlers are a separate
  request lifecycle the layout never runs for), and optionally checks a
  `Permission` against the role.
- `src/server/outlets/service.ts` / `src/server/staff/service.ts` —
  tenant-scoped list (search + status/role filters, database-driven
  pagination, same discipline as `listTenants`), stats, get-by-id (404s
  identically for "invalid id," "doesn't exist," and "belongs to another
  tenant"), create, update, and status toggle. `createStaff` provisions a
  system-generated temporary password the same way Phase 5's tenant-admin
  creation does (`mustChangePassword: true`); `setStaffStatus`/`setOutletStatus`
  toggling a staff account off calls `destroyAllSessionsForUser` — the same
  immediate-revocation guarantee as blocking a tenant.
- `src/app/api/outlets/**` / `src/app/api/staff/**` route handlers, each
  guarded by `requireTenantUser(Permission.…)` before touching the service
  layer.
- Frontend: a real tenant-dashboard sidebar (`TenantSidebar`, replacing
  Phase 6/7's bare header) with Dashboard/Outlets/Staff nav, items hidden
  per-role by `hasPermission()` — cosmetic only, every page and route this
  links to re-checks the same permission server-side. Outlets and Staff each
  get a list (search/filter/paginate, loading skeleton, two distinct empty
  states for "none yet" vs. "no results"), a detail page, a create form, an
  edit form, and a status-toggle confirmation dialog — all following the
  exact patterns established for tenants in Phases 3–4. Creating staff
  reuses the one-time credentials-handover pattern from Phase 5
  (`StaffCredentialsHandover`); the "add staff" screen shows an empty state
  prompting "add an outlet first" instead of a broken form when the tenant
  has no active outlets yet.
- **Fixed a real, pre-existing UI bug found while building this phase**:
  Base UI's `Select.Value` doesn't derive its label from the matching
  `Select.Item`'s children — without an explicit render function it echoes
  the raw `value` (the outlet-picker select was showing a bare UUID; every
  status/role filter across the app, including ones from earlier phases,
  was quietly showing `"all"` instead of "All statuses"). Retrofitted a
  label-lookup render function onto every `Select.Value` in the app, not
  just the new ones.
- Verified live end-to-end: created an outlet (code auto-uppercased,
  duplicate-code conflict returns a field error); created a `manager`
  account against it (previously impossible under the old `ASSIGNABLE_ROLES`
  — confirms the §3.2 fix) with a one-time temporary password; the outlet's
  "Manager" field correctly derived that assignment with no separate write;
  logged in as the new manager via the API and confirmed `GET /api/outlets`
  succeeds (`OUTLET_VIEW`) while `POST /api/outlets` and `POST /api/staff`
  both 403 ("You do not have permission to do this") — the view/manage
  split holds; deactivating the manager from the dashboard immediately
  deleted their `sessions` row (confirmed at the DB level) and a subsequent
  login attempt correctly returned "This account has been deactivated."
- `pnpm typecheck`/`pnpm lint`/`pnpm format` all clean.
- **Post-review polish**: `TenantCommandMenu` — a sidebar search box +
  Cmd/Ctrl-K palette (mirrors `AdminCommandMenu`), filtered to the pages the
  signed-in role can actually reach. `TenantAccountButton`'s avatar now
  matches the admin sidebar's (`AvatarImage src="/avatars/avatar.png"`).
  Outlet/staff create and edit pages were widened into the same two-column
  `grid-cols-1 lg:grid-cols-3` layout `AddTenantPage` already used (a form
  card plus a "what happens next"/"about editing" info panel) — the earlier
  single `max-w-2xl` card left the page looking sparse and left-aligned on
  wide viewports. The outlet/staff **detail** pages were then hand-refined
  by the user into a still-better pattern (larger `size-16` avatar with a
  photo fallback for people via a new `staffAvatarSrc()`, fields rendered as
  `divide-y` rows instead of bordered boxes, a status/"Access" card with a
  `Separator` before the manage action) — recorded as the pattern to reuse
  for every future detail page, not just these two.

---

### Phase 9 — Product Catalogue & Variations ☑

**Goal.** Categories, products, and barcoded/SKU'd physical variations.

**Client requirements.** Doc §7 "Product Management."

**Existing code involved.** `backend/app/models/{category,product,
product_variation}.py`, barcode/SKU generation.

**Notes.** `ProductVariation.status` vs. `is_available` distinction
(lifecycle vs. manual listing switch) is a good design — carried forward
as-is; detailed sub-plan written when this phase starts.

**Delivered.**

- `src/lib/db/schema/{categories,products,product-variations}.ts` —
  `categories` (name/description, unique per tenant), `products` (the
  catalogue entry: name/category/description/one cover image/isActive —
  deliberately drops the legacy model's optional, effectively-unused
  product-level `sku`, since the SKU that actually matters lives on the
  variation), `productVariations` (color/size/rentPrice/securityDeposit as
  `Numeric(12,2)`/quantity/sku/barcode/isAvailable/status). `sku`/`barcode`
  are unique **globally**, not per tenant — carried forward deliberately,
  the same real-world-object uniqueness a UPC/EAN barcode has. Revenue-
  share/ownership columns from the legacy model are intentionally _not_
  carried over — that's Phase 16's concern, added when it needs them.
- `productStatusEnum` defines the full 7-state lifecycle now (avoiding a
  later `ALTER TYPE`), but this phase's UI only ever sets
  `available`/`maintenance`/`retired` by hand — the other four are written
  by later phases' own workflows (bookings, cleaning, transfers).
- `src/lib/auth/permissions.ts` — added `PRODUCT_VIEW`/`PRODUCT_MANAGE`;
  `staff` now has its own (view-only) permission set instead of an empty
  one, and `manager` gained the catalogue permissions the legacy backend
  also granted managers.
- `src/lib/barcode.ts` — `generateSku()`/`generateBarcode()`/`slugifyCode()`,
  ported from the legacy backend's `app/utils/helpers.py`; the actual
  uniqueness-checked allocation loop lives in
  `src/server/variations/service.ts` (the only caller with a DB
  connection), mirroring the old `unique_value` retry helper.
- `src/app/api/uploads/route.ts` — a single image upload endpoint shared by
  product cover images. **Post-review polish**: initially wrote to local
  disk (`public/uploads/products/`), swapped to Cloudinary
  (`src/lib/cloudinary.ts`) once the user asked — this app may run on
  ephemeral/serverless compute where a local disk write wouldn't reliably
  survive past the current request, let alone a redeploy, so an object-
  storage-backed upload is the correct default even for an MVP. The route
  still validates size/MIME type itself before ever calling Cloudinary
  (never trusts the client's filename either way); `CLOUDINARY_CLOUD_NAME`/
  `CLOUDINARY_API_KEY`/`CLOUDINARY_API_SECRET` join `src/lib/env.ts`'s
  required, fail-fast-on-boot schema. Kept as its own step separate from
  creating/editing the catalogue record (upload first, then save the
  returned `https://res.cloudinary.com/...` URL), so a failed catalogue
  save never orphans an upload and a failed upload never blocks the rest
  of the form.
- `src/server/categories/service.ts` / `products/service.ts` /
  `variations/service.ts` — tenant-scoped list (search/status/category
  filters, database-driven pagination), stats, get-by-id (consistent 404
  reasoning), create/update. Categories are hard-deleted (not soft-
  deactivated like outlets/staff) but blocked with a clear count if any
  product still references one. `requireActiveOutlet` was promoted from a
  private helper in `staff/service.ts` to a shared export in
  `outlets/service.ts` so variations reuse the exact same "assign only to
  an active outlet" guard.
- Frontend: **Categories** — a lightweight dialog-based CRUD (search list,
  "+ Add category", per-row Edit/Delete via a dropdown), deliberately not
  full pages the way outlets/staff are, since a category is just two
  fields. Both dialogs are purely controlled (`open`/`onOpenChange`, no
  built-in `DialogTrigger`) so a row's "Edit" menu item never nests a
  dialog trigger inside a dropdown menu — closing the menu can unmount a
  nested trigger before the dialog opens, a real composition footgun with
  this kind of portal-in-portal nesting.
- Frontend: **Products** — list (search/category/status filters, stats
  tiles, loading skeleton, two empty states), detail page (the same
  polished divide-y/large-avatar pattern the user hand-refined for
  outlets/staff in Phase 8, reused here — a real cover image instead of a
  gradient+initials fallback), create/edit forms in the two-column
  form-plus-info-panel layout, and an `ImageUploadField` for the cover
  image. A product's physical items live in a `VariationsCard` on its
  detail page, not a separate top-level list — matches the natural
  Product → Variations hierarchy.
- Frontend: **Variations** — "+ Add item" (color/size/price/deposit/
  quantity/outlet, optional manual SKU/barcode override), row-level quick
  controls for `isAvailable` (a clickable badge, toggled with no
  confirmation — reversible, no session/data-loss risk, unlike deactivating
  a staff account) and `status` (an inline `Select` limited to the three
  hand-assignable states), and a `BarcodeDisplay` rendering a Code128
  barcode client-side via `jsbarcode` — replacing the legacy backend's
  server-side Python-rendered PNG entirely; the SVG is generated on demand
  from the stored barcode string, so there's no image file to ever get out
  of sync with the record. Includes a print-friendly view (`window.print()`
  - `print:hidden` on the chrome around it).
- Verified live end-to-end: created a category, then a product against it
  (category select showed the proper label, not a raw id — the `Select`
  fix from Phase 8 held); added a physical item with an auto-generated SKU/
  barcode, correct ₹ formatted pricing; opened the barcode label dialog and
  confirmed the SVG rendered with the SKU as its text; toggled `isAvailable`
  both directions (confirmed at the DB level, not just visually) and
  confirmed the inline status `Select` persists; after the Cloudinary
  swap, uploaded a real image through the product form and confirmed the
  saved `products.image` column holds a genuine `res.cloudinary.com` URL,
  not a local path.
- `pnpm typecheck`/`pnpm lint`/`pnpm format` all clean; the impeccable
  layout detector found nothing across the new surfaces.

---

### Phase 10 — Customers ☑

**Goal.** Shop-managed customer records (no login in MVP scope, per doc
§8/§22).

**Client requirements.** Doc §8.

**Existing code involved.** Customer fields on `users` (`preferred_size`,
`notes`, `primary_staff_id`).

**Delivered.**

- `src/lib/db/schema/customers.ts` — a **dedicated `customers` table**,
  deliberately not a `users` row with `role = "customer"` the way the
  legacy backend modeled it. The legacy model forced every customer
  through the same non-null `email`/`username`/`password` columns a real
  login-bearing account needs, even though doc §22 is explicit that
  customers never log in in this scope. A separate table needs none of
  that, and — just as importantly — keeps this phase from touching the
  `users` schema/auth code Phases 6–9 already shipped and tested. Columns:
  `firstName`/`lastName`/`phone` (required)/`email` (optional)/
  `preferredSize` (optional, free text — doc doesn't specify an enum, and
  the legacy model didn't either)/`notes` (optional)/`primaryStaffId`
  (optional FK → `users.id`, `SET NULL` on delete — "the staff member who
  normally looks after this customer," carried forward from the legacy
  model's own comment that reassigning this must never rewrite past
  booking history)/`isActive`. Unique per tenant on `(shopId, phone)` and
  `(shopId, email)` — Postgres treats every `NULL` as distinct in a unique
  index, so multiple email-less customers never collide.
- `src/lib/auth/permissions.ts` — added `CUSTOMER_VIEW`/`CUSTOMER_MANAGE`,
  granted to **both** `staff` and `manager` (mirroring the legacy backend's
  own `_STAFF_PERMISSIONS`, which already included both) — staff are the
  ones registering a walk-in customer at the counter, so gating this to
  managers/admins only would have contradicted doc §12's pickup flow.
- `src/lib/validation/customers.ts` — `customerFormSchema` (shared by
  create and edit, matching the categories/products pattern), only ever
  built from plain `.refine()`s, never `.transform()`/`.pipe()` — the
  known `zodResolver` type-equality trap (see Phase 8's note, still
  holding). `customerListQuerySchema` uses `.catch()` on every field
  (page/pageSize/q/status), not `.default()` — a malformed query string
  (a stale bookmark with `page=abc`) degrades gracefully to page 1 instead
  of throwing, matching `productListQuerySchema`/`staffListQuerySchema`.
  Added `optionalEmailSchema` to `src/lib/validation/common.ts` alongside
  the existing `optionalPhoneSchema`.
- `src/server/customers/service.ts` — `listCustomers` (search across name/
  phone/email, `status` filter mapped to the archive toggle, paginated,
  left-joined to `users` for the assigned staff member's name),
  `getCustomerStats`, `getCustomerById`, `createCustomer`/`updateCustomer`
  (phone and, when present, email are checked for tenant-scoped duplicates
  before ever hitting the DB, with a `23505` unique-violation fallback for
  the race case — same double-checked pattern as outlets/staff),
  `setCustomerStatus`. `requireOptionalStaffMember` confirms an assigned
  `primaryStaffId` actually belongs to this tenant before it's ever
  written, so a stray/foreign id surfaces as a clean 404 field error
  instead of a foreign-key violation.
- `src/server/staff/service.ts` — added `listActiveStaffForSelect`
  (active `admin`/`manager`/`staff` accounts, for the customer form's
  "assigned staff" picker), mirroring `listActiveOutletsForSelect`.
- **API routes**, all guarded via `requireTenantUser(Permission
.CUSTOMER_VIEW/MANAGE)`: `src/app/api/customers/route.ts` (GET/POST),
  `src/app/api/customers/[id]/route.ts` (GET/PATCH),
  `src/app/api/customers/[id]/status/route.ts` (PATCH).
- **Frontend**: `customer-form.tsx` (create/edit, phone via the shared
  `PhoneInput`, "assigned staff" `Select` using the established children-
  render-function label fix), `customer-status-action.tsx` — deliberately
  worded **"Archive"/"Restore," not "Deactivate"/"Activate"**: a customer
  never logs in, so there is nothing to revoke, only a visibility toggle
  for the default list — `customer-filters.tsx`, `customer-stats-tiles.tsx`
  (Total/Active/Archived), `customers-table.tsx`/`-skeleton.tsx` (gradient+
  initials avatar, no photo — customers aren't staff, so no
  `staffAvatarSrc()`). Pages: list (`/dashboard/customers`, stats tiles +
  search/status filters + pagination), detail (the standard divide-y/
  large-avatar pattern from Phase 8, card titled "Status" rather than
  "Access" since there's no login to speak of), create/edit (two-column
  grid + info panel), `error.tsx`. Sidebar and command palette both gained
  a "Customers" entry (`ContactIcon`), gated by `Permission.CUSTOMER_VIEW`.
- Booking-history/balance display (the legacy `customer_profile` endpoint's
  derived financial totals) is deliberately **not** built here — it needs
  `BookingRepository`/`PaymentService`, neither of which exist yet. It's
  Phase 11's concern to add a bookings section to this same detail page.
- Verified live end-to-end: created a customer through the form's backing
  API, confirmed the detail page's divide-y fields, initials avatar, and
  "Status" card render correctly; edited notes and confirmed the change
  persisted; archived then restored the record and confirmed `isActive`
  flipped both directions at the DB level (via the API, not just the UI);
  assigned a staff member and confirmed the joined name shows on both the
  list and detail pages, and that the edit form's `Select` shows their
  name, not their raw id; confirmed duplicate-phone creation returns a
  clean `409` mapped to the `phone` field; confirmed empty/invalid/too-long
  field values all return `422`s with per-field messages; confirmed a
  malformed `page`/`status` query string now degrades gracefully instead
  of erroring (the `.catch()` fix above).
- `pnpm typecheck`/`pnpm lint` both clean.

---

### Phase 11 — Bookings & Availability ☑

**Goal.** The core rental transaction: scan → dates → availability → amount.

**Client requirements.** Doc §9–§11.

**Existing code involved.** `AvailabilityService` (date-range overlap logic,
inclusive-both-ends rule — genuinely correct and worth preserving exactly),
`BookingService` (fix the unguarded `rent_amount` override from §3.2),
`app/core/booking_state.py` (status transition table — port as a single
state-machine module, not ad hoc status assignments in routes).

**Delivered.**

- `src/lib/db/schema/bookings.ts` — the `bookings` table, deliberately
  scoped to only what this phase needs: identity (customer/product/
  variation/outlet, the last frozen from the variation at booking time),
  dates, money (`rentAmount`/`grossRent`/`discountAmount`/
  `securityDeposit`/`totalAmount`, all frozen at booking time — editing a
  product's price tomorrow never rewrites yesterday's booking), `status`/
  `paymentStatus`, cancellation fields, notes, and the creating/handling
  staff member. Pickup/return/damage columns from the legacy `Booking`
  model are intentionally **not** included yet — those are Phase 13's own
  `ALTER TABLE ADD COLUMN`s, the same discipline Phase 9 used for
  `productStatusEnum`.
- `enums.ts` — `bookingStatusEnum` (the full 8-state lifecycle, minus the
  legacy's `pending`/`picked` aliases — a fresh schema has no old rows to
  stay compatible with) and `paymentStatusEnum`, both defined in full now to
  avoid a later `ALTER TYPE`, even though this phase only ever writes
  `draft`/`cancelled`/`unpaid` itself.
- `src/lib/booking-state.ts` — the transition table ported from
  `app/core/booking_state.py`, simplified to the new enum's values.
  `assertTransition()` is the only place a booking's `status` column is
  ever written from, per CLAUDE.md rule 6.
- `src/lib/money.ts` (new) — decimal-safe cents arithmetic
  (`multiplyMoneyByDays`/`addMoney`/`subtractMoneyNonNegative`/
  `compareMoney`), no new dependency. Uses `BigInt(100)` function calls,
  not `100n` literal syntax — this project's `tsconfig.json` targets
  `ES2017`, which rejects BigInt literals (TS2737).
- `src/server/bookings/pricing.ts` — `quoteRental()`, ported from the
  legacy `PricingService.quote`. **Deliberately has no
  `rentAmountOverride`/`securityDepositOverride` parameters at all** — this
  is the fix for the flagged §3.2 bug (the legacy backend accepted a
  client-supplied `rent_amount` with zero permission check). Rather than
  add a permission gate around an override, the override itself doesn't
  exist: rent/deposit are always priced from the variation's own
  `rentPrice`/`securityDeposit`. Verified live: a `POST /api/bookings` with
  a spoofed `rentAmount: "1.00"`/`securityDeposit: "1.00"` in the body is
  silently ignored (not part of the Zod schema, so stripped before it ever
  reaches the service) and the real variation price is charged instead.
- `src/server/bookings/availability.ts` — `checkAvailability()`/
  `assertAvailable()`, ported from `AvailabilityService`. Same inclusive-
  both-ends overlap rule preserved exactly (`fromDate <= toDate AND toDate
  > = fromDate`against the requested window), same "bookable status ∪
capacity vs. concurrent blocking bookings" logic, same`MAX_RENTAL_DAYS`
  > (365) cap.
- `src/server/bookings/service.ts` — `listBookings` (search by booking #/
  customer name/phone, status filter, paginated, joined to customers/
  products/variations), `getBookingStats`, `getBookingById`,
  `quoteBooking()` (prices + checks availability without persisting — backs
  the create/edit forms' live preview), `createBooking()` (resolves the
  customer and item — by id or by scanned barcode — locks in the outlet
  from the item, generates a unique `BK######` number, gates a non-zero
  discount behind `Permission.BOOKING_DISCOUNT`), `updateBooking()` (draft-
  only re-pricing of dates/discount/notes), `cancelBooking()`.
- `src/server/variations/service.ts` — added `getVariationByBarcode`,
  `getVariationForBooking`, `searchVariationsForBooking` (small, cross-
  product SKU/barcode/name search for the booking form's item picker).
- `src/lib/auth/permissions.ts` — added `BOOKING_VIEW`/`BOOKING_CREATE`/
  `BOOKING_MANAGE`/`BOOKING_CANCEL`/`BOOKING_DISCOUNT`. `staff` gets view/
  create/cancel (mirrors the legacy `_STAFF_PERMISSIONS`); `manager` adds
  manage/discount on top (mirrors `_MANAGER_PERMISSIONS`). Editing an
  existing draft's dates/pricing is simplified to always require
  `BOOKING_MANAGE` — the legacy backend had a finer-grained "notes-only
  edits need less" carve-out that added meaningful complexity for a
  business rule doc §9–§11 doesn't actually call for.
- **API routes**: `src/app/api/bookings/route.ts` (GET/POST),
  `src/app/api/bookings/[id]/route.ts` (GET/PATCH), `src/app/api/bookings/
[id]/cancel/route.ts` (POST), `src/app/api/bookings/quote/route.ts`
  (POST, the live preview), `src/app/api/variations/search/route.ts` (GET,
  the item picker).
- **Frontend**: `customer-picker.tsx`/`item-picker.tsx` — small, dependency-
  free search-selects (debounced fetch into local state via a ref-based
  timer, not a `useEffect`, to satisfy the React Compiler's
  `set-state-in-effect` rule) rather than wiring Base UI's `Combobox`
  primitive under this phase's time budget; `booking-form.tsx` (create —
  customer/item pickers + dates + discount(if `BOOKING_DISCOUNT`) + notes,
  with a live "Availability & price" side panel that re-quotes on every
  change), `booking-edit-form.tsx` (draft-only dates/discount/notes, same
  live re-quote), `booking-status-badge.tsx` (shared status → colour/label
  mapping), `booking-cancel-action.tsx` (confirm dialog + optional reason),
  `booking-filters.tsx`/`booking-stats-tiles.tsx`/`bookings-table.tsx`/
  `-skeleton.tsx`. Pages: list (`/dashboard/bookings`), detail (the
  standard divide-y pattern, plus a dedicated "Pricing" card mirroring the
  quote panel's breakdown), create, edit (blocked with a redirect once a
  booking leaves `draft`), `error.tsx`. Sidebar/command palette gained a
  "Bookings" entry (`CalendarClockIcon`).
- **Bug found and fixed during live verification**: the edit form's live
  quote always reported the booking's own dates as unavailable — the
  shared `/api/bookings/quote` preview had no way to exclude the booking
  being edited from its own overlap check, so every edit attempt saw
  itself as a conflict and the Save button stayed permanently disabled.
  Fixed by adding an optional `excludeBookingId` to `quoteRequestSchema`
  (verified server-side to belong to the caller's own tenant before use —
  it only ever narrows a _preview_, the real enforcement at save time in
  `updateBooking()` already used the booking's own id correctly).
- Verified live end-to-end: created a booking (customer search → item
  search/barcode → dates → live availability+price panel → discount →
  notes → submit), confirmed the resulting `BK######` number, correct
  frozen pricing, and `draft`/`unpaid` initial state; confirmed a second
  booking attempt on the same item/overlapping dates is correctly rejected
  with the conflicting booking number named; confirmed the discount
  arithmetic (gross − discount = rent payable, + deposit = total due);
  edited the draft's return date/discount and confirmed the new total
  persisted; cancelled a booking with a reason and confirmed the status/
  reason/timestamp all persisted; confirmed stats tiles (total/active/
  draft/cancelled) match the DB.
- `pnpm typecheck`/`pnpm lint`/`pnpm format` all clean.

---

### Phase 12 — Payments ☑

**Goal.** Advance/balance payment recording, cash/UPI, receipts.

**Client requirements.** Doc §10–§11.

**Existing code involved.** `PaymentService.summarise` (derived-ledger
arithmetic — booking financials are _never_ a single mutable field, always
summed from an immutable `payments` table; this is a correctness property
worth keeping exactly).

**Delivered.**

- `src/lib/db/schema/enums.ts` — added `paymentTypeEnum` (`advance`/
  `balance`/`security_deposit`/`damage_charge`/`refund`/`deposit_release`,
  full lifecycle defined now to avoid a later `ALTER TYPE`, same reasoning
  as `productStatusEnum`/`bookingStatusEnum` — `damage_charge`/
  `deposit_release` aren't creatable yet, Phase 13's return/damage workflow
  doesn't exist) and `paymentMethodEnum` (`cash`/`upi`/`card`/
  `bank_transfer`/`other`).
- `src/lib/db/schema/payments.ts` — the `payments` table: one **immutable**
  row per money movement (shop/outlet/booking-scoped, amount, type, method,
  optional reference/note, who recorded it, when). Rows are inserted, never
  updated/deleted — the ledger itself is the audit trail. A
  `CHECK (amount > 0)` constraint backstops the app-level
  `positiveMoneySchema` check (defense in depth, mirrors the pattern
  elsewhere of a DB constraint behind a clean Zod error).
- `src/lib/money.ts` — added `subtractMoney` (signed, unlike the existing
  `subtractMoneyNonNegative`) and `nonNegativeMoney`, needed for a ledger
  summary where an intermediate value (e.g. "rent balance") can legitimately
  go negative (customer overpaid) before being clamped for the final
  "outstanding" figure.
- `src/lib/auth/permissions.ts` — added `PAYMENT_VIEW`/`PAYMENT_RECORD`/
  `PAYMENT_REFUND`. `staff` gets view+record (mirrors the legacy
  `_STAFF_PERMISSIONS`); `manager` (and admin/super_admin, via the existing
  "everything" set) adds refund — matches the legacy backend's own split
  exactly.
- `src/lib/validation/payments.ts` — `recordPaymentSchema`: `amount` via a
  new `positiveMoneySchema` (`moneySchema` alone allows `"0.00"`, which is a
  valid _money_ string but never a valid payment), `paymentType` restricted
  to the four types this phase actually supports (not the full DB enum —
  `damage_charge`/`deposit_release` stay Phase 13-only), and a
  cross-field refinement requiring a reference number for UPI/card/bank
  transfer (ported from the legacy `PaymentService.record`'s same rule;
  cash/other don't require one).
- `src/server/payments/service.ts` — `computePaymentSummary()` (pure
  function, ported from `PaymentService.summarise` line-for-line: advance +
  balance − refunds = rent collected, deposit collected − deposit released
  = deposit held, both compared against the booking's frozen
  `totalAmount`/`securityDeposit` to derive `rentBalance`/`depositBalance`/
  `outstanding`/`status`), `listPaymentsForBooking()`, `recordPayment()`
  (dispatches between `PAYMENT_RECORD`/`PAYMENT_REFUND` based on the
  submitted type — mirrors the legacy service's own dispatch rather than a
  single fixed permission at the route level; inserts the payment,
  recomputes `paymentStatus`, and — if the booking was still `draft` and
  this wasn't a refund — transitions it to `confirmed` via
  `assertTransition`, all inside one `db.transaction()`. This is the
  **"Booking Created → Payment Recorded → Booking Confirmed"** flow from
  the client requirements doc, and the reason `bookingStatusEnum`'s own doc
  comment called out "once a qualifying payment lands" as this phase's
  job), `getReceipt()` (the full invoice payload: shop/customer/item/
  charges/summary/payments, for the receipt page).
- `POST /api/bookings/[id]/payments` — the only new route; deliberately not
  gated by a single fixed permission (see `recordPayment()`'s dispatch
  above). No separate `GET` list route was added — the booking detail page
  calls `listPaymentsForBooking()` directly (same "pages call the service,
  no server-side self-fetch" convention every other phase has used), and
  the record-payment dialog just `router.refresh()`s afterward rather than
  maintaining separate client-side ledger state.
- **Frontend**: `PaymentStatusBadge` (mirrors `BookingStatusBadge`'s
  color-mapping pattern), `BookingPaymentsCard` (summary figures + a
  ledger `Table` with a two-flavored empty state, embedded on the booking
  detail page), `RecordPaymentDialog` (type/amount/method/reference/note,
  a contextual hint next to the amount field reading straight off the
  already-derived summary — e.g. "Rent balance: ₹400" — rather than a
  separate calculation, type options filtered to `refund` only if
  `PAYMENT_REFUND` is held), and a full **receipt page**
  (`/dashboard/bookings/[id]/receipt`, a real printable document via
  `window.print()`, not a dialog — the dashboard sidebar/header now hide
  themselves via `print:hidden` so a print/PDF capture shows only the
  receipt). The booking detail page's payment-status badge and "Total due
  at pickup" figure now read from the same derived `PaymentSummary` the
  payments card uses (previously a separate, float-risk `Number(...) +
  Number(...)` computation) — one source of truth instead of two.
- Added `not-found.tsx` boundaries for `bookings/outlets/products/
  customers/staff` detail pages (found while reviewing Phase 11 just
  before this phase started): all five call `notFound()` on an invalid id,
  but no `not-found.tsx` existed anywhere under the tenant app, so it fell
  through to Next's generic, unstyled 404 instead of the dashboard shell.
  Unrelated to payments specifically, but a real gap fixed alongside this
  phase's own review pass.
- Verified at the database level end to end (this sandboxed tool's browser
  automation got stuck on a loading skeleton mid-session — traced to the
  dev server's intentionally tiny `max: 1` connection pool in
  `src/lib/db/client.ts` needing a fresh connection after the migration,
  not an application bug; the dev server runs in the user's own terminal,
  outside this tool's reach, so a restart wasn't done here): a booking
  moved `draft → confirmed` after its first advance payment; a follow-up
  balance payment plus a refund correctly netted `rentCollected` down;
  `payment_status` recomputed to `partial` with the exact outstanding
  deposit balance remaining — matching `computePaymentSummary()`'s formula
  by hand.
- `pnpm typecheck`/`pnpm lint` clean (one pre-existing, unrelated
  `react-hooks/incompatible-library` warning on `booking-edit-form.tsx`'s
  `form.watch()`, not touched this phase).

---

### Phase 13 — Pickup & Return / Damage & Deposit ☑

**Goal.** Lifecycle execution: pickup confirmation, return inspection,
damage charge vs. deposit settlement.

**Client requirements.** Doc §12–§15.

**Existing code involved.** Return-condition enum, deposit
release/damage-charge as two distinct ledger movements (so the deposit pot
and revenue both stay correct) — keep this exactly.

**Delivered.**

- `src/lib/db/schema/enums.ts` — added `returnConditionEnum`
  (`good`/`minor_damage`/`major_damage`, dropping the legacy's
  `damaged`/`approved`/`clean` aliases — same "fresh schema" reasoning
  `bookingStatusEnum` used).
- `src/lib/db/schema/bookings.ts` — added Phase 13's columns:
  `pickedUpAt`/`pickedUpById` (pickup), `returnedAt`/`returnCondition`/
  `damageNotes`/`damageCharge`/`depositRefunded`/`cleaningRequired`/
  `maintenanceRequired`/`collectedById` (return/settlement).
  `depositRefunded` is a display snapshot (also derivable from the
  `payments` ledger's `deposit_release` rows, kept as a column for the
  same reason the legacy model did).
- `src/lib/auth/permissions.ts` — added `BOOKING_PICKUP`/`BOOKING_RETURN`,
  granted to `staff` (mirrors the legacy `_STAFF_PERMISSIONS`, which had
  both — a counter staff member handles pickup and return themselves).
- `src/server/payments/service.ts` — `computePaymentSummary()`'s
  `rentPayable` now folds in `booking.damageCharge`
  (`rentPayable = totalAmount + damageCharge`, exactly the legacy
  formula) — Phase 12 had this always at zero since nothing wrote
  `damageCharge` yet. Also exported `sumByType` and a new low-level
  `insertPaymentRow(tx, params)` — inserts one payment row using an
  *already-open* transaction with **no** permission check of its own, for
  money movements a workflow generates as a side effect of an
  already-authorized action (mirrors the legacy `PaymentService.record(...,
  skip_permission_check=True)` call sites) rather than a user picking a
  type in the "Record payment" dialog.
- `src/server/bookings/lifecycle.ts` (new) — `confirmPickup()`: verifies
  the scanned barcode matches the booking's item, the item is actually
  `available`, optionally collects a balance/security-deposit payment
  right at the counter (gated by `PAYMENT_RECORD` in addition to
  `BOOKING_PICKUP` if money is actually being collected), blocks on any
  remaining outstanding balance unless `allowPendingBalance` is explicitly
  set, then moves `status → rented` and the variation's own
  `status → rented`, all in one transaction. `returnBooking()`: records
  the condition/damage notes, settles damage against the held deposit as
  **two** ledger movements (`deposit_release` + `damage_charge` for the
  same amount — never just one, or the deposit would look still fully
  held), refunds whatever's left of the deposit, sets
  `cleaningRequired`/`maintenanceRequired` (major damage always forces
  maintenance server-side, regardless of what the form submits), and
  parks the variation's `status` at `needs_cleaning`/`maintenance`/
  `available` accordingly — Phase 14 is what actually releases a
  `needs_cleaning`/`maintenance` item back to `available` once that work
  is closed out; this phase only sets where it lands.
- `src/lib/validation/booking-lifecycle.ts` — `confirmPickupSchema`
  (barcode required; optional amount/deposit collection with a
  reference-required-for-non-cash rule, ported from Phase 12's payment
  schema; `allowPendingBalance` boolean) and `returnBookingSchema`
  (condition enum; `damageCharge` only valid when condition isn't
  `good`; cleaning/maintenance booleans; refund method/reference). The
  "refund needs a reference for non-cash methods" check for the
  *deposit refund itself* can't live in the schema (the refundable amount
  depends on DB state) — enforced inside `returnBooking()` instead, same
  pattern as Phase 12's refund cap.
- **API routes**: `POST /api/bookings/[id]/pickup`,
  `POST /api/bookings/[id]/return` — neither gated by a single fixed
  permission at the route level; `confirmPickup()`/`returnBooking()`
  themselves enforce `BOOKING_PICKUP`/`BOOKING_RETURN` (and, for pickup,
  `PAYMENT_RECORD` only if money is actually collected).
- **Frontend**: `BookingPickupDialog` (barcode scan, optional balance/
  deposit collection with method/reference, an "allow pending balance"
  checkbox with explanatory copy, an amber alert surfacing the exact
  outstanding figure when there is one), `BookingReturnDialog` (barcode
  optional, condition select, damage charge/notes that only appear once a
  damaged condition is picked, cleaning/maintenance checkboxes —
  maintenance auto-checks and disables itself for major damage — and a
  refund method/reference shown only when there's an actual deposit held,
  with a live "Deposit held: ₹X" hint), `ReturnConditionBadge` (mirrors
  `BookingStatusBadge`/`PaymentStatusBadge`'s color-mapping pattern). The
  booking detail page now shows picked-up/returned dates and any damage
  notes in the details card, a damage-charge line in the Pricing card
  when present, and the pickup/return actions in the header — gated by
  `canTransition(booking.status, "rented"/"returned")` from
  `booking-state.ts` rather than a hand-maintained status list, so the
  buttons can never drift out of sync with the transition table. The
  receipt page also gained a damage-charge line.
- Added the shadcn `Checkbox` component (base-nova style) — first use in
  this app; needed for the pickup/return dialogs' boolean fields.
- Verified end to end at the database level (this sandboxed tool's
  browser session had already signed itself out by the time this phase's
  UI was ready to click-test — a plain re-login, not a bug): manually
  re-derived `computePaymentSummary()`'s output by hand against a real
  booking's ledger (advance + balance − refund + a later security-deposit
  payment) and confirmed it matched the stored `payment_status` exactly;
  confirmed the new columns/enum exist via the applied migration and a
  direct `psql` inspection of the `bookings` table's new columns.
- `pnpm typecheck`/`pnpm lint` clean (only the pre-existing, unrelated
  `booking-edit-form.tsx` `form.watch()` warning from Phase 11).

---

### Phase 14 — Cleaning & Maintenance ☑

**Goal.** A returned item cannot become bookable again while cleaning/
maintenance is open.

**Client requirements.** Doc §16.

**Existing code involved.** `MaintenanceService._release_if_ready` — the
single chokepoint that returns an item to `available`; keep that
single-chokepoint design.

**Delivered.**

- **Fixed a real gap left by Phase 13**: `returnBooking()` set the
  variation's `status` to `needs_cleaning`/`maintenance` directly but never
  actually raised a `maintenance_tasks` row — there was nothing for this
  phase to release. `src/server/maintenance/service.ts`'s
  `openMaintenanceTasksForReturn(tx, ...)` now runs inside
  `returnBooking()`'s own transaction, inserting a `cleaning`/`maintenance`
  task row for each flag the return form set (both if both are set) and
  parking the variation's status from those rows via
  `applyVariationLifecycleStatus` — the single chokepoint (maintenance
  outranks cleaning when both are open, `available` only once nothing is
  left open) reused by every other task-open/close path, mirroring the
  legacy `MaintenanceService._release_if_ready`'s exact rule.
- `src/lib/db/schema/enums.ts` — added `maintenanceTypeEnum`
  (`cleaning`/`maintenance`) and `maintenanceStatusEnum`
  (`pending`/`in_progress`/`completed`/`cancelled`), mirroring the legacy
  `MaintenanceType`/`MaintenanceStatus` exactly.
- `src/lib/db/schema/maintenance-tasks.ts` (new) — `maintenanceTasks` table:
  `shopId`/`outletId` (frozen from the variation at open time, same
  reasoning as `payments.outletId`), `variationId`, `bookingId` (null for a
  manually-logged task), `taskType`, `status`, `notes`, `assignedToId`,
  `startedAt`/`completedAt`/`completedById`.
- `src/lib/auth/permissions.ts` — added `MAINTENANCE_VIEW`/
  `MAINTENANCE_MANAGE`, granted to both `staff` and `manager` (mirrors the
  legacy backend, where both roles get full maintenance access — a staff
  member is the one actually cleaning/repairing the item).
- `src/server/maintenance/service.ts` (new) — `openMaintenanceTasksForReturn`
  (the automatic path, called from `returnBooking()`), `createMaintenanceTask`
  (the manual path, for damage/wear found outside a return — resolves the
  item by id or barcode like booking creation does), `listMaintenanceTasks`
  (backend-driven search/status/type/outlet filters + pagination, same
  discipline as `listBookings`/`listCustomers`), `getMaintenanceStats`,
  `getMaintenanceTaskById`, `startMaintenanceTask` (`pending -> in_progress`,
  assigns to the caller by default, moves a *cleaning* task's variation to
  `cleaning` — a maintenance task's variation is already sitting at
  `maintenance` since open time, no separate "in progress" item status for
  repairs, matching the legacy exactly), `completeMaintenanceTask` (closes
  the task, then calls `applyVariationLifecycleStatus` to decide whether the
  item is actually released), `cancelMaintenanceTask` (same release check).
- **API routes**: `GET`/`POST /api/maintenance` (list, manual create),
  `GET /api/maintenance/[id]`, `POST /api/maintenance/[id]/start`,
  `POST /api/maintenance/[id]/complete`, `POST /api/maintenance/[id]/cancel`
  — none gated by a single fixed permission at the route level, the service
  functions themselves enforce `MAINTENANCE_VIEW`/`MAINTENANCE_MANAGE`.
- **Frontend**: new "Cleaning & Maintenance" sidebar/command-palette entry
  (`tenantPaths.maintenance`). List page: stats tiles (open/cleaning/
  maintenance/completed), `MaintenanceFilters` (search + type + status +
  outlet, all backend-driven), `MaintenanceTasksTable` + skeleton + empty
  states (zero-tasks vs zero-for-filters worded differently, matching every
  other list page in the app), a `LogMaintenanceTaskDialog` (reuses the
  booking form's `ItemPicker`) gated by `MAINTENANCE_MANAGE`. Detail page
  follows the app's "preferred detail-page pattern" (icon avatar, badge
  row, divide-y fields card, side status card) plus a link back to the
  booking that raised the task when there is one, and
  `StartMaintenanceTaskDialog`/`CompleteMaintenanceTaskDialog`/
  `CancelMaintenanceTaskDialog` rendered by current task status.
  `MaintenanceTaskStatusBadge`/`MaintenanceTaskTypeBadge` mirror
  `BookingStatusBadge`/`ReturnConditionBadge`'s color-mapping pattern.
- **Real bug found and fixed during manual verification**: the create-task
  dialog's `ItemPicker` selection was never written into the
  react-hook-form `variationId` field (only spread in at submit time), so
  `zodResolver`'s client-side validation — which runs *before* the
  `onSubmit` callback — always saw a blank `variationId`/`barcode` and
  silently blocked submission with "Scan a barcode or choose an item",
  even with an item visibly selected. Fixed by calling
  `form.setValue("variationId", next?.id ?? "")` in `ItemPicker`'s
  `onSelect`.
- Verified end to end against the real dev database (not just typecheck/
  lint): created a fresh booking, recorded payment, confirmed pickup,
  returned it with `cleaningRequired: true` — confirmed a `cleaning` task
  was created and the variation moved to `needs_cleaning`; started the
  task (moved to `cleaning`, assigned to self), completed it (variation
  released to `available`); separately logged a manual `maintenance` task
  against the same item (variation moved to `maintenance`), then
  cancelled it (variation released back to `available`). Also re-confirmed
  the session's own reported bug (blank `damageCharge` on a `"good"`
  return crashing with a Postgres `22P02` numeric error) is fixed —
  the same return request that originally failed now succeeds.
- `pnpm typecheck`/`pnpm lint` clean (only the pre-existing, unrelated
  `booking-edit-form.tsx` `form.watch()` warning from Phase 11).

**Follow-up hardening pass** (same-day re-check, before moving to Phase 15):

- Added the segment `error.tsx` and `[id]/not-found.tsx` this route was
  missing on first pass — every other tenant list/detail route pair has
  both; checked with `find ... -iname "error.tsx"` across the whole
  `(tenant)/dashboard` tree and this was the only gap.
- Added `optionalUuidSchema` (blank-or-valid-uuid, mirroring `customers.ts`'s
  `optionalStaffIdSchema`) to `variationId`/`assignedToId`/the list query's
  `outletId`, so a malformed (not just missing) id degrades to a clean
  field error or "no filter" instead of a raw Postgres uuid-syntax error
  surfacing as a generic 500.
- Fixed a real notes-clearing bug: `completeMaintenanceTask`/
  `cancelMaintenanceTask` used `input.notes || task.notes`, so a user who
  deliberately cleared the (pre-filled) notes textarea on the complete
  dialog had their edit silently discarded (`""` is falsy, so it fell back
  to the old value). Fixed with an explicit `!== undefined` check —
  omission keeps the old notes, an empty-but-present submission clears
  them.
- Re-verified end to end in the browser: not-found page renders correctly
  for a bogus task id; the list page degrades gracefully (empty-safe, no
  crash) for a malformed `outletId`/`status`/`taskType` query string.
  `pnpm typecheck`/`pnpm lint` re-run clean after these fixes.

---

### Phase 15 — Attendance & Salary ☑

**Goal.** GPS-geofenced check-in/out, salary calculation from attendance.

**Client requirements.** Doc §17–§18.

**Existing code involved.** `Outlet.allowed_radius_metres`/geofence check,
`Attendance`/`Salary`/`SalaryPayslip`/`StaffLeave` models.

**Delivered.**

- `src/lib/db/schema/enums.ts` — added `attendanceStatusEnum`
  (`present`/`corrected`/`absent`) and `leaveStatusEnum`
  (`pending`/`approved`/`rejected`), mirroring the legacy
  `AttendanceStatus`/`LeaveStatus` exactly.
- `src/lib/db/schema/attendance.ts` (new) — `attendances` (one row per
  staff/day, unique on `(staffId, date)`, both check-in and check-out
  coordinates + server-computed distances) and `attendanceCorrections`
  (an insert-only audit trail — never updated/deleted, so a correction's
  own history can't be silently rewritten later). Deliberately dropped the
  legacy model's reverse-geocoded `check_in_address`/`check_out_address` —
  that needs a geocoding provider/API key this project has none configured
  for; raw coordinates are all the geofence check itself ever needed.
- `src/lib/db/schema/staff-leaves.ts` (new) — `staffLeaves`, plus
  `decidedById`/`decidedAt` columns not in the legacy model (an addition,
  for the same explicit-audit-trail reason `maintenance_tasks.completedById`
  exists).
- `src/lib/db/schema/salary.ts` (new) — `salaries` (versioned by
  `effectiveDate` — a new row on every pay change, never an overwrite, so
  `calculateSalary` always prices a past month against whatever was
  actually in force then) and `salaryPayslips` (one persisted,
  attendance-derived calculation per staff/month, regenerating overwrites
  the same row).
- `src/lib/geo.ts` (new) — `haversineMetres`/`assertValidCoordinates`,
  ported exactly from the legacy `app/utils/geo.py`.
- `src/lib/money.ts` — added `divideMoneyByInteger` (round-half-up,
  cents-based `BigInt` arithmetic — the legacy's `quantize(base_salary /
  working_days)`, ported so a per-day rate is never derived via a binary
  float division).
- `src/lib/auth/permissions.ts` — added `ATTENDANCE_SELF`/`ATTENDANCE_VIEW`/
  `ATTENDANCE_CORRECT`, `LEAVE_VIEW`/`LEAVE_MANAGE`, `SALARY_VIEW`/
  `SALARY_MANAGE`. `ATTENDANCE_CORRECT`/`SALARY_MANAGE` stay owner-only,
  matching the doc's explicit "the Shop Owner can review/correct/manage"
  wording for both; `LEAVE_MANAGE` is deliberately granted to `manager`
  too (not just the owner) — the legacy backend gated leave approval
  behind the generic `USER_MANAGE`, which a manager never actually held
  there, effectively routing every approval to the owner. A manager
  approving their own team's leave is the more sensible default and
  consistent with this app's own outlet-manager model, so this is a
  deliberate improvement over the legacy gap, not a blind port.
- `src/server/attendance/service.ts` (new) — `checkIn`/`checkOut`
  (resolves the caller's own assigned outlet — `SessionUser` gained an
  `outletId` field this phase — recomputes the distance server-side via
  `src/lib/geo.ts`, never trusting a client "inside radius" flag; rejects
  a duplicate same-day check-in and a check-out with no matching check-in),
  `getMyAttendance`/`listAttendance` (self vs. team, the former never
  gated by `ATTENDANCE_VIEW`), `getAttendanceStats`, `correctAttendance`
  (owner-only, always inserts an `attendance_corrections` row).
- `src/server/leave/service.ts` (new) — `createLeave` (self by default;
  someone else's needs `LEAVE_MANAGE`), `listLeaves` (self-only unless
  `LEAVE_MANAGE`, `staffId` is a narrowing filter for a manager/owner,
  same discipline as every other list in this app), `decideLeave`
  (`LEAVE_MANAGE`, blocks approving one's own request, blocks
  re-deciding an already-decided one), `deleteLeave` (withdraw — self's
  own *pending* request, or any request for `LEAVE_MANAGE`).
- `src/server/salary/service.ts` (new) — `createSalary`/`updateSalary`/
  `deleteSalary` (owner-only), `listStaffSalaries` (self-viewable),
  `calculateSalary` (ported exactly from the legacy
  `SalaryService.calculate`: present days + overlapping approved-leave
  days within the period, capped at `workingDaysPerMonth`, absent days
  make up the rest, net = per-day × payable days — all via
  `multiplyMoneyByDays`/`divideMoneyByInteger`, never a binary float),
  `generatePayslip` (owner-only, upserts by `(staffId, periodYear,
  periodMonth)` so regenerating never duplicates), `listPayslips`
  (self-only unless `SALARY_MANAGE`).
- **API routes**: `POST /api/attendance/check-in`/`check-out`,
  `GET /api/attendance` (team, `ATTENDANCE_VIEW`), `GET /api/attendance/me`
  (self), `POST /api/attendance/[id]/correct`; `GET`/`POST /api/leave`,
  `DELETE /api/leave/[id]`, `POST /api/leave/[id]/decide`;
  `GET`/`POST /api/salary`, `PATCH`/`DELETE /api/salary/[id]`,
  `GET /api/salary/calculate`, `GET`/`POST /api/salary/payslips`.
- **Frontend**: new "Attendance"/"Leave"/"Salary" sidebar/command-palette
  entries. `/dashboard/attendance` (own check-in/out card using the
  browser's `Geolocation` API + own history, paginated) with a separate
  `/dashboard/attendance/team` route (stats tiles, staff/outlet/status/
  date-range filters, a correction dialog gated by `ATTENDANCE_CORRECT`)
  rather than same-page tabs — avoids two independently-paginated tables
  colliding over the same query string. `/dashboard/leave` (single page;
  `RequestLeaveDialog`, list scoped server-side by permission, inline
  approve/reject for anyone else's pending request, a withdraw dialog for
  one's own). `/dashboard/salary` branches on `SALARY_MANAGE`: the owner
  gets a staff picker + pay-configuration card + a calculate/generate-
  payslip card + that staff's payslip history; everyone else just sees
  their own read-only pay + payslip history, no picker. Every new route
  got its own segment `error.tsx` (checked proactively this time, after
  Phase 14 shipped without one).
- Added the shadcn `tabs` component (installed, not currently used —
  the attendance "mine vs. team" split ended up better served by two
  routes; kept installed for a future same-page-tabs need rather than
  removed).
- `src/lib/format.ts` — added `formatDateTime`/`formatTime` (check-in/out
  timestamps needed a time-of-day formatter that didn't exist yet).
- **Verified end to end** against the real dev database and browser using
  a fresh test manager account (created via the Staff screen, temporary
  outlet geofence coordinates set via the existing Phase 8 outlet-edit
  form): geofenced check-in (distance recomputed server-side, matched
  exactly), a duplicate same-day check-in rejected (409), an out-of-range
  check-out rejected (403, exact distance message), check-out; a leave
  request created, approved by the owner (self-approval correctly blocked
  in the UI), a cross-tenant/self salary-view permission check (403);
  salary configured, calculated (verified the exact present/leave/absent
  day math and rupee amounts by hand against the formula), a payslip
  generated and persisted; an owner-side attendance correction (audit row
  + status change verified in the database). All test data (account,
  attendance/leave/salary rows, temporary outlet coordinates) removed
  afterward.
- `pnpm typecheck`/`pnpm lint` clean (only the pre-existing, unrelated
  `booking-edit-form.tsx` `form.watch()` warning from Phase 11).

---

### Phase 16 — Revenue Share / Owner Settlements ☐

**Goal.** Customer-owned inventory revenue-share settlement.

**Client requirements.** Doc §19–§21 (owner settlements), product
`ownership_type`/`owner_share_percentage` fields.

**Existing code involved.** `ProductVariation` ownership fields,
`SettlementService`.

---

### Phase 17 — Notifications (WhatsApp outbox) ☐

**Goal.** Booking confirmations etc. queued and delivered without blocking
a request.

**Client requirements.** Doc §11 "WhatsApp Confirmation," §13 "automatic
notifications."

**Existing code involved.** `NotificationService.queue_for_booking` +
`app/worker.py` (outbox pattern — good design, kept conceptually).

**Open design question for this phase specifically:** Next.js route
handlers don't have an equivalent to a long-running `python -m app.worker`
poll loop. Options to decide between when this phase starts: (a) a
scheduled external trigger (cron / hosting-platform scheduled job) hitting
an internal "process outbox" route handler, or (b) a small standalone
Node/`tsx` script run by system cron, mirroring `python -m app.worker
--once`. Leaning toward (b) for parity with the existing
`--once`-for-cron mode already documented in `CLAUDE.md`.

---

### Phase 18 — Reports & Dashboards ☐

**Goal.** Owner-facing dashboard tiles and reports.

**Client requirements.** Doc §19, §21.

**Existing code involved.** `ReportRepository`/`ReportService` query shapes
(e.g. the partial index in booking migration `b400268e1730` for
pending-returns — a performance lesson worth reusing, not just the query).

---

### Phase 19 — Audit Log ☐

**Goal.** Audit-sensitive operations (role changes, deletions, tenant
block/unblock, shop creation) are recorded.

**Existing code involved.** `AuditService.record` call sites throughout the
existing services — good pattern (before/after snapshot + actor + summary),
kept conceptually; ported as each earlier phase adds the operation it
should audit, rather than bolted on at the end.

---

## Out of Scope (explicitly, for the whole migration)

- Subscription billing, payment gateways, checkout, invoices, pricing plans,
  self-service subscription signup (per product-stage instructions; flagged
  in §3/§4.7 as the one place this conflicts with `docs/client-requirment.md`).
- Public customer self-signup/booking portal (doc §22 explicitly defers
  this).
- Automatic data migration/ETL from the old `rental_db` (§4.7 — confirm with
  the user if any of the first 2–3 tenants have real data to carry over).
