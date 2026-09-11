import { CircleCheckIcon, ClockIcon, WalletIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { formatMoney } from "@/lib/format";
import type { SettlementSummary } from "@/server/settlements/service";

/** Same KPI-tile treatment as `OutletStatsTiles`/`TenantStatsTiles` — the
 * accent color calls out "Pending" (the number that needs the owner's
 * attention), everything else stays neutral. */
export function SettlementStatsTiles({
  summary,
}: {
  summary: SettlementSummary;
}) {
  const tiles = [
    {
      label: "Pending payout",
      value: formatMoney(summary.pendingTotal),
      icon: ClockIcon,
      accent: true,
    },
    {
      label: "Paid out",
      value: formatMoney(summary.paidTotal),
      icon: CircleCheckIcon,
      accent: false,
    },
    {
      label: "All-time owed",
      value: formatMoney(summary.allTimeTotal),
      icon: WalletIcon,
      accent: false,
    },
  ];

  return (
    <div className="grid w-full grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3">
      {tiles.map((tile) => (
        <Card key={tile.label}>
          <CardContent className="flex items-center gap-3 px-4">
            <span
              className={
                tile.accent
                  ? "bg-primary/10 text-primary flex size-9 shrink-0 items-center justify-center rounded-full"
                  : "bg-muted text-muted-foreground flex size-9 shrink-0 items-center justify-center rounded-full"
              }
            >
              <tile.icon className="size-4" aria-hidden="true" />
            </span>
            <div className="flex flex-col">
              <span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                {tile.label}
              </span>
              <span className="text-lg font-semibold tracking-tight">
                {tile.value}
              </span>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
