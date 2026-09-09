"use client";

import { useEffect, useRef, useState } from "react";
import { SearchIcon, ShirtIcon, XIcon } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/api-client";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { VariationSearchResult } from "@/server/variations/service";

const SEARCH_DEBOUNCE_MS = 300;

/**
 * Search-select for the booking form's "Item" field — searches SKU,
 * barcode or product name across the whole catalogue (unlike the product
 * detail page's per-product variation list). A barcode scanner types the
 * code followed by Enter, which naturally lands as a normal search here —
 * no separate "scan mode" is needed.
 */
export function ItemPicker({
  value,
  onSelect,
  disabled,
  invalid,
  autoFocus,
}: {
  value: VariationSearchResult | null;
  onSelect: (variation: VariationSearchResult | null) => void;
  disabled?: boolean;
  invalid?: boolean;
  /** Focuses the search input as soon as it mounts — opt-in per call site
   * since not every picker is the first field in its form (e.g. an inline
   * swap-item action shouldn't steal focus the way a fresh dialog's first
   * field should). */
  autoFocus?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<VariationSearchResult[]>([]);
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
        const data = await apiRequest<VariationSearchResult[]>(
          `/api/variations/search?q=${encodeURIComponent(next)}`,
        );
        setResults(data);
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
          "border-input flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-sm",
          invalid && "border-destructive",
        )}
      >
        <span className="bg-primary/10 text-primary flex size-8 shrink-0 items-center justify-center rounded-lg">
          <ShirtIcon className="size-4" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">
            {value.productName}
            {value.color || value.size ? (
              <span className="text-muted-foreground font-normal">
                {" "}
                — {[value.color, value.size].filter(Boolean).join(", ")}
              </span>
            ) : null}
          </p>
          <p className="text-muted-foreground truncate text-xs">
            SKU {value.sku} · {formatMoney(value.rentPrice)} per rental
          </p>
        </div>
        {!disabled ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Clear item"
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
          autoFocus={autoFocus}
          onChange={(event) => search(event.target.value)}
          onFocus={() => setOpen(true)}
          placeholder="Scan a barcode, or search by SKU/product name…"
          className="pl-8"
          role="combobox"
          aria-expanded={open}
          aria-controls="item-picker-list"
        />
      </div>

      {open && query.trim() ? (
        <div
          id="item-picker-list"
          role="listbox"
          className="bg-popover text-popover-foreground ring-foreground/10 absolute z-50 mt-1 max-h-72 w-full overflow-y-auto rounded-lg py-1 shadow-md ring-1"
        >
          {loading ? (
            <div className="text-muted-foreground flex items-center gap-2 px-3 py-3 text-sm">
              <Spinner className="size-3.5" />
              Searching…
            </div>
          ) : results.length === 0 ? (
            <p className="text-muted-foreground px-3 py-3 text-sm">
              No items match &ldquo;{query}&rdquo;.
            </p>
          ) : (
            results.map((variation) => (
              <button
                key={variation.id}
                type="button"
                role="option"
                aria-selected={false}
                className="hover:bg-accent hover:text-accent-foreground flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm"
                onClick={() => {
                  onSelect(variation);
                  setOpen(false);
                  setQuery("");
                }}
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">
                    {variation.productName}
                    {variation.color || variation.size ? (
                      <span className="text-muted-foreground font-normal">
                        {" "}
                        —{" "}
                        {[variation.color, variation.size]
                          .filter(Boolean)
                          .join(", ")}
                      </span>
                    ) : null}
                  </p>
                  <p className="text-muted-foreground truncate text-xs">
                    SKU {variation.sku} · {variation.outletName ?? "No outlet"}
                  </p>
                </div>
                <Badge
                  variant={
                    variation.status === "available" ? "secondary" : "outline"
                  }
                  className={
                    variation.status === "available"
                      ? "bg-primary/10 text-primary shrink-0"
                      : "text-muted-foreground shrink-0"
                  }
                >
                  {formatMoney(variation.rentPrice)}
                </Badge>
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
