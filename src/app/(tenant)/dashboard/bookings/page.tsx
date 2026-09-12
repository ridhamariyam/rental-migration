import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PlusIcon, XIcon } from "lucide-react";
import { BookingFilters } from "@/components/tenant/booking-filters";
import { BookingStatsTiles } from "@/components/tenant/booking-stats-tiles";
import { BookingsTable } from "@/components/tenant/bookings-table";
import { BookingsTableSkeleton } from "@/components/tenant/bookings-table-skeleton";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth/session";
import { hasPermission, Permission } from "@/lib/auth/permissions";
import { tenantPaths } from "@/lib/tenant-paths";
import { bookingListQuerySchema } from "@/lib/validation/bookings";
import { getBookingStats } from "@/server/bookings/service";

export const metadata = {
  title: "Bookings — Rentique",
};

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** Human wording for the dashboard's `?view=` cuts, so the banner reads
 * as a sentence rather than echoing the parameter. */
const VIEW_LABELS: Record<string, string> = {
  upcoming: "upcoming bookings — pickup still ahead",
  pickup_today: "bookings going out today",
  return_today: "bookings due back today",
  overdue: "overdue returns",
  pending_payment: "bookings with a balance still owed",
  completed: "completed bookings",
};

export default async function BookingsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const user = await getCurrentUser();
  if (!user?.shopId) {
    return null;
  }

  if (!hasPermission(user.role, Permission.BOOKING_VIEW)) {
    redirect(tenantPaths.dashboard);
  }

  const canCreate = hasPermission(user.role, Permission.BOOKING_CREATE);

  const rawParams = await searchParams;
  const query = bookingListQuerySchema.parse({
    page: rawParams.page,
    pageSize: rawParams.pageSize,
    q: rawParams.q,
    status: rawParams.status,
    customerId: rawParams.customerId,
    view: rawParams.view,
  });

  const stats = await getBookingStats(user.shopId, user);

  return (
    <main className="flex flex-1 flex-col gap-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold tracking-tight">Bookings</h1>
          <p className="text-muted-foreground text-sm">
            Rentals created for your customers.
          </p>
        </div>

        {canCreate ? (
          <Button
            nativeButton={false}
            render={<Link href={tenantPaths.newBooking} />}
          >
            <PlusIcon />
            New booking
          </Button>
        ) : null}
      </div>

      <BookingStatsTiles stats={stats} />

      {/* Arriving from a dashboard tile, the list is filtered to something
          no control on this page shows — so say which cut is in force, and
          give it a way out. */}
      {query.view !== "all" ? (
        <div className="border-primary/25 bg-primary/5 flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3">
          <p className="text-sm font-medium">
            Showing {VIEW_LABELS[query.view]}
          </p>
          <Button
            size="sm"
            variant="outline"
            nativeButton={false}
            render={<Link href={tenantPaths.bookings} />}
          >
            <XIcon />
            Clear filter
          </Button>
        </div>
      ) : null}

      <div className="bg-card ring-foreground/10 overflow-hidden rounded-xl shadow-xs ring-1">
        <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center">
          <BookingFilters
            defaultQuery={query.q ?? ""}
            defaultStatus={query.status}
          />
        </div>

        <Suspense
          key={JSON.stringify(query)}
          fallback={<BookingsTableSkeleton />}
        >
          <BookingsTable
            shopId={user.shopId}
            query={query}
            viewer={user}
            canDelete={hasPermission(user.role, Permission.RECORD_DELETE)}
          />
        </Suspense>
      </div>
    </main>
  );
}
