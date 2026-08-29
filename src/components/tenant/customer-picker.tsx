"use client";

import { useEffect, useRef, useState } from "react";
import { SearchIcon, UserIcon, XIcon } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/api-client";
import { cn } from "@/lib/utils";

const SEARCH_DEBOUNCE_MS = 300;

export type PickedCustomer = {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
};

type CustomerSearchItem = PickedCustomer;

/**
 * Search-select for the booking form's "Customer" field — searches the
 * existing `/api/customers?q=` endpoint (no separate search API needed),
 * a small unpaginated-feeling result list rather than a full picker page.
 * Deliberately no inline "create customer" shortcut: a walk-in the staff
 * can't find should be added properly from the Customers page first.
 */
export function CustomerPicker({
  value,
  onSelect,
  disabled,
  invalid,
}: {
  value: PickedCustomer | null;
  onSelect: (customer: PickedCustomer | null) => void;
  disabled?: boolean;
  invalid?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CustomerSearchItem[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function search(next: string) {
    setQuery(next);
    setOpen(true);

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    if (!next.trim()) {
      setResults([]);
      return;
    }

    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const data = await apiRequest<{ items: CustomerSearchItem[] }>(
          `/api/customers?q=${encodeURIComponent(next)}&pageSize=6&status=active`,
        );
        setResults(data.items);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, SEARCH_DEBOUNCE_MS);
  }

  if (value) {
    return (
      <div
        className={cn(
          "border-input flex h-10 w-full items-center gap-2 rounded-lg border px-3 text-sm",
          invalid && "border-destructive",
        )}
      >
        <UserIcon className="text-muted-foreground size-4 shrink-0" />
        <span className="flex-1 truncate font-medium">
          {value.firstName} {value.lastName}
        </span>
        <span className="text-muted-foreground shrink-0 text-xs">
          {value.phone}
        </span>
        {!disabled ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Clear customer"
            onClick={() => {
              onSelect(null);
              setQuery("");
            }}
          >
            <XIcon className="size-3.5" />
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <SearchIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
        <Input
          value={query}
          disabled={disabled}
          aria-invalid={invalid}
          onChange={(event) => search(event.target.value)}
          onFocus={() => setOpen(true)}
          placeholder="Search by name or phone…"
          className="pl-8"
          role="combobox"
          aria-expanded={open}
          aria-controls="customer-picker-list"
        />
      </div>

      {open && query.trim() ? (
        <div
          id="customer-picker-list"
          role="listbox"
          className="bg-popover text-popover-foreground ring-foreground/10 absolute z-50 mt-1 max-h-64 w-full overflow-y-auto rounded-lg py-1 shadow-md ring-1"
        >
          {loading ? (
            <div className="text-muted-foreground flex items-center gap-2 px-3 py-3 text-sm">
              <Spinner className="size-3.5" />
              Searching…
            </div>
          ) : results.length === 0 ? (
            <p className="text-muted-foreground px-3 py-3 text-sm">
              No customers match &ldquo;{query}&rdquo;.
            </p>
          ) : (
            results.map((customer) => (
              <button
                key={customer.id}
                type="button"
                role="option"
                aria-selected={false}
                className="hover:bg-accent hover:text-accent-foreground flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm"
                onClick={() => {
                  onSelect(customer);
                  setOpen(false);
                  setQuery("");
                }}
              >
                <span className="font-medium">
                  {customer.firstName} {customer.lastName}
                </span>
                <span className="text-muted-foreground text-xs">
                  {customer.phone}
                </span>
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
