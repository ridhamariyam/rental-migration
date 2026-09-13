"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { formatMoney } from "@/lib/format";
import { Building2Icon } from "lucide-react";

// The pastel chart palette from `globals.css` (mint, lavender, peach, sky,
// rose) — every slice is also named in the legend below, so colour is
// never the only way to tell them apart.
const COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

export type DonutItem = {
  name: string;
  value: number;
  revenue: string;
};

export function CategoryDonutChart({
  data,
}: {
  data: DonutItem[];
}) {
  const totalRevenue = data.reduce((acc, item) => acc + Number(item.revenue), 0);
  const totalBookings = data.reduce((acc, item) => acc + item.value, 0);

  if (data.length === 0) {
    return (
      <div className="flex h-52 items-center justify-center text-sm text-muted-foreground">
        No breakdown data available
      </div>
    );
  }

  if (data.length === 1) {
    const item = data[0];
    return (
      <div className="flex flex-col items-center gap-5 px-2 py-4">
        <div className="relative flex size-28 items-center justify-center">
          <svg viewBox="0 0 100 100" className="size-full -rotate-90">
            <circle
              cx="50" cy="50" r="42"
              fill="none"
              stroke="var(--border)"
              strokeWidth="5"
              strokeOpacity="0.25"
            />
            <circle
              cx="50" cy="50" r="42"
              fill="none"
              stroke="oklch(0.6 0.118 174)"
              strokeWidth="5"
              strokeDasharray={`${2 * Math.PI * 42}`}
              strokeLinecap="round"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center px-3">
            <span className="text-sm font-bold tracking-tight text-foreground">
              {formatMoney(item.revenue)}
            </span>
          </div>
        </div>

        <div className="w-full space-y-3">
          <div className="flex items-center justify-between text-sm px-1">
            <div className="flex items-center gap-2 min-w-0">
              <Building2Icon className="size-4 shrink-0 text-primary" />
              <span className="font-semibold text-foreground truncate">{item.name}</span>
            </div>
            <span className="text-xs text-muted-foreground shrink-0">{item.value} bookings</span>
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <div className="rounded-lg bg-primary/8 px-3 py-2.5">
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Revenue</p>
              <p className="text-sm font-bold text-foreground mt-0.5">{formatMoney(item.revenue)}</p>
            </div>
            <div className="rounded-lg bg-muted/50 px-3 py-2.5">
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Bookings</p>
              <p className="text-sm font-bold text-foreground mt-0.5">{item.value}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const formattedTotal = formatMoney(String(totalRevenue));
  const fontClass = formattedTotal.length > 11 ? "text-xs" : formattedTotal.length > 8 ? "text-sm" : "text-base";

  return (
    <div className="flex flex-col gap-3">
      <div className="relative flex h-44 w-full items-center justify-center">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={50}
              outerRadius={70}
              paddingAngle={data.length > 1 ? 4 : 0}
              dataKey="value"
              strokeWidth={0}
            >
              {data.map((_, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={COLORS[index % COLORS.length]}
                  stroke="transparent"
                />
              ))}
            </Pie>
            <Tooltip
              wrapperStyle={{ zIndex: 50, outline: "none" }}
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  const item = payload[0].payload as DonutItem;
                  const pct = totalBookings > 0 ? Math.round((item.value / totalBookings) * 100) : 0;
                  return (
                    <div className="rounded-xl border border-border/80 bg-popover px-3 py-2.5 shadow-xl text-xs">
                      <p className="font-semibold text-foreground">{item.name}</p>
                      <p className="text-muted-foreground mt-0.5">
                        {item.value} bookings ({pct}%) · {formatMoney(item.revenue)}
                      </p>
                    </div>
                  );
                }
                return null;
              }}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 z-0 flex flex-col items-center justify-center text-center px-2">
          <span className="text-[10px] font-medium text-muted-foreground/70 uppercase tracking-widest leading-none mb-1">
            Total
          </span>
          <span className={`font-bold tracking-tight text-foreground truncate max-w-[96px] ${fontClass}`}>
            {formattedTotal}
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-2 border-t border-border/50 pt-3">
        {data.slice(0, 5).map((item, index) => {
          const percent = totalRevenue > 0 ? Math.round((Number(item.revenue) / totalRevenue) * 100) : 0;
          return (
            <div key={item.name} className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="size-2 shrink-0 rounded-full"
                  style={{ backgroundColor: COLORS[index % COLORS.length] }}
                />
                <span className="truncate font-medium text-foreground">{item.name}</span>
              </div>
              <div className="flex items-center gap-2.5 shrink-0">
                <span className="font-semibold text-foreground">{formatMoney(item.revenue)}</span>
                <span className="text-muted-foreground/70 w-8 text-right font-mono text-[11px]">{percent}%</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
