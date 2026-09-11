import { Building2Icon, CircleCheckIcon, CircleSlashIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { OutletStats } from "@/server/outlets/service";

/** Same KPI-tile treatment as `TenantStatsTiles` — the accent color is
 * reserved for "Active" only, everything else stays neutral. */
export function OutletStatsTiles({ stats }: { stats: OutletStats }) {
  const tiles = [
    {
      label: "Total outlets",
      value: stats.total,
      icon: Building2Icon,
      accent: false,
    },
    {
      label: "Active",
      value: stats.active,
      icon: CircleCheckIcon,
      accent: true,
    },
    {
      label: "Inactive",
      value: stats.inactive,
      icon: CircleSlashIcon,
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
