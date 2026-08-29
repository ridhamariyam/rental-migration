import { Suspense } from "react";
import { redirect } from "next/navigation";
import { ActiveBookingsReport } from "@/components/tenant/active-bookings-report";
import {
  DailyIncomeReport,
  MonthlyIncomeReport,
} from "@/components/tenant/income-reports";
import { MostRentedReport } from "@/components/tenant/most-rented-report";
import { ReportFilters } from "@/components/tenant/report-filters";
import { ReportNavTabs } from "@/components/tenant/report-nav-tabs";
import { ReportTableSkeleton } from "@/components/tenant/report-table-skeleton";
import { RevenueByOutletReport } from "@/components/tenant/revenue-by-outlet-report";
import { StaffPerformanceReport } from "@/components/tenant/staff-performance-report";
import { getCurrentUser } from "@/lib/auth/session";
import { hasPermission, Permission } from "@/lib/auth/permissions";
import { REPORT_TYPES, type ReportType } from "@/lib/report-types";
import { tenantPaths } from "@/lib/tenant-paths";
import { listActiveOutletsForSelect } from "@/server/outlets/service";
import type { TenantSessionUser } from "@/server/auth/guard";

export const metadata = {
  title: "Reports — Rentique",
};

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const REPORT_VALUES = REPORT_TYPES.map((type) => type.value);

function firstString(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const user = await getCurrentUser();
  if (!user?.shopId) {
    return null;
  }

  if (!hasPermission(user.role, Permission.REPORT_VIEW)) {
    redirect(tenantPaths.dashboard);
  }

  const actor = user as TenantSessionUser;
  const rawParams = await searchParams;

  const rawReport = firstString(rawParams.report);
  const report: ReportType = REPORT_VALUES.includes(rawReport as ReportType)
    ? (rawReport as ReportType)
    : "daily-income";

  const fromDate = firstString(rawParams.fromDate) ?? "";
  const toDate = firstString(rawParams.toDate) ?? "";
  const year = firstString(rawParams.year) ?? String(new Date().getFullYear());
  const outletId = firstString(rawParams.outletId) ?? "";
  const page = Math.max(1, Number(firstString(rawParams.page)) || 1);

  const outlets = await listActiveOutletsForSelect(user.shopId);

  const commonProps = {
    actor,
    fromDate: fromDate || undefined,
    toDate: toDate || undefined,
    outletId: outletId || undefined,
  };

  return (
    <main className="flex flex-1 flex-col gap-4 p-5 sm:p-6">
      <div className="flex flex-col gap-0.5">
        <h1 className="text-lg font-bold tracking-tight">Reports</h1>
        <p className="text-muted-foreground text-xs">
          Income, performance, and what&rsquo;s still out with customers.
        </p>
      </div>

      <ReportNavTabs active={report} />

      <div className="bg-card ring-foreground/10 overflow-hidden rounded-xl shadow-xs ring-1">
        <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center">
          <ReportFilters
            report={report}
            fromDate={fromDate}
            toDate={toDate}
            year={year}
            outletId={outletId}
            outlets={outlets}
          />
        </div>

        <Suspense
          key={JSON.stringify({ report, fromDate, toDate, year, outletId, page })}
          fallback={<ReportTableSkeleton columns={report === "monthly-income" || report === "daily-income" ? 2 : 3} />}
        >
          {report === "daily-income" ? <DailyIncomeReport {...commonProps} /> : null}
          {report === "monthly-income" ? (
            <MonthlyIncomeReport actor={actor} year={Number(year)} outletId={outletId || undefined} />
          ) : null}
          {report === "most-rented" ? <MostRentedReport {...commonProps} /> : null}
          {report === "revenue-by-outlet" ? (
            <RevenueByOutletReport actor={actor} fromDate={fromDate || undefined} toDate={toDate || undefined} />
          ) : null}
          {report === "staff-performance" ? <StaffPerformanceReport {...commonProps} /> : null}
          {report === "pending-returns" ? (
            <ActiveBookingsReport
              actor={actor}
              kind="returns"
              outletId={outletId || undefined}
              page={page}
              pageSize={20}
            />
          ) : null}
          {report === "deposits-held" ? (
            <ActiveBookingsReport
              actor={actor}
              kind="deposits"
              outletId={outletId || undefined}
              page={page}
              pageSize={20}
            />
          ) : null}
        </Suspense>
      </div>
    </main>
  );
}
