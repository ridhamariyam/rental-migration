import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  ArrowLeftIcon,
  Building2Icon,
  InfoIcon,
  NavigationIcon,
} from "lucide-react";
import { OutletForm } from "@/components/tenant/outlet-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth/session";
import { hasPermission, Permission } from "@/lib/auth/permissions";
import { tenantPaths } from "@/lib/tenant-paths";
import { getOutletById } from "@/server/outlets/service";

type Params = Promise<{ id: string }>;

export const metadata = {
  title: "Edit Outlet — Rentique",
};

const aboutEditing = [
  {
    icon: InfoIcon,
    title: "Changes apply immediately",
    description:
      "Updates take effect as soon as you save — there's no approval step.",
  },
  {
    icon: Building2Icon,
    title: "Code must stay unique",
    description:
      "The outlet code only needs to be unique within your own business.",
  },
  {
    icon: NavigationIcon,
    title: "Geofence is optional",
    description:
      "Location fields aren't enforced yet — they're used once staff attendance check-in ships.",
  },
];

export default async function EditOutletPage({ params }: { params: Params }) {
  const user = await getCurrentUser();
  if (!user?.shopId) {
    return null;
  }

  if (!hasPermission(user.role, Permission.OUTLET_MANAGE)) {
    redirect(tenantPaths.outlets);
  }

  const { id } = await params;
  const outlet = await getOutletById(user.shopId, id);

  if (!outlet) {
    notFound();
  }

  return (
    <main className="flex flex-1 flex-col gap-6 p-6">
      <div className="flex flex-col gap-3">
        <Link
          href={`${tenantPaths.outlets}/${outlet.id}`}
          className="text-muted-foreground hover:text-foreground inline-flex w-fit items-center gap-1 text-sm transition-colors"
        >
          <ArrowLeftIcon className="size-4" aria-hidden="true" />
          {outlet.name}
        </Link>

        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold tracking-tight">Edit outlet</h1>
          <p className="text-muted-foreground text-sm">
            Update this branch&rsquo;s details.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Outlet details</CardTitle>
          </CardHeader>
          <CardContent>
            <OutletForm outlet={outlet} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">About editing</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {aboutEditing.map((step) => (
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
