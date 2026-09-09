"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { RotateCcwIcon, SlidersHorizontalIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { auditActionLabel } from "@/components/tenant/audit-action-badge";
import { parseDateString } from "@/lib/format";
import { TENANT_VISIBLE_ACTIONS } from "@/lib/audit-actions";

const ACTION_VALUES = ["all", ...TENANT_VISIBLE_ACTIONS] as const;
const ENTITY_TYPE_VALUES = [
  "all",
  "user",
  "salary",
  "owner_settlement",
  "attendance",
  "staff_leave",
  "booking",
  "payment",
] as const;

const ENTITY_TYPE_LABELS: Record<string, string> = {
  all: "All entities",
  user: "Staff",
  salary: "Salary",
  owner_settlement: "Settlement",
  attendance: "Attendance",
  staff_leave: "Leave",
  booking: "Booking",
  payment: "Payment",
};

/** URL-driven filters for the Audit Log — same pattern as every other
 * list page's filter bar (`MaintenanceFilters`/`SettlementFilters`/etc.):
 * every change navigates to a new query string, so filtering happens in
 * the database. */
export function AuditLogFilters({
  defaultAction,
  defaultEntityType,
  defaultFromDate,
  defaultToDate,
}: {
  defaultAction: string;
  defaultEntityType: string;
  defaultFromDate: string;
  defaultToDate: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [sheetOpen, setSheetOpen] = useState(false);

  const activeFilterCount =
    (defaultAction !== "all" ? 1 : 0) +
    (defaultEntityType !== "all" ? 1 : 0) +
    (defaultFromDate ? 1 : 0) +
    (defaultToDate ? 1 : 0);

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

  function clearAllFilters() {
    updateParams({ action: null, entityType: null, fromDate: null, toDate: null });
  }

  const renderFilterControls = (isMobile = false) => (
    <>
      <Select
        value={defaultAction}
        onValueChange={(value) => updateParams({ action: value === "all" ? null : value })}
      >
        <SelectTrigger className={isMobile ? "w-full" : "w-full sm:w-48"}>
          <SelectValue placeholder="All actions">
            {(value: string) => (value === "all" ? "All actions" : auditActionLabel(value))}
          </SelectValue>
        </SelectTrigger>
        <SelectContent alignItemWithTrigger={false}>
          {ACTION_VALUES.map((value) => (
            <SelectItem key={value} value={value}>
              {value === "all" ? "All actions" : auditActionLabel(value)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={defaultEntityType}
        onValueChange={(value) => updateParams({ entityType: value === "all" ? null : value })}
      >
        <SelectTrigger className={isMobile ? "w-full" : "w-full sm:w-40"}>
          <SelectValue placeholder="All entities">
            {(value: string) => ENTITY_TYPE_LABELS[value] ?? "All entities"}
          </SelectValue>
        </SelectTrigger>
        <SelectContent alignItemWithTrigger={false}>
          {ENTITY_TYPE_VALUES.map((value) => (
            <SelectItem key={value} value={value}>
              {ENTITY_TYPE_LABELS[value]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <DatePicker
        value={defaultFromDate}
        onChange={(value) => updateParams({ fromDate: value })}
        placeholder="From date"
        className={isMobile ? "w-full" : "w-full sm:w-40"}
      />
      <DatePicker
        value={defaultToDate}
        onChange={(value) => updateParams({ toDate: value })}
        placeholder="To date"
        disabledMatcher={defaultFromDate ? { before: parseDateString(defaultFromDate) } : undefined}
        className={isMobile ? "w-full" : "w-full sm:w-40"}
      />
    </>
  );

  return (
    <div className="w-full">
      {/* Desktop view: inline filters */}
      <div className="hidden sm:flex sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
        {renderFilterControls(false)}
      </div>

      {/* Mobile view: on-demand filter sheet */}
      <div className="flex w-full items-center justify-between gap-2 sm:hidden">
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetTrigger render={<Button variant="outline" size="sm" />}>
            <SlidersHorizontalIcon className="size-4" />
            <span>Filters</span>
            {activeFilterCount > 0 ? (
              <span className="bg-primary text-primary-foreground flex size-5 items-center justify-center rounded-full text-xs font-semibold">
                {activeFilterCount}
              </span>
            ) : null}
          </SheetTrigger>
          <SheetContent side="bottom" className="rounded-t-2xl p-5">
            <SheetHeader className="p-0 pb-3">
              <SheetTitle>Filter activity</SheetTitle>
            </SheetHeader>
            <div className="flex flex-col gap-3 py-2">{renderFilterControls(true)}</div>
            {activeFilterCount > 0 ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearAllFilters}
                className="mt-2 w-full text-muted-foreground"
              >
                <RotateCcwIcon className="size-3.5" />
                Reset all filters
              </Button>
            ) : null}
          </SheetContent>
        </Sheet>

        {activeFilterCount > 0 ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={clearAllFilters}
            className="text-muted-foreground text-xs"
          >
            <XIcon className="size-3.5" />
            Clear ({activeFilterCount})
          </Button>
        ) : null}
      </div>
    </div>
  );
}
