import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeftIcon } from "lucide-react";
import { BookingItemEditForm } from "@/components/tenant/booking-item-edit-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth/session";
import { hasPermission, Permission } from "@/lib/auth/permissions";
import { tenantPaths } from "@/lib/tenant-paths";
import { isEditable } from "@/lib/booking-state";
import { getBookingById, getBookingItemById } from "@/server/bookings/service";

type Params = Promise<{ id: string; itemId: string }>;

export const metadata = {
  title: "Edit Item — Rentique",
};

export default async function EditBookingItemPage({ params }: { params: Params }) {
  const user = await getCurrentUser();
  if (!user?.shopId) {
    return null;
  }

  if (!hasPermission(user.role, Permission.BOOKING_MANAGE)) {
    redirect(tenantPaths.bookings);
  }

  const { id, itemId } = await params;
  const booking = await getBookingById(user.shopId, id, user);
  const item = booking
    ? await getBookingItemById(user.shopId, id, itemId, user)
    : null;

  if (!booking || !item) {
    notFound();
  }

  if (!isEditable(item.status)) {
    redirect(`${tenantPaths.bookings}/${booking.id}`);
  }

  return (
    <main className="flex flex-1 flex-col gap-6 p-6">
      <div className="flex flex-col gap-3">
        <Link
          href={`${tenantPaths.bookings}/${booking.id}`}
          className="text-muted-foreground hover:text-foreground inline-flex w-fit items-center gap-1 text-sm transition-colors"
        >
          <ArrowLeftIcon className="size-4" aria-hidden="true" />
          {booking.bookingNumber}
        </Link>

        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold tracking-tight">
            Edit item — {item.productName}
          </h1>
          <p className="text-muted-foreground text-sm">
            Update this item&rsquo;s dates and quantity.
          </p>
        </div>
      </div>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle className="text-base">Item details</CardTitle>
        </CardHeader>
        <CardContent>
          <BookingItemEditForm bookingId={booking.id} item={item} />
        </CardContent>
      </Card>
    </main>
  );
}
