import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PlusIcon } from "lucide-react";
import { CustomerFilters } from "@/components/tenant/customer-filters";
import { CustomerStatsTiles } from "@/components/tenant/customer-stats-tiles";
import { CustomersTable } from "@/components/tenant/customers-table";
import { CustomersTableSkeleton } from "@/components/tenant/customers-table-skeleton";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth/session";
import { hasPermission, Permission } from "@/lib/auth/permissions";
import { tenantPaths } from "@/lib/tenant-paths";
import { customerListQuerySchema } from "@/lib/validation/customers";
import { getCustomerStats } from "@/server/customers/service";

export const metadata = {
  title: "Customers — Rentique",
};

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const user = await getCurrentUser();
  if (!user?.shopId) {
    return null;
  }

  if (!hasPermission(user.role, Permission.CUSTOMER_VIEW)) {
    redirect(tenantPaths.dashboard);
  }

  const canManage = hasPermission(user.role, Permission.CUSTOMER_MANAGE);

  const rawParams = await searchParams;
  const query = customerListQuerySchema.parse({
    page: rawParams.page,
    pageSize: rawParams.pageSize,
    q: rawParams.q,
    status: rawParams.status,
  });

  const stats = await getCustomerStats(user.shopId);

  return (
    <main className="flex flex-1 flex-col gap-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold tracking-tight">Customers</h1>
          <p className="text-muted-foreground text-sm">
            Everyone who has rented from you.
          </p>
        </div>

        {canManage ? (
          <Button
            nativeButton={false}
            render={<Link href={tenantPaths.newCustomer} />}
          >
            <PlusIcon />
            Add customer
          </Button>
        ) : null}
      </div>

      <CustomerStatsTiles stats={stats} />

      <div className="bg-card ring-foreground/10 overflow-hidden rounded-xl shadow-xs ring-1">
        <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center">
          <CustomerFilters
            defaultQuery={query.q ?? ""}
            defaultStatus={query.status}
          />
        </div>

        <Suspense
          key={JSON.stringify(query)}
          fallback={<CustomersTableSkeleton />}
        >
          <CustomersTable
            shopId={user.shopId}
            query={query}
            canDelete={hasPermission(user.role, Permission.RECORD_DELETE)}
          />
        </Suspense>
      </div>
    </main>
  );
}
