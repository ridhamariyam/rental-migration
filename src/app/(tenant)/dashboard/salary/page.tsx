import { Suspense } from "react";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { CalculatePayslipCard } from "@/components/tenant/calculate-payslip-card";
import { PayslipsTable } from "@/components/tenant/payslips-table";
import { PayslipsTableSkeleton } from "@/components/tenant/payslips-table-skeleton";
import { SalaryConfigCard } from "@/components/tenant/salary-config-card";
import { SalaryStaffPicker } from "@/components/tenant/salary-staff-picker";
import { getCurrentUser } from "@/lib/auth/session";
import { hasPermission, Permission } from "@/lib/auth/permissions";
import { tenantPaths } from "@/lib/tenant-paths";
import { payslipListQuerySchema } from "@/lib/validation/salary";
import { listPayableStaffForSelect } from "@/server/staff/service";
import { getPayReadiness } from "@/server/salary/service";
import type { TenantSessionUser } from "@/server/auth/guard";
import { UsersIcon } from "lucide-react";

export const metadata = {
  title: "Salary — Rental Dashboard",
};

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function SalaryPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const user = await getCurrentUser();
  if (!user?.shopId) {
    return null;
  }

  const actor = user as TenantSessionUser;
  const canManage = hasPermission(user.role, Permission.SALARY_MANAGE);
  const rawParams = await searchParams;

  if (!canManage) {
    // Self-view: no staff picker, always the caller's own records.
    const query = payslipListQuerySchema.parse({
      page: rawParams.page,
      pageSize: rawParams.pageSize,
    });

    return (
      <main className="flex flex-1 flex-col gap-6 p-6">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold tracking-tight">Salary</h1>
          <p className="text-muted-foreground text-sm">
            Your pay configuration and payslip history.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="lg:col-span-1">
            <SalaryConfigCard
              actor={actor}
              staffId={user.id}
              canManage={false}
            />
          </div>
          <div className="bg-card ring-foreground/10 overflow-hidden rounded-xl shadow-xs ring-1 lg:col-span-2">
            <div className="border-b p-4">
              <h2 className="text-sm font-medium">Payslip history</h2>
            </div>
            <Suspense
              key={JSON.stringify(query)}
              fallback={<PayslipsTableSkeleton showStaffColumn={false} />}
            >
              <PayslipsTable
                actor={actor}
                query={query}
                showStaffColumn={false}
                basePath={tenantPaths.salary}
              />
            </Suspense>
          </div>
        </div>
      </main>
    );
  }

  // Owner view: pick a staff member to configure/calculate for.
  const staffId =
    typeof rawParams.staffId === "string" ? rawParams.staffId : undefined;
  const staffOptions = await listPayableStaffForSelect(user.shopId);

  const query = payslipListQuerySchema.parse({
    page: rawParams.page,
    pageSize: rawParams.pageSize,
    staffId,
  });

  // Read once here rather than letting the Calculate button discover it:
  // "no hourly rate configured" is a setup step, not an error.
  const payReadiness = staffId
    ? await getPayReadiness(actor, staffId)
    : "ready";

  return (
    <main className="flex flex-1 flex-col gap-6 p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight">Salary</h1>
        <p className="text-muted-foreground text-sm">
          Configure pay and generate attendance-derived payslips.
        </p>
      </div>

      <SalaryStaffPicker
        defaultStaffId={staffId ?? ""}
        staffOptions={staffOptions}
      />

      {!staffId ? (
        <Empty className="py-16">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <UsersIcon />
            </EmptyMedia>
            <EmptyTitle>Choose a staff member</EmptyTitle>
            <EmptyDescription>
              Pick someone above to configure their pay or generate a payslip.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="flex flex-col gap-4 lg:col-span-1">
            <SalaryConfigCard actor={actor} staffId={staffId} canManage />
            <CalculatePayslipCard
              key={staffId}
              staffId={staffId}
              canGenerate
              payReadiness={payReadiness}
            />
          </div>
          <div className="bg-card ring-foreground/10 overflow-hidden rounded-xl shadow-xs ring-1 lg:col-span-2">
            <div className="border-b p-4">
              <h2 className="text-sm font-medium">Payslip history</h2>
            </div>
            <Suspense
              key={JSON.stringify(query)}
              fallback={<PayslipsTableSkeleton showStaffColumn={false} />}
            >
              <PayslipsTable
                actor={actor}
                query={query}
                showStaffColumn={false}
                basePath={tenantPaths.salary}
              />
            </Suspense>
          </div>
        </div>
      )}
    </main>
  );
}
