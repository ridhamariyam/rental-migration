/**
 * Centralised admin route strings — mirrors the pattern the old frontend
 * used (`frontend/src/paths.ts`), kept small since there's only one nav
 * section so far. Add to this as later phases add admin pages.
 */
export const adminPaths = {
  login: "/admin/login",
  dashboard: "/admin",
  tenants: "/admin/tenants",
  newTenant: "/admin/tenants/new",
} as const;
