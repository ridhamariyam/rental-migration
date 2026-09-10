# Migration Phases — Quick Reference

Full detail (scope, existing-code mapping, security/validation notes, tests,
acceptance criteria) for every phase lives in
[`../plan.md`](../plan.md) § 5 "Migration Phases" — that is the document to
update as work lands. This file is a short, at-a-glance index so the phase
list doesn't require opening the full plan every time.

**Status legend:** ☑ done · 🔄 in progress · ☐ not started

| #   | Phase                              | Status | One-line goal                                                                                                                           |
| --- | ---------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| 0   | Project Foundation                 | ☑      | Next.js app scaffolded: TypeScript, Tailwind, shadcn/ui, Geist, Zod, Drizzle schema, env validation, error-handling + auth foundations. |
| 1   | Platform Admin Authentication      | ☑      | Super admin (credentials from env vars) can sign in/out through a protected `/admin` route.                                             |
| 2   | Admin Shell                        | ☑      | Authenticated layout (shadcn `Sidebar`, responsive) to hang every later admin screen off of.                                            |
| 3   | Tenant Management                  | ☑      | Super admin can list/search/filter/paginate tenants and view a read-only detail page.                                                   |
| 4   | Add Tenant + Block/Unblock         | ☑      | Create a tenant with duplicate checks; block/unblock with immediate session revocation.                                                 |
| 5   | Tenant Admin Provisioning          | ☑      | Creating a tenant also creates its first admin user with a one-time temporary password.                                                 |
| 6   | Tenant Admin Authentication        | ☑      | Tenant admin/staff can sign in, scoped to their own shop.                                                                               |
| 7   | Forced First-Login Password Reset  | ☑      | `mustChangePassword` accounts can reach nothing but the reset screen until they reset.                                                  |
| 8   | Outlets, Staff & RBAC Foundation   | ☑      | Outlet CRUD; staff/manager accounts with correct role-assignment rules (fixes a bug from the old app).                                  |
| 9   | Product Catalogue & Variations     | ☑      | Categories, products, barcoded/SKU'd physical variations.                                                                               |
| 10  | Customers                          | ☑      | Shop-managed customer records (no customer login in this scope).                                                                        |
| 11  | Bookings & Availability            | ☑      | Scan → dates → availability check → booking, the core rental transaction.                                                               |
| 12  | Payments                           | ☑      | Advance/balance payment recording (cash/UPI), receipts, derived ledger.                                                                 |
| 13  | Pickup & Return / Damage & Deposit | ☑      | Pickup confirmation, return inspection, damage charge vs. deposit settlement.                                                           |
| 14  | Cleaning & Maintenance             | ☑      | A returned item can't become bookable again while cleaning/maintenance is open.                                                         |
| 15  | Attendance & Salary                | ☑      | GPS-geofenced staff check-in/out; salary calculated from attendance.                                                                    |
| 16  | Revenue Share / Owner Settlements  | ☑      | Settlement for customer-owned (consignment) inventory.                                                                                  |
| 17  | Notifications (WhatsApp outbox)    | ☑      | Booking confirmations etc. queued and delivered without blocking a request.                                                             |
| 18  | Reports & Dashboards               | ☑      | Owner-facing dashboard tiles and reports.                                                                                               |
| 19  | Audit Log                          | ☑      | Audit-sensitive operations (role changes, deletions, block/unblock) recorded.                                                           |

## Post-migration hardening (Sep 2026)

A full audit of the shipped code found a set of correctness defects that
have since been fixed. They are listed here because several changed
behaviour a reader of the phase notes above would otherwise expect:

| Ref | What changed |
| --- | --- |
| RQ-01 | A deposit kept against damage is now a `deposit_applied` ledger row and counts toward what the customer has paid. It used to be recorded as a release and credited to nothing, so the shop kept the deposit *and* billed the full damage. |
| RQ-02 | Booking capacity is checked inside the writing transaction behind a `FOR UPDATE` lock on the variation. Concurrent requests could previously all pass the check and oversell one physical item. |
| RQ-03 | Revenue reports exclude `draft` and `cancelled` bookings, and "cash collected" and "contracted rental revenue" are now distinct, separately labelled figures. |
| RQ-05 | One authoritative availability calculation (per-day peak usage). The quote endpoint used to disagree with the create endpoint. |
| RQ-06 | A product variation carries a default security deposit again; the field had been stripped from the schema while pricing still read the column, pinning every default at zero. |
| RQ-07 | `booking_confirmed` is queued at the real `draft → confirmed` transition, not at creation. |
| RQ-08 | Cancelling releases the deposit and refunds any over-payment, and requires a reason. |
| RQ-09 | A payslip cannot be generated for a month that has not closed; previews clamp to today. |
| RQ-10 | A scheduled tick promotes items past their return date to `overdue`. Nothing wrote that status before. |
| RQ-11 | A booking can no longer report an outstanding balance and a credit at the same time. |
| RQ-12 | `manager` and `staff` are enforced as outlet-scoped server-side; `?outletId=` from the client is reconciled, not trusted. |
| RQ-13 | Customer documents carry their owning shop in the storage key and are checked against the session before streaming. |
| RQ-14 | Login rate limiting reads the trusted proxy hop, sweeps expired windows, and counts per account as well as per IP. |
| RQ-18 | An order's finished state is derived from its items, so a settled order stops offering pickup-phase actions. |

Phase 17's delivery worker (the open question noted below) is resolved: a
Railway cron service runs `scripts/dispatch-notifications.ts`. See the
README § Notifications.

## Explicitly out of scope for this migration

- Subscription billing, payment gateways, checkout, invoices, pricing plans,
  self-service subscription signup.
- Public customer self-signup/booking portal.
- Automatic data migration/ETL from the old `rental_db` (open question —
  see `../plan.md` § 4.7).

## Notable mid-plan decision

Phase 1 shipped with super admin credentials sourced from environment
variables (`SUPER_ADMIN_EMAIL`/`SUPER_ADMIN_PASSWORD`) instead of the
originally planned database-seeded account — see `../plan.md` § 4.7a for the
full rationale and tradeoffs this carries forward.
