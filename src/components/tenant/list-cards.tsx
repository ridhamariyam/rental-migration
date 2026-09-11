import type { ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * The phone half of every list in the dashboard.
 *
 * A data table can only fit a ~390px screen by scrolling sideways, and a
 * sideways scroll inside a vertically-scrolling page is a gesture nothing
 * on screen hints at — so the columns past the fold (status, outlet, the
 * row's own actions) may as well not exist. Each list therefore renders
 * twice: `ListCards` below its breakpoint, `TableOnly` above it, from the
 * same data.
 *
 * `at` is the width where the table takes over, chosen per list from how
 * much room its columns actually need — narrow lists switch at `sm`, the
 * eight-column ones not until `lg`. The classes are spelled out in full
 * rather than interpolated because Tailwind only ships classes it can see
 * in the source.
 */
const CARDS_HIDDEN_AT = {
  sm: "sm:hidden",
  md: "md:hidden",
  lg: "lg:hidden",
} as const;

const TABLE_SHOWN_AT = {
  sm: "hidden sm:block",
  md: "hidden md:block",
  lg: "hidden lg:block",
} as const;

export type ListBreakpoint = keyof typeof CARDS_HIDDEN_AT;

export function ListCards({
  at = "sm",
  className,
  children,
}: {
  at?: ListBreakpoint;
  className?: string;
  children: ReactNode;
}) {
  return (
    <ul
      className={cn(
        "divide-border/40 divide-y",
        CARDS_HIDDEN_AT[at],
        className,
      )}
    >
      {children}
    </ul>
  );
}

export function TableOnly({
  at = "sm",
  children,
}: {
  at?: ListBreakpoint;
  children: ReactNode;
}) {
  return <div className={TABLE_SHOWN_AT[at]}>{children}</div>;
}

/**
 * One row of `ListCards`, in the shape nearly every list here shares: an
 * optional thumbnail, a title, a status badge and a line of secondary
 * detail, and an action on the right (usually "View", sometimes the row's
 * own menu).
 *
 * `meta` is deliberately the *last* thing to get space and truncates — put
 * whatever the row must always say (a price, a count, a date) at its front,
 * since the tail is what gets clipped on a narrow screen.
 */
export function ListCardRow({
  media,
  title,
  badge,
  meta,
  action,
  className,
}: {
  media?: ReactNode;
  title: ReactNode;
  badge?: ReactNode;
  meta?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <li className={cn("flex items-center gap-3 p-4", className)}>
      {media ? <span className="shrink-0">{media}</span> : null}

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="truncate text-sm font-medium">{title}</div>
        {badge || meta ? (
          /* Wraps rather than squeezing: a row carrying two badges (a
             status plus a flag like "Refund pending") would otherwise
             leave the detail line no width at all and render it blank. */
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            {badge}
            {meta ? (
              <span className="text-muted-foreground truncate text-xs">
                {meta}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>

      {action ? <div className="shrink-0">{action}</div> : null}
    </li>
  );
}

/**
 * The loading state for `ListCards`, so a phone never flashes the table
 * layout it is about to not use.
 */
export function ListCardsSkeleton({
  at = "sm",
  rows = 6,
  media = true,
}: {
  at?: ListBreakpoint;
  rows?: number;
  media?: boolean;
}) {
  return (
    <ListCards at={at}>
      {Array.from({ length: rows }).map((_, index) => (
        <li key={index} className="flex items-center gap-3 p-4">
          {media ? <Skeleton className="size-10 shrink-0 rounded-lg" /> : null}
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <Skeleton className="h-4 w-40 max-w-full" />
            <Skeleton className="h-3 w-24" />
          </div>
          <Skeleton className="h-7 w-16 shrink-0 rounded-lg" />
        </li>
      ))}
    </ListCards>
  );
}
