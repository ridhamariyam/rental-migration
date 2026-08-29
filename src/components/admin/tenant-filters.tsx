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
  blocked: "Blocked",
};

/**
 * Search + status filter for the tenant list. Both are URL-driven (not
 * client-side state filtering a fetched list) — every change navigates to
 * a new `?q=&status=` so the actual filtering happens in the database via
 * `listTenants`, and the URL stays shareable/bookmarkable. Changing either
 * filter resets `page` back to 1.
 */
export function TenantFilters({
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
          placeholder="Search by name, email, or phone…"
          aria-label="Search tenants"
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
        {/* Base UI's Select defaults to aligning the *selected item* with
            the trigger (mimicking a native <select>), which can make the
            popup open above/beside the trigger instead of directly below
            it depending on which option is selected. `alignItemWithTrigger
            ={false}` makes it behave like a normal dropdown: always
            anchored below the trigger. */}
        <SelectContent alignItemWithTrigger={false}>
          <SelectItem value="all">All statuses</SelectItem>
          <SelectItem value="active">Active</SelectItem>
          <SelectItem value="blocked">Blocked</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
