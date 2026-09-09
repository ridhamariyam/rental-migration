"use client";

import * as React from "react";
import type { Matcher } from "react-day-picker";
import { CalendarIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { formatDate, parseDateString, toDateString } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * A single-date picker built from shadcn's `Calendar`/`Popover` (added via
 * the shadcn CLI this phase, replacing the plain native `<input
 * type="date">` the browser renders very differently across OSes/browsers)
 * — works in the same `YYYY-MM-DD` strings every booking date field
 * already uses end to end, so nothing else about the form needed to
 * change shape.
 */
export function DatePicker({
  id,
  value,
  onChange,
  disabled,
  invalid,
  placeholder = "Choose a date",
  disabledMatcher,
  className,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  invalid?: boolean;
  placeholder?: string;
  /** react-day-picker `Matcher` — dates that can't be selected (e.g. "no
   * earlier than the pickup date" for a return-date field). */
  disabledMatcher?: Matcher | Matcher[];
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const selected = value ? parseDateString(value) : undefined;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            id={id}
            type="button"
            variant="outline"
            disabled={disabled}
            aria-invalid={invalid}
            className={cn(
              "h-10 border-input bg-transparent hover:bg-accent/50 dark:bg-input/30 dark:hover:bg-input/50 flex w-full min-w-0 items-center justify-start gap-2 rounded-lg border px-3 py-2 text-sm transition-colors outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20",
              !selected ? "text-muted-foreground font-normal" : "text-foreground font-medium",
              className,
            )}
          />
        }
      >
        <CalendarIcon className="text-muted-foreground size-4 shrink-0" />
        <span className="min-w-0 truncate">
          {selected ? formatDate(selected, "long") : placeholder}
        </span>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selected}
          defaultMonth={selected}
          disabled={disabledMatcher}
          onSelect={(date) => {
            if (date) {
              onChange(toDateString(date));
              setOpen(false);
            }
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
