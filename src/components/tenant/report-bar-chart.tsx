"use client";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { formatMoney } from "@/lib/format";

const chartConfig = {
  value: {
    label: "Revenue",
    color: "var(--primary)",
  },
} satisfies ChartConfig;

/**
 * Shared responsive bar chart across Reports page tabs (daily/monthly income,
 * most rented products, revenue by outlet, staff performance).
 * Constrains max bar size to prevent single-bar layout overflow.
 */
export function ReportBarChart({
  data,
  layout = "vertical",
  height = 288,
}: {
  data: { label: string; value: number }[];
  layout?: "vertical" | "horizontal";
  height?: number;
}) {
  if (layout === "horizontal") {
    return (
      <ChartContainer
        config={chartConfig}
        className="aspect-auto w-full"
        style={{ height }}
      >
        <BarChart
          data={data}
          layout="vertical"
          margin={{ left: 8, right: 24, top: 12, bottom: 12 }}
        >
          <defs>
            <linearGradient id="barGradientHorizontal" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.85} />
              <stop offset="100%" stopColor="var(--primary)" stopOpacity={1} />
            </linearGradient>
          </defs>
          <CartesianGrid horizontal={false} stroke="var(--border)" strokeOpacity={0.5} strokeDasharray="3 3" />
          <XAxis type="number" hide />
          <YAxis
            type="category"
            dataKey="label"
            tickLine={false}
            axisLine={false}
            width={130}
            tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
          />
          <ChartTooltip
            cursor={{ fill: "var(--accent)", opacity: 0.5, radius: 6 }}
            content={
              <ChartTooltipContent
                hideLabel
                className="rounded-xl border border-border/80 bg-popover/95 p-3 shadow-xl backdrop-blur-xs"
                formatter={(value, _name, item) => [
                  formatMoney(String(value)),
                  ` ${item.payload.label}`,
                ]}
              />
            }
          />
          <Bar
            dataKey="value"
            fill="url(#barGradientHorizontal)"
            radius={[0, 6, 6, 0]}
            maxBarSize={28}
            barSize={24}
          />
        </BarChart>
      </ChartContainer>
    );
  }

  return (
    <ChartContainer
      config={chartConfig}
      className="aspect-auto w-full"
      style={{ height }}
    >
      <BarChart
        data={data}
        margin={{ left: 12, right: 12, top: 16, bottom: 8 }}
      >
        <defs>
          <linearGradient id="barGradientVertical" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--primary)" stopOpacity={1} />
            <stop offset="100%" stopColor="var(--primary)" stopOpacity={0.75} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="var(--border)" strokeOpacity={0.5} strokeDasharray="3 3" />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          tickMargin={10}
          minTickGap={16}
          tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          width={64}
          tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
          tickFormatter={(value: number) => formatMoney(String(value))}
        />
        <ChartTooltip
          cursor={{ fill: "var(--accent)", opacity: 0.5, radius: 6 }}
          content={
            <ChartTooltipContent
              hideLabel
              className="rounded-xl border border-border/80 bg-popover/95 p-3 shadow-xl backdrop-blur-xs"
              formatter={(value) => [formatMoney(String(value)), " Revenue"]}
            />
          }
        />
        <Bar
          dataKey="value"
          fill="url(#barGradientVertical)"
          radius={[6, 6, 0, 0]}
          maxBarSize={36}
          barSize={30}
        />
      </BarChart>
    </ChartContainer>
  );
}
