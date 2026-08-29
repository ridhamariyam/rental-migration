import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PlusIcon } from "lucide-react";
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
          <BookingsTable shopId={user.shopId} query={query} viewer={user} />
        </Suspense>
      </div>
    </main>
  );
}
