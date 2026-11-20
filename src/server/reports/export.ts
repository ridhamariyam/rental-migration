import "server-only";

import type { TenantSessionUser } from "@/server/auth/guard";
import type { ReportType } from "@/lib/report-types";
import {
  activeBookingsQuerySchema,
  monthlyIncomeQuerySchema,
  mostRentedQuerySchema,
  reportDateRangeQuerySchema,
} from "@/lib/validation/reports";
import {
  getDailyIncome,
  getMonthlyIncome,
  getMostRentedProducts,
  getNotRentedProducts,
  getRevenueByOutlet,
  getStaffPerformance,
  listActiveBookings,
} from "@/server/reports/service";

type Cell = string | number | null | undefined;
type Table = { header: string[]; rows: Cell[][] };

/** RFC 4180 quoting, and a leading `'` on anything a spreadsheet would
 * read as a formula (`=`, `+`, `-`, `@`) — a customer name like
 * `=HYPERLINK(...)` must open as text, not run. Plain numbers are left
 * alone so amounts stay summable. */
function csvCell(value: Cell): string {
  if (value === null || value === undefined) return "";
  let text = String(value);
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(text) && !/^-?\d+(\.\d+)?$/.test(text)) {
    text = `'${text}`;
  }
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(table: Table): string {
  // BOM so Excel opens the file as UTF-8 (₹, non-Latin names).
  return (
    "﻿" +
    [table.header, ...table.rows].map((row) => row.map(csvCell).join(",")).join("\r\n") +
    "\r\n"
  );
}

/** Every row of a paginated "currently out" list — the export is the whole
 * report, not whichever page happened to be on screen. */
async function allActiveBookings(
  actor: TenantSessionUser,
  kind: "returns" | "deposits",
  outletId: string | undefined,
) {
  const items = [];
  for (let page = 1; ; page += 1) {
    const result = await listActiveBookings(
      actor,
      activeBookingsQuerySchema.parse({ page, pageSize: 100, outletId, kind }),
    );
    items.push(...result.items);
    if (page >= result.totalPages) return items;
  }
}

export async function buildReportTable(
  actor: TenantSessionUser,
  report: ReportType,
  params: { fromDate?: string; toDate?: string; year?: string; outletId?: string },
): Promise<Table> {
  const range = reportDateRangeQuerySchema.parse({
    fromDate: params.fromDate,
    toDate: params.toDate,
    outletId: params.outletId,
  });

  switch (report) {
    case "daily-income": {
      const result = await getDailyIncome(actor, range);
      return {
        header: ["Date", "Bookings", "Income"],
        rows: [
          ...result.rows.map((row) => [row.date, row.bookings, row.amount]),
          ["Total", "", result.total],
        ],
      };
    }
    case "monthly-income": {
      const result = await getMonthlyIncome(
        actor,
        monthlyIncomeQuerySchema.parse({ year: params.year, outletId: params.outletId }),
      );
      return {
        header: ["Month", "Income"],
        rows: [...result.rows.map((row) => [row.month, row.amount]), ["Total", result.total]],
      };
    }
    case "most-rented": {
      const rows = await getMostRentedProducts(
        actor,
        mostRentedQuerySchema.parse({ ...range, limit: 50 }),
      );
      return {
        header: ["Product", "Times rented", "Revenue"],
        rows: rows.map((row) => [row.productName, row.rentalCount, row.revenue]),
      };
    }
    case "not-rented": {
      const rows = await getNotRentedProducts(
        actor,
        mostRentedQuerySchema.parse({ ...range, limit: 50 }),
      );
      return {
        header: ["Product", "Category", "Items"],
        rows: rows.map((row) => [row.productName, row.categoryName, row.variationCount]),
      };
    }
    case "revenue-by-outlet": {
      const rows = await getRevenueByOutlet(actor, range);
      return {
        header: ["Outlet", "Items rented", "Revenue"],
        rows: rows.map((row) => [row.outletName, row.bookingCount, row.revenue]),
      };
    }
    case "staff-performance": {
      const rows = await getStaffPerformance(actor, range);
      return {
        header: ["Staff", "Bookings", "Revenue"],
        rows: rows.map((row) => [row.staffName, row.bookingCount, row.revenue]),
      };
    }
    case "pending-returns":
    case "deposits-held": {
      const items = await allActiveBookings(
        actor,
        report === "pending-returns" ? "returns" : "deposits",
        range.outletId,
      );
      return {
        header: [
          "Booking",
          "Customer",
          "Phone",
          "Product",
          "SKU",
          "Outlet",
          "Pickup",
          "Return",
          "Days overdue",
          "Deposit",
          "Status",
        ],
        rows: items.map((item) => [
          item.bookingNumber,
          item.customerName,
          item.customerPhone,
          item.productName,
          item.sku,
          item.outletName,
          item.fromDate,
          item.toDate,
          item.daysOverdue,
          item.securityDeposit,
          item.status.replace(/_/g, " "),
        ]),
      };
    }
  }
}

export function reportFileName(
  report: ReportType,
  params: { fromDate?: string; toDate?: string; year?: string },
): string {
  const label = report;
  const period =
    report === "monthly-income"
      ? (params.year ?? "")
      : [params.fromDate, params.toDate].filter(Boolean).join("_to_");
  return `${label}${period ? `_${period}` : ""}.csv`;
}
