import { CircleCheckIcon, ClockIcon, WalletIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { formatMoney } from "@/lib/format";
import type { SettlementSummary } from "@/server/settlements/service";

/** Same KPI-tile treatment as `OutletStatsTiles`/`TenantStatsTiles` — the
 * accent color calls out "Pending" (the number that needs the owner's
 * attention), everything else stays neutral. */
export function SettlementStatsTiles({ summary }: { summary: SettlementSummary }) {
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
    <div className="flex w-full overflow-x-auto gap-3 pb-1 snap-x scrollbar-none sm:grid sm:grid-cols-3">
      {tiles.map((tile) => (
        <Card
          key={tile.label}
          className="min-w-[200px] shrink-0 snap-start sm:min-w-0"
        >
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
