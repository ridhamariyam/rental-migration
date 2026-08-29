import { Building2Icon, CircleCheckIcon, CircleSlashIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { TenantStats } from "@/server/tenants/service";

/**
 * Shared KPI tile row for real (non-fabricated) tenant counts — used on
 * both the dashboard home and the tenants list so the two surfaces never
 * drift out of sync. Rose is reserved for "Active" only (a real
 * current-state indicator); Total/Blocked stay neutral so the accent isn't
 * used decoratively across all three.
 */
export function TenantStatsTiles({ stats }: { stats: TenantStats }) {
  const tiles = [
    {
      label: "Total tenants",
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
      label: "Blocked",
      value: stats.blocked,
      icon: CircleSlashIcon,
      accent: false,
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
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
