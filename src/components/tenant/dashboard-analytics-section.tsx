import Link from "next/link";
import {
  ArrowUpRightIcon,
  Building2Icon,
  ClockIcon,
  PackageCheckIcon,
  ShirtIcon,
  SprayCanIcon,
  TrendingUpIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { CategoryDonutChart, type DonutItem } from "@/components/tenant/category-donut-chart";
import { RevenueTrendChart } from "@/components/tenant/revenue-trend-chart";
import { formatMoney, toDateString } from "@/lib/format";
import { tenantPaths } from "@/lib/tenant-paths";
import type { TenantSessionUser } from "@/server/auth/guard";
import {
  getDailyIncome,
  getDashboardStats,
  getMostRentedProducts,
  getRevenueByOutlet,
} from "@/server/reports/service";

export async function DashboardAnalyticsSection({
  actor,
}: {
  actor: TenantSessionUser;
}) {
  const now = new Date();
  const toDate = toDateString(now);
  const fromDate = toDateString(new Date(now.getTime() - 13 * 86_400_000));
  const previousToDate = toDateString(new Date(now.getTime() - 14 * 86_400_000));
  const previousFromDate = toDateString(new Date(now.getTime() - 27 * 86_400_000));

  const [
    { total, rows: trendRows },
    { total: previousTotal },
    stats,
    mostRented,
    outletRevenues,
  ] = await Promise.all([
    getDailyIncome(actor, { fromDate, toDate }),
    getDailyIncome(actor, { fromDate: previousFromDate, toDate: previousToDate }),
    getDashboardStats(actor, {}),
    getMostRentedProducts(actor, { limit: 4 }),
    // Same 14-day window as the trend beside it — this used to be an
    // all-time figure sitting next to a 14-day one, both labelled
    // "Revenue" (RQ-03).
    getRevenueByOutlet(actor, { fromDate, toDate }),
  ]);

  const previousTotalNum = Number(previousTotal);
  const revenueChangePercent =
    previousTotalNum === 0
      ? null
      : Math.round(((Number(total) - previousTotalNum) / previousTotalNum) * 100);

  // Convert outlet revenue data for the Donut Chart widget
  const donutData: DonutItem[] = outletRevenues.map((o) => ({
    name: o.outletName,
    value: o.bookingCount,
    revenue: o.revenue,
  }));

  // Status pipeline items
  const pipelineTotal =
    stats.activeRentals + stats.availableProducts + stats.pendingReturns + stats.itemsNeedingCleaning || 1;

  const pipeline = [
    {
      label: "Active Rentals",
      count: stats.activeRentals,
      percent: Math.round((stats.activeRentals / pipelineTotal) * 100),
      color: "bg-emerald-500",
      icon: PackageCheckIcon,
    },
    {
      label: "Available Items",
      count: stats.availableProducts,
      percent: Math.round((stats.availableProducts / pipelineTotal) * 100),
      color: "bg-primary",
      icon: ShirtIcon,
    },
    {
      label: "Pending Returns",
      count: stats.pendingReturns,
      percent: Math.round((stats.pendingReturns / pipelineTotal) * 100),
      color: "bg-amber-500",
      icon: ClockIcon,
    },
    {
      label: "Needs Cleaning/Repair",
      count: stats.itemsNeedingCleaning,
      percent: Math.round((stats.itemsNeedingCleaning / pipelineTotal) * 100),
      color: "bg-rose-500",
      icon: SprayCanIcon,
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      {/* Middle Grid: Revenue Trend (2/3) + Donut Breakdown (1/3) */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Revenue Trend Chart Card */}
        <Card className="lg:col-span-2 overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between border-b border-border/60 px-4 py-3.5 space-y-0">
            <div className="flex flex-col gap-0.5">
              <div className="flex items-center gap-2">
                <CardTitle className="text-sm font-semibold tracking-tight">
                  Revenue Analytics
                </CardTitle>
                {revenueChangePercent !== null ? (
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold border",
                      revenueChangePercent >= 0
                        ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                        : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
                    )}
                  >
                    <TrendingUpIcon className="size-3" />
                    {revenueChangePercent > 0 ? "+" : ""}
                    {revenueChangePercent}% vs last period
                  </span>
                ) : null}
              </div>
              <p className="text-[11px] text-muted-foreground">
                Total earnings: <span className="font-semibold text-foreground">{formatMoney(total)}</span> (last 14 days)
              </p>
            </div>
            <Button
              size="sm"
              variant="ghost"
              nativeButton={false}
              render={<Link href={tenantPaths.reports} />}
              className="gap-1 h-7 px-2.5 text-xs text-muted-foreground hover:text-foreground"
            >
              Full report
              <ArrowUpRightIcon className="size-3.5" />
            </Button>
          </CardHeader>
          <CardContent className="px-4 py-3">
            <RevenueTrendChart data={trendRows} fromDate={fromDate} toDate={toDate} />
          </CardContent>
        </Card>

        {/* Donut Category / Outlet Distribution Card */}
        <Card className="overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between border-b border-border/60 px-4 py-3.5 space-y-0">
            <div>
              <CardTitle className="text-sm font-semibold tracking-tight">
                Outlet Share
              </CardTitle>
              <p className="text-[11px] text-muted-foreground">Revenue distribution by outlet</p>
            </div>
            <Building2Icon className="size-4 text-muted-foreground/80" />
          </CardHeader>
          <CardContent className="px-5 py-4">
            <CategoryDonutChart data={donutData} />
          </CardContent>
        </Card>
      </div>

      {/* Bottom Analytics Grid (3 Columns) */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {/* 1. Inventory & Rental Pipeline */}
        <Card className="overflow-hidden">
          <CardHeader className="border-b border-border/60 px-4 py-3">
            <CardTitle className="text-sm font-semibold tracking-tight">
              Inventory Pipeline
            </CardTitle>
            <p className="text-[11px] text-muted-foreground">Current status of physical items</p>
          </CardHeader>
          <CardContent className="p-4 flex flex-col gap-3">
            {pipeline.map((item) => (
              <div key={item.label} className="flex flex-col gap-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-foreground flex items-center gap-1.5">
                    <item.icon className="size-3.5 text-muted-foreground/80" />
                    {item.label}
                  </span>
                  <span className="font-semibold text-foreground">
                    {item.count} <span className="text-muted-foreground/80 font-normal">({item.percent}%)</span>
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted/60">
                  <div
                    className={`h-full ${item.color} transition-all duration-500 rounded-full`}
                    style={{ width: `${Math.max(5, item.percent)}%` }}
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* 2. Top Rented Catalogue Products */}
        <Card className="overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between border-b border-border/60 px-4 py-3 space-y-0">
            <div>
              <CardTitle className="text-sm font-semibold tracking-tight">
                Top Products
              </CardTitle>
              <p className="text-[11px] text-muted-foreground">Most popular rented items</p>
            </div>
            <Button
              size="sm"
              variant="ghost"
              nativeButton={false}
              render={<Link href={tenantPaths.products} />}
              className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
            >
              View catalogue
            </Button>
          </CardHeader>
          <CardContent className="p-4 flex flex-col gap-2.5">
            {mostRented.length === 0 ? (
              <p className="text-xs text-muted-foreground py-4 text-center">No rental activity yet</p>
            ) : (
              mostRented.map((product, idx) => (
                <div key={product.productId} className="flex items-center justify-between gap-2.5 text-xs border-b border-border/30 pb-2 last:border-0 last:pb-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="flex size-5 shrink-0 items-center justify-center rounded bg-muted font-mono font-semibold text-[10px]">
                      #{idx + 1}
                    </span>
                    <div className="flex flex-col min-w-0">
                      <span className="font-semibold truncate text-foreground">{product.productName}</span>
                      <span className="text-muted-foreground text-[10px]">{product.rentalCount} bookings</span>
                    </div>
                  </div>
                  <span className="font-semibold text-foreground shrink-0">{formatMoney(product.revenue)}</span>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* 3. Outlet Revenue Performance List */}
        <Card className="overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between border-b border-border/60 px-4 py-3 space-y-0">
            <div>
              <CardTitle className="text-sm font-semibold tracking-tight">
                Outlets Performance
              </CardTitle>
              <p className="text-[11px] text-muted-foreground">Revenue by store location</p>
            </div>
            <Button
              size="sm"
              variant="ghost"
              nativeButton={false}
              render={<Link href={tenantPaths.outlets} />}
              className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
            >
              Manage outlets
            </Button>
          </CardHeader>
          <CardContent className="p-4 flex flex-col gap-2.5">
            {outletRevenues.length === 0 ? (
              <p className="text-xs text-muted-foreground py-4 text-center">No outlet data available</p>
            ) : (
              outletRevenues.map((outlet) => (
                <div key={outlet.outletId} className="flex items-center justify-between gap-2 text-xs border-b border-border/30 pb-2 last:border-0 last:pb-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <Building2Icon className="size-3.5 shrink-0 text-muted-foreground/80" />
                    <div className="flex flex-col min-w-0">
                      <span className="font-semibold truncate text-foreground">{outlet.outletName}</span>
                      <span className="text-muted-foreground text-[10px]">{outlet.bookingCount} bookings</span>
                    </div>
                  </div>
                  <Badge variant="outline" className="font-semibold text-foreground text-[11px] py-0 px-2">
                    {formatMoney(outlet.revenue)}
                  </Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
