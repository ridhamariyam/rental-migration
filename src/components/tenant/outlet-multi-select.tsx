"use client";

import { useState } from "react";
import { Building2Icon, ChevronsUpDownIcon, XIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type OutletMultiSelectOption = { id: string; name: string; code: string };

/**
 * Pick one or more outlets at once — used by "Add item" so a shop with the
 * same barcoded item at several outlets doesn't have to repeat the whole
 * dialog per outlet. Selecting N outlets creates N separate physical
 * items (one per outlet), each with its own auto-generated SKU/barcode
 * (see `createVariation` in `server/variations/service.ts`).
 */
export function OutletMultiSelect({
  id,
  outlets,
  value,
  onChange,
  disabled,
  invalid,
}: {
  id?: string;
  outlets: OutletMultiSelectOption[];
  value: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
  invalid?: boolean;
}) {
  const [open, setOpen] = useState(false);

  function toggle(outletId: string) {
    onChange(
      value.includes(outletId)
        ? value.filter((existing) => existing !== outletId)
        : [...value, outletId],
    );
  }

  function remove(outletId: string) {
    onChange(value.filter((existing) => existing !== outletId));
  }

  const selected = outlets.filter((outlet) => value.includes(outlet.id));

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        id={id}
        type="button"
        disabled={disabled}
        aria-invalid={invalid}
        className={cn(
          "border-input bg-background flex min-h-9 w-full flex-wrap items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-expanded:border-ring disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20",
        )}
      >
        {selected.length === 0 ? (
          <span className="text-muted-foreground flex items-center gap-1.5">
            <Building2Icon className="size-4" />
            Choose outlets
          </span>
        ) : (
          selected.map((outlet) => (
            <Badge key={outlet.id} variant="secondary" className="gap-1 pr-1">
              {outlet.name}
              <span
                role="button"
                tabIndex={-1}
                aria-label={`Remove ${outlet.name}`}
                onClick={(event) => {
                  event.stopPropagation();
                  remove(outlet.id);
                }}
                onPointerDown={(event) => event.stopPropagation()}
                className="hover:bg-foreground/10 -mr-0.5 rounded-full p-0.5"
              >
                <XIcon className="size-2.5" />
              </span>
            </Badge>
          ))
        )}
        <ChevronsUpDownIcon className="text-muted-foreground ml-auto size-4 shrink-0 opacity-60" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-(--anchor-width) min-w-64 p-0">
        <Command>
          <CommandInput placeholder="Search outlets…" />
          <CommandList>
            <CommandEmpty>No outlets found.</CommandEmpty>
            <CommandGroup>
              {outlets.map((outlet) => {
                const checked = value.includes(outlet.id);
                return (
                  <CommandItem
                    key={outlet.id}
                    value={`${outlet.name} ${outlet.code}`}
                    data-checked={checked ? "true" : undefined}
                    onSelect={() => toggle(outlet.id)}
                  >
                    <span className="truncate">
                      {outlet.name} ({outlet.code})
                    </span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
