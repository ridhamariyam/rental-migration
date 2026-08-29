import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeftIcon, InfoIcon, UsersIcon } from "lucide-react";
import { CustomerForm } from "@/components/tenant/customer-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth/session";
import { hasPermission, Permission } from "@/lib/auth/permissions";
import { tenantPaths } from "@/lib/tenant-paths";
import { getCustomerById } from "@/server/customers/service";

type Params = Promise<{ id: string }>;

export const metadata = {
  title: "Edit Customer — Rentique",
};

const aboutEditing = [
  {
    icon: InfoIcon,
    title: "Changes apply immediately",
    description: "Updates take effect as soon as you save.",
  },
  {
    icon: UsersIcon,
    title: "Staff assignment happens at booking time",
    description:
      "This form no longer sets a primary staff member — admins choose who handles each booking when creating it.",
  },
];

export default async function EditCustomerPage({ params }: { params: Params }) {
  const user = await getCurrentUser();
  if (!user?.shopId) {
    return null;
  }

  if (!hasPermission(user.role, Permission.CUSTOMER_MANAGE)) {
    redirect(tenantPaths.customers);
  }

  const { id } = await params;
  const customer = await getCustomerById(user.shopId, id);

  if (!customer) {
    notFound();
  }

  const name = `${customer.firstName} ${customer.lastName}`;

  return (
    <main className="flex flex-1 flex-col gap-6 p-6">
      <div className="flex flex-col gap-3">
        <Link
          href={`${tenantPaths.customers}/${customer.id}`}
          className="text-muted-foreground hover:text-foreground inline-flex w-fit items-center gap-1 text-sm transition-colors"
        >
          <ArrowLeftIcon className="size-4" aria-hidden="true" />
          {name}
        </Link>

        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold tracking-tight">
            Edit customer
          </h1>
          <p className="text-muted-foreground text-sm">
            Update this customer&rsquo;s details.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Customer details</CardTitle>
          </CardHeader>
          <CardContent>
            <CustomerForm customer={customer} />
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
