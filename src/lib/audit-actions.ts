/**
 * Plain audit-action constants — kept in a separate non-`"server-only"`
 * module so client components (the Audit Log filter bar, the action
 * badge) can import the string values without pulling in
 * `src/server/audit/service.ts`'s database code. The service module
 * re-exports these under the same name for server-side call sites.
 */
export const AuditAction = {
  TENANT_CREATED: "tenant.created",
  TENANT_BLOCKED: "tenant.blocked",
  TENANT_UNBLOCKED: "tenant.unblocked",
  STAFF_CREATED: "staff.created",
  STAFF_UPDATED: "staff.updated",
  STAFF_ROLE_CHANGED: "staff.role_changed",
  STAFF_STATUS_CHANGED: "staff.status_changed",
  STAFF_PASSWORD_RESET: "staff.password_reset",
  SALARY_CONFIGURED: "salary.configured",
  SALARY_UPDATED: "salary.updated",
  SALARY_DELETED: "salary.deleted",
  SETTLEMENT_PAID: "settlement.paid",
  ATTENDANCE_CORRECTED: "attendance.corrected",
  LEAVE_DECIDED: "leave.decided",
  BOOKING_DISCOUNT_APPLIED: "booking.discount_applied",
  BOOKING_CANCELLED: "booking.cancelled",
  BOOKING_PICKED_UP: "booking.picked_up",
  BOOKING_RETURNED: "booking.returned",
  PAYMENT_RECORDED: "payment.recorded",
  PAYMENT_REFUNDED: "payment.refunded",
  SHOP_UPDATED: "shop.updated",
  // Permanent removals (owner-only, `Permission.RECORD_DELETE`). A record
  // that is gone leaves no other trace, so the audit row *is* the trace —
  // each carries the deleted row's identifying fields in `before`.
  BOOKING_DELETED: "booking.deleted",
  PRODUCT_DELETED: "product.deleted",
  VARIATION_DELETED: "variation.deleted",
  CUSTOMER_DELETED: "customer.deleted",
  OUTLET_DELETED: "outlet.deleted",
  STAFF_DELETED: "staff.deleted",
  CATEGORY_DELETED: "category.deleted",
} as const;

export type AuditActionValue = (typeof AuditAction)[keyof typeof AuditAction];

/**
 * Actions performed by the platform (the SaaS super admin moderating a
 * tenant's account — create/block/unblock) rather than by anyone on the
 * tenant's own team. The super admin isn't a `users` row at all (it's a
 * stateless signed cookie, see `requireSuperAdmin()`), so these rows
 * never belong in a shop owner's "who did what on my team" audit trail.
 * `listAuditLogs` excludes them unconditionally (not just hidden in the
 * UI) so a crafted `?action=tenant.created` query can't surface them
 * either — see the security note there.
 */
export const PLATFORM_ONLY_ACTIONS: ReadonlySet<AuditActionValue> = new Set([
  AuditAction.TENANT_CREATED,
  AuditAction.TENANT_BLOCKED,
  AuditAction.TENANT_UNBLOCKED,
]);

/** The subset of `AuditAction` a tenant owner is actually allowed to see
 * — everything except the platform-only ones above. Used to build the
 * Audit Log filter dropdown so it never even offers an option that would
 * always come back empty. */
export const TENANT_VISIBLE_ACTIONS = Object.values(AuditAction).filter(
  (action) => !PLATFORM_ONLY_ACTIONS.has(action),
);

