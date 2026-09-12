# Rentique (rental-migration)

Next.js app for the bridal rental dashboard — one platform admin console
(`/admin`) and a per-tenant operations console (`/dashboard`).

## Setup

Install dependencies:

```bash
pnpm install
```

Create the local env file:

```bash
cp .env.example .env.local
```

`.env.example` is the authoritative list of environment variables and
carries a comment for each one. Every variable below is **required** —
`src/lib/env.ts` validates them at boot and refuses to start if one is
missing or malformed, so a typo fails immediately rather than deep inside
a request:

| Variable | What it is |
| --- | --- |
| `DATABASE_URL` | Postgres connection string for this app's own database. |
| `SESSION_SECRET` | ≥32 chars. Signs the admin session cookie. |
| `SUPER_ADMIN_EMAIL` / `SUPER_ADMIN_PASSWORD` | The single platform admin login (env-sourced, not a DB row — see `plan.md` § 4.7a). |
| `STORAGE_BUCKET` / `STORAGE_ACCESS_KEY_ID` / `STORAGE_SECRET_ACCESS_KEY` | Railway bucket holding uploads. |
| `NOTIFICATION_WORKER_SECRET` | ≥32 chars. Shared secret the dispatch cron presents. |
| `MSG91_WEBHOOK_SECRET` | ≥32 chars. Shared secret MSG91 returns on its webhook. |

Optional, with working defaults: `NODE_ENV`, `NEXT_PUBLIC_APP_URL`,
`STORAGE_ENDPOINT`, `STORAGE_REGION`, `MSG91_AUTHKEY`,
`MSG91_WHATSAPP_BASE_URL`, `WHATSAPP_DEFAULT_COUNTRY_CODE`,
`TRUSTED_PROXY_HOPS`, `NEXT_PUBLIC_MAPBOX_TOKEN`.

> Uploads moved from Cloudinary to a Railway bucket in `31aadcb`. There
> are no `CLOUDINARY_*` variables any more; `next.config.ts` keeps the
> Cloudinary `remotePatterns` entry only so images uploaded before that
> move still render from their stored absolute URLs.

## Database

Start local Postgres (port 5435, deliberately not 5432 so it cannot
collide with the legacy backend's own database):

```bash
docker compose up -d
```

If Docker is unavailable, any local Postgres 14+ listening on 5435 with a
`rental_migration` database works — only the connection string matters.

Run migrations:

```bash
pnpm db:migrate
```

Optional seed data:

```bash
pnpm db:seed:tenants
```

Stop Postgres (`-v` also deletes the local data):

```bash
docker compose down
docker compose down -v
```

## Run

```bash
pnpm dev     # http://localhost:3003
```

## Checks

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

## Testing

Most suites are **integration tests against a real Postgres**, because
the defects they cover — row locking, capacity arithmetic, ledger
reconciliation, tenant and outlet scoping — live in the interaction
between the service layer and the database, which a mock would define
away.

One-time setup (and again after adding a migration):

```bash
pnpm test:db:setup    # creates/migrates the database named in .env.test
pnpm test
```

`.env.test` is committed on purpose — it holds no secrets and points at a
throwaway `rental_migration_test` database that the harness truncates
between suites. Both `setup-test-db.ts` and `src/test/db.ts` refuse to run
against any database whose name does not end in `_test`.

Three things about the runner are load-bearing:

- **The glob is quoted.** `"src/**/*.test.ts"` is expanded by Node, not by
  `sh`, which has no `globstar` — an unquoted glob silently matched only
  one directory level, so a test in `src/server/bookings/` would never run
  and the suite would still report green.
- **`--conditions=react-server`** makes `import "server-only"` resolve to
  that package's own `empty.js` instead of throwing outside Next's bundler,
  which is what lets tests import the service layer directly.
- **`--test-concurrency=1`** keeps files serial. They share one database
  and each truncates it, so running them in parallel makes them wipe each
  other's fixtures.

Add regression tests beside the code they cover (`foo.test.ts` next to
`foo.ts`), not in a separate tree.

## Notifications

Queueing a notification only inserts a `notification_logs` row. Nothing in
a request sends it — WhatsApp is never called inside a booking or payment
transaction — so something has to drive the outbox:

```text
app writes notification_logs  →  scheduled worker  →  POST /api/internal/notifications/dispatch  →  MSG91
```

**Production** dispatches in-process: `src/instrumentation.ts`'s `register()`
starts a `setInterval` (default every 5 minutes, override with
`NOTIFICATION_DISPATCH_INTERVAL_MS`) that calls `dispatchDueNotifications()`
directly as soon as the `next start` server boots — no second service to
deploy or configure. If Railway ever scales this service to multiple
instances, that's fine too; see the locking note below.

The old approach — a second Railway service running
`scripts/dispatch-notifications.ts` on a `railway.notifications.json` cron
schedule, talking to `/api/internal/notifications/dispatch` over HTTP — still
works and is kept as a fallback (e.g. if dispatch ever needs to be decoupled
from the web process again), but is no longer required.

Retries and restart-safety are handled by the dispatcher, not the
scheduler: `claimDueNotifications` claims rows with `FOR UPDATE SKIP
LOCKED` and increments `attempts`, so two overlapping runs never send the
same message twice, a crashed run leaves its rows claimable again, and a
row is retried until `MAX_ATTEMPTS` (5).

The same tick also promotes items past their return date to `overdue`
before the reminder scan, so reports and reminders always agree about
which rentals are late.

**Local development** uses a polling loop instead:

```bash
pnpm notifications:worker
```

Trigger one dispatch by hand:

```bash
curl -X POST http://localhost:3003/api/internal/notifications/dispatch \
  -H "x-worker-secret: $NOTIFICATION_WORKER_SECRET"
```

MSG91 webhook URL — the token must match `MSG91_WEBHOOK_SECRET`, since
MSG91 does not sign its callbacks:

```text
https://your-domain.com/api/webhooks/msg91/whatsapp?token=<MSG91_WEBHOOK_SECRET>
```

Before anything can actually send, a tenant needs a verified Meta Business
Portfolio, a WhatsApp number onboarded in MSG91, wallet balance, and
approved templates. The Notifications screen lists these and ticks the two
the app can verify for itself.

## Deployment (Railway)

Two services from this one repo:

| Service | Config | Command |
| --- | --- | --- |
| `web` | `railway.json` | `pnpm start` |
| `notifications` | `railway.notifications.json` | `pnpm notifications:dispatch`, cron `*/5 * * * *` |

Run `pnpm db:migrate` against the production database as part of the
release step.

`next.config.ts` pins `process.env.TZ = "Asia/Kolkata"`. Every "today"
boundary in the app (attendance days, today's cash, the overdue scan) uses
local-time getters, so the server process must be on IST; a container
defaulting to UTC would shift early-morning check-ins onto the wrong day.
Calendar-date arithmetic that also runs in the browser goes through
`src/lib/date-range.ts`, which is timezone-independent.

## Money and the payment ledger

Amounts cross the API as strings and are computed in integer paise
(`src/lib/money.ts`); nothing about a rupee amount ever touches a float.

A booking's money is always *derived* by summing the immutable `payments`
ledger — never read off a mutable column. The definitions that matter:

```text
rentPayable   = totalAmount + Σ item.damageCharge
rentCollected = advance + balance − refund + depositAppliedToDamage
depositHeld   = depositCollected − depositReturned − depositApplied
outstanding   = what the customer still owes
creditBalance = what the shop owes back
```

The two deposit outflows are separate ledger types and mean different
things:

- `deposit_release` — deposit handed **back** to the customer. Settles
  nothing they owe.
- `deposit_applied` — deposit **kept against a damage charge**. Counts
  toward `rentCollected`, because the customer has paid that much of the
  damage with money the shop was already holding.

Report metrics are defined in `src/server/reports/service.ts`:
**cash collected** (the ledger, over a period) and **contracted rental
revenue** (rent from bookings that are neither `draft` nor `cancelled`)
are different numbers and are never both called "revenue". A deposit is
never revenue.
