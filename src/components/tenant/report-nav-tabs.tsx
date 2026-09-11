"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  BarChart3Icon,
  Building2Icon,
  CalendarDaysIcon,
  CalendarIcon,
  ClockIcon,
  PackageXIcon,
  ShieldCheckIcon,
  TrendingUpIcon,
  UsersIcon,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { tenantPaths } from "@/lib/tenant-paths";
import { REPORT_TYPES, type ReportType } from "@/lib/report-types";

const REPORT_ICONS: Record<
  string,
  React.ComponentType<{ className?: string }>
> = {
  "daily-income": CalendarIcon,
  "monthly-income": CalendarDaysIcon,
  "pending-returns": ClockIcon,
  "deposits-held": ShieldCheckIcon,
  "most-rented": TrendingUpIcon,
  "not-rented": PackageXIcon,
  "revenue-by-outlet": Building2Icon,
  "staff-performance": UsersIcon,
};

export function ReportNavTabs({ active }: { active: ReportType }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function hrefFor(report: string): string {
    const params = new URLSearchParams(searchParams.toString());
    params.set("report", report);
    params.delete("page");
    return `${tenantPaths.reports}?${params.toString()}`;
  }

  const activeLabel =
    REPORT_TYPES.find((type) => type.value === active)?.label ?? "Report";

  return (
    <>
      {/* Eight tabs cannot sit abreast on a phone. They used to run off the
          side in a scrolling strip, which hid most of the reports behind a
          gesture; below `lg` they become a picker instead, so every report
          is one tap away. */}
      <div className="pb-4 lg:hidden">
        <Select
          value={active}
          onValueChange={(next) => {
            if (next) router.push(hrefFor(next));
          }}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Choose a report">
              {(value: string) =>
                REPORT_TYPES.find((type) => type.value === value)?.label ??
                activeLabel
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent alignItemWithTrigger={false}>
            {REPORT_TYPES.map((type) => (
              <SelectItem key={type.value} value={type.value}>
                {type.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* The strip keeps its own scroll container from `lg` up: eight tabs
          still out-measure a laptop's content column, and without it the
          overflow would push the whole page sideways instead of staying
          inside the tab bar. */}
      <div className="hidden w-full scrollbar-none overflow-x-auto pb-4 lg:block">
        <div className="border-border/40 inline-flex min-w-full items-center gap-2 border-b pb-px lg:min-w-0">
          {REPORT_TYPES.map((type) => {
            const isActive = active === type.value;
            const Icon = REPORT_ICONS[type.value] ?? BarChart3Icon;

            return (
              <Link
                key={type.value}
                href={hrefFor(type.value)}
                className={cn(
                  "group relative flex shrink-0 items-center gap-2.5 px-3 py-2.5 text-sm font-medium transition-colors",
                  isActive
                    ? "text-primary font-semibold"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <div
                  className={cn(
                    "flex size-6 items-center justify-center rounded-md transition-colors",
                    isActive
                      ? "bg-primary/10 text-primary"
                      : "bg-muted text-muted-foreground group-hover:bg-accent group-hover:text-foreground",
                  )}
                >
                  <Icon className="size-3.5" />
                </div>
                <span>{type.label}</span>
                {isActive && (
                  <span className="bg-primary absolute inset-x-0 -bottom-[1px] h-0.5 rounded-t-full" />
                )}
              </Link>
            );
          })}
        </div>
      </div>
    </>
  );
}
