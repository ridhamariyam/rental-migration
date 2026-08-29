"use client";

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatMoney } from "@/lib/format";

export function StaffPerformanceChart({
  data,
}: {
  data: { staffName: string; revenue: string; bookingCount: number }[];
}) {
  const chartData = data.map((d) => ({
    name: d.staffName,
    revenue: Number(d.revenue),
    bookings: d.bookingCount,
  }));

  // We'll just render a clean custom bar chart where the bar length is revenue
  return (
    <div className="w-full" style={{ height: Math.max(160, data.length * 50) }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={chartData}
          layout="vertical"
          margin={{ top: 10, right: 30, left: 20, bottom: 5 }}
        >
          <CartesianGrid horizontal={false} stroke="var(--border)" strokeOpacity={0.5} strokeDasharray="3 3" />
          <XAxis type="number" hide />
          <YAxis
            type="category"
            dataKey="name"
            axisLine={false}
            tickLine={false}
            width={120}
            tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
          />
          <Tooltip
            cursor={{ fill: "var(--accent)", opacity: 0.4 }}
            content={({ active, payload }) => {
              if (active && payload && payload.length) {
                const item = payload[0].payload;
                return (
                  <div className="rounded-xl border border-border/80 bg-popover/95 p-3 shadow-xl backdrop-blur-xs text-xs">
                    <p className="font-semibold text-foreground mb-1">{item.name}</p>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-muted-foreground">
                        Revenue: <span className="font-medium text-foreground">{formatMoney(String(item.revenue))}</span>
                      </span>
                      <span className="text-muted-foreground">
                        Bookings: <span className="font-medium text-foreground">{item.bookings}</span>
                      </span>
                    </div>
                  </div>
                );
              }
              return null;
            }}
          />
          <Bar dataKey="revenue" radius={[0, 4, 4, 0]} maxBarSize={32}>
            {chartData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={`var(--chart-${(index % 5) + 1})`} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
