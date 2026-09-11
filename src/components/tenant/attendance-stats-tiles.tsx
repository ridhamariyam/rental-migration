import { CalendarCheck2Icon, PencilLineIcon, UsersIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { AttendanceStats } from "@/server/attendance/service";

export function AttendanceStatsTiles({ stats }: { stats: AttendanceStats }) {
  const tiles = [
    {
      label: "Present today",
      value: stats.presentToday,
      icon: CalendarCheck2Icon,
      accent: true,
    },
    {
      label: "Active staff",
      value: stats.totalStaff,
      icon: UsersIcon,
      accent: false,
    },
    {
      label: "Corrections this month",
      value: stats.correctionsThisMonth,
      icon: PencilLineIcon,
      accent: false,
    },
  ];

  return (
    <div className="grid w-full grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3">
      {tiles.map((tile) => (
        <Card key={tile.label}>
          <CardContent className="flex items-center gap-3 p-4">
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
