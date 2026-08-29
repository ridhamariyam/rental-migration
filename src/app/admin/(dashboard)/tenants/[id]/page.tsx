import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeftIcon,
  BuildingIcon,
  CheckCircle2Icon,
  MailIcon,
  MapPinIcon,
  PhoneIcon,
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TenantStatusAction } from "@/components/admin/tenant-status-action";
import { adminPaths } from "@/lib/admin-paths";
import { formatDate } from "@/lib/format";
import { avatarGradient } from "@/lib/tenant-avatar";
import { getTenantById } from "@/server/tenants/service";

type Params = Promise<{ id: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata({ params }: { params: Params }) {
  const { id } = await params;
  const tenant = await getTenantById(id);

  return {
    title: tenant
      ? `${tenant.name} — Rentique Admin`
      : "Tenant not found — Rentique Admin",
  };
}

export default async function AdminTenantDetailPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { id } = await params;
  const { created } = await searchParams;
  const tenant = await getTenantById(id);

  if (!tenant) {
    notFound();
  }

  const fields = [
    { label: "Email", value: tenant.email, icon: MailIcon },
    { label: "Phone", value: tenant.phone, icon: PhoneIcon },
    { label: "Address", value: tenant.address ?? "—", icon: MapPinIcon },
    {
      label: "Onboarded",
      value: formatDate(tenant.createdAt, "long"),
      icon: BuildingIcon,
    },
  ];

  return (
    <main className="flex flex-1 flex-col gap-6 p-6">
      <div className="flex flex-col gap-4">
        <Link
          href={adminPaths.tenants}
          className="text-muted-foreground hover:text-foreground inline-flex w-fit items-center gap-1 text-sm transition-colors"
        >
          <ArrowLeftIcon className="size-4" aria-hidden="true" />
          Tenants
        </Link>

        {created === "1" ? (
          <Alert className="border-primary/25 bg-primary/5">
            <CheckCircle2Icon className="text-primary" />
            <AlertDescription className="text-primary font-medium">
              Tenant created successfully.
            </AlertDescription>
          </Alert>
        ) : null}

        <div className="flex flex-wrap items-center gap-4">
          <span
            className="size-14 shrink-0 rounded-2xl shadow-sm"
            style={{ backgroundImage: avatarGradient(tenant.name) }}
            aria-hidden="true"
          />
          <div className="flex flex-col gap-1">
            <h1 className="text-xl font-semibold tracking-tight">
              {tenant.name}
            </h1>
            <p className="text-muted-foreground text-sm">Business profile</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Contact details</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {fields.map((field) => (
                <div
                  key={field.label}
                  className="flex items-start gap-3 rounded-lg border p-4"
                >
                  <span className="bg-primary/10 text-primary flex size-9 shrink-0 items-center justify-center rounded-full">
                    <field.icon className="size-4" aria-hidden="true" />
                  </span>
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                      {field.label}
                    </p>
                    <p className="truncate text-sm font-medium">
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
            <CardTitle className="text-base">Account status</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex items-center justify-between rounded-lg border p-4">
              <div className="flex flex-col gap-1">
                <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                  Current status
                </p>
                <p className="text-sm font-medium">
                  {tenant.isActive
                    ? "Signed-in users can access the platform."
                    : "All access to the platform is blocked."}
                </p>
              </div>
              {tenant.isActive ? (
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
                  Blocked
                </Badge>
              )}
            </div>

            <p className="text-muted-foreground text-sm">
              {tenant.isActive
                ? "Blocking this tenant immediately signs out every user at this business and prevents new sign-ins until it's unblocked."
                : "Unblocking this tenant immediately restores sign-in access for every user at this business."}
            </p>

            <TenantStatusAction
              tenantId={tenant.id}
              isActive={tenant.isActive}
            />
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
