import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  ArrowLeftIcon,
  Building2Icon,
  CheckCircle2Icon,
  KeyRoundIcon,
  MailIcon,
  PencilIcon,
  PhoneIcon,
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { StaffStatusAction } from "@/components/tenant/staff-status-action";
import { StaffResetPasswordAction } from "@/components/tenant/staff-reset-password-action";
import { getCurrentUser } from "@/lib/auth/session";
import { hasPermission, Permission } from "@/lib/auth/permissions";
import { tenantPaths } from "@/lib/tenant-paths";
import { formatDate } from "@/lib/format";
import {
  avatarGradient,
  initialsFor,
  resolveAvatarSrc,
} from "@/lib/tenant-avatar";
import { getStaffById } from "@/server/staff/service";

type Params = Promise<{ id: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata({ params }: { params: Params }) {
  const user = await getCurrentUser();
  const { id } = await params;
  const staff = user?.shopId ? await getStaffById(user.shopId, id) : null;

  return {
    title: staff
      ? `${staff.firstName} ${staff.lastName} — Rentique`
      : "Staff member not found — Rentique",
  };
}

export default async function StaffDetailPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const user = await getCurrentUser();
  if (!user?.shopId) {
    return null;
  }

  if (!hasPermission(user.role, Permission.STAFF_VIEW)) {
    redirect(tenantPaths.dashboard);
  }

  const canManage = hasPermission(user.role, Permission.STAFF_MANAGE);
  const { id } = await params;
  const { created } = await searchParams;
  const staff = await getStaffById(user.shopId, id);

  if (!staff) {
    notFound();
  }

  const name = `${staff.firstName} ${staff.lastName}`;

  const fields = [
    { label: "Email", value: staff.email, icon: MailIcon },
    { label: "Phone", value: staff.phone ?? "—", icon: PhoneIcon },
    {
      label: "Outlet",
      value: staff.outletName
        ? `${staff.outletName} (${staff.outletCode})`
        : "Unassigned",
      icon: Building2Icon,
    },
    {
      label: "Password",
      value: staff.mustChangePassword
        ? "Still using the temporary password"
        : "Set by the account holder",
      icon: KeyRoundIcon,
    },
  ];

  return (
    <main className="flex flex-1 flex-col gap-8 p-6">
      <div className="flex flex-col gap-4">
        <Link
          href={tenantPaths.staff}
          className="text-muted-foreground hover:text-foreground inline-flex w-fit items-center gap-1 text-sm transition-colors"
        >
          <ArrowLeftIcon className="size-4" aria-hidden="true" />
          Staff
        </Link>

        {created === "1" ? (
          <Alert className="border-primary/25 bg-primary/5">
            <CheckCircle2Icon className="text-primary" />
            <AlertDescription className="text-primary font-medium">
              Account created successfully.
            </AlertDescription>
          </Alert>
        ) : null}

        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="flex items-center gap-5">
            <Avatar className="size-16 shadow-md">
              <AvatarImage src={resolveAvatarSrc(staff.avatarUrl, name)} alt={name} />
              <AvatarFallback
                className="text-lg font-semibold text-white"
                style={{ backgroundImage: avatarGradient(name) }}
              >
                {initialsFor(name)}
              </AvatarFallback>
            </Avatar>
            <div className="flex flex-col gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">{name}</h1>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="capitalize">
                  {staff.role}
                </Badge>
                {staff.isActive ? (
                  <Badge
                    variant="secondary"
                    className="bg-primary/10 text-primary"
                  >
                    <span className="size-1.5 rounded-full bg-current" />
                    Active
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-muted-foreground">
                    <span className="size-1.5 rounded-full bg-current" />
                    Inactive
                  </Badge>
                )}
              </div>
              <span className="text-muted-foreground text-xs">
                Added {formatDate(staff.createdAt, "long")}
              </span>
            </div>
          </div>

          {canManage ? (
            <Button
              variant="accent"
              nativeButton={false}
              render={<Link href={`${tenantPaths.staff}/${staff.id}/edit`} />}
            >
              <PencilIcon />
              Edit
            </Button>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Account details</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="divide-y">
              {fields.map((field) => (
                <div
                  key={field.label}
                  className="flex items-center gap-4 py-4 first:pt-0 last:pb-0"
                >
                  <span className="bg-primary/10 text-primary flex size-9 shrink-0 items-center justify-center rounded-lg">
                    <field.icon className="size-4" aria-hidden="true" />
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                    <p className="text-muted-foreground text-sm">
                      {field.label}
                    </p>
                    <p className="truncate text-sm font-medium sm:text-right">
                      {field.value}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Access</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            <div className="flex items-center gap-3">
              <span
                className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${staff.isActive ? "bg-primary/10" : "bg-muted"}`}
              >
                <span
                  className={`size-2.5 rounded-full ${staff.isActive ? "bg-primary" : "bg-muted-foreground/40"}`}
                />
              </span>
              <div className="flex flex-col">
                <p className="text-sm font-medium">
                  {staff.isActive ? "Active" : "Inactive"}
                </p>
                <p className="text-muted-foreground text-xs">
                  {staff.isActive
                    ? "Can sign in and access the dashboard"
                    : "Blocked from signing in"}
                </p>
              </div>
            </div>

            {canManage ? (
              <>
                <Separator />
                <StaffResetPasswordAction staffId={staff.id} email={staff.email} />
                <StaffStatusAction
                  staffId={staff.id}
                  isActive={staff.isActive}
                />
              </>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
