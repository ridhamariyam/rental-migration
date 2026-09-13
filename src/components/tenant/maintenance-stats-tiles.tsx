import { CheckCircle2Icon, SparklesIcon, WrenchIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { PASTEL_TONES } from "@/lib/pastel-tones";
import type { MaintenanceStats } from "@/server/maintenance/service";

export function MaintenanceStatsTiles({ stats }: { stats: MaintenanceStats }) {
  const tiles = [
    {
      label: "Open tasks",
      value: stats.open,
      icon: WrenchIcon,
      // Warm only while there is something open to get to.
      tone: stats.open > 0 ? ("peach" as const) : ("lemon" as const),
    },
    {
      label: "Cleaning",
      value: stats.cleaning,
      icon: SparklesIcon,
      tone: "sky" as const,
    },
    {
      label: "Maintenance",
      value: stats.maintenance,
      icon: WrenchIcon,
      tone: "lavender" as const,
    },
    {
      label: "Completed",
      value: stats.completed,
      icon: CheckCircle2Icon,
      tone: "mint" as const,
    },
  ];

  return (
    <div className="grid w-full grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
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
