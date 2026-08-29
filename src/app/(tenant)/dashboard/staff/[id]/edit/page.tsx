import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  ArrowLeftIcon,
  Building2Icon,
  InfoIcon,
  KeyRoundIcon,
} from "lucide-react";
import { EditStaffForm } from "@/components/tenant/edit-staff-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth/session";
import {
  ASSIGNABLE_ROLES,
  hasPermission,
  Permission,
} from "@/lib/auth/permissions";
import { tenantPaths } from "@/lib/tenant-paths";
import { getStaffById } from "@/server/staff/service";
import { listActiveOutletsForSelect } from "@/server/outlets/service";

type Params = Promise<{ id: string }>;

export const metadata = {
  title: "Edit Staff — Rentique",
};

const aboutEditing = [
  {
    icon: InfoIcon,
    title: "Changes apply immediately",
    description: "Updates take effect as soon as you save.",
  },
  {
    icon: KeyRoundIcon,
    title: "Password isn't editable here",
    description:
      "They reset their own password after signing in with a temporary one.",
  },
  {
    icon: Building2Icon,
    title: "Reassigning outlets",
    description: "Moving them to a different outlet takes effect immediately.",
  },
];

export default async function EditStaffPage({ params }: { params: Params }) {
  const user = await getCurrentUser();
  if (!user?.shopId) {
    return null;
  }

  if (!hasPermission(user.role, Permission.STAFF_MANAGE)) {
    redirect(tenantPaths.staff);
  }

  const { id } = await params;
  const staff = await getStaffById(user.shopId, id);

  if (!staff) {
    notFound();
  }

  // The outlet this account is currently assigned to might itself be
  // deactivated since — still show it in the picker (excluded by
  // `listActiveOutletsForSelect` otherwise) so saving the form without
  // touching this field doesn't silently fail its own outlet lookup.
  const activeOutlets = await listActiveOutletsForSelect(user.shopId);
  const outlets = activeOutlets.some((outlet) => outlet.id === staff.outletId)
    ? activeOutlets
    : staff.outletName && staff.outletId
      ? [
          {
            id: staff.outletId,
            name: staff.outletName,
            code: staff.outletCode ?? "",
          },
          ...activeOutlets,
        ]
      : activeOutlets;

  const assignableRoles = Array.from(ASSIGNABLE_ROLES[user.role] ?? []).filter(
    (role): role is "manager" | "staff" =>
      role === "manager" || role === "staff",
  );

  return (
    <main className="flex flex-1 flex-col gap-6 p-6">
      <div className="flex flex-col gap-3">
        <Link
          href={`${tenantPaths.staff}/${staff.id}`}
          className="text-muted-foreground hover:text-foreground inline-flex w-fit items-center gap-1 text-sm transition-colors"
        >
          <ArrowLeftIcon className="size-4" aria-hidden="true" />
          {staff.firstName} {staff.lastName}
        </Link>

        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold tracking-tight">Edit staff</h1>
          <p className="text-muted-foreground text-sm">
            Update this account&rsquo;s details.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Account details</CardTitle>
          </CardHeader>
          <CardContent>
            <EditStaffForm
              staff={staff}
              outlets={outlets}
              assignableRoles={assignableRoles}
            />
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
