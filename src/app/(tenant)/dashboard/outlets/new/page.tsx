import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowLeftIcon,
  Building2Icon,
  ShieldCheckIcon,
  UsersIcon,
} from "lucide-react";
import { OutletForm } from "@/components/tenant/outlet-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth/session";
import { hasPermission, Permission } from "@/lib/auth/permissions";
import { tenantPaths } from "@/lib/tenant-paths";

export const metadata = {
  title: "Add Outlet — Rentique",
};

const nextSteps = [
  {
    icon: Building2Icon,
    title: "Ready immediately",
    description:
      "The outlet appears in your list right away, active and ready to assign staff and inventory to.",
  },
  {
    icon: UsersIcon,
    title: "Assign your team",
    description:
      "Create manager or staff accounts and assign them to this outlet from the Staff page.",
  },
  {
    icon: ShieldCheckIcon,
    title: "Reversible",
    description:
      "You can deactivate this outlet at any time from its detail page.",
  },
];

export default async function NewOutletPage() {
  const user = await getCurrentUser();
  if (!user?.shopId) {
    return null;
  }

  if (!hasPermission(user.role, Permission.OUTLET_MANAGE)) {
    redirect(tenantPaths.outlets);
  }

  return (
    <main className="flex flex-1 flex-col gap-6 p-6">
      <div className="flex flex-col gap-3">
        <Link
          href={tenantPaths.outlets}
          className="text-muted-foreground hover:text-foreground inline-flex w-fit items-center gap-1 text-sm transition-colors"
        >
          <ArrowLeftIcon className="size-4" aria-hidden="true" />
          Outlets
        </Link>

        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold tracking-tight">Add outlet</h1>
          <p className="text-muted-foreground text-sm">
            Add a new branch to your business.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Outlet details</CardTitle>
          </CardHeader>
          <CardContent>
            <OutletForm />
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
