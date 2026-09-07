import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeftIcon, InfoIcon, ShieldAlertIcon } from "lucide-react";
import { AddBookingItemButton } from "@/components/tenant/add-booking-item-dialog";
import { BookingEditForm } from "@/components/tenant/booking-edit-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth/session";
import { hasPermission, Permission } from "@/lib/auth/permissions";
import { tenantPaths } from "@/lib/tenant-paths";
import { isEditable } from "@/lib/booking-state";
import { getBookingById } from "@/server/bookings/service";

type Params = Promise<{ id: string }>;

export const metadata = {
  title: "Edit Booking — Rentique",
};

const aboutEditing = [
  {
    icon: InfoIcon,
    title: "Customer, item and discount are fixed",
    description:
      "Dates, quantity (only downward) and additional cost can all be changed here — cancel and create a new booking to change the customer, item, or discount.",
  },
  {
    icon: ShieldAlertIcon,
    title: "Only while in draft",
    description:
      "Once the item is picked up, dates and pricing can no longer be changed here.",
  },
];

export default async function EditBookingPage({ params }: { params: Params }) {
  const user = await getCurrentUser();
  if (!user?.shopId) {
    return null;
  }

  if (!hasPermission(user.role, Permission.BOOKING_MANAGE)) {
    redirect(tenantPaths.bookings);
  }

  const { id } = await params;
  const booking = await getBookingById(user.shopId, id, user);

  if (!booking) {
    notFound();
  }

  if (!isEditable(booking.status)) {
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
          <h1 className="text-xl font-semibold tracking-tight">Edit booking</h1>
          <p className="text-muted-foreground text-sm">
            Update this booking&rsquo;s dates, quantity and additional cost.
          </p>
        </div>
      </div>

      <div className="flex justify-end">
        <AddBookingItemButton
          bookingId={booking.id}
          bookingNumber={booking.bookingNumber}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Booking details</CardTitle>
          </CardHeader>
          <CardContent>
            <BookingEditForm booking={booking} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">About editing</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {aboutEditing.map((item) => (
              <div key={item.title} className="flex items-start gap-3">
                <span className="bg-primary/10 text-primary flex size-9 shrink-0 items-center justify-center rounded-full">
                  <item.icon className="size-4" aria-hidden="true" />
                </span>
                <div className="flex flex-col gap-0.5">
                  <p className="text-sm font-medium">{item.title}</p>
                  <p className="text-muted-foreground text-sm">
                    {item.description}
                  </p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
