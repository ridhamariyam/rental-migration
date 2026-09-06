import { z } from "zod";
import {
  dateStringSchema,
  optionalMoneySchema,
  optionalUuidSchema,
  uuidSchema,
} from "@/lib/validation/common";
import { toDateString } from "@/lib/format";

export const bookingIdParamSchema = z.object({ id: uuidSchema });

const BOOKING_STATUS_FILTER_VALUES = [
  "all",
  "draft",
  "confirmed",
  "pickup_pending",
  "rented",
  "return_pending",
  "returned",
  "overdue",
  "cancelled",
] as const;

export const bookingListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).catch(1),
  pageSize: z.coerce.number().int().min(1).max(100).catch(20),
  q: z
    .string()
    .trim()
    .max(100, "Search is too long")
    .optional()
    .catch(undefined),
  status: z.enum(BOOKING_STATUS_FILTER_VALUES).catch("all"),
  customerId: z.string().trim().optional().catch(undefined),
});

export type BookingListQuery = z.infer<typeof bookingListQuerySchema>;

/**
 * A booking must identify its physical item by either its id (picked from
 * a search list) or its barcode (scanned at the counter) — mirrors the
 * legacy `BookingCreate`'s own either/or requirement. `rentAmount` is
 * deliberately **not** accepted here at all: the legacy backend let a
 * caller override the rent with no permission check (plan.md § 3.2's
 * flagged bug) — the fix is to not expose that field in the first place,
 * always pricing rent from the variation's own `rentPrice`. The deposit
 * *is* accepted as an optional override (see `bookingItemSchema`): it is
 * refundable money held, not revenue, and the counter genuinely varies it
 * per customer.
 */
const itemIdentifierRefinement = <
  T extends { variationId?: string; barcode?: string },
>(
  data: T,
  ctx: z.RefinementCtx,
) => {
  if (!data.variationId && !data.barcode) {
    ctx.addIssue({
      code: "custom",
      path: ["barcode"],
      message: "Scan a barcode or choose an item",
    });
  }
};

/** The extra-charge pair every priced line accepts. A charge the customer
 * can’t see a reason for on their bill is exactly the kind of "what is
 * this ₹500 for?" dispute this field exists to prevent, so a non-zero
 * amount always has to be explained. */
const additionalCostRefinement = <
  T extends { additionalCost?: string; additionalCostReason?: string },
>(
  data: T,
  ctx: z.RefinementCtx,
) => {
  const hasCost =
    !!data.additionalCost && Number(data.additionalCost) > 0;
  if (hasCost && !data.additionalCostReason?.trim()) {
    ctx.addIssue({
      code: "custom",
      path: ["additionalCostReason"],
      message: "Say what this extra charge is for",
    });
  }
};

const dateRangeRefinement = <T extends { fromDate: string; toDate: string }>(
  data: T,
  ctx: z.RefinementCtx,
) => {
  if (data.toDate < data.fromDate) {
    ctx.addIssue({
      code: "custom",
      path: ["toDate"],
      message: "Return date cannot be before pickup date",
    });
  }
};

/** A **new** booking's pickup date can't be backdated — only enforced for
 * creating/quoting a fresh line, never for `updateBookingSchema` (editing an
 * existing draft's paperwork can legitimately keep a pickup date that's
 * since slipped into the past). */
const pickupNotInPastRefinement = <T extends { fromDate: string }>(
  data: T,
  ctx: z.RefinementCtx,
) => {
  if (data.fromDate < toDateString(new Date())) {
    ctx.addIssue({
      code: "custom",
      path: ["fromDate"],
      message: "Pickup date cannot be in the past",
    });
  }
};

/** How many identical physical units of the same item/dates one booking
 * line requests — priced, paid, picked up and returned together as a
 * single `bookings` row/booking number (not one row per unit). Kept as a
 * string for the same `zodResolver` input/output type-equality reason as
 * `quantitySchema` in `validation/variations.ts`, and capped well below
 * that field's 9,999 ceiling since this is units *per order line*, not a
 * shop's total stock. */
export const bookingQuantitySchema = z
  .string()
  .trim()
  .min(1, "Required")
  .refine(
    (value) => {
      const parsed = Number(value);
      return Number.isInteger(parsed) && parsed >= 1 && parsed <= 20;
    },
    { message: "Enter a whole number between 1 and 20" },
  );

export const quoteRequestSchema = z
  .object({
    variationId: z.string().trim().optional(),
    barcode: z.string().trim().max(50).optional(),
    fromDate: dateStringSchema,
    toDate: dateStringSchema,
    discountAmount: optionalMoneySchema,
    // Extra charge + its reason, previewed here so the summary panel's
    // total is the same number the server will freeze onto the booking.
    additionalCost: optionalMoneySchema,
    additionalCostReason: z
      .string()
      .trim()
      .max(200, "Must be at most 200 characters")
      .optional(),
    // Blank keeps the item's own deposit; a value replaces it (per unit).
    securityDeposit: optionalMoneySchema,
    // How many units of this line are wanted — scales both the live
    // preview's price (rent and deposit each multiply by this) and its
    // availability check ("is there room for N units").
    quantity: bookingQuantitySchema.optional(),
    // Set when previewing an edit to an *existing* draft booking, so the
    // availability check doesn't flag the booking's own reservation as a
    // conflict with itself. Only ever narrows the check — the real
    // enforcement at save time (`updateBooking`) uses the booking's own id
    // from the URL, never this client-supplied value.
    excludeBookingId: uuidSchema.optional(),
  })
  .superRefine((data, ctx) => {
    itemIdentifierRefinement(data, ctx);
    dateRangeRefinement(data, ctx);
    pickupNotInPastRefinement(data, ctx);
  });

export type QuoteRequestInput = z.infer<typeof quoteRequestSchema>;

/**
 * One "cart line" — a customer can rent several *different* items in the
 * same transaction (e.g. an outfit plus accessories for the same event),
 * each with its own item and its own dates/discount, since one might be
 * returned before another. `quantity` requests that many *identical*
 * units of this same line (same item, same dates, same discount) — still
 * just this one line/one `bookings` row, priced at `rate × quantity` (see
 * `bookingQuantitySchema`).
 */
export const bookingItemSchema = z
  .object({
    variationId: z.string().trim().optional(),
    barcode: z.string().trim().max(50).optional(),
    fromDate: dateStringSchema,
    toDate: dateStringSchema,
    discountAmount: optionalMoneySchema,
    /** A one-off extra charge on this line (alteration, delivery, …) —
     * unlike `discountAmount` this needs no special permission: any role
     * that can create a booking can bill for work the shop actually did,
     * as long as it says what it was for. */
    additionalCost: optionalMoneySchema,
    additionalCostReason: z
      .string()
      .trim()
      .max(200, "Must be at most 200 characters")
      .optional(),
    /** Deposit to hold per unit. Blank keeps the item's own default — the
     * counter only fills this in when it has agreed something else (a
     * regular customer, a higher-value piece). */
    securityDeposit: optionalMoneySchema,
    quantity: bookingQuantitySchema,
  })
  .superRefine((data, ctx) => {
    itemIdentifierRefinement(data, ctx);
    dateRangeRefinement(data, ctx);
    pickupNotInPastRefinement(data, ctx);
    additionalCostRefinement(data, ctx);
  });

export type BookingItemInput = z.infer<typeof bookingItemSchema>;

/** Total physical units a single order submission may create — a much
 * higher ceiling than the 20-line cap below since one line can now itself
 * ask for up to 20 units; this guards against a pathological "20 lines ×
 * 20 units" (400-row) submission rather than the realistic group-booking
 * case this feature exists for. Exported so the booking form can check
 * (and disable submit) proactively, not just discover this cap from an
 * otherwise-invisible failed validation after clicking submit. */
export const MAX_TOTAL_BOOKING_UNITS = 40;

/** One piece of paperwork attached to a booking. The file itself is
 * uploaded first (`POST /api/uploads/document`) and only this URL/label
 * pair is submitted with the booking — same two-step shape as an item
 * photo, so a failed upload never leaves a half-created booking. */
export const bookingDocumentSchema = z.object({
  url: z.url("Invalid document"),
  name: z
    .string()
    .trim()
    .min(1, "Required")
    .max(200, "Must be at most 200 characters"),
});

export type BookingDocumentInput = z.infer<typeof bookingDocumentSchema>;

/** Ten is well past what a rental counter attaches in practice (an ID
 * proof, a signed agreement, a couple of handover photos) while still
 * bounding what one request can carry. */
export const MAX_BOOKING_DOCUMENTS = 10;

export const createBookingSchema = z
  .object({
    customerId: uuidSchema,
    items: z
      .array(bookingItemSchema)
      .min(1, "Add at least one item")
      .max(20, "A single order can have at most 20 items"),
    notes: z
      .string()
      .trim()
      .max(2000, "Notes must be at most 2000 characters")
      .optional(),
    // Order-level paperwork — copied onto every line the submission
    // creates, exactly like `notes` is.
    documents: z
      .array(bookingDocumentSchema)
      .max(
        MAX_BOOKING_DOCUMENTS,
        `At most ${MAX_BOOKING_DOCUMENTS} documents per booking`,
      )
      .optional(),
    // Who this booking is attributed to. Only ever honoured for an
    // `admin` actor (see `resolveHandledById` in `bookings/service.ts`) —
    // every other role's bookings are always attributed to themselves,
    // straight from their own session, regardless of what (if anything)
    // is submitted here.
    handledById: optionalUuidSchema,
  })
  .superRefine((data, ctx) => {
    const totalUnits = data.items.reduce(
      (sum, item) => sum + Number(item.quantity || "1"),
      0,
    );
    if (totalUnits > MAX_TOTAL_BOOKING_UNITS) {
      ctx.addIssue({
        code: "custom",
        path: ["items"],
        message: `A single order can request at most ${MAX_TOTAL_BOOKING_UNITS} units in total`,
      });
    }
  });

export type CreateBookingInput = z.infer<typeof createBookingSchema>;

/** Editing an existing **draft** booking — dates/notes only. The item,
 * customer, outlet and discount are all fixed once created (start over
 * with a new booking to change those, matching `is_editable`'s
 * "paperwork-only" reasoning ported from the legacy state machine). The
 * discount specifically is frozen the same way `handledById` is — it's
 * part of what was agreed with the customer at booking time, not
 * something to quietly change later. */
export const updateBookingSchema = z
  .object({
    fromDate: dateStringSchema,
    toDate: dateStringSchema,
    notes: z
      .string()
      .trim()
      .max(2000, "Notes must be at most 2000 characters")
      .optional(),
  })
  .superRefine((data, ctx) => dateRangeRefinement(data, ctx));

export type UpdateBookingInput = z.infer<typeof updateBookingSchema>;

export const cancelBookingSchema = z.object({
  reason: z
    .string()
    .trim()
    .max(500, "Reason must be at most 500 characters")
    .optional(),
});

export type CancelBookingInput = z.infer<typeof cancelBookingSchema>;

export const variationSearchQuerySchema = z.object({
  q: z.string().trim().min(1).max(100).catch(""),
});
