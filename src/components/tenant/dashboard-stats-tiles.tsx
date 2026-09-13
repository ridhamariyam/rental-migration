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
import { PASTEL_TONES, type PastelTone } from "@/lib/pastel-tones";
import type { TenantSessionUser } from "@/server/auth/guard";
import { getDashboardStats } from "@/server/reports/service";

/**
 * The Shop Owner Dashboard's KPI tiles (doc §19) — server-fetched and
 * `Suspense`-wrapped by the page so the header/quick-actions above it
 * paint immediately while these tiles load. Each tile is a card washed in
 * its own pastel (see `PASTEL_TONES`), with its icon on a white chip in the
 * matching ink, so the four headline numbers are told apart at a glance.
 */
export async function DashboardStatsTiles({
  actor,
  outletId,
}: {
  actor: TenantSessionUser;
  outletId?: string;
}) {
  const stats = await getDashboardStats(actor, { outletId });

  function trendBadge(percent: number | null): {
    badge: string | null;
    badgeVariant: "positive" | "warning" | "neutral";
  } {
    if (percent === null) return { badge: null, badgeVariant: "neutral" };
    return {
      badge: `${percent > 0 ? "+" : ""}${percent}%`,
      badgeVariant: percent >= 0 ? "positive" : "warning",
    };
  }

  const todaysTrend = trendBadge(stats.todaysIncomeChangePercent);
  const monthTrend = trendBadge(stats.monthIncomeChangePercent);

  // These two tiles are **cash collected**, not contracted rent — the
  // dashboard used to label both definitions "Revenue" and show them
  // side by side (RQ-03). The title now says which one this is.
  //
  // A "vs yesterday" caption is only shown when there is a delta to go
  // with it: `computePercentChange` returns null with no prior-period
  // baseline, and a comparison label with nothing to compare is worse
  // than no label. The two constant badges ("Active", "Ready") are gone
  // for the same reason — they never changed, so they said nothing.
  const kpis: {
    title: string;
    value: string;
    badge: string | null;
    badgeVariant: "positive" | "warning" | "neutral";
    subtitle: string;
    icon: typeof BadgeIndianRupeeIcon;
    tone: PastelTone;
  }[] = [
    {
      title: "Cash Collected Today",
      value: formatMoney(stats.todaysIncome),
      badge: todaysTrend.badge,
      badgeVariant: todaysTrend.badgeVariant,
      subtitle: todaysTrend.badge ? "vs yesterday" : "Payments received today",
      icon: BadgeIndianRupeeIcon,
      tone: "mint",
    },
    {
      title: "Cash Collected This Month",
      value: formatMoney(stats.monthIncome),
      badge: monthTrend.badge,
      badgeVariant: monthTrend.badgeVariant,
      subtitle: monthTrend.badge
        ? "vs last month"
        : "Payments received this month",
      icon: HandCoinsIcon,
      tone: "sky",
    },
    {
      title: "Active Rentals",
      value: `${stats.activeRentals} items`,
      badge: stats.pendingReturns > 0 ? `${stats.pendingReturns} due` : null,
      badgeVariant: "warning",
      subtitle: "Out with customers",
      icon: CalendarClockIcon,
      tone: "lavender",
    },
    {
      title: "Available Stock",
      value: `${stats.availableProducts} items`,
      badge: null,
      badgeVariant: "neutral",
      subtitle: "Available to book",
      icon: PackageCheckIcon,
      tone: "peach",
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {kpis.map((kpi) => (
        <Card
          key={kpi.title}
          className={cn(
            "relative overflow-hidden transition-all",
            PASTEL_TONES[kpi.tone].surface,
          )}
        >
          <CardContent className="flex flex-col gap-3 p-5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-foreground/70 text-xs font-semibold tracking-wider uppercase">
                {kpi.title}
              </span>
              {kpi.badge ? (
                <span
                  className={cn(
                    "bg-card/80 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold",
                    kpi.badgeVariant === "positive"
                      ? "border-emerald-500/20 text-emerald-700 dark:text-emerald-400"
                      : kpi.badgeVariant === "warning"
                        ? "border-amber-500/20 text-amber-700 dark:text-amber-400"
                        : "text-muted-foreground border-border/40",
                  )}
                >
                  {kpi.badgeVariant === "positive" ? (
                    <TrendingUpIcon className="size-3" />
                  ) : null}
                  {kpi.badge}
                </span>
              ) : null}
            </div>

            <div className="flex items-end justify-between gap-3">
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="text-foreground text-2xl font-bold tracking-tight">
                  {kpi.value}
                </span>
                <span className="text-foreground/65 text-xs font-medium">
                  {kpi.subtitle}
                </span>
              </div>
              <span
                className={cn(
                  "bg-card/80 flex size-9 shrink-0 items-center justify-center rounded-full",
                  PASTEL_TONES[kpi.tone].ink,
                )}
              >
                <kpi.icon className="size-4" aria-hidden="true" />
              </span>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
