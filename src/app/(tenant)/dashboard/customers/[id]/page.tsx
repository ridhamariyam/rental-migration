import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  ArrowLeftIcon,
  CheckCircle2Icon,
  MailIcon,
  MapPinIcon,
  PencilIcon,
  PhoneIcon,
  StickyNoteIcon,
  UserIcon,
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { CustomerStatusAction } from "@/components/tenant/customer-status-action";
import { getCurrentUser } from "@/lib/auth/session";
import { hasPermission, Permission } from "@/lib/auth/permissions";
import { tenantPaths } from "@/lib/tenant-paths";
import { formatDate } from "@/lib/format";
import {
  avatarGradient,
  customerGlassAvatarStyle,
  initialsFor,
  staffAvatarSrc,
} from "@/lib/tenant-avatar";
import { getCustomerById } from "@/server/customers/service";

type Params = Promise<{ id: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata({ params }: { params: Params }) {
  const user = await getCurrentUser();
  const { id } = await params;
  const customer = user?.shopId ? await getCustomerById(user.shopId, id) : null;

  return {
    title: customer
      ? `${customer.firstName} ${customer.lastName} — Rentique`
      : "Customer not found — Rentique",
  };
}

export default async function CustomerDetailPage({
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

  if (!hasPermission(user.role, Permission.CUSTOMER_VIEW)) {
    redirect(tenantPaths.dashboard);
  }

  const canManage = hasPermission(user.role, Permission.CUSTOMER_MANAGE);
  const { id } = await params;
  const { created } = await searchParams;
  const customer = await getCustomerById(user.shopId, id);

  if (!customer) {
    notFound();
  }

  const name = `${customer.firstName} ${customer.lastName}`;

  const fields = [
    { label: "Phone", value: customer.phone, icon: PhoneIcon },
    { label: "Email", value: customer.email ?? "—", icon: MailIcon },
    {
      label: "Location",
      value: customer.location ?? "—",
      icon: MapPinIcon,
    },
    {
      label: "Assigned staff",
      value: customer.primaryStaffName ? (
        <span className="inline-flex items-center gap-2">
          <Avatar className="size-5 shrink-0">
            <AvatarImage
              src={staffAvatarSrc(customer.primaryStaffName)}
              alt={customer.primaryStaffName}
            />
            <AvatarFallback
              className="!text-white text-[10px] font-semibold"
              style={{
                backgroundImage: avatarGradient(customer.primaryStaffName),
              }}
            >
              {initialsFor(customer.primaryStaffName)}
            </AvatarFallback>
          </Avatar>
          <span>{customer.primaryStaffName}</span>
        </span>
      ) : (
        "Unassigned"
      ),
      icon: UserIcon,
    },
    { label: "Notes", value: customer.notes ?? "—", icon: StickyNoteIcon },
  ];

  return (
    <main className="flex flex-1 flex-col gap-8 p-6">
      <div className="flex flex-col gap-4">
        <Link
          href={tenantPaths.customers}
          className="text-muted-foreground hover:text-foreground inline-flex w-fit items-center gap-1 text-sm transition-colors"
        >
          <ArrowLeftIcon className="size-4" aria-hidden="true" />
          Customers
        </Link>

        {created === "1" ? (
          <Alert className="border-primary/25 bg-primary/5">
            <CheckCircle2Icon className="text-primary" />
            <AlertDescription className="text-primary font-medium">
              Customer created successfully.
            </AlertDescription>
          </Alert>
        ) : null}

        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="flex items-center gap-5">
            <Avatar className="size-16 shadow-md">
              <AvatarFallback
                className="text-lg font-semibold"
                style={customerGlassAvatarStyle(name)}
              >
                {initialsFor(name)}
              </AvatarFallback>
            </Avatar>
            <div className="flex flex-col gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">{name}</h1>
              <div className="flex flex-wrap items-center gap-2">
                {customer.isActive ? (
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
                    Archived
                  </Badge>
                )}
              </div>
              <span className="text-muted-foreground text-xs">
                Added {formatDate(customer.createdAt, "long")}
              </span>
            </div>
          </div>

          {canManage ? (
            <Button
              variant="accent"
              nativeButton={false}
              render={
                <Link href={`${tenantPaths.customers}/${customer.id}/edit`} />
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
            <CardTitle className="text-base">Customer details</CardTitle>
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
                className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${customer.isActive ? "bg-primary/10" : "bg-muted"}`}
              >
                <span
                  className={`size-2.5 rounded-full ${customer.isActive ? "bg-primary" : "bg-muted-foreground/40"}`}
                />
              </span>
              <div className="flex flex-col">
                <p className="text-sm font-medium">
                  {customer.isActive ? "Active" : "Archived"}
                </p>
                <p className="text-muted-foreground text-xs">
                  {customer.isActive
                    ? "Shown in the default customer list"
                    : "Hidden from the default customer list"}
                </p>
              </div>
            </div>

            {canManage ? (
              <>
                <Separator />
                <CustomerStatusAction
                  customerId={customer.id}
                  isActive={customer.isActive}
                />
              </>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
