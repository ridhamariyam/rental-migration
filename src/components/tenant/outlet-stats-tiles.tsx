import { Building2Icon, CircleCheckIcon, CircleSlashIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { PASTEL_TONES } from "@/lib/pastel-tones";
import type { OutletStats } from "@/server/outlets/service";

/** Same KPI-tile treatment as `TenantStatsTiles` — each tile's icon sits on
 * its own pastel (see `PASTEL_TONES`), mint for "Active". */
export function OutletStatsTiles({ stats }: { stats: OutletStats }) {
  const tiles = [
    {
      label: "Total outlets",
      value: stats.total,
      icon: Building2Icon,
      tone: "sky" as const,
    },
    {
      label: "Active",
      value: stats.active,
      icon: CircleCheckIcon,
      tone: "mint" as const,
    },
    {
      label: "Inactive",
      value: stats.inactive,
      icon: CircleSlashIcon,
      tone: "lavender" as const,
    },
  ];

  return (
    <div className="grid w-full grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3">
      {tiles.map((tile) => (
        <Card key={tile.label}>
          <CardContent className="flex items-center gap-3 px-4">
            <span
              className={`${PASTEL_TONES[tile.tone].chip} flex size-9 shrink-0 items-center justify-center rounded-full`}
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
