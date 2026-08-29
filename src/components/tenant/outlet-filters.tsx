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

const SEARCH_DEBOUNCE_MS = 350;

const STATUS_LABELS: Record<string, string> = {
  all: "All statuses",
  active: "Active",
  inactive: "Inactive",
};

/**
 * Search + status filter for the outlet list — same URL-driven approach as
 * `TenantFilters` (every change navigates to a new `?q=&status=`, so
 * filtering happens in the database via `listOutlets`, and the URL stays
 * shareable/bookmarkable). Changing either filter resets `page` to 1.
 */
export function OutletFilters({
  defaultQuery,
  defaultStatus,
}: {
  defaultQuery: string;
  defaultStatus: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [value, setValue] = useState(defaultQuery);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <div className="relative sm:max-w-xs sm:flex-1">
        <SearchIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
        <Input
          value={value}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search by name, code, or address…"
          aria-label="Search outlets"
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
          {/* `Select.Value` shows the raw `value` string unless given a
              render function — without this it would literally render
              "all"/"active"/"inactive" instead of the item's own label. */}
          <SelectValue placeholder="Status">
            {(value: string) => STATUS_LABELS[value] ?? "Status"}
          </SelectValue>
        </SelectTrigger>
        <SelectContent alignItemWithTrigger={false}>
          <SelectItem value="all">All statuses</SelectItem>
          <SelectItem value="active">Active</SelectItem>
          <SelectItem value="inactive">Inactive</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
