import "server-only";

import { aliasedTable, and, count, desc, eq, inArray, or, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { AppError } from "@/lib/errors/app-error";
import {
  bookingItems,
  outlets,
  productVariations,
  products,
  stockTransfers,
  users,
  type StockTransfer,
} from "@/lib/db/schema";
import { BLOCKING_STATUSES } from "@/lib/booking-state";
import { eachDayInclusive } from "@/lib/date-range";
import { toDateString } from "@/lib/format";
import { AuditAction } from "@/lib/audit-actions";
import { hasPermission, Permission } from "@/lib/auth/permissions";
import type {
  CreateTransferInput,
  TransferListQuery,
} from "@/lib/validation/transfers";
import { recordAudit } from "@/server/audit/service";
import {
  isOutletScoped,
  outletScopeFor,
  type TenantSessionUser,
} from "@/server/auth/guard";
import { lockVariationsForUpdate } from "@/server/bookings/availability";
import { getMaintenanceBlockedQuantity } from "@/server/variations/capacity";
import { allocateGeneratedIdentifiers } from "@/server/variations/service";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Actor = Pick<TenantSessionUser, "id" | "role" | "outletId" | "shopId">;

/** Roles a transfer can be handed to for receiving. */
const RECEIVER_ROLES = ["staff", "manager", "admin"] as const;

/** Item statuses that mean the unit is physically with a customer, so it
 * is "taken" every day until it comes back, whatever its return date. */
const OUT_NOW = new Set(["pickup_pending", "rented", "return_pending", "overdue"]);

export type TransferListItem = {
  id: string;
  transferNumber: string;
  status: StockTransfer["status"];
  quantity: number;
  notes: string | null;
  createdAt: Date;
  receivedAt: Date | null;
  cancelledAt: Date | null;
  variationId: string;
  productId: string;
  productName: string;
  color: string | null;
  size: string | null;
  sku: string;
  fromOutletId: string | null;
  fromOutletName: string | null;
  toOutletId: string | null;
  toOutletName: string | null;
  sentById: string | null;
  sentByName: string | null;
  assignedToId: string | null;
  assignedToName: string | null;
  receivedByName: string | null;
};

export type TransferListResult = {
  items: TransferListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

const fromOutlet = aliasedTable(outlets, "from_outlet");
const toOutlet = aliasedTable(outlets, "to_outlet");
const sender = aliasedTable(users, "sender");
const assignee = aliasedTable(users, "assignee");
const receiver = aliasedTable(users, "receiver");

const fullName = (table: typeof users) =>
  sql<string | null>`nullif(trim(concat(${table.firstName}, ' ', ${table.lastName})), '')`;

const LIST_SELECT = {
  id: stockTransfers.id,
  transferNumber: stockTransfers.transferNumber,
  status: stockTransfers.status,
  quantity: stockTransfers.quantity,
  notes: stockTransfers.notes,
  createdAt: stockTransfers.createdAt,
  receivedAt: stockTransfers.receivedAt,
  cancelledAt: stockTransfers.cancelledAt,
  variationId: stockTransfers.variationId,
  productId: products.id,
  productName: products.name,
  color: productVariations.color,
  size: productVariations.size,
  sku: productVariations.sku,
  fromOutletId: stockTransfers.fromOutletId,
  fromOutletName: fromOutlet.name,
  toOutletId: stockTransfers.toOutletId,
  toOutletName: toOutlet.name,
  sentById: stockTransfers.sentById,
  sentByName: fullName(sender),
  assignedToId: stockTransfers.assignedToId,
  assignedToName: fullName(assignee),
  receivedByName: fullName(receiver),
} as const;

function listBase() {
  return db
    .select(LIST_SELECT)
    .from(stockTransfers)
    .innerJoin(productVariations, eq(stockTransfers.variationId, productVariations.id))
    .innerJoin(products, eq(productVariations.productId, products.id))
    .leftJoin(fromOutlet, eq(stockTransfers.fromOutletId, fromOutlet.id))
    .leftJoin(toOutlet, eq(stockTransfers.toOutletId, toOutlet.id))
    .leftJoin(sender, eq(stockTransfers.sentById, sender.id))
    .leftJoin(assignee, eq(stockTransfers.assignedToId, assignee.id))
    .leftJoin(receiver, eq(stockTransfers.receivedById, receiver.id));
}

/** Outlet-scoped accounts see transfers into or out of their own outlet,
 * plus anything assigned to them personally. */
function visibilityCondition(actor: Actor) {
  const scope = outletScopeFor(actor);
  if (scope === null) return undefined;
  return or(
    eq(stockTransfers.fromOutletId, scope),
    eq(stockTransfers.toOutletId, scope),
    eq(stockTransfers.assignedToId, actor.id),
  );
}

export async function listTransfers(
  actor: Actor,
  query: TransferListQuery,
): Promise<TransferListResult> {
  const conditions = [eq(stockTransfers.shopId, actor.shopId)];
  const visibility = visibilityCondition(actor);
  if (visibility) conditions.push(visibility);
  if (query.status !== "all") conditions.push(eq(stockTransfers.status, query.status));
  if (query.view === "mine") {
    conditions.push(
      eq(stockTransfers.assignedToId, actor.id),
      eq(stockTransfers.status, "in_transit"),
    );
  }
  const where = and(...conditions);

  const [items, [{ total }]] = await Promise.all([
    listBase()
      .where(where)
      .orderBy(desc(stockTransfers.createdAt))
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize),
    db.select({ total: count() }).from(stockTransfers).where(where),
  ]);

  return {
    items,
    total,
    page: query.page,
    pageSize: query.pageSize,
    totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
  };
}

/** In-transit transfers the user has been asked to receive. */
export async function listTransfersAwaiting(actor: Actor): Promise<TransferListItem[]> {
  return listBase()
    .where(
      and(
        eq(stockTransfers.shopId, actor.shopId),
        eq(stockTransfers.assignedToId, actor.id),
        eq(stockTransfers.status, "in_transit"),
      ),
    )
    .orderBy(desc(stockTransfers.createdAt))
    .limit(20);
}

/** Latest transfer touching each of these items — the product page's
 * "Transferred from …" / "In transfer to …" badges. */
export async function getLatestTransfersForVariations(
  shopId: string,
  variationIds: string[],
): Promise<Map<string, TransferListItem>> {
  if (variationIds.length === 0) return new Map();
  const rows = await listBase()
    .where(
      and(
        eq(stockTransfers.shopId, shopId),
        inArray(stockTransfers.variationId, variationIds),
        inArray(stockTransfers.status, ["in_transit", "received"]),
      ),
    )
    .orderBy(desc(stockTransfers.createdAt));
  const latest = new Map<string, TransferListItem>();
  for (const row of rows) {
    if (!latest.has(row.variationId)) latest.set(row.variationId, row);
  }
  return latest;
}

/** Active people at an outlet who can be asked to receive a transfer. */
export async function listReceiversForOutlet(
  shopId: string,
  outletId: string,
): Promise<{ id: string; name: string; role: string }[]> {
  const rows = await db
    .select({
      id: users.id,
      firstName: users.firstName,
      lastName: users.lastName,
      role: users.role,
    })
    .from(users)
    .where(
      and(
        eq(users.shopId, shopId),
        eq(users.outletId, outletId),
        eq(users.isActive, true),
        inArray(users.role, [...RECEIVER_ROLES]),
      ),
    )
    .orderBy(users.firstName);
  return rows.map((row) => ({
    id: row.id,
    name: `${row.firstName} ${row.lastName ?? ""}`.trim(),
    role: row.role,
  }));
}

/**
 * Most units of this item committed on any single day from today on: what
 * customers already have, plus every future booking, plus whatever is tied
 * up in an open cleaning/repair task. Those units have to stay where the
 * bookings expect them, so only the rest can travel.
 */
async function committedUnits(tx: Tx, variationId: string, today: string): Promise<number> {
  const rows = await tx
    .select({
      quantity: bookingItems.quantity,
      fromDate: bookingItems.fromDate,
      toDate: bookingItems.toDate,
      status: bookingItems.status,
    })
    .from(bookingItems)
    .where(
      and(
        eq(bookingItems.variationId, variationId),
        inArray(bookingItems.status, [...BLOCKING_STATUSES]),
      ),
    );

  let alwaysOut = 0;
  const perDay = new Map<string, number>();
  for (const row of rows) {
    if (OUT_NOW.has(row.status)) {
      alwaysOut += row.quantity;
      continue;
    }
    if (row.toDate < today) continue;
    const start = row.fromDate > today ? row.fromDate : today;
    for (const day of eachDayInclusive(start, row.toDate)) {
      perDay.set(day, (perDay.get(day) ?? 0) + row.quantity);
    }
  }
  const peakFuture = Math.max(0, ...perDay.values());
  const blocked = await getMaintenanceBlockedQuantity(variationId, tx);
  return alwaysOut + peakFuture + blocked.maintenanceQty + blocked.cleaningQty;
}

async function nextTransferNumber(tx: Tx, shopId: string): Promise<string> {
  const [{ total }] = await tx
    .select({ total: count() })
    .from(stockTransfers)
    .where(eq(stockTransfers.shopId, shopId));
  return `TR-${String(total + 1).padStart(4, "0")}`;
}

export async function createTransfer(
  actor: Actor,
  input: CreateTransferInput,
): Promise<StockTransfer> {
  if (!hasPermission(actor.role, Permission.TRANSFER_CREATE)) {
    throw AppError.forbidden("You don't have permission to send transfers");
  }

  return db.transaction(async (tx) => {
    await lockVariationsForUpdate(tx, [input.variationId]);

    const [item] = await tx
      .select({
        variation: productVariations,
        productName: products.name,
      })
      .from(productVariations)
      .innerJoin(products, eq(productVariations.productId, products.id))
      .where(
        and(
          eq(productVariations.id, input.variationId),
          eq(products.shopId, actor.shopId),
        ),
      )
      .limit(1);
    if (!item) throw AppError.notFound("Item not found");
    const variation = item.variation;

    const fromOutletId = variation.outletId;
    if (!fromOutletId) {
      throw new AppError("This item isn't assigned to an outlet yet", 400);
    }
    const scope = outletScopeFor(actor);
    if (scope !== null && scope !== fromOutletId) {
      throw AppError.forbidden("You can only send items from your own outlet");
    }
    if (input.toOutletId === fromOutletId) {
      throw new AppError("The item is already at that outlet", 400, [
        { field: "toOutletId", message: "Pick a different outlet" },
      ]);
    }
    if (variation.status === "in_transfer") {
      throw new AppError("This item is already being transferred", 409);
    }
    if (variation.status === "retired") {
      throw new AppError("A retired item can't be transferred", 400);
    }

    const [destination] = await tx
      .select({ id: outlets.id, name: outlets.name, isActive: outlets.isActive })
      .from(outlets)
      .where(and(eq(outlets.id, input.toOutletId), eq(outlets.shopId, actor.shopId)))
      .limit(1);
    if (!destination || !destination.isActive) {
      throw new AppError("Pick an active outlet to send to", 400, [
        { field: "toOutletId", message: "Pick an active outlet" },
      ]);
    }

    const [receiverRow] = await tx
      .select({ id: users.id, outletId: users.outletId, isActive: users.isActive, role: users.role })
      .from(users)
      .where(and(eq(users.id, input.assignedToId), eq(users.shopId, actor.shopId)))
      .limit(1);
    if (
      !receiverRow ||
      !receiverRow.isActive ||
      receiverRow.outletId !== input.toOutletId ||
      !(RECEIVER_ROLES as readonly string[]).includes(receiverRow.role)
    ) {
      throw new AppError("Pick someone who works at the receiving outlet", 400, [
        { field: "assignedToId", message: "Must work at the receiving outlet" },
      ]);
    }

    if (input.quantity > variation.quantity) {
      throw new AppError(`Only ${variation.quantity} unit(s) of this item exist`, 400, [
        { field: "quantity", message: `At most ${variation.quantity}` },
      ]);
    }

    const committed = await committedUnits(tx, variation.id, toDateString(new Date()));
    const free = variation.quantity - committed;
    if (input.quantity > free) {
      throw new AppError(
        free <= 0
          ? "Every unit of this item is booked, out with a customer, or in cleaning/repair — none can be moved right now"
          : `Only ${free} unit(s) are free to move — the rest are booked, out with a customer, or in cleaning/repair`,
        409,
        [{ field: "quantity", message: `At most ${Math.max(0, free)} free` }],
      );
    }

    const isWhole = input.quantity === variation.quantity;
    let movingId = variation.id;

    if (isWhole) {
      await tx
        .update(productVariations)
        .set({ status: "in_transfer", updatedAt: new Date() })
        .where(eq(productVariations.id, variation.id));
    } else {
      // Split the moving units off as their own item (new barcode) so the
      // rest can keep renting at the origin while these travel.
      const { sku, barcode } = await allocateGeneratedIdentifiers(tx, item.productName);
      const [split] = await tx
        .insert(productVariations)
        .values({
          productId: variation.productId,
          outletId: fromOutletId,
          color: variation.color,
          size: variation.size,
          rentPrice: variation.rentPrice,
          sellingPrice: variation.sellingPrice,
          buyingPrice: variation.buyingPrice,
          securityDeposit: variation.securityDeposit,
          quantity: input.quantity,
          sku,
          barcode,
          image: variation.image,
          gallery: variation.gallery,
          isAvailable: variation.isAvailable,
          status: "in_transfer",
          ownershipType: variation.ownershipType,
          ownerName: variation.ownerName,
          ownerPhone: variation.ownerPhone,
          ownerCustomerId: variation.ownerCustomerId,
          ownerShareAmount: variation.ownerShareAmount,
          ownerNotes: variation.ownerNotes,
        })
        .returning({ id: productVariations.id });
      movingId = split.id;
      await tx
        .update(productVariations)
        .set({ quantity: variation.quantity - input.quantity, updatedAt: new Date() })
        .where(eq(productVariations.id, variation.id));
    }

    const [transfer] = await tx
      .insert(stockTransfers)
      .values({
        shopId: actor.shopId,
        transferNumber: await nextTransferNumber(tx, actor.shopId),
        variationId: movingId,
        sourceVariationId: isWhole ? null : variation.id,
        fromOutletId,
        toOutletId: input.toOutletId,
        quantity: input.quantity,
        notes: input.notes ?? null,
        sentById: actor.id,
        assignedToId: input.assignedToId,
      })
      .returning();

    await recordAudit(tx, {
      shopId: actor.shopId,
      outletId: fromOutletId,
      userId: actor.id,
      action: AuditAction.TRANSFER_SENT,
      entityType: "stock_transfer",
      entityId: transfer.id,
      summary: `${transfer.transferNumber}: ${input.quantity} × ${item.productName} (${variation.sku}) sent to ${destination.name}`,
      after: { variationId: movingId, quantity: input.quantity, toOutletId: input.toOutletId },
    });

    return transfer;
  });
}

async function loadForUpdate(tx: Tx, actor: Actor, id: string) {
  const [transfer] = await tx
    .select()
    .from(stockTransfers)
    .where(and(eq(stockTransfers.id, id), eq(stockTransfers.shopId, actor.shopId)))
    .for("update")
    .limit(1);
  if (!transfer) throw AppError.notFound("Transfer not found");
  if (transfer.status !== "in_transit") {
    throw new AppError(
      transfer.status === "received"
        ? "This transfer has already been received"
        : "This transfer was cancelled",
      409,
    );
  }
  return transfer;
}

/** The assigned receiver (or the owner) confirms the items arrived: they
 * now belong to the destination outlet and can be booked there. */
export async function receiveTransfer(actor: Actor, id: string): Promise<StockTransfer> {
  return db.transaction(async (tx) => {
    const transfer = await loadForUpdate(tx, actor, id);
    if (transfer.assignedToId !== actor.id && isOutletScoped(actor)) {
      throw AppError.forbidden("Only the person this transfer was sent to can receive it");
    }

    await tx
      .update(productVariations)
      .set({ outletId: transfer.toOutletId, status: "available", updatedAt: new Date() })
      .where(eq(productVariations.id, transfer.variationId));

    const [updated] = await tx
      .update(stockTransfers)
      .set({
        status: "received",
        receivedById: actor.id,
        receivedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(stockTransfers.id, transfer.id))
      .returning();

    await recordAudit(tx, {
      shopId: actor.shopId,
      outletId: transfer.toOutletId,
      userId: actor.id,
      action: AuditAction.TRANSFER_RECEIVED,
      entityType: "stock_transfer",
      entityId: transfer.id,
      summary: `${transfer.transferNumber}: ${transfer.quantity} unit(s) received`,
    });

    return updated;
  });
}

/**
 * Calls off a transfer still in transit (sender, anyone at the origin
 * outlet, or the owner). The items stay at the origin and become bookable
 * again; a split-off part keeps its own barcode rather than being merged
 * back, so its history and labels stay valid.
 */
export async function cancelTransfer(actor: Actor, id: string): Promise<StockTransfer> {
  return db.transaction(async (tx) => {
    const transfer = await loadForUpdate(tx, actor, id);
    const scope = outletScopeFor(actor);
    if (scope !== null && transfer.sentById !== actor.id && scope !== transfer.fromOutletId) {
      throw AppError.forbidden("Only the sending outlet can cancel this transfer");
    }

    await tx
      .update(productVariations)
      .set({ status: "available", updatedAt: new Date() })
      .where(eq(productVariations.id, transfer.variationId));

    const [updated] = await tx
      .update(stockTransfers)
      .set({ status: "cancelled", cancelledAt: new Date(), updatedAt: new Date() })
      .where(eq(stockTransfers.id, transfer.id))
      .returning();

    await recordAudit(tx, {
      shopId: actor.shopId,
      outletId: transfer.fromOutletId,
      userId: actor.id,
      action: AuditAction.TRANSFER_CANCELLED,
      entityType: "stock_transfer",
      entityId: transfer.id,
      summary: `${transfer.transferNumber} cancelled`,
    });

    return updated;
  });
}
