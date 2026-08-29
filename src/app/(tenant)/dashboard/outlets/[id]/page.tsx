import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  ArrowLeftIcon,
  CheckCircle2Icon,
  MapPinIcon,
  NavigationIcon,
  PencilIcon,
  PhoneIcon,
  UserIcon,
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { OutletStatusAction } from "@/components/tenant/outlet-status-action";
import { getCurrentUser } from "@/lib/auth/session";
import { hasPermission, Permission } from "@/lib/auth/permissions";
import { tenantPaths } from "@/lib/tenant-paths";
import { formatDate } from "@/lib/format";
import { avatarGradient, initialsFor } from "@/lib/tenant-avatar";
import { getOutletById } from "@/server/outlets/service";

type Params = Promise<{ id: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata({ params }: { params: Params }) {
  const user = await getCurrentUser();
  const { id } = await params;
  const outlet = user?.shopId ? await getOutletById(user.shopId, id) : null;

  return {
    title: outlet
      ? `${outlet.name} — Rentique`
      : "Outlet not found — Rentique",
  };
}

export default async function OutletDetailPage({
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

  if (!hasPermission(user.role, Permission.OUTLET_VIEW)) {
    redirect(tenantPaths.dashboard);
  }

  const canManage = hasPermission(user.role, Permission.OUTLET_MANAGE);
  const { id } = await params;
  const { created } = await searchParams;
  const outlet = await getOutletById(user.shopId, id);

  if (!outlet) {
    notFound();
  }

  const fields = [
    { label: "Phone", value: outlet.phone ?? "—", icon: PhoneIcon },
    { label: "Address", value: outlet.address ?? "—", icon: MapPinIcon },
    {
      label: "Manager",
      value: outlet.managerName ?? "Unassigned",
      icon: UserIcon,
    },
    {
      label: "Geofence",
      value:
        outlet.latitude != null && outlet.longitude != null
          ? `${outlet.latitude}, ${outlet.longitude} (${outlet.allowedRadiusMetres}m)`
          : "Not configured",
      icon: NavigationIcon,
    },
  ];

  return (
    <main className="flex flex-1 flex-col gap-8 p-6">
      <div className="flex flex-col gap-4">
        <Link
          href={tenantPaths.outlets}
          className="text-muted-foreground hover:text-foreground inline-flex w-fit items-center gap-1 text-sm transition-colors"
        >
          <ArrowLeftIcon className="size-4" aria-hidden="true" />
          Outlets
        </Link>

        {created === "1" ? (
          <Alert className="border-primary/25 bg-primary/5">
            <CheckCircle2Icon className="text-primary" />
            <AlertDescription className="text-primary font-medium">
              Outlet created successfully.
            </AlertDescription>
          </Alert>
        ) : null}

        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="flex items-center gap-5">
            <Avatar className="size-16 rounded-2xl shadow-md">
              <AvatarFallback
                className="rounded-2xl text-lg font-semibold text-white"
                style={{ backgroundImage: avatarGradient(outlet.name) }}
              >
                {initialsFor(outlet.name)}
              </AvatarFallback>
            </Avatar>
            <div className="flex flex-col gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">
                {outlet.name}
              </h1>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="font-mono text-xs">
                  {outlet.code}
                </Badge>
                {outlet.isActive ? (
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
                Created {formatDate(outlet.createdAt, "long")}
              </span>
            </div>
          </div>

          {canManage ? (
            <Button
              variant="accent"
              nativeButton={false}
              render={
                <Link href={`${tenantPaths.outlets}/${outlet.id}/edit`} />
              }
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
            <CardTitle className="text-base">Outlet details</CardTitle>
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
            <CardTitle className="text-base">Status</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            <div className="flex items-center gap-3">
              <span
                className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${outlet.isActive ? "bg-primary/10" : "bg-muted"}`}
              >
                <span
                  className={`size-2.5 rounded-full ${outlet.isActive ? "bg-primary" : "bg-muted-foreground/40"}`}
                />
              </span>
              <div className="flex flex-col">
                <p className="text-sm font-medium">
                  {outlet.isActive ? "Active" : "Inactive"}
                </p>
                <p className="text-muted-foreground text-xs">
                  {outlet.isActive
                    ? "Available for staff assignment"
                    : "Hidden from staff assignment"}
                </p>
              </div>
            </div>

            {canManage ? (
              <>
                <Separator />
                <OutletStatusAction
                  outletId={outlet.id}
                  isActive={outlet.isActive}
                />
              </>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
