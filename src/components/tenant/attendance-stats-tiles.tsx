import { CalendarCheck2Icon, PencilLineIcon, UsersIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { PASTEL_TONES } from "@/lib/pastel-tones";
import type { AttendanceStats } from "@/server/attendance/service";

export function AttendanceStatsTiles({ stats }: { stats: AttendanceStats }) {
  const tiles = [
    {
      label: "Present today",
      value: stats.presentToday,
      icon: CalendarCheck2Icon,
      tone: "mint" as const,
    },
    {
      label: "Active staff",
      value: stats.totalStaff,
      icon: UsersIcon,
      tone: "sky" as const,
    },
    {
      label: "Corrections this month",
      value: stats.correctionsThisMonth,
      icon: PencilLineIcon,
      tone: "peach" as const,
    },
  ];

  return (
    <div className="grid w-full grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3">
      {tiles.map((tile) => (
        <Card key={tile.label}>
          <CardContent className="flex items-center gap-3 p-4">
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
