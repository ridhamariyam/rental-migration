import { ArchiveIcon, CircleCheckIcon, ContactIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { CustomerStats } from "@/server/customers/service";

export function CustomerStatsTiles({ stats }: { stats: CustomerStats }) {
  const tiles = [
    {
      label: "Total customers",
      value: stats.total,
      icon: ContactIcon,
      accent: false,
    },
    {
      label: "Active",
      value: stats.active,
      icon: CircleCheckIcon,
      accent: true,
    },
    {
      label: "Archived",
      value: stats.archived,
      icon: ArchiveIcon,
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
