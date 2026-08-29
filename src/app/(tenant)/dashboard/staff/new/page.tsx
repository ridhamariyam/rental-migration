import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowLeftIcon,
  Building2Icon,
  KeyRoundIcon,
  ShieldCheckIcon,
} from "lucide-react";
import { AddStaffForm } from "@/components/tenant/add-staff-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { getCurrentUser } from "@/lib/auth/session";
import {
  ASSIGNABLE_ROLES,
  hasPermission,
  Permission,
} from "@/lib/auth/permissions";
import { tenantPaths } from "@/lib/tenant-paths";
import { listActiveOutletsForSelect } from "@/server/outlets/service";

export const metadata = {
  title: "Add Staff — Rentique",
};

const nextSteps = [
  {
    icon: KeyRoundIcon,
    title: "One-time password",
    description:
      "You'll see a temporary password exactly once after creating the account — hand it over yourself.",
  },
  {
    icon: ShieldCheckIcon,
    title: "Role-based access",
    description:
      "Managers can view outlets and staff; only you can create or edit them.",
  },
  {
    icon: Building2Icon,
    title: "Tied to an outlet",
    description:
      "Every account is assigned to one outlet on creation — you can reassign it later.",
  },
];

export default async function NewStaffPage() {
  const user = await getCurrentUser();
  if (!user?.shopId) {
    return null;
  }

  if (!hasPermission(user.role, Permission.STAFF_MANAGE)) {
    redirect(tenantPaths.staff);
  }

  const outlets = await listActiveOutletsForSelect(user.shopId);
  const assignableRoles = Array.from(ASSIGNABLE_ROLES[user.role] ?? []).filter(
    (role): role is "manager" | "staff" =>
      role === "manager" || role === "staff",
  );

  return (
    <main className="flex flex-1 flex-col gap-6 p-6">
      <div className="flex flex-col gap-3">
        <Link
          href={tenantPaths.staff}
          className="text-muted-foreground hover:text-foreground inline-flex w-fit items-center gap-1 text-sm transition-colors"
        >
          <ArrowLeftIcon className="size-4" aria-hidden="true" />
          Staff
        </Link>

        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold tracking-tight">Add staff</h1>
          <p className="text-muted-foreground text-sm">
            Create a manager or staff login for your team.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {outlets.length === 0 ? (
          <Card className="lg:col-span-2">
            <CardContent className="p-0">
              <Empty className="py-20">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <Building2Icon />
                  </EmptyMedia>
                  <EmptyTitle>Add an outlet first</EmptyTitle>
                  <EmptyDescription>
                    Staff and managers are always assigned to an active outlet —
                    create one before adding your team.
                  </EmptyDescription>
                </EmptyHeader>
                <EmptyContent>
                  <Button
                    nativeButton={false}
                    render={<Link href={tenantPaths.newOutlet} />}
                  >
                    Add outlet
                  </Button>
                </EmptyContent>
              </Empty>
            </CardContent>
          </Card>
        ) : (
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">Account details</CardTitle>
            </CardHeader>
            <CardContent>
              <AddStaffForm
                outlets={outlets}
                assignableRoles={assignableRoles}
              />
            </CardContent>
          </Card>
        )}

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
