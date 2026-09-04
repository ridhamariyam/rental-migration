import {
  BadgeIndianRupeeIcon,
  CalendarClockIcon,
  HandCoinsIcon,
  PackageCheckIcon,
  TrendingUpIcon,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/format";
import type { TenantSessionUser } from "@/server/auth/guard";
import { getDashboardStats } from "@/server/reports/service";

/**
 * The Shop Owner Dashboard's KPI tiles (doc §19) — server-fetched and
 * `Suspense`-wrapped by the page so the header/quick-actions above it
 * paint immediately while these tiles load. Reuses the exact tile-card
 * markup every other stats-tiles component in this app already uses
 * (`OutletStatsTiles`/`SettlementStatsTiles`/etc.) so this page reads as
 * one family with the rest of the dashboard, not a bespoke layout.
 */
export async function DashboardStatsTiles({
  actor,
  outletId,
}: {
  actor: TenantSessionUser;
  outletId?: string;
}) {
  const stats = await getDashboardStats(actor, { outletId });

  function trendBadge(percent: number | null): { badge: string | null; badgeVariant: "positive" | "warning" | "neutral" } {
    if (percent === null) return { badge: null, badgeVariant: "neutral" };
    return {
      badge: `${percent > 0 ? "+" : ""}${percent}%`,
      badgeVariant: percent >= 0 ? "positive" : "warning",
    };
  }

  const todaysTrend = trendBadge(stats.todaysIncomeChangePercent);
  const monthTrend = trendBadge(stats.monthIncomeChangePercent);

  const kpis = [
    {
      title: "Today's Revenue",
      value: formatMoney(stats.todaysIncome),
      badge: todaysTrend.badge,
      badgeVariant: todaysTrend.badgeVariant,
      subtitle: "vs yesterday",
      icon: BadgeIndianRupeeIcon,
    },
    {
      title: "Monthly Revenue",
      value: formatMoney(stats.monthIncome),
      badge: monthTrend.badge,
      badgeVariant: monthTrend.badgeVariant,
      subtitle: "vs last month",
      icon: HandCoinsIcon,
    },
    {
      title: "Active Rentals",
      value: `${stats.activeRentals} items`,
      badge: stats.pendingReturns > 0 ? `${stats.pendingReturns} due` : "Active",
      badgeVariant: stats.pendingReturns > 0 ? "warning" : "positive",
      subtitle: "Out with customers",
      icon: CalendarClockIcon,
    },
    {
      title: "Available Stock",
      value: `${stats.availableProducts} items`,
      badge: "Ready",
      badgeVariant: "neutral",
      subtitle: "Available to book",
      icon: PackageCheckIcon,
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {kpis.map((kpi) => (
        <Card key={kpi.title} className="relative overflow-hidden transition-all hover:border-border/80">
          <CardContent className="p-5 flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/80">
                {kpi.title}
              </span>
              {kpi.badge ? (
                <span
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold",
                    kpi.badgeVariant === "positive"
                      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                      : kpi.badgeVariant === "warning"
                      ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20"
                      : "bg-muted text-muted-foreground border border-border/40",
                  )}
                >
                  {kpi.badgeVariant === "positive" ? <TrendingUpIcon className="size-3" /> : null}
                  {kpi.badge}
                </span>
              ) : null}
            </div>

            <div className="flex flex-col gap-0.5">
              <span className="text-2xl font-bold tracking-tight text-foreground">
                {kpi.value}
              </span>
              <span className="text-xs font-medium text-muted-foreground/80">
                {kpi.subtitle}
              </span>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
