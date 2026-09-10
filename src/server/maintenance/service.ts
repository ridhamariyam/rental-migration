import "server-only";

import { and, count, desc, eq, ilike, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/lib/db/client";
import { AppError } from "@/lib/errors/app-error";
import {
  bookingItems,
  bookings,
  maintenanceTasks,
  outlets,
  productVariations,
  products,
  users,
  type MaintenanceTask,
  type ProductVariation,
} from "@/lib/db/schema";
import { Permission, hasPermission } from "@/lib/auth/permissions";
import { resolveOutletScope, type TenantSessionUser } from "@/server/auth/guard";
import {
  getVariationByBarcode,
  getVariationForBooking,
} from "@/server/variations/service";
import { maintenanceTaskIdParamSchema } from "@/lib/validation/maintenance";
import type {
  CancelMaintenanceTaskInput,
  CompleteMaintenanceTaskInput,
  CreateMaintenanceTaskInput,
  MaintenanceListQuery,
  StartMaintenanceTaskInput,
} from "@/lib/validation/maintenance";
import {
  getMaintenanceBlockedQuantity,
  getRentedOutQuantity,
} from "@/server/variations/capacity";

/** Same "inferred from `db.transaction`'s own callback" shape as
 * `PaymentTx` in `src/server/payments/service.ts` — kept in sync with
 * whatever driver/schema `db` actually uses without hand-typing it. */
export type MaintenanceTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * The single chokepoint that decides a variation's lifecycle status from
 * its own currently-open tasks *and* how much of its total `quantity` is
 * actually spoken for right now — mirrors the legacy backend's
 * `MaintenanceService._release_if_ready`, generalised for a variation
 * that represents several identical physical units (see `bookings
 * .quantity`'s doc comment): one unit needing repair no longer parks the
 * *entire* batch as unbookable — the status only moves off `available`
 * once maintenance/cleaning/active rentals between them account for
 * every unit (maintenance outranks cleaning outranks a plain rental).
 * Called after *any* task-open, task-close, or pickup operation so the
 * variation's `status` can never drift out of sync with its own tasks.
 */
export async function applyVariationLifecycleStatus(
  tx: MaintenanceTx,
  variationId: string,
): Promise<ProductVariation["status"]> {
  const [variation] = await tx
    .select({ quantity: productVariations.quantity })
    .from(productVariations)
    .where(eq(productVariations.id, variationId))
    .limit(1);

  const capacity = Math.max(1, variation?.quantity ?? 1);
  const { maintenanceQty, cleaningQty, cleaningInProgress } =
    await getMaintenanceBlockedQuantity(variationId, tx);
  const rentedQty = await getRentedOutQuantity(variationId, tx);

  const blocked = maintenanceQty + cleaningQty + rentedQty;
  const nextStatus: ProductVariation["status"] =
    blocked < capacity
      ? "available"
      : maintenanceQty > 0
        ? "maintenance"
        : cleaningQty > 0
          ? cleaningInProgress
            ? "cleaning"
            : "needs_cleaning"
          : "rented";

  await tx
    .update(productVariations)
    .set({ status: nextStatus, updatedAt: new Date() })
    .where(eq(productVariations.id, variationId));

  return nextStatus;
}

/**
 * Opens the work a just-returned item needs, inside `returnBooking()`'s
 * own already-open transaction (`src/server/bookings/lifecycle.ts`) — the
 * automatic counterpart to `createMaintenanceTask()`'s manual path. Parks
 * the variation's lifecycle status via `applyVariationLifecycleStatus`
 * rather than setting it directly, so a booking that flags *both*
 * `cleaningRequired`/`maintenanceRequired` lands on the correct
 * "maintenance outranks cleaning" status without duplicating that rule
 * here.
 */
export async function openMaintenanceTasksForReturn(
  tx: MaintenanceTx,
  params: {
    shopId: string;
    outletId: string | null;
    variationId: string;
    bookingId: string;
    cleaningRequired: boolean;
    maintenanceRequired: boolean;
    damageNotes: string | null;
  },
): Promise<ProductVariation["status"]> {
  if (params.maintenanceRequired) {
    await tx.insert(maintenanceTasks).values({
      shopId: params.shopId,
      outletId: params.outletId,
      variationId: params.variationId,
      bookingId: params.bookingId,
      taskType: "maintenance",
      notes: params.damageNotes,
    });
  }

  if (params.cleaningRequired) {
    await tx.insert(maintenanceTasks).values({
      shopId: params.shopId,
      outletId: params.outletId,
      variationId: params.variationId,
      bookingId: params.bookingId,
      taskType: "cleaning",
    });
  }

  return applyVariationLifecycleStatus(tx, params.variationId);
}

const assignedToUser = alias(users, "maintenance_assigned_to");
const completedByUser = alias(users, "maintenance_completed_by");

const TASK_SELECT = {
  id: maintenanceTasks.id,
  shopId: maintenanceTasks.shopId,
  outletId: maintenanceTasks.outletId,
  outletName: outlets.name,
  variationId: maintenanceTasks.variationId,
  sku: productVariations.sku,
  barcode: productVariations.barcode,
  variationColor: productVariations.color,
  variationSize: productVariations.size,
  productName: products.name,
  itemStatus: productVariations.status,
  bookingId: maintenanceTasks.bookingId,
  // `maintenanceTasks.bookingId` is actually a `booking_items.id` (see its
  // column doc comment) — this is the order's own id, for linking to
  // `/dashboard/bookings/{orderId}` instead of the item id.
  orderId: bookings.id,
  bookingNumber: bookings.bookingNumber,
  bookingQuantity: bookingItems.quantity,
  taskType: maintenanceTasks.taskType,
  status: maintenanceTasks.status,
  notes: maintenanceTasks.notes,
  assignedToId: maintenanceTasks.assignedToId,
  assignedToFirstName: assignedToUser.firstName,
  assignedToLastName: assignedToUser.lastName,
  startedAt: maintenanceTasks.startedAt,
  completedAt: maintenanceTasks.completedAt,
  completedById: maintenanceTasks.completedById,
  completedByFirstName: completedByUser.firstName,
  completedByLastName: completedByUser.lastName,
  createdAt: maintenanceTasks.createdAt,
  updatedAt: maintenanceTasks.updatedAt,
} as const;

type TaskSelectRow = {
  id: string;
  shopId: string;
  outletId: string | null;
  outletName: string | null;
  variationId: string;
  sku: string;
  barcode: string;
  variationColor: string | null;
  variationSize: string | null;
  productName: string;
  itemStatus: ProductVariation["status"];
  bookingId: string | null;
  orderId: string | null;
  bookingNumber: string | null;
  bookingQuantity: number | null;
  taskType: MaintenanceTask["taskType"];
  status: MaintenanceTask["status"];
  notes: string | null;
  assignedToId: string | null;
  assignedToFirstName: string | null;
  assignedToLastName: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  completedById: string | null;
  completedByFirstName: string | null;
  completedByLastName: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type MaintenanceTaskItem = Omit<
  TaskSelectRow,
  | "assignedToFirstName"
  | "assignedToLastName"
  | "completedByFirstName"
  | "completedByLastName"
> & {
  assignedToName: string | null;
  completedByName: string | null;
};

function toTaskItem(row: TaskSelectRow): MaintenanceTaskItem {
  const {
    assignedToFirstName,
    assignedToLastName,
    completedByFirstName,
    completedByLastName,
    ...rest
  } = row;

  return {
    ...rest,
    assignedToName: assignedToFirstName
      ? `${assignedToFirstName} ${assignedToLastName ?? ""}`.trim()
      : null,
    completedByName: completedByFirstName
      ? `${completedByFirstName} ${completedByLastName ?? ""}`.trim()
      : null,
  };
}

function baseTaskQuery() {
  return db
    .select(TASK_SELECT)
    .from(maintenanceTasks)
    .innerJoin(
      productVariations,
      eq(maintenanceTasks.variationId, productVariations.id),
    )
    .innerJoin(products, eq(productVariations.productId, products.id))
    .leftJoin(outlets, eq(maintenanceTasks.outletId, outlets.id))
    .leftJoin(bookingItems, eq(maintenanceTasks.bookingId, bookingItems.id))
    .leftJoin(bookings, eq(bookingItems.bookingId, bookings.id))
    .leftJoin(assignedToUser, eq(maintenanceTasks.assignedToId, assignedToUser.id))
    .leftJoin(
      completedByUser,
      eq(maintenanceTasks.completedById, completedByUser.id),
    );
}

export type MaintenanceListResult = {
  items: MaintenanceTaskItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

/**
 * Tenant-scoped reads of the work queue, same discipline as
 * `listCustomers`/`listBookings`. Search matches SKU, barcode or product
 * name — a staff member at the cleaning station is looking the item up by
 * whichever of those they have in hand, not the task itself.
 */
export async function listMaintenanceTasks(
  actor: Pick<TenantSessionUser, "shopId" | "role" | "outletId">,
  query: MaintenanceListQuery,
): Promise<MaintenanceListResult> {
  const { page, pageSize, q, status, taskType } = query;
  const shopId = actor.shopId;
  // Outlet-scoped roles only ever see their own outlet's queue (RQ-12).
  const outletId = resolveOutletScope(actor, query.outletId);

  const conditions = [eq(maintenanceTasks.shopId, shopId)];

  if (q) {
    const pattern = `%${q}%`;
    conditions.push(
      or(
        ilike(productVariations.sku, pattern),
        ilike(productVariations.barcode, pattern),
        ilike(products.name, pattern),
      )!,
    );
  }

  if (status !== "all") {
    conditions.push(eq(maintenanceTasks.status, status));
  }

  if (taskType !== "all") {
    conditions.push(eq(maintenanceTasks.taskType, taskType));
  }

  if (outletId) {
    conditions.push(eq(maintenanceTasks.outletId, outletId));
  }

  const where = and(...conditions);

  const [totalRow, rows] = await Promise.all([
    db
      .select({ value: count() })
      .from(maintenanceTasks)
      .innerJoin(
        productVariations,
        eq(maintenanceTasks.variationId, productVariations.id),
      )
      .innerJoin(products, eq(productVariations.productId, products.id))
      .where(where),
    baseTaskQuery()
      .where(where)
      .orderBy(desc(maintenanceTasks.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
  ]);

  const total = totalRow[0]?.value ?? 0;

  return {
    items: rows.map(toTaskItem),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export type MaintenanceStats = {
  open: number;
  cleaning: number;
  maintenance: number;
  completed: number;
};

export async function getMaintenanceStats(
  shopId: string,
): Promise<MaintenanceStats> {
  const rows = await db
    .select({ taskType: maintenanceTasks.taskType, status: maintenanceTasks.status })
    .from(maintenanceTasks)
    .where(eq(maintenanceTasks.shopId, shopId));

  let open = 0;
  let cleaning = 0;
  let maintenance = 0;
  let completed = 0;

  for (const row of rows) {
    if (row.status === "completed") {
      completed += 1;
      continue;
    }
    if (row.status !== "pending" && row.status !== "in_progress") {
      continue;
    }
    open += 1;
    if (row.taskType === "cleaning") {
      cleaning += 1;
    } else {
      maintenance += 1;
    }
  }

  return { open, cleaning, maintenance, completed };
}

async function loadTaskForTenant(
  shopId: string,
  taskId: string,
): Promise<MaintenanceTaskItem> {
  const parsedId = maintenanceTaskIdParamSchema.safeParse({ id: taskId });
  if (!parsedId.success) {
    throw AppError.notFound("Task not found");
  }

  const [row] = await baseTaskQuery()
    .where(
      and(eq(maintenanceTasks.id, taskId), eq(maintenanceTasks.shopId, shopId)),
    )
    .limit(1);

  if (!row) {
    throw AppError.notFound("Task not found");
  }

  return toTaskItem(row);
}

export async function getMaintenanceTaskById(
  shopId: string,
  taskId: string,
): Promise<MaintenanceTaskItem | null> {
  try {
    return await loadTaskForTenant(shopId, taskId);
  } catch {
    return null;
  }
}

async function requireActiveTenantStaff(
  shopId: string,
  userId: string,
): Promise<void> {
  const [staffUser] = await db
    .select({ id: users.id, isActive: users.isActive })
    .from(users)
    .where(and(eq(users.id, userId), eq(users.shopId, shopId)))
    .limit(1);

  if (!staffUser || !staffUser.isActive) {
    throw new AppError("Staff member not found", 404, [
      { field: "assignedToId", message: "Staff member not found" },
    ]);
  }
}

/**
 * Manually raises a task against an item found needing work outside a
 * return (e.g. a routine shelf check) — the automatic counterpart is
 * `openMaintenanceTasksForReturn()`, run inside `returnBooking()` itself.
 */
export async function createMaintenanceTask(
  actor: TenantSessionUser,
  input: CreateMaintenanceTaskInput,
): Promise<MaintenanceTaskItem> {
  if (!hasPermission(actor.role, Permission.MAINTENANCE_MANAGE)) {
    throw AppError.forbidden("You do not have permission to do this");
  }

  const variation = input.variationId
    ? await getVariationForBooking(actor.shopId, input.variationId)
    : input.barcode
      ? await getVariationByBarcode(actor.shopId, input.barcode)
      : null;

  if (!variation) {
    throw new AppError("Item not found", 404, [
      { field: "barcode", message: "Item not found" },
    ]);
  }

  const created = await db.transaction(async (tx) => {
    const [task] = await tx
      .insert(maintenanceTasks)
      .values({
        shopId: actor.shopId,
        outletId: variation.outletId,
        variationId: variation.id,
        taskType: input.taskType,
        notes: input.notes || null,
      })
      .returning({ id: maintenanceTasks.id });

    await applyVariationLifecycleStatus(tx, variation.id);

    return task;
  });

  return loadTaskForTenant(actor.shopId, created.id);
}

/**
 * Starts the work: moves `pending -> in_progress`, records who's doing it
 * (defaults to the caller), and re-runs `applyVariationLifecycleStatus` so
 * a cleaning task moving to "started" is reflected in the item's own
 * status — but only once every unit is actually accounted for (mirrors the
 * legacy backend's binary behaviour exactly when `quantity` is 1).
 */
export async function startMaintenanceTask(
  actor: TenantSessionUser,
  taskId: string,
  input: StartMaintenanceTaskInput,
): Promise<MaintenanceTaskItem> {
  if (!hasPermission(actor.role, Permission.MAINTENANCE_MANAGE)) {
    throw AppError.forbidden("You do not have permission to do this");
  }

  const task = await loadTaskForTenant(actor.shopId, taskId);

  if (task.status !== "pending") {
    throw new AppError(`Task is already '${task.status.replace("_", " ")}'`, 409);
  }

  if (input.assignedToId) {
    await requireActiveTenantStaff(actor.shopId, input.assignedToId);
  }

  await db.transaction(async (tx) => {
    await tx
      .update(maintenanceTasks)
      .set({
        status: "in_progress",
        startedAt: new Date(),
        assignedToId: input.assignedToId || task.assignedToId || actor.id,
        updatedAt: new Date(),
      })
      .where(eq(maintenanceTasks.id, taskId));

    if (task.taskType === "cleaning") {
      await applyVariationLifecycleStatus(tx, task.variationId);
    }
  });

  return loadTaskForTenant(actor.shopId, taskId);
}

/**
 * Closes the work and releases the item only when nothing else is open
 * for it — `applyVariationLifecycleStatus` is the single chokepoint that
 * decides that, never this function directly (mirrors the legacy
 * `MaintenanceService._release_if_ready`).
 */
export async function completeMaintenanceTask(
  actor: TenantSessionUser,
  taskId: string,
  input: CompleteMaintenanceTaskInput,
): Promise<{ task: MaintenanceTaskItem; released: boolean }> {
  if (!hasPermission(actor.role, Permission.MAINTENANCE_MANAGE)) {
    throw AppError.forbidden("You do not have permission to do this");
  }

  const task = await loadTaskForTenant(actor.shopId, taskId);

  if (task.status === "completed") {
    throw new AppError("Task is already completed", 409);
  }
  if (task.status === "cancelled") {
    throw new AppError("Task was cancelled", 409);
  }

  const released = await db.transaction(async (tx) => {
    await tx
      .update(maintenanceTasks)
      .set({
        status: "completed",
        completedAt: new Date(),
        completedById: actor.id,
        // `input.notes` is always present (the dialog pre-fills the
        // textarea with the task's current notes) so an intentional
        // "clear the notes" submission is a defined but empty string, not
        // `undefined` — falling back to `task.notes` with `||` would
        // silently discard that edit. Only actual omission (a caller other
        // than this dialog posting no `notes` at all) keeps the old value.
        notes: input.notes !== undefined ? input.notes || null : task.notes,
        updatedAt: new Date(),
      })
      .where(eq(maintenanceTasks.id, taskId));

    const nextStatus = await applyVariationLifecycleStatus(
      tx,
      task.variationId,
    );

    return nextStatus === "available";
  });

  return { task: await loadTaskForTenant(actor.shopId, taskId), released };
}

export async function cancelMaintenanceTask(
  actor: TenantSessionUser,
  taskId: string,
  input: CancelMaintenanceTaskInput,
): Promise<MaintenanceTaskItem> {
  if (!hasPermission(actor.role, Permission.MAINTENANCE_MANAGE)) {
    throw AppError.forbidden("You do not have permission to do this");
  }

  const task = await loadTaskForTenant(actor.shopId, taskId);

  if (task.status === "completed") {
    throw new AppError("Completed work cannot be cancelled", 409);
  }
  if (task.status === "cancelled") {
    throw new AppError("Task is already cancelled", 409);
  }

  await db.transaction(async (tx) => {
    await tx
      .update(maintenanceTasks)
      .set({
        status: "cancelled",
        notes: input.notes !== undefined ? input.notes || null : task.notes,
        updatedAt: new Date(),
      })
      .where(eq(maintenanceTasks.id, taskId));

    await applyVariationLifecycleStatus(tx, task.variationId);
  });

  return loadTaskForTenant(actor.shopId, taskId);
}
