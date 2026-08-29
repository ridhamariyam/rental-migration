import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowLeftIcon,
  CalendarClockIcon,
  ContactIcon,
  UsersIcon,
} from "lucide-react";
import { CustomerForm } from "@/components/tenant/customer-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth/session";
import { hasPermission, Permission } from "@/lib/auth/permissions";
import { tenantPaths } from "@/lib/tenant-paths";

export const metadata = {
  title: "Add Customer — Rentique",
};

const nextSteps = [
  {
    icon: ContactIcon,
    title: "No login required",
    description:
      "Customers are records you manage, not accounts — there's nothing for them to sign in to.",
  },
  {
    icon: UsersIcon,
    title: "Staff assignment happens at booking time",
    description:
      "Bookings are attributed to whoever creates them — admins can hand a booking to a specific staff member when creating it.",
  },
  {
    icon: CalendarClockIcon,
    title: "Ready for bookings",
    description:
      "Once bookings are live, this customer's rental history will show up on their profile.",
  },
];

export default async function NewCustomerPage() {
  const user = await getCurrentUser();
  if (!user?.shopId) {
    return null;
  }

  if (!hasPermission(user.role, Permission.CUSTOMER_MANAGE)) {
    redirect(tenantPaths.customers);
  }

  return (
    <main className="flex flex-1 flex-col gap-6 p-6">
      <div className="flex flex-col gap-3">
        <Link
          href={tenantPaths.customers}
          className="text-muted-foreground hover:text-foreground inline-flex w-fit items-center gap-1 text-sm transition-colors"
        >
          <ArrowLeftIcon className="size-4" aria-hidden="true" />
          Customers
        </Link>

        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold tracking-tight">Add customer</h1>
          <p className="text-muted-foreground text-sm">
            Record a new customer for bookings and rentals.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Customer details</CardTitle>
          </CardHeader>
          <CardContent>
            <CustomerForm />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">What happens next</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {nextSteps.map((step) => (
              <div key={step.title} className="flex items-start gap-3">
                <span className="bg-primary/10 text-primary flex size-9 shrink-0 items-center justify-center rounded-full">
                  <step.icon className="size-4" aria-hidden="true" />
                </span>
                <div className="flex flex-col gap-0.5">
                  <p className="text-sm font-medium">{step.title}</p>
                  <p className="text-muted-foreground text-sm">
                    {step.description}
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
