"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
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
import { cn } from "@/lib/utils";
import { tenantPaths } from "@/lib/tenant-paths";
import { REPORT_TYPES, type ReportType } from "@/lib/report-types";

const REPORT_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
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
  const searchParams = useSearchParams();

  function hrefFor(report: string): string {
    const params = new URLSearchParams(searchParams.toString());
    params.set("report", report);
    params.delete("page");
    return `${tenantPaths.reports}?${params.toString()}`;
  }

  return (
    <div className="w-full overflow-x-auto pb-4 scrollbar-none">
      <div className="inline-flex min-w-full items-center gap-2 border-b border-border/40 pb-px sm:min-w-0">
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
              <div className={cn(
                "flex size-6 items-center justify-center rounded-md transition-colors",
                isActive ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground group-hover:bg-accent group-hover:text-foreground"
              )}>
                <Icon className="size-3.5" />
              </div>
              <span>{type.label}</span>
              {isActive && (
                <span className="absolute inset-x-0 -bottom-[1px] h-0.5 rounded-t-full bg-primary" />
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
