"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ReportType } from "@/lib/report-types";

const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = Array.from({ length: 5 }, (_, i) => String(CURRENT_YEAR - i));

/**
 * The filter bar shown above the active report — which controls appear
 * depends on the report (a date range for the income/performance reports,
 * a plain year for monthly income, just an outlet for the two "currently
 * out" lists) rather than one generic filter set every report ignores
 * half of.
 */
export function ReportFilters({
  report,
  fromDate,
  toDate,
  year,
  outletId,
  outlets,
}: {
  report: ReportType;
  fromDate: string;
  toDate: string;
  year: string;
  outletId: string;
  outlets: { id: string; name: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function updateParams(next: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(next)) {
      if (!value) {
        params.delete(key);
      } else {
        params.set(key, value);
      }
    }
    params.delete("page");
    router.replace(`${pathname}?${params.toString()}`);
  }

  const showDateRange = [
    "daily-income",
    "most-rented",
    "not-rented",
    "staff-performance",
  ].includes(report);
  const showYear = report === "monthly-income";
  const showOutlet = [
    "monthly-income",
    "most-rented",
    "not-rented",
    "staff-performance",
    "pending-returns",
    "deposits-held",
  ].includes(report);

  if (!showDateRange && !showYear && !showOutlet) {
    return null;
  }

  return (
    <div className="flex flex-col gap-3.5 sm:flex-row sm:flex-wrap sm:items-center">
      {showDateRange ? (
        <>
          <DatePicker
            value={fromDate}
            onChange={(value) => updateParams({ fromDate: value })}
            placeholder="From date"
            className="w-full sm:w-40"
          />
          <DatePicker
            value={toDate}
            onChange={(value) => updateParams({ toDate: value })}
            placeholder="To date"
            disabledMatcher={fromDate ? { before: new Date(fromDate) } : undefined}
            className="w-full sm:w-40"
          />
        </>
      ) : null}

      {showYear ? (
        <Select value={year} onValueChange={(value) => updateParams({ year: value })}>
          <SelectTrigger className="w-full sm:w-32">
            <SelectValue>{year}</SelectValue>
          </SelectTrigger>
          <SelectContent alignItemWithTrigger={false}>
            {YEAR_OPTIONS.map((y) => (
              <SelectItem key={y} value={y}>
                {y}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}

      {showOutlet && outlets.length > 0 ? (
        <Select
          value={outletId || "all"}
          onValueChange={(value) =>
            updateParams({ outletId: value === "all" ? null : value })
          }
        >
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue placeholder="All outlets">
              {(value: string) =>
                value === "all"
                  ? "All outlets"
                  : (outlets.find((o) => o.id === value)?.name ?? "All outlets")
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent alignItemWithTrigger={false}>
            <SelectItem value="all">All outlets</SelectItem>
            {outlets.map((outlet) => (
              <SelectItem key={outlet.id} value={outlet.id}>
                {outlet.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}
    </div>
  );
}
