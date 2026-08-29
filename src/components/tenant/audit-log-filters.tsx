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
import { auditActionLabel } from "@/components/tenant/audit-action-badge";
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

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
      <Select
        value={defaultAction}
        onValueChange={(value) => updateParams({ action: value === "all" ? null : value })}
      >
        <SelectTrigger className="w-full sm:w-48">
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
        <SelectTrigger className="w-full sm:w-40">
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

      <div className="flex items-center gap-2">
        <span className="text-muted-foreground text-sm">From</span>
        <DatePicker
          value={defaultFromDate}
          onChange={(value) => updateParams({ fromDate: value })}
          className="w-full sm:w-40"
        />
      </div>
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground text-sm">To</span>
        <DatePicker
          value={defaultToDate}
          onChange={(value) => updateParams({ toDate: value })}
          disabledMatcher={defaultFromDate ? { before: new Date(defaultFromDate) } : undefined}
          className="w-full sm:w-40"
        />
      </div>
    </div>
  );
}
