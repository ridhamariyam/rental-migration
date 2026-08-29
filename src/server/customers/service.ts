import "server-only";

import { and, count, desc, eq, ilike, or } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { AppError } from "@/lib/errors/app-error";
import { customers, users } from "@/lib/db/schema";
import type {
  CustomerFormInput,
  CustomerListQuery,
} from "@/lib/validation/customers";
import { customerIdParamSchema } from "@/lib/validation/customers";

export type CustomerRow = typeof customers.$inferSelect;

export type CustomerListItem = CustomerRow & {
  primaryStaffName: string | null;
};

export type CustomerListResult = {
  items: CustomerListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

function isUniqueViolation(
  error: unknown,
): error is { code: string; constraint?: string } {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "23505"
  );
}

const CUSTOMER_SELECT = {
  id: customers.id,
  shopId: customers.shopId,
  firstName: customers.firstName,
  lastName: customers.lastName,
  phone: customers.phone,
  email: customers.email,
  preferredSize: customers.preferredSize,
  notes: customers.notes,
  primaryStaffId: customers.primaryStaffId,
  isActive: customers.isActive,
  createdAt: customers.createdAt,
  updatedAt: customers.updatedAt,
  primaryStaffFirstName: users.firstName,
  primaryStaffLastName: users.lastName,
} as const;

type CustomerSelectRow = {
  id: string;
  shopId: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string | null;
  preferredSize: string | null;
  notes: string | null;
  primaryStaffId: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  primaryStaffFirstName: string | null;
  primaryStaffLastName: string | null;
};

function toListItem(row: CustomerSelectRow): CustomerListItem {
  const { primaryStaffFirstName, primaryStaffLastName, ...rest } = row;
  return {
    ...rest,
    primaryStaffName: primaryStaffFirstName
      ? `${primaryStaffFirstName} ${primaryStaffLastName ?? ""}`.trim()
      : null,
  };
}

/**
 * Shop-managed customer reads, always scoped to the caller's own tenant —
 * same discipline as `listStaff`/`listOutlets`. Search matches name, phone
 * or email; `status` maps to the archive toggle (`isActive`).
 */
export async function listCustomers(
  shopId: string,
  query: CustomerListQuery,
): Promise<CustomerListResult> {
  const { page, pageSize, q, status } = query;

  const conditions = [eq(customers.shopId, shopId)];

  if (q) {
    const pattern = `%${q}%`;
    conditions.push(
      or(
        ilike(customers.firstName, pattern),
        ilike(customers.lastName, pattern),
        ilike(customers.phone, pattern),
        ilike(customers.email, pattern),
      )!,
    );
  }

  if (status === "active") {
    conditions.push(eq(customers.isActive, true));
  } else if (status === "archived") {
    conditions.push(eq(customers.isActive, false));
  }

  const where = and(...conditions);

  const [totalRow, rows] = await Promise.all([
    db.select({ value: count() }).from(customers).where(where),
    db
      .select(CUSTOMER_SELECT)
      .from(customers)
      .leftJoin(users, eq(customers.primaryStaffId, users.id))
      .where(where)
      .orderBy(desc(customers.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
  ]);

  const total = totalRow[0]?.value ?? 0;

  return {
    items: rows.map(toListItem),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export type CustomerStats = {
  total: number;
  active: number;
  archived: number;
};

export async function getCustomerStats(shopId: string): Promise<CustomerStats> {
  const [totalRow, activeRow] = await Promise.all([
    db
      .select({ value: count() })
      .from(customers)
      .where(eq(customers.shopId, shopId)),
    db
      .select({ value: count() })
      .from(customers)
      .where(and(eq(customers.shopId, shopId), eq(customers.isActive, true))),
  ]);

  const total = totalRow[0]?.value ?? 0;
  const active = activeRow[0]?.value ?? 0;

  return { total, active, archived: total - active };
}

/**
 * Returns `null` for an invalid id, a nonexistent customer, or one outside
 * this tenant — the caller turns any of these into a 404, same "don't
 * reveal which case it was" reasoning used everywhere else.
 */
export async function getCustomerById(
  shopId: string,
  id: string,
): Promise<CustomerListItem | null> {
  const parsedId = customerIdParamSchema.safeParse({ id });
  if (!parsedId.success) {
    return null;
  }

  const [row] = await db
    .select(CUSTOMER_SELECT)
    .from(customers)
    .leftJoin(users, eq(customers.primaryStaffId, users.id))
    .where(
      and(eq(customers.id, parsedId.data.id), eq(customers.shopId, shopId)),
    )
    .limit(1);

  return row ? toListItem(row) : null;
}

function conflictError(field: "phone" | "email"): AppError {
  const message =
    field === "phone"
      ? "A customer with this phone number already exists"
      : "A customer with this email already exists";
  return new AppError(message, 409, [{ field, message }]);
}

export async function createCustomer(
  shopId: string,
  input: CustomerFormInput,
): Promise<CustomerRow> {
  const [phoneConflict] = await db
    .select({ id: customers.id })
    .from(customers)
    .where(and(eq(customers.shopId, shopId), eq(customers.phone, input.phone)))
    .limit(1);

  if (phoneConflict) {
    throw conflictError("phone");
  }

  if (input.email) {
    const [emailConflict] = await db
      .select({ id: customers.id })
      .from(customers)
      .where(
        and(eq(customers.shopId, shopId), eq(customers.email, input.email)),
      )
      .limit(1);

    if (emailConflict) {
      throw conflictError("email");
    }
  }

  try {
    const [customer] = await db
      .insert(customers)
      .values({
        shopId,
        firstName: input.firstName,
        lastName: input.lastName,
        phone: input.phone,
        email: input.email || null,
        preferredSize: input.preferredSize || null,
        notes: input.notes || null,
      })
      .returning();

    return customer;
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw conflictError(
        error.constraint?.includes("email") ? "email" : "phone",
      );
    }
    throw error;
  }
}

export async function updateCustomer(
  shopId: string,
  id: string,
  input: CustomerFormInput,
): Promise<CustomerRow> {
  const existing = await getCustomerById(shopId, id);
  if (!existing) {
    throw AppError.notFound("Customer not found");
  }

  const [phoneConflict] = await db
    .select({ id: customers.id })
    .from(customers)
    .where(and(eq(customers.shopId, shopId), eq(customers.phone, input.phone)))
    .limit(1);

  if (phoneConflict && phoneConflict.id !== id) {
    throw conflictError("phone");
  }

  if (input.email) {
    const [emailConflict] = await db
      .select({ id: customers.id })
      .from(customers)
      .where(
        and(eq(customers.shopId, shopId), eq(customers.email, input.email)),
      )
      .limit(1);

    if (emailConflict && emailConflict.id !== id) {
      throw conflictError("email");
    }
  }

  try {
    const [customer] = await db
      .update(customers)
      .set({
        firstName: input.firstName,
        lastName: input.lastName,
        phone: input.phone,
        email: input.email || null,
        preferredSize: input.preferredSize || null,
        notes: input.notes || null,
        updatedAt: new Date(),
      })
      .where(and(eq(customers.id, id), eq(customers.shopId, shopId)))
      .returning();

    return customer;
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw conflictError(
        error.constraint?.includes("email") ? "email" : "phone",
      );
    }
    throw error;
  }
}

/**
 * "Archive"/"Restore" rather than "Activate"/"Deactivate" — a customer
 * never logs in, so there's nothing to revoke; this is purely a visibility
 * toggle for the default list (see the frontend's wording).
 */
export async function setCustomerStatus(
  shopId: string,
  id: string,
  isActive: boolean,
): Promise<CustomerRow> {
  const existing = await getCustomerById(shopId, id);
  if (!existing) {
    throw AppError.notFound("Customer not found");
  }

  const [customer] = await db
    .update(customers)
    .set({ isActive, updatedAt: new Date() })
    .where(and(eq(customers.id, id), eq(customers.shopId, shopId)))
    .returning();

  return customer;
}
