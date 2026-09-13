import { CalendarClockIcon, FileTextIcon, XCircleIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { PASTEL_TONES } from "@/lib/pastel-tones";
import type { BookingStats } from "@/server/bookings/service";

export function BookingStatsTiles({ stats }: { stats: BookingStats }) {
  const tiles = [
    {
      label: "Total bookings",
      value: stats.total,
      icon: CalendarClockIcon,
      tone: "sky" as const,
    },
    {
      label: "Active",
      value: stats.active,
      icon: CalendarClockIcon,
      tone: "mint" as const,
    },
    {
      label: "Draft",
      value: stats.draft,
      icon: FileTextIcon,
      tone: "lemon" as const,
    },
    {
      label: "Cancelled",
      value: stats.cancelled,
      icon: XCircleIcon,
      tone: "rose" as const,
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
