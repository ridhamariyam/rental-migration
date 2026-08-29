import { pgEnum } from "drizzle-orm/pg-core";

/**
 * Mirrors the legacy backend's `UserRole` (app/core/enums.py). Kept as a
 * single source of truth here rather than a free-text column so Postgres
 * itself rejects an invalid role.
 */
export const userRoleEnum = pgEnum("user_role", [
  "super_admin",
  "admin",
  "manager",
  "staff",
  "customer",
]);

/**
 * Physical-item lifecycle state, mirroring the legacy backend's
 * `ProductStatus` in full even though Phase 9 (categories/products/
 * variations) only ever sets `available`/`maintenance`/`retired` itself —
 * `rented`/`needs_cleaning`/`cleaning`/`in_transfer` are written by later
 * phases' own workflows (bookings, cleaning, transfers). Defining the whole
 * enum now avoids an `ALTER TYPE` migration later; it does **not** mean this
 * phase's UI lets someone set those other values by hand.
 *
 * This is not, on its own, a rental-availability check — see plan.md's
 * Phase 9 note carrying forward the legacy `status` vs. `is_available`
 * split: `status` is the physical lifecycle, `is_available` is the owner's
 * manual "listed for rental" switch.
 */
export const productStatusEnum = pgEnum("product_status", [
  "available",
  "rented",
  "needs_cleaning",
  "cleaning",
  "maintenance",
  "in_transfer",
  "retired",
]);

/**
 * Booking lifecycle, mirroring the legacy backend's `BookingStatus` but
 * without its `pending`/`picked` legacy aliases — this is a fresh schema
 * with no old rows to stay compatible with, so `draft`/`rented` are the
 * only names that exist. Status only ever moves through
 * `src/lib/booking-state.ts`'s transition table, never assigned directly by
 * a route/service. Phase 11 (booking creation + cancellation) only ever
 * writes `draft`/`cancelled` itself; the rest (`confirmed` once a
 * qualifying payment lands, `pickup_pending`/`rented`/`return_pending`/
 * `returned`/`overdue`) are written by Phases 12/13's own workflows. The
 * full lifecycle is defined now for the same reason `productStatusEnum` is:
 * avoiding a later `ALTER TYPE` migration.
 */
export const bookingStatusEnum = pgEnum("booking_status", [
  "draft",
  "confirmed",
  "pickup_pending",
  "rented",
  "return_pending",
  "returned",
  "overdue",
  "cancelled",
]);

/**
 * Derived-ledger summary, not a source of truth — CLAUDE.md's rule that
 * financial state is never a single mutable field applies here too: this
 * column is recomputed from the `payments` ledger after every payment
 * (`recordPayment` in `src/server/payments/service.ts`), never hand-set.
 * Phase 11 only ever wrote `unpaid` (a freshly created booking has no
 * payments yet).
 */
export const paymentStatusEnum = pgEnum("payment_status", [
  "unpaid",
  "partial",
  "paid",
  "refunded",
]);

/**
 * One immutable money movement against a booking, mirroring the legacy
 * backend's `PaymentType`. Phase 12 wrote `advance`/`balance`/
 * `security_deposit`/`refund`; Phase 13's return workflow activates
 * `damage_charge`/`deposit_release` (system-generated at return time, not
 * user-selectable in the "Record payment" dialog) — both were defined
 * from the start for the same "avoid a later `ALTER TYPE`" reason
 * `productStatusEnum`/`bookingStatusEnum` were.
 */
export const paymentTypeEnum = pgEnum("payment_type", [
  "advance",
  "balance",
  "security_deposit",
  "damage_charge",
  "refund",
  "deposit_release",
]);

/** Mirrors the legacy backend's `PaymentMethod` in full. The client
 * requirements doc (§10) only calls out Cash/UPI explicitly, but Card/
 * Bank transfer/Other are cheap to keep available for a shop that also
 * takes those. */
export const paymentMethodEnum = pgEnum("payment_method", [
  "cash",
  "upi",
  "card",
  "bank_transfer",
  "other",
]);

/**
 * Condition recorded at return (doc §14–15), mirroring the legacy
 * backend's `ReturnCondition` minus its `damaged`/`approved`/`clean`
 * legacy aliases — same "fresh schema, no old rows to stay compatible
 * with" reasoning `bookingStatusEnum` used. `major_damage` always forces
 * `bookings.maintenanceRequired` server-side (see
 * `src/server/bookings/lifecycle.ts`), regardless of what the return form
 * submits.
 */
export const returnConditionEnum = pgEnum("return_condition", [
  "good",
  "minor_damage",
  "major_damage",
]);

/**
 * Post-return work item raised against a physical `ProductVariation` (doc
 * §16), mirroring the legacy backend's `MaintenanceType`. `returnBooking()`
 * (`src/server/bookings/lifecycle.ts`) opens one of each when the return
 * form flags `cleaningRequired`/`maintenanceRequired`; the maintenance
 * service can also open one by hand for damage found outside a return.
 */
export const maintenanceTypeEnum = pgEnum("maintenance_type", [
  "cleaning",
  "maintenance",
]);

/**
 * Mirrors the legacy backend's `MaintenanceStatus`. `pending` →
 * `in_progress` → `completed`/`cancelled` — only ever moved by
 * `src/server/maintenance/service.ts`, never assigned directly by a route.
 * Completing or cancelling the *last* open task for a variation is the
 * single chokepoint that releases it back to `available`
 * (`releaseVariationIfReady`), same "don't rebook while work is open"
 * design as the legacy `MaintenanceService._release_if_ready`.
 */
export const maintenanceStatusEnum = pgEnum("maintenance_status", [
  "pending",
  "in_progress",
  "completed",
  "cancelled",
]);

/**
 * One staff attendance day's state (doc §17), mirroring the legacy
 * backend's `AttendanceStatus`. `present` is written by a normal geofenced
 * check-in; `corrected` is set whenever an owner edits a recorded day
 * (`correctAttendance` in `src/server/attendance/service.ts`) — never by a
 * check-in/out itself; `absent` only ever comes from a manual owner entry
 * for a day the app wasn't used at all (a day with no row is *implicitly*
 * absent for salary purposes — see `calculateSalary` — this value is only
 * for an explicit record saying so).
 */
export const attendanceStatusEnum = pgEnum("attendance_status", [
  "present",
  "corrected",
  "absent",
]);

/**
 * A staff leave request's lifecycle (doc §18's "Present/Absent" input
 * includes approved leave), mirroring the legacy backend's `LeaveStatus`.
 * Only ever moved by `src/server/leave/service.ts` — `approved` days count
 * toward `calculateSalary`'s payable days alongside present days.
 */
export const leaveStatusEnum = pgEnum("leave_status", [
  "pending",
  "approved",
  "rejected",
]);

/**
 * Who actually owns a physical item (doc §19–21's "Revenue Share"),
 * mirroring the legacy backend's `OwnershipType`. Almost every item is
 * `shop_owned`; `customer_owned` is a customer's own piece (e.g. a
 * family heirloom saree) the shop lists and rents out on their behalf,
 * splitting the rent with them — see `product-variations.ts`'s
 * `ownerSharePercentage` and `settlements.ts`.
 */
export const ownershipTypeEnum = pgEnum("ownership_type", [
  "shop_owned",
  "customer_owned",
]);

/**
 * An owner settlement's payout lifecycle, mirroring the legacy backend's
 * `SettlementStatus`. `pending` is set the moment a customer-owned item's
 * rental is returned (see `src/server/settlements/service.ts`); only an
 * owner action (`markSettlementPaid`) ever moves it to `paid`, and
 * `cancelled` is reserved for a payout that turns out not to be owed
 * (kept for parity with the legacy schema even though no phase-16 flow
 * writes it yet).
 */
export const settlementStatusEnum = pgEnum("settlement_status", [
  "pending",
  "paid",
  "cancelled",
]);
