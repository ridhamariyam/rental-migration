import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon } from "lucide-react";
import { PrintReceiptButton } from "@/components/tenant/print-receipt-button";
import { getCurrentUser } from "@/lib/auth/session";
import { tenantPaths } from "@/lib/tenant-paths";
import {
  formatDate,
  formatDateTime,
  formatMinutes,
  formatMoney,
  formatPayrollPeriod,
  formatWeeklyOffDay,
} from "@/lib/format";
import { getTenantById } from "@/server/tenants/service";
import { getPayslipById } from "@/server/salary/service";
import type { TenantSessionUser } from "@/server/auth/guard";

type Params = Promise<{ id: string }>;

export const metadata = {
  title: "Payslip — Rentique",
};

/**
 * The payslip as a document: what the staff member is handed, printed or
 * saved as a PDF from the browser's print dialog (the same `.print-document`
 * treatment the customer invoice uses, so the app chrome is dropped and the
 * sheet is the measure).
 *
 * It shows the arithmetic, not just the total — hours at a rate, extra
 * hours at the other rate — because "why is it this much" is the only
 * question a payslip ever has to answer.
 */
export default async function PayslipDocumentPage({
  params,
}: {
  params: Params;
}) {
  const user = await getCurrentUser();
  if (!user?.shopId) {
    return null;
  }

  const { id } = await params;
  const payslip = await getPayslipById(user as TenantSessionUser, id);

  if (!payslip) {
    notFound();
  }

  const shop = await getTenantById(user.shopId);
  const period = formatPayrollPeriod(payslip);

  const lines = [
    {
      label: "Regular hours",
      value: formatMinutes(payslip.regularMinutes),
    },
    {
      label: "Extra / overtime hours",
      value:
        payslip.overtimeMinutes > 0
          ? formatMinutes(payslip.overtimeMinutes)
          : "—",
    },
    { label: "Hourly rate", value: `${formatMoney(payslip.hourlyRate)}/hr` },
    {
      label: "Extra worktime rate",
      value: payslip.overtimeRatePerHour
        ? `${formatMoney(payslip.overtimeRatePerHour)}/hr`
        : "Not paid",
    },
  ];

  const attendance = [
    {
      label: `Working days (${payslip.standardHoursPerDay}h/day)`,
      value: String(payslip.workingDays),
    },
    { label: "Present days", value: String(payslip.presentDays) },
    {
      label: "Approved leave (paid)",
      value: String(payslip.approvedLeaveDays),
    },
    { label: "Absent days", value: String(payslip.absentDays) },
    {
      label: "Total hours worked",
      value: formatMinutes(payslip.totalWorkedMinutes),
    },
    { label: "Weekly off", value: formatWeeklyOffDay(payslip.weeklyOffDay) },
  ];

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 p-4 sm:p-6">
      <div className="flex items-center justify-between gap-3 print:hidden">
        <Link
          href={`${tenantPaths.salary}?staffId=${payslip.staffId}`}
          className="text-muted-foreground hover:text-foreground inline-flex w-fit items-center gap-1 text-sm transition-colors"
        >
          <ArrowLeftIcon className="size-4" aria-hidden="true" />
          Salary
        </Link>
        <PrintReceiptButton label="Print / download" />
      </div>

      <article className="print-document bg-card ring-foreground/10 overflow-hidden rounded-xl shadow-xs ring-1">
        <header className="bg-primary text-primary-foreground flex items-center justify-end px-6 py-4 sm:px-8">
          <h1 className="text-2xl font-bold tracking-[0.2em] uppercase sm:text-3xl">
            Payslip
          </h1>
        </header>

        <div className="flex flex-col gap-6 p-6 sm:p-8">
          <div className="flex flex-col items-start justify-between gap-6 sm:flex-row">
            <div className="flex flex-col gap-0.5">
              <p className="text-primary text-base font-bold tracking-wide uppercase">
                {shop?.name ?? "Your business"}
              </p>
              {shop?.address ? (
                <p className="text-muted-foreground text-sm">{shop.address}</p>
              ) : null}
              {shop?.phone ? (
                <p className="text-muted-foreground text-sm">{shop.phone}</p>
              ) : null}
            </div>

            <div className="flex flex-col items-start gap-0.5 sm:items-end sm:text-right">
              <p className="text-primary text-xs font-semibold tracking-wide uppercase">
                Paid to
              </p>
              <p className="text-base font-semibold">
                {payslip.staffFirstName} {payslip.staffLastName}
              </p>
              <p className="text-muted-foreground text-sm">{period}</p>
              {/* The exact days, but only when the label above is a month
                  name — for a custom range the label already *is* the two
                  dates, and printing them twice reads like a mistake. */}
              {payslip.periodYear && payslip.periodMonth ? (
                <p className="text-muted-foreground text-sm">
                  {formatDate(payslip.periodStart)} –{" "}
                  {formatDate(payslip.periodEnd)}
                </p>
              ) : null}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <div className="flex flex-col gap-2 text-sm">
              <p className="text-primary text-xs font-semibold tracking-wide uppercase">
                How it was worked out
              </p>
              {lines.map((line) => (
                <div
                  key={line.label}
                  className="flex items-center justify-between gap-4"
                >
                  <span className="text-muted-foreground">{line.label}</span>
                  <span className="font-medium">{line.value}</span>
                </div>
              ))}

              <div className="mt-1 flex items-center justify-between gap-4 border-t pt-2">
                <span className="text-muted-foreground">
                  Base pay ({formatMinutes(payslip.regularMinutes)} ×{" "}
                  {formatMoney(payslip.hourlyRate)})
                </span>
                <span className="font-medium">
                  {formatMoney(payslip.basePay)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">Overtime pay</span>
                <span className="font-medium">
                  {formatMoney(payslip.overtimePay)}
                </span>
              </div>

              <div className="flex items-center justify-between gap-4 border-t pt-2">
                <span className="text-primary text-base font-bold tracking-wide uppercase">
                  Net payable
                </span>
                <span className="text-primary text-base font-bold">
                  {formatMoney(payslip.netAmount)}
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-2 border-t pt-4 text-sm sm:border-t-0 sm:pt-0">
              <p className="text-primary text-xs font-semibold tracking-wide uppercase">
                Attendance in this period
              </p>
              {attendance.map((row) => (
                <div
                  key={row.label}
                  className="flex items-center justify-between gap-4"
                >
                  <span className="text-muted-foreground">{row.label}</span>
                  <span className="font-medium">{row.value}</span>
                </div>
              ))}
            </div>
          </div>

          <p className="text-muted-foreground border-t pt-4 text-xs">
            Pay is the hours actually worked at the configured rate; extra
            worktime is the hours beyond a standard day, paid at the extra rate.
            Generated{" "}
            {payslip.generatedAt
              ? formatDateTime(payslip.generatedAt)
              : formatDateTime(payslip.createdAt)}
            .
          </p>
        </div>

        <footer className="bg-primary h-6" />
      </article>
    </main>
  );
}
