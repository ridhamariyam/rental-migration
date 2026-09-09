"use client";

import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  XAxis,
  YAxis,
} from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { formatMoney } from "@/lib/format";

const chartConfig = {
  amount: {
    label: "Revenue",
    color: "var(--primary)",
  },
  bookings: {
    label: "Bookings",
    color: "oklch(0.65 0.15 250)",
  },
} satisfies ChartConfig;

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function shortDate(value: string): string {
  const [, month, day] = value.split("-");
  return `${MONTH_NAMES[Number(month) - 1]} ${Number(day)}`;
}

/** Compact axis-only variant of `formatMoney` — the full "₹16,000.00" is
 * wider than the Y-axis column has room for and gets clipped by the
 * chart's SVG edge (most visible on mobile). Compact notation in `en-IN`
 * collapses it to e.g. "₹16K"/"₹1.2L". */
function formatAxisMoney(value: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function fillDateGaps(
  data: { date: string; amount: number; bookings: number }[],
  fromDate?: string,
  toDate?: string,
) {
  if (data.length === 0) return data;

  const dataMap = new Map(data.map((d) => [d.date, d]));

  const start = fromDate
    ? new Date(`${fromDate}T00:00:00`)
    : new Date(`${data[0].date}T00:00:00`);
  const end = toDate
    ? new Date(`${toDate}T00:00:00`)
    : new Date(`${data[data.length - 1].date}T00:00:00`);

  const filled: { date: string; amount: number; bookings: number }[] = [];
  const cursor = new Date(start);

  while (cursor <= end) {
    const key = cursor.toISOString().slice(0, 10);
    filled.push(dataMap.get(key) ?? { date: key, amount: 0, bookings: 0 });
    cursor.setDate(cursor.getDate() + 1);
  }

  return filled;
}

export function RevenueTrendChart({
  data,
  fromDate,
  toDate,
}: {
  data: { date: string; amount: string; bookings?: number }[];
  fromDate?: string;
  toDate?: string;
}) {
  const raw = data.map((row) => ({
    date: row.date,
    amount: Number(row.amount),
    bookings: row.bookings ?? 0,
  }));

  const chartData = fillDateGaps(raw, fromDate, toDate);
  const hasBookings = chartData.some((d) => d.bookings > 0);

  return (
    <ChartContainer config={chartConfig} className="aspect-auto h-56 w-full">
      <ComposedChart data={chartData} margin={{ left: 4, right: 4, top: 16, bottom: 4 }}>
        <defs>
          <linearGradient id="fillAmount" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.35} />
            <stop offset="100%" stopColor="var(--primary)" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid
          vertical={false}
          stroke="var(--border)"
          strokeOpacity={0.4}
          strokeDasharray="3 3"
        />
        <XAxis
          dataKey="date"
          tickLine={false}
          axisLine={false}
          tickMargin={10}
          minTickGap={32}
          tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
          tickFormatter={shortDate}
        />
        <YAxis
          yAxisId="left"
          tickLine={false}
          axisLine={false}
          tickMargin={4}
          width={44}
          tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
          tickFormatter={(value: number) => formatAxisMoney(value)}
        />
        {hasBookings && (
          <YAxis
            yAxisId="right"
            orientation="right"
            tickLine={false}
            axisLine={false}
            tickMargin={4}
            width={32}
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            allowDecimals={false}
          />
        )}
        <ChartTooltip
          cursor={{ stroke: "var(--primary)", strokeWidth: 1, strokeDasharray: "4 4" }}
          content={
            <ChartTooltipContent
              className="rounded-xl border border-border/80 bg-popover/95 px-3 py-2.5 shadow-xl backdrop-blur-sm text-xs"
              labelFormatter={(value) => shortDate(String(value))}
              formatter={(value, name) => {
                if (name === "amount" || name === "Revenue") {
                  return [formatMoney(String(value)), "Revenue"];
                }
                return [value, "Bookings"];
              }}
            />
          }
        />
        {hasBookings && (
          <Bar
            yAxisId="right"
            dataKey="bookings"
            fill="oklch(0.65 0.15 250)"
            radius={[3, 3, 0, 0]}
            maxBarSize={14}
            opacity={0.6}
          />
        )}
        <Area
          yAxisId="left"
          dataKey="amount"
          type="monotone"
          fill="url(#fillAmount)"
          stroke="var(--primary)"
          strokeWidth={2}
          dot={chartData.length <= 14 ? { r: 3, fill: "var(--primary)", strokeWidth: 0 } : false}
          activeDot={{ r: 5, fill: "var(--primary)", strokeWidth: 2, stroke: "var(--background)" }}
        />
      </ComposedChart>
    </ChartContainer>
  );
}
