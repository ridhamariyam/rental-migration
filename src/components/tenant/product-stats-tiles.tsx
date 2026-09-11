import { CircleCheckIcon, CircleSlashIcon, ShirtIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { ProductStats } from "@/server/products/service";

export function ProductStatsTiles({ stats }: { stats: ProductStats }) {
  const tiles = [
    {
      label: "Total products",
      value: stats.total,
      icon: ShirtIcon,
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
    /* All three tiles are on screen at every width — they used to sit in a
       sideways-snapping strip on a phone, which put "Inactive" out of sight
       behind a scroll gesture for three numbers that easily fit abreast
       once the icon is dropped. */
    <div className="grid w-full grid-cols-3 gap-2 sm:gap-3">
      {tiles.map((tile) => (
        <Card key={tile.label}>
          <CardContent className="flex items-center gap-3 px-3 sm:px-4">
            <span
              className={
                tile.accent
                  ? "bg-primary/10 text-primary hidden size-9 shrink-0 items-center justify-center rounded-full sm:flex"
                  : "bg-muted text-muted-foreground hidden size-9 shrink-0 items-center justify-center rounded-full sm:flex"
              }
            >
              <tile.icon className="size-4" aria-hidden="true" />
            </span>
            <div className="flex min-w-0 flex-col">
              <span className="text-muted-foreground text-[0.625rem] leading-tight font-medium tracking-wide uppercase sm:text-xs">
                {tile.label}
              </span>
              <span className="text-base font-semibold tracking-tight sm:text-lg">
                {tile.value}
              </span>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
