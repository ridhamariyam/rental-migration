import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeftIcon } from "lucide-react";
import { BookingForm } from "@/components/tenant/booking-form";
import { getCurrentUser } from "@/lib/auth/session";
import { hasPermission, Permission } from "@/lib/auth/permissions";
import { tenantPaths } from "@/lib/tenant-paths";
import { listActiveStaffForSelect } from "@/server/staff/service";

export const metadata = {
  title: "New Booking — Rentique",
};

export default async function NewBookingPage() {
  const user = await getCurrentUser();
  if (!user?.shopId) {
    return null;
  }

  if (!hasPermission(user.role, Permission.BOOKING_CREATE)) {
    redirect(tenantPaths.bookings);
  }

  const canDiscount = hasPermission(user.role, Permission.BOOKING_DISCOUNT);
  // Only an admin gets to hand a booking to a specific staff member —
  // everyone else's bookings are always attributed to themselves (see
  // `resolveHandledById` in `server/bookings/service.ts`), so there's
  // nothing to pick from and no reason to fetch the staff list at all.
  const staffOptions =
    user.role === "admin" ? await listActiveStaffForSelect(user.shopId) : [];

  return (
    <main className="flex flex-1 flex-col gap-6 p-6 pb-28 lg:pb-6">
      <div className="flex flex-col gap-3">
        <Link
          href={tenantPaths.bookings}
          className="text-muted-foreground hover:text-foreground inline-flex w-fit items-center gap-1 text-sm transition-colors"
        >
          <ArrowLeftIcon className="size-4" aria-hidden="true" />
          Bookings
        </Link>

        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold tracking-tight">New booking</h1>
          <p className="text-muted-foreground text-sm">
            Select a customer and an item to rent, then check its availability
            and price.
          </p>
        </div>
      </div>

      <BookingForm canDiscount={canDiscount} staffOptions={staffOptions} />
    </main>
  );
}
