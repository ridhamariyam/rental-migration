import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  ArrowLeftIcon,
  Building2Icon,
  CalendarClockIcon,
  ReceiptTextIcon,
  ShirtIcon,
  SparklesIcon,
  StickyNoteIcon,
  UserIcon,
  WrenchIcon,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { CancelMaintenanceTaskDialog } from "@/components/tenant/cancel-maintenance-task-dialog";
import { CompleteMaintenanceTaskDialog } from "@/components/tenant/complete-maintenance-task-dialog";
import { MaintenanceTaskStatusBadge } from "@/components/tenant/maintenance-task-status-badge";
import { MaintenanceTaskTypeBadge } from "@/components/tenant/maintenance-task-type-badge";
import { StartMaintenanceTaskDialog } from "@/components/tenant/start-maintenance-task-dialog";
import { getCurrentUser } from "@/lib/auth/session";
import { hasPermission, Permission } from "@/lib/auth/permissions";
import { tenantPaths } from "@/lib/tenant-paths";
import { formatDate } from "@/lib/format";
import { getMaintenanceTaskById } from "@/server/maintenance/service";
import { listActiveStaffForSelect } from "@/server/staff/service";

type Params = Promise<{ id: string }>;

export async function generateMetadata({ params }: { params: Params }) {
  const user = await getCurrentUser();
  const { id } = await params;
  const task = user?.shopId
    ? await getMaintenanceTaskById(user.shopId, id)
    : null;

  return {
    title: task
      ? `${task.productName} task — Rentique`
      : "Task not found — Rentique",
  };
}

export default async function MaintenanceTaskDetailPage({
  params,
}: {
  params: Params;
}) {
  const user = await getCurrentUser();
  if (!user?.shopId) {
    return null;
  }

  if (!hasPermission(user.role, Permission.MAINTENANCE_VIEW)) {
    redirect(tenantPaths.dashboard);
  }

  const canManage = hasPermission(user.role, Permission.MAINTENANCE_MANAGE);
  const { id } = await params;
  const task = await getMaintenanceTaskById(user.shopId, id);

  if (!task) {
    notFound();
  }

  const staffOptions = canManage
    ? await listActiveStaffForSelect(user.shopId)
    : [];

  const itemLabel = [task.variationColor, task.variationSize]
    .filter(Boolean)
    .join(", ");

  const fields = [
    {
      label: "Item",
      value: `${task.productName}${itemLabel ? ` (${itemLabel})` : ""} · ${task.sku}`,
      icon: ShirtIcon,
    },
    {
      label: "Outlet",
      value: task.outletName ?? "—",
      icon: Building2Icon,
    },
    {
      label: "Assigned to",
      value: task.assignedToName ?? "Unassigned",
      icon: UserIcon,
    },
    {
      label: "Notes",
      value: task.notes || "—",
      icon: StickyNoteIcon,
    },
  ];

  const TypeIcon = task.taskType === "cleaning" ? SparklesIcon : WrenchIcon;

  const STATUS_STATE: Record<
    typeof task.status,
    { title: string; description: string }
  > = {
    pending: {
      title: "Waiting to start",
      description: "Item stays off the shelf until this is closed out.",
    },
    in_progress: {
      title: "In progress",
      description: "Being worked on right now.",
    },
    completed: {
      title: "Completed",
      description: "This task is done and no longer open.",
    },
    cancelled: {
      title: "Cancelled",
      description: "This task was cancelled before it was finished.",
    },
  };

  const state = STATUS_STATE[task.status];
  const isOpen = task.status === "pending" || task.status === "in_progress";

  return (
    <main className="flex flex-1 flex-col gap-8 p-6">
      <div className="flex flex-col gap-4">
        <Link
          href={tenantPaths.maintenance}
          className="text-muted-foreground hover:text-foreground inline-flex w-fit items-center gap-1 text-sm transition-colors"
        >
          <ArrowLeftIcon className="size-4" aria-hidden="true" />
          Cleaning & Maintenance
        </Link>

        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="flex items-center gap-5">
            <span className="bg-primary/10 text-primary flex size-16 shrink-0 items-center justify-center rounded-2xl shadow-md">
              <TypeIcon className="size-6" aria-hidden="true" />
            </span>
            <div className="flex flex-col gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">
                {task.productName}
              </h1>
              <div className="flex flex-wrap items-center gap-2">
                <MaintenanceTaskTypeBadge taskType={task.taskType} />
                <MaintenanceTaskStatusBadge status={task.status} />
              </div>
              <span className="text-muted-foreground text-xs">
                Opened {formatDate(task.createdAt, "long")}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Task details</CardTitle>
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

            {task.bookingId ? (
              <>
                <Separator className="my-2" />
                <Link
                  href={`${tenantPaths.bookings}/${task.bookingId}`}
                  className="hover:bg-muted/50 -mx-2 flex items-center gap-4 rounded-lg px-2 py-3 transition-colors"
                >
                  <span className="bg-primary/10 text-primary flex size-9 shrink-0 items-center justify-center rounded-lg">
                    <ReceiptTextIcon className="size-4" aria-hidden="true" />
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                    <p className="text-muted-foreground text-sm">
                      Raised from booking
                    </p>
                    <p className="truncate text-sm font-medium sm:text-right hover:underline">
                      {task.bookingNumber}
                    </p>
                  </div>
                </Link>
              </>
            ) : null}

            {task.startedAt || task.completedAt ? (
              <>
                <Separator className="my-2" />
                <div className="flex flex-col gap-2 text-sm">
                  {task.startedAt ? (
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Started</span>
                      <span className="font-medium">
                        {formatDate(task.startedAt, "long")}
                      </span>
                    </div>
                  ) : null}
                  {task.completedAt ? (
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">
                        {task.status === "cancelled" ? "Cancelled" : "Completed"}
                      </span>
                      <span className="font-medium">
                        {formatDate(task.completedAt, "long")}
                      </span>
                    </div>
                  ) : null}
                  {task.completedByName ? (
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">By</span>
                      <span className="font-medium">
                        {task.completedByName}
                      </span>
                    </div>
                  ) : null}
                </div>
              </>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarClockIcon className="size-4" aria-hidden="true" />
              Status
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            <div className="flex items-center gap-3">
              <span
                className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${isOpen ? "bg-amber-500/10" : task.status === "completed" ? "bg-primary/10" : "bg-muted"}`}
              >
                <span
                  className={`size-2.5 rounded-full ${isOpen ? "bg-amber-500" : task.status === "completed" ? "bg-primary" : "bg-muted-foreground/40"}`}
                />
              </span>
              <div className="flex flex-col">
                <p className="text-sm font-medium">{state.title}</p>
                <p className="text-muted-foreground text-xs">
                  {state.description}
                </p>
              </div>
            </div>

            {canManage && task.status === "pending" ? (
              <>
                <Separator />
                <div className="flex flex-col gap-2">
                  <StartMaintenanceTaskDialog
                    taskId={task.id}
                    staffOptions={staffOptions}
                  />
                  <CancelMaintenanceTaskDialog taskId={task.id} />
                </div>
              </>
            ) : null}

            {canManage && task.status === "in_progress" ? (
              <>
                <Separator />
                <div className="flex flex-col gap-2">
                  <CompleteMaintenanceTaskDialog
                    taskId={task.id}
                    currentNotes={task.notes}
                  />
                  <CancelMaintenanceTaskDialog taskId={task.id} />
                </div>
              </>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
