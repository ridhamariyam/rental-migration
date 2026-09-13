import Link from "next/link";
import {
  AlarmClockIcon,
  BanknoteIcon,
  CalendarCheckIcon,
  CircleCheckBigIcon,
  PackageCheckIcon,
  TruckIcon,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { PASTEL_TONES, type PastelTone } from "@/lib/pastel-tones";
import { tenantPaths } from "@/lib/tenant-paths";
import type { TenantSessionUser } from "@/server/auth/guard";
import {
  getBookingViewCounts,
  type BookingView,
} from "@/server/bookings/service";

/**
 * The "what needs doing" row of the dashboard: six counts of work, each a
 * link into the bookings list already filtered to exactly what it counted
 * (`?view=…`). The count and the list share one condition
 * (`bookingViewCondition`), so a tile can never promise rows the list then
 * fails to show.
 *
 * Every tile's icon sits on its own pastel so the row is easy to scan.
 * Overdue returns and pending payments additionally turn their number and
 * border red/amber once non-zero, because they are exceptions someone has
 * to act on; the rest are counts of a normal day.
 */
const TILES: {
  view: BookingView;
  label: string;
  hint: string;
  icon: typeof TruckIcon;
  tone: "neutral" | "warning" | "danger" | "positive";
  pastel: PastelTone;
}[] = [
  {
    view: "upcoming",
    label: "Upcoming bookings",
    hint: "Pickup still ahead",
    icon: CalendarCheckIcon,
    tone: "neutral",
    pastel: "sky",
  },
  {
    view: "pickup_today",
    label: "Pickup today",
    hint: "Going out today",
    icon: TruckIcon,
    tone: "neutral",
    pastel: "lavender",
  },
  {
    view: "return_today",
    label: "Return today",
    hint: "Due back today",
    icon: PackageCheckIcon,
    tone: "neutral",
    pastel: "lemon",
  },
  {
    view: "overdue",
    label: "Overdue returns",
    hint: "Past their return date",
    icon: AlarmClockIcon,
    tone: "danger",
    pastel: "rose",
  },
  {
    view: "pending_payment",
    label: "Pending payments",
    hint: "Balance still owed",
    icon: BanknoteIcon,
    tone: "warning",
    pastel: "peach",
  },
  {
    view: "completed",
    label: "Completed bookings",
    hint: "Returned and closed",
    icon: CircleCheckBigIcon,
    tone: "positive",
    pastel: "mint",
  },
];

export async function DashboardOperationsTiles({
  actor,
}: {
  actor: TenantSessionUser;
}) {
  const counts = await getBookingViewCounts(actor.shopId, actor);

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
      {TILES.map((tile) => {
        const value = counts[tile.view];
        const isAlert =
          value > 0 && (tile.tone === "danger" || tile.tone === "warning");

        return (
          <Link
            key={tile.view}
            href={`${tenantPaths.bookings}?view=${tile.view}`}
            className="focus-visible:ring-ring/50 rounded-xl outline-none focus-visible:ring-3"
          >
            <Card
              className={cn(
                "hover:border-border/80 hover:bg-muted/30 h-full transition-colors",
                isAlert && tile.tone === "danger" && "border-destructive/30",
                isAlert && tile.tone === "warning" && "border-amber-500/30",
              )}
            >
              <CardContent className="flex flex-col gap-2 p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground/80 text-[0.625rem] leading-tight font-semibold tracking-wider uppercase">
                    {tile.label}
                  </span>
                  <span
                    className={cn(
                      "flex size-7 shrink-0 items-center justify-center rounded-full",
                      PASTEL_TONES[tile.pastel].chip,
                    )}
                  >
                    <tile.icon className="size-3.5" aria-hidden="true" />
                  </span>
                </div>

                <div className="flex flex-col gap-0.5">
                  <span
                    className={cn(
                      "text-2xl font-bold tracking-tight",
                      isAlert && tile.tone === "danger" && "text-destructive",
                      isAlert &&
                        tile.tone === "warning" &&
                        "text-amber-600 dark:text-amber-400",
                    )}
                  >
                    {value}
                  </span>
                  <span className="text-muted-foreground/80 text-xs font-medium">
                    {tile.hint}
                  </span>
                </div>
              </CardContent>
            </Card>
          </Link>
        );
      })}
    </div>
  );
}
