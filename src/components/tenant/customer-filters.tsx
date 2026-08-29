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
  all: "All customers",
  active: "Active",
  archived: "Archived",
};

export function CustomerFilters({
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
    <div className="flex flex-row items-center gap-2.5 sm:flex-row sm:items-center">
      <div className="relative flex-1 sm:max-w-xs">
        <SearchIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
        <Input
          value={value}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search by name, phone or email…"
          aria-label="Search customers"
          className="pl-8"
        />
      </div>

      <Select
        defaultValue={defaultStatus}
        onValueChange={(next) =>
          updateParams({ status: next === "all" ? null : next })
        }
      >
        <SelectTrigger className="w-[130px] shrink-0 sm:w-40">
          <SelectValue placeholder="Status">
            {(value: string) => STATUS_LABELS[value] ?? "Status"}
          </SelectValue>
        </SelectTrigger>
        <SelectContent alignItemWithTrigger={false}>
          <SelectItem value="all">All customers</SelectItem>
          <SelectItem value="active">Active</SelectItem>
          <SelectItem value="archived">Archived</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
