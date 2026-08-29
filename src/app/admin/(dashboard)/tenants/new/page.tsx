import Link from "next/link";
import {
  ArrowLeftIcon,
  BuildingIcon,
  KeyRoundIcon,
  ShieldCheckIcon,
} from "lucide-react";
import { AddTenantForm } from "@/components/admin/add-tenant-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { adminPaths } from "@/lib/admin-paths";

export const metadata = {
  title: "Add Tenant — Rentique Admin",
};

const nextSteps = [
  {
    icon: BuildingIcon,
    title: "Created immediately",
    description:
      "The business appears in the tenants list right away, with its status set to active.",
  },
  {
    icon: KeyRoundIcon,
    title: "Owner login created with it",
    description:
      "A one-time temporary password is generated for the owner — you'll see it exactly once after submitting, to hand over yourself.",
  },
  {
    icon: ShieldCheckIcon,
    title: "Access is reversible",
    description:
      "You can block or unblock this tenant at any time from its detail page.",
  },
];

export default function AddTenantPage() {
  return (
    <main className="flex flex-1 flex-col gap-6 p-6">
      <div className="flex flex-col gap-3">
        <Link
          href={adminPaths.tenants}
          className="text-muted-foreground hover:text-foreground inline-flex w-fit items-center gap-1 text-sm transition-colors"
        >
          <ArrowLeftIcon className="size-4" aria-hidden="true" />
          Tenants
        </Link>

        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold tracking-tight">Add tenant</h1>
          <p className="text-muted-foreground text-sm">
            Onboard a new business onto the platform.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">
              Business &amp; owner details
            </CardTitle>
          </CardHeader>
          <CardContent>
            <AddTenantForm />
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
