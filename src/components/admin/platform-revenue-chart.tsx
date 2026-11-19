"use client";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { formatPaise } from "@/lib/plans";

const chartConfig = {
  revenue: { label: "Revenue", color: "var(--primary)" },
} satisfies ChartConfig;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function monthLabel(key: string): string {
  const [year, month] = key.split("-");
  return `${MONTHS[Number(month) - 1]} ${year.slice(2)}`;
}

function axisMoney(rupees: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(rupees);
}

/** Subscription revenue per calendar month (last 12), from paid payments. */
export function PlatformRevenueChart({
  data,
}: {
  data: { month: string; revenuePaise: number; payments: number; signups: number }[];
}) {
  const chartData = data.map((d) => ({ ...d, revenue: d.revenuePaise / 100 }));

  return (
    <ChartContainer config={chartConfig} className="aspect-auto h-60 w-full">
      <BarChart data={chartData} margin={{ left: 4, right: 4, top: 12, bottom: 4 }}>
        <CartesianGrid vertical={false} stroke="var(--border)" strokeOpacity={0.5} strokeDasharray="3 3" />
        <XAxis
          dataKey="month"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={12}
          tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
          tickFormatter={monthLabel}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={48}
          tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
          tickFormatter={(v: number) => axisMoney(v)}
          allowDecimals={false}
        />
        <ChartTooltip
          cursor={{ fill: "var(--muted)", opacity: 0.5 }}
          content={
            <ChartTooltipContent
              className="text-xs"
              labelFormatter={(_, payload) => {
                const row = payload?.[0]?.payload as (typeof chartData)[number] | undefined;
                return row ? monthLabel(row.month) : "";
              }}
              formatter={(_, __, item) => {
                const row = item.payload as (typeof chartData)[number];
                return (
                  <div className="flex w-full flex-col gap-0.5">
                    <span className="flex justify-between gap-4">
                      <span className="text-muted-foreground">Revenue</span>
                      <span className="font-medium tabular-nums">{formatPaise(row.revenuePaise)}</span>
                    </span>
                    <span className="flex justify-between gap-4">
                      <span className="text-muted-foreground">Payments</span>
                      <span className="tabular-nums">{row.payments}</span>
                    </span>
                    <span className="flex justify-between gap-4">
                      <span className="text-muted-foreground">New signups</span>
                      <span className="tabular-nums">{row.signups}</span>
                    </span>
                  </div>
                );
              }}
            />
          }
        />
        <Bar dataKey="revenue" fill="var(--color-revenue)" radius={[4, 4, 0, 0]} maxBarSize={36} />
      </BarChart>
    </ChartContainer>
  );
}
