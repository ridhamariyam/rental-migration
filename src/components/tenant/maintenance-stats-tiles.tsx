import { CheckCircle2Icon, SparklesIcon, WrenchIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { MaintenanceStats } from "@/server/maintenance/service";

export function MaintenanceStatsTiles({ stats }: { stats: MaintenanceStats }) {
  const tiles = [
    {
      label: "Open tasks",
      value: stats.open,
      icon: WrenchIcon,
      accent: stats.open > 0,
    },
    {
      label: "Cleaning",
      value: stats.cleaning,
      icon: SparklesIcon,
      accent: false,
    },
    {
      label: "Maintenance",
      value: stats.maintenance,
      icon: WrenchIcon,
      accent: false,
    },
    {
      label: "Completed",
      value: stats.completed,
      icon: CheckCircle2Icon,
      accent: false,
    },
  ];

  return (
    <div className="flex w-full overflow-x-auto gap-3 pb-1 snap-x scrollbar-none sm:grid sm:grid-cols-2 lg:grid-cols-4">
      {tiles.map((tile) => (
        <Card
          key={tile.label}
          className="min-w-[180px] shrink-0 snap-start sm:min-w-0"
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
