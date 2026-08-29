/**
 * Centralised tenant-facing route strings — mirrors `admin-paths.ts`'s
 * pattern. Grows as Phase 8+ adds more tenant dashboard sections.
 */
export const tenantPaths = {
  login: "/login",
  dashboard: "/dashboard",
  outlets: "/dashboard/outlets",
  newOutlet: "/dashboard/outlets/new",
  staff: "/dashboard/staff",
  newStaff: "/dashboard/staff/new",
  categories: "/dashboard/categories",
  products: "/dashboard/products",
  newProduct: "/dashboard/products/new",
  customers: "/dashboard/customers",
  newCustomer: "/dashboard/customers/new",
  bookings: "/dashboard/bookings",
  newBooking: "/dashboard/bookings/new",
  maintenance: "/dashboard/maintenance",
  attendance: "/dashboard/attendance",
  leave: "/dashboard/leave",
  salary: "/dashboard/salary",
  revenueShare: "/dashboard/revenue-share",
  notifications: "/dashboard/notifications",
  reports: "/dashboard/reports",
  auditLog: "/dashboard/audit-log",
} as const;
