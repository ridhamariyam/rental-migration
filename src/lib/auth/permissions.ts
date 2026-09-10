import type { User } from "@/lib/db/schema";

export type UserRole = User["role"];

/**
 * Ported from the legacy backend's `app/core/permissions.py`, trimmed to
 * only what this phase's outlet/staff management actually uses — more
 * permissions are added as later phases need to distinguish more actions
 * (see plan.md § Phase 8).
 */
export enum Permission {
  OUTLET_VIEW = "outlet:view",
  OUTLET_MANAGE = "outlet:manage",
  STAFF_VIEW = "staff:view",
  STAFF_MANAGE = "staff:manage",
  PRODUCT_VIEW = "product:view",
  PRODUCT_MANAGE = "product:manage",
  // An item's buying/cost price is sensitive financial data — unlike the
  // rental/selling price, which any `PRODUCT_MANAGE` role can see and set,
  // this stays owner-only (never added to `MANAGER_PERMISSIONS`/
  // `STAFF_PERMISSIONS`), same reasoning as `SHOP_MANAGE`.
  PRODUCT_COST_VIEW = "product:cost_view",
  CUSTOMER_VIEW = "customer:view",
  CUSTOMER_MANAGE = "customer:manage",
  BOOKING_VIEW = "booking:view",
  BOOKING_CREATE = "booking:create",
  BOOKING_MANAGE = "booking:manage",
  BOOKING_CANCEL = "booking:cancel",
  BOOKING_DISCOUNT = "booking:discount",
  BOOKING_PICKUP = "booking:pickup",
  BOOKING_RETURN = "booking:return",
  PAYMENT_VIEW = "payment:view",
  PAYMENT_RECORD = "payment:record",
  PAYMENT_REFUND = "payment:refund",
  MAINTENANCE_VIEW = "maintenance:view",
  MAINTENANCE_MANAGE = "maintenance:manage",
  // Attendance (doc §17). `ATTENDANCE_SELF` is the geofenced check-in/out
  // action itself; `ATTENDANCE_VIEW` is reading *other* staff's attendance
  // (a self-check bypasses this for one's own records, same as the legacy
  // backend); `ATTENDANCE_CORRECT` is the doc's explicit "Shop Owner can
  // review attendance and manually correct it" — kept owner-only.
  ATTENDANCE_SELF = "attendance:self",
  ATTENDANCE_VIEW = "attendance:view",
  ATTENDANCE_CORRECT = "attendance:correct",
  // Leave (doc §18). Every staff/manager can view/request their own leave
  // (`LEAVE_VIEW`, no self-check-bypass needed since it's a permission
  // every login-bearing tenant role already holds); `LEAVE_MANAGE` sees
  // every staff member's requests and approves/rejects them — granted to
  // `manager` here, not just the owner, deliberately deviating from the
  // legacy backend (which gated approval behind the *generic* `USER_MANAGE`
  // a manager never actually held there — a manager approving their own
  // outlet's leave requests is a more sensible default than routing every
  // approval to the owner).
  LEAVE_VIEW = "leave:view",
  LEAVE_MANAGE = "leave:manage",
  // Salary (doc §18). `SALARY_VIEW` is every staff/manager's own pay
  // slips; configuring pay and generating payslips (`SALARY_MANAGE`) stays
  // owner-only — matches the doc's "Shop Owner can review salary records"
  // and is sensitive financial data, unlike leave approval.
  SALARY_VIEW = "salary:view",
  SALARY_MANAGE = "salary:manage",
  // Revenue share (doc §19–21). Both stay owner-only — the doc lists
  // "Revenue Share" only under the Shop Owner's own module list (§20), and
  // unlike salary there's no "self" record a staff/manager account would
  // ever need to see (a settlement is about a customer-owner, not them).
  SETTLEMENT_VIEW = "settlement:view",
  SETTLEMENT_MANAGE = "settlement:manage",
  // Notifications (doc §13/§17, WhatsApp outbox — Phase 17). Fully wired:
  // rows are queued by the app and delivered by the cron service in
  // `railway.notifications.json`. Granted as broadly as `MAINTENANCE_VIEW`
  // since every role that touches a booking wants to see whether its
  // messages went out.
  NOTIFICATION_VIEW = "notification:view",
  NOTIFICATION_MANAGE = "notification:manage",
  // Reports & owner dashboard (doc §19/§21, Phase 18). Granted to manager
  // too (not just the owner) — mirrors the legacy backend's own
  // `_MANAGER_PERMISSIONS` including `REPORT_VIEW`, unlike
  // `SETTLEMENT_VIEW`/`SALARY_MANAGE` which stay owner-only for more
  // sensitive financial data.
  REPORT_VIEW = "report:view",
  // Audit log (Phase 19). Owner-only — unlike reports, this is a
  // sensitive record of *who did what*, not an operational tool a manager
  // needs day to day.
  AUDIT_VIEW = "audit:view",
  // Business Settings (the tenant's own shop profile — name/email/phone/
  // address/logo). Deliberately owner-only, never granted to `manager`:
  // this mirrors the client's own request that only the shop owner sees
  // this screen. `ALL_PERMISSIONS` already covers `admin`/`super_admin`;
  // this is never added to `MANAGER_PERMISSIONS`/`STAFF_PERMISSIONS`.
  SHOP_MANAGE = "shop:manage",
}

const ALL_PERMISSIONS = new Set(Object.values(Permission));

/** Runs day-to-day counter operations for their outlet: can see the roster,
 * but never create/edit it. Customers are the exception — the legacy
 * backend's `staff` permission set already included
 * `CUSTOMER_VIEW`/`CUSTOMER_MANAGE`, since staff are the ones registering a
 * walk-in customer at the counter. `PRODUCT_MANAGE` is also granted here
 * (deviating from the legacy backend) so a counter agent can add new
 * categories/products/physical items on the fly — `PRODUCT_COST_VIEW`
 * stays owner-only, so the buying price field never appears for them; the
 * owner fills it in later. */
const STAFF_PERMISSIONS: ReadonlySet<Permission> = new Set([
  Permission.PRODUCT_VIEW,
  Permission.PRODUCT_MANAGE,
  Permission.CUSTOMER_VIEW,
  Permission.CUSTOMER_MANAGE,
  Permission.BOOKING_VIEW,
  Permission.BOOKING_CREATE,
  Permission.BOOKING_CANCEL,
  Permission.BOOKING_PICKUP,
  Permission.BOOKING_RETURN,
  Permission.PAYMENT_VIEW,
  Permission.PAYMENT_RECORD,
  Permission.MAINTENANCE_VIEW,
  Permission.MAINTENANCE_MANAGE,
  Permission.ATTENDANCE_SELF,
  Permission.LEAVE_VIEW,
  Permission.SALARY_VIEW,
]);

/** Outlet-scoped: manages their own outlet's roster *and* catalogue — the
 * legacy backend's `manager` permission set included `PRODUCT_MANAGE`, so
 * this is carried forward, not a new grant. Booking-wise, a manager also
 * gets to edit an existing draft's dates/pricing and apply a discount —
 * the legacy backend's `manager` permission set included both
 * `BOOKING_MANAGE`/`BOOKING_DISCOUNT`, staff had neither. */
const MANAGER_PERMISSIONS: ReadonlySet<Permission> = new Set([
  Permission.OUTLET_VIEW,
  Permission.STAFF_VIEW,
  Permission.PRODUCT_VIEW,
  Permission.PRODUCT_MANAGE,
  Permission.CUSTOMER_VIEW,
  Permission.CUSTOMER_MANAGE,
  Permission.BOOKING_VIEW,
  Permission.BOOKING_CREATE,
  Permission.BOOKING_CANCEL,
  Permission.BOOKING_MANAGE,
  Permission.BOOKING_DISCOUNT,
  Permission.BOOKING_PICKUP,
  Permission.BOOKING_RETURN,
  Permission.PAYMENT_VIEW,
  Permission.PAYMENT_RECORD,
  Permission.PAYMENT_REFUND,
  Permission.MAINTENANCE_VIEW,
  Permission.MAINTENANCE_MANAGE,
  Permission.ATTENDANCE_SELF,
  Permission.ATTENDANCE_VIEW,
  Permission.LEAVE_VIEW,
  Permission.LEAVE_MANAGE,
  Permission.SALARY_VIEW,
  Permission.NOTIFICATION_VIEW,
  Permission.NOTIFICATION_MANAGE,
  Permission.REPORT_VIEW,
]);

export const ROLE_PERMISSIONS: Record<UserRole, ReadonlySet<Permission>> = {
  super_admin: ALL_PERMISSIONS,
  admin: ALL_PERMISSIONS,
  manager: MANAGER_PERMISSIONS,
  staff: STAFF_PERMISSIONS,
  customer: new Set(),
};

export function hasPermission(role: UserRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.has(permission) ?? false;
}

/**
 * Which roles each role is allowed to create/assign to someone else.
 *
 * Fixes the bug documented in plan.md § 3.2 / § Phase 8: the legacy
 * backend's `ASSIGNABLE_ROLES` let an `admin` (tenant owner) create `staff`
 * and `customer` accounts but never `manager` — contradicting the client
 * requirement that the Shop Owner assigns an outlet manager themselves.
 * Here, the tenant owner can assign both `manager` and `staff`.
 */
export const ASSIGNABLE_ROLES: Record<UserRole, ReadonlySet<UserRole>> = {
  super_admin: new Set([
    "super_admin",
    "admin",
    "manager",
    "staff",
    "customer",
  ]),
  admin: new Set(["manager", "staff"]),
  manager: new Set(["staff"]),
  staff: new Set(),
  customer: new Set(),
};

export function canAssignRole(
  actorRole: UserRole,
  targetRole: UserRole,
): boolean {
  return ASSIGNABLE_ROLES[actorRole]?.has(targetRole) ?? false;
}
