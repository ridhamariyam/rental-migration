import { CalendarClockIcon, FileTextIcon, XCircleIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { BookingStats } from "@/server/bookings/service";

export function BookingStatsTiles({ stats }: { stats: BookingStats }) {
  const tiles = [
    {
      label: "Total bookings",
      value: stats.total,
      icon: CalendarClockIcon,
      accent: false,
    },
    {
      label: "Active",
      value: stats.active,
      icon: CalendarClockIcon,
      accent: true,
    },
    {
      label: "Draft",
      value: stats.draft,
      icon: FileTextIcon,
      accent: false,
    },
    {
      label: "Cancelled",
      value: stats.cancelled,
      icon: XCircleIcon,
      accent: false,
    },
  ];

  return (
    /* A plain grid at every width: these tiles used to sit in a
       sideways-snapping strip on a phone, which hid the last of them behind
       a scroll gesture the page gives no hint of. */
    <div className="grid w-full grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
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
