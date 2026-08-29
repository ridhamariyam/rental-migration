"use client";

import { useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { SearchIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { settlementStatusLabel } from "@/components/tenant/settlement-status-badge";
import type { OwnerSettlement } from "@/lib/db/schema";

const SEARCH_DEBOUNCE_MS = 350;

const STATUS_VALUES: (OwnerSettlement["status"] | "all")[] = [
  "all",
  "pending",
  "paid",
  "cancelled",
];

const STATUS_LABELS: Record<string, string> = {
  all: "All statuses",
  ...Object.fromEntries(
    STATUS_VALUES.filter((v) => v !== "all").map((v) => [
      v,
      settlementStatusLabel(v as OwnerSettlement["status"]),
    ]),
  ),
};

/**
 * Search + status + outlet filters for the Revenue Share list — same
 * URL-driven approach as `MaintenanceFilters`/`BookingFilters`: every
 * change navigates to a new query string, so filtering happens in the
 * database, not client-side array filtering.
 */
export function SettlementFilters({
  defaultQuery,
  defaultStatus,
  defaultOutletId,
  outlets,
}: {
  defaultQuery: string;
  defaultStatus: string;
  defaultOutletId: string;
  outlets: { id: string; name: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [value, setValue] = useState(defaultQuery);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const outletLabels: Record<string, string> = {
    all: "All outlets",
    ...Object.fromEntries(outlets.map((o) => [o.id, o.name])),
  };

  function updateParams(next: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());

    for (const [key, val] of Object.entries(next)) {
      if (!val) {
        params.delete(key);
      } else {
        params.set(key, val);
      }
    }

    params.delete("page");
    const query = params.toString();
    router.replace(`${pathname}${query ? `?${query}` : ""}`);
  }

  function onSearchChange(next: string) {
    setValue(next);

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      updateParams({ q: next.trim() || null });
    }, SEARCH_DEBOUNCE_MS);
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
      <div className="relative sm:max-w-xs sm:flex-1">
        <SearchIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
        <Input
          value={value}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search by owner, SKU, product, or booking…"
          aria-label="Search settlements"
          className="pl-8"
        />
      </div>

      <Select
        defaultValue={defaultStatus}
        onValueChange={(next) =>
          updateParams({ status: next === "all" ? null : next })
        }
      >
        <SelectTrigger className="w-full sm:w-40">
          <SelectValue placeholder="Status">
            {(value: string) => STATUS_LABELS[value] ?? "Status"}
          </SelectValue>
        </SelectTrigger>
        <SelectContent alignItemWithTrigger={false}>
          {STATUS_VALUES.map((status) => (
            <SelectItem key={status} value={status}>
              {STATUS_LABELS[status]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {outlets.length > 0 ? (
        <Select
          defaultValue={defaultOutletId}
          onValueChange={(next) =>
            updateParams({ outletId: next === "all" ? null : next })
          }
        >
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue placeholder="Outlet">
              {(value: string) => outletLabels[value] ?? "Outlet"}
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
